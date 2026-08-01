"""The process: bring the network up, start the server, tick the scheduler.

Order of business at boot
-------------------------
1. Open the store and the servos, and restore whatever schedule was loaded
   before the power went out.
2. Start the web server *first*, before touching the network. If the WiFi work
   below hangs or fails, the device is still reachable — over Ethernet, over a
   previously-working WiFi connection, over anything. A firmware that only
   becomes reachable after its network setup succeeds is unreachable exactly
   when you need it.
3. Ask the network supervisor to get onto something, and do not wait for it.
   Joining a network takes tens of seconds and nothing about dispensing needs
   one: on a morning where the power came back at 07:58, waiting here is a dose
   held up by a router. `network.py` owns everything about which mode the radio
   is in, and does it on its own thread.
4. Open the cloud link, if one is configured, on its own threads. It is not
   waited for and its failure is not this function's problem — a dispenser with
   an unreachable relay is a dispenser, and the schedule it is running is
   already on the SD card.
5. Tick.

The tick loop
-------------
Deliberately dull. It asks the dispenser what is owed, and the dispenser is the
only thing that can open a tray. Nothing here decides anything.

The one piece of judgement in this file is that a failing tick must not stop
the loop. A servo that jams, a full SD card, a store that cannot be written —
all of those are logged and retried on the next tick. The alternative is a
process that exits, and a dispenser that has silently stopped dispensing is the
failure this whole project is written against.

Which is also why `Supervisor.tick` only ever *decides*, and hands anything that
touches the radio to a worker. A network call on this thread is a dose that
waits for nmcli.
"""
from __future__ import annotations

import argparse
import logging
import signal
import sys
import threading

from . import config, provisioning, qr
from .button import ConfirmButton
from .clock import Clock
from .cloud import CloudLink
from .device import Dispenser
from .indicators import LogIndicator, make_indicator
from .network import Supervisor
from .server import serve_forever
from .servo import TrayServos, make_backend
from .store import Store

log = logging.getLogger("snapcare")


class Daemon:
    def __init__(self, port: int | None = None, backend: str | None = None,
                 state_dir=None, manage_wifi: bool = True,
                 identity: provisioning.Identity | None = None,
                 headless: bool = False, relay_url: str | None = None,
                 cloud: bool | None = None):
        self.store = Store(state_dir)
        self.identity = identity or provisioning.load_identity(self.store)
        self.servos = TrayServos(backend=make_backend(backend))
        self.dispenser = Dispenser(
            store=self.store, servos=self.servos, clock=Clock(),
            indicator=LogIndicator() if headless else make_indicator(),
        )
        # The button and the web page's confirm call the same method, so a
        # press and a tap are indistinguishable to everything downstream.
        self.button = None if headless else ConfirmButton(self._confirm)
        # Constructed even when it will not run, so that the status page can
        # say *why* — "no relay configured" is a different thing to explain
        # than "cannot reach the relay", and a None here would collapse them.
        self.cloud = CloudLink(self.dispenser, self.identity,
                               relay_url=relay_url, enabled=cloud)
        # Every recorded dose goes up promptly, whichever of the five things
        # that can cause one caused it. See `Dispenser.on_event`.
        self.dispenser.on_event = lambda _record: self.cloud.nudge()
        # Which mode the radio is in, and the whole of the join flow. Given the
        # indicator so that the room can say "I am not on a network yet", and
        # given the cloud link so that coming back onto the WiFi collapses a
        # retry backoff that can otherwise be minutes long — a device that is
        # back but still missing from the app looks exactly like one that is not.
        self.network = Supervisor(
            self.identity,
            indicator=self.dispenser.indicator,
            manage=manage_wifi,
            on_online=self.cloud.network_changed,
        )
        self.port = port
        self._stop = threading.Event()
        self._server = None
        self._ntp_trusted = False

    def _confirm(self) -> None:
        """Somebody pressed the button.

        A press with nothing waiting records nothing — `confirm_taken` returns
        None — which is the right reading of a curious visitor pressing it.
        """
        record = self.dispenser.confirm_taken()
        if record:
            log.info("tray %d confirmed taken by button press", record["tray"])
        else:
            log.debug("button pressed with no dose waiting")

    # ── the loop ────────────────────────────────────────────────────────────

    def run(self) -> int:
        # Before anything reads the clock. On a DS1302 build nothing else will
        # have: there is no kernel driver, so the system clock is still
        # whatever fake-hwclock restored from the last shutdown, and a device
        # that started ticking on that would dispense against the wrong day
        # while reporting a trusted clock. A no-op on a DS3231 build, where the
        # kernel applied the chip's time before this process existed.
        self.dispenser.clock.adopt_rtc()

        self._server = serve_forever(self.dispenser, self.port, self.identity,
                                     cloud=self.cloud, network=self.network,
                                     button=self.button)
        self.network.start()

        # Not conditional on the network being up, and no longer even ordered
        # after it: the link's own retry loop is better at waiting than anything
        # this function could do, and `Supervisor.on_online` pokes it the moment
        # the WiFi actually arrives.
        self.cloud.start()

        if not self.dispenser.clock.trusted:
            log.warning(
                "the clock is not trusted yet, so nothing will be dispensed. "
                "It will start once NTP synchronises, or when a phone sets it."
            )

        last_seen_trusted = False

        while not self._stop.is_set():
            try:
                # NTP is the better authority than anything a phone sent, and
                # it arrives asynchronously — some seconds after the WiFi comes
                # up, which is well after this loop started.
                if not self._ntp_trusted and self.dispenser.clock.trust_ntp():
                    self._ntp_trusted = True
                    log.info("clock synchronised from the network")

                trusted = self.dispenser.clock.trusted
                if trusted and not last_seen_trusted:
                    log.info("clock is trusted — dispensing is enabled")
                last_seen_trusted = trusted

                for event in self.dispenser.tick():
                    log.info("tray %d %s at %s (%s)", event["tray"],
                             "dispensed" if event["taken"] else "MISSED",
                             event["time"], event["sc1"])

                # Second, and cheap: it decides and dispatches, never waits.
                # Doses come first in this loop because they are the job.
                self.network.tick()

            except Exception:  # noqa: BLE001
                # See the module docstring: the loop outlives its failures.
                log.exception("tick failed; carrying on")

            self._stop.wait(config.TICK_SECONDS)

        return 0

    def stop(self, *_args) -> None:
        log.info("shutting down")
        self._stop.set()
        # Asked to stop here rather than in `close`, so their threads have the
        # whole of the shutdown to notice. They are daemon threads and cannot
        # hold the process open either way; this just keeps a poll that is
        # mid-flight, or a join waiting on a router, from logging a failure on
        # the way out.
        self.cloud.stop()
        self.network.stop()

    def close(self) -> None:
        self.cloud.stop()
        self.network.close()
        if self.button:
            self.button.close()
        if self._server:
            self._server.shutdown()
            self._server.server_close()
        self.dispenser.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="snapcare-dispenser",
        description="SnapCare pill dispenser firmware for the Raspberry Pi.",
    )
    parser.add_argument("--port", type=int, default=None,
                        help=f"web server port (default {config.HTTP_PORT})")
    parser.add_argument("--servo-backend", default=None,
                        choices=["auto", "pigpio", "rpigpio", "mock"],
                        help="which servo driver to use (default auto)")
    parser.add_argument("--state-dir", default=None,
                        help=f"where to keep the schedule and log (default {config.STATE_DIR})")
    parser.add_argument("--no-wifi", action="store_true",
                        help="do not manage the network — for development on a laptop")
    parser.add_argument("--headless", action="store_true",
                        help="no LED ring, buzzer or button — log what they would have done")
    parser.add_argument("--relay-url", default=None, metavar="URL",
                        help="cloud relay to sync schedules through "
                             f"(default {config.CLOUD_RELAY_URL or 'none — LAN only'})")
    parser.add_argument("--no-cloud", action="store_true",
                        help="do not open a cloud connection, whatever is configured")
    parser.add_argument("--trays", type=int, default=None, metavar="N",
                        help=f"how many hoppers are fitted (default {config.INSTALLED_TRAYS})")
    parser.add_argument("--show-qr", action="store_true",
                        help="print this device's permanent setup QR code and exit")
    parser.add_argument("--show-label", action="store_true",
                        help="print the label values as JSON and exit")
    parser.add_argument("--drop", type=int, metavar="TRAY",
                        help="sweep one tray once and exit — for checking wiring")
    parser.add_argument("--selftest", action="store_true",
                        help="commission an assembled machine: check what can be "
                             "checked, ask about what only eyes and ears can "
                             "settle, and write a report")
    parser.add_argument("--auto-only", action="store_true",
                        help="with --selftest, run only the checks that need no "
                             "person and open no tray")
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args(argv)

    if args.trays is not None:
        config.INSTALLED_TRAYS = args.trays

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    identity = provisioning.load_identity(Store(args.state_dir))

    if args.show_label:
        print(provisioning.label_json(identity))
        return 0

    if args.show_qr:
        print(f"network: {identity.ssid}\npassword: {identity.passphrase}\n")
        try:
            print(qr.to_text(identity.wifi_qr))
        except qr.QREncoderUnavailable as exc:
            print(f"{exc}\nthe code would be: {identity.wifi_qr}")
            return 1
        print(f"\nthen open {provisioning.setup_url()}")
        print(f"\npairing code: {identity.claim}")
        print("(for the app, once the device is on the home WiFi. "
              "It is derived from this board and never changes.)")
        return 0

    if args.selftest:
        from .selftest import run as run_selftest  # noqa: PLC0415

        return run_selftest(interactive=not args.auto_only, fitted=args.trays,
                            backend=args.servo_backend, state_dir=args.state_dir)

    if args.drop is not None:
        servos = TrayServos(backend=make_backend(args.servo_backend))
        try:
            servos.drop(args.drop)
        except KeyError as exc:
            print(exc, file=sys.stderr)
            return 1
        finally:
            servos.close()
        return 0

    daemon = Daemon(port=args.port, backend=args.servo_backend,
                    state_dir=args.state_dir, manage_wifi=not args.no_wifi,
                    identity=identity, headless=args.headless,
                    relay_url=args.relay_url,
                    cloud=False if args.no_cloud else None)
    signal.signal(signal.SIGTERM, daemon.stop)
    signal.signal(signal.SIGINT, daemon.stop)
    try:
        return daemon.run()
    finally:
        daemon.close()


if __name__ == "__main__":
    raise SystemExit(main())
