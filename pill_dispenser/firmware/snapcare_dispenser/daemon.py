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
import time

from . import config, provisioning, qr
from .button import TakeDoseButton
from .clock import Clock
from .cloud import CloudLink
from .device import Dispenser
from .indicators import LogIndicator, make_indicator
from .network import Supervisor
from .server import serve_forever
from .servo import TrayServos, make_backend, servo_backends
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
        # Constructed even when it will not run, so that the status page can
        # say *why* — "no relay configured" is a different thing to explain
        # than "cannot reach the relay", and a None here would collapse them.
        self.cloud = CloudLink(self.dispenser, self.identity,
                               relay_url=relay_url, enabled=cloud)
        # Every recorded dose goes up promptly, whichever of the four things
        # that can cause one caused it. See `Dispenser.on_event`.
        self.dispenser.on_event = lambda _record: self.cloud.nudge()
        # And so does a dose that has only just become *due*. This is the one
        # that carries the release model: the app cannot offer a button for a
        # dose it has not heard about, so the report goes up when the ring goes
        # green rather than at the next heartbeat five minutes later.
        self.dispenser.on_change = self.cloud.nudge
        # The one input the machine has. It is the same action as the release
        # button on the app's main screen, deliberately reaching the same
        # `Dispenser.release` — so there is one path by which the schedule opens
        # a tray and one set of rules around it, whether the tap came from a
        # phone in another country or a thumb in the room.
        #
        # `headless` covers `make run` on a laptop, where claiming GPIO 24 would
        # fail anyway and the log line about it is noise.
        self.button = None if headless else TakeDoseButton(self._button_pressed)
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
        #: When the clock chip was last written. Seeded at 0 so the first
        #: tick with a trustworthy clock writes it, which is what rescues a
        #: device whose RTC has never been vouched for.
        self._last_seeded = 0.0

    # ── the button ──────────────────────────────────────────────────────────

    def _button_pressed(self) -> None:
        """Somebody pressed the button on the machine. Release what is due.

        Runs on the GPIO library's notification thread, so everything it can
        raise has to stop here — `TakeDoseButton._fire` catches it, but a
        handler that throws every time is a button that looks broken.

        Three outcomes, and none of them is an error:

          **a dose was due** — the tray sweeps, the event goes up marked taken,
          and the screen turns blue. Identical in every respect to the same tap
          made in the app;

          **nothing was due** — nothing moves and nothing is recorded. This is
          the common case for an idle machine and the whole reason the button
          is not a "dispense" button;

          **no GPIO library** — `release` refuses rather than claiming a dose it
          could not deliver. Logged, because the person is standing right there.
        """
        try:
            released = self.dispenser.release()
        except RuntimeError as exc:
            log.error("button pressed but nothing can move: %s", exc)
            return

        if not released:
            log.info("button pressed with no dose waiting — nothing released")
            return

        for event in released:
            log.info("button: tray %d released for the %s dose",
                     event["tray"], event["time"])

    # ── keeping the clock chip fed ──────────────────────────────────────────

    def _seed_rtc(self, why: str) -> None:
        """Write the current trusted time into the chip, and say what happened."""
        if self.dispenser.clock.seed_rtc():
            log.info("clock chip seeded (%s) — it can now carry the time "
                     "across a power cut", why)
        else:
            # Not an error on a build with no RTC, and `rtc.vouch` has already
            # logged the reason when there is one. Recorded at debug so a device
            # that is quietly failing to seed can still be diagnosed.
            log.debug("clock chip not seeded (%s)", why)
        self._last_seeded = time.monotonic()

    def _reseed_rtc_if_due(self) -> None:
        """Push the good time back down every `RTC_RESEED_S`, while there is one.

        Two jobs. It corrects the DS1302's drift — an uncompensated crystal is
        a few minutes a month, and the chip is only ever consulted after a power
        cut, when nothing is left to correct it. And it is the self-heal for a
        chip that could not be seeded earlier: a cell fitted after the fact, a
        module wired up while the device was already running, a write that
        failed once.

        Only while something trustworthy is vouching, and never from the chip's
        own reading — seeding it from itself would launder drift into a fresh
        token that claims the drifted time is correct.
        """
        if not config.RTC_RESEED_S:
            return
        if time.monotonic() - self._last_seeded < config.RTC_RESEED_S:
            return
        # Gated on what must NOT be true rather than on a list of source names.
        #
        # It used to test `source in ("ntp", "phone")`, and `"phone"` is a string
        # nothing in this package ever produces — every real caller of
        # `Clock.accept` passes `"api"` (server.py) or `"cloud"` (cloud.py), and
        # `"phone"` is only the parameter's default. So on a LAN-only device
        # whose clock a carer set from the app, this returned early forever: no
        # drift correction on an uncompensated crystal, and no self-heal for a
        # cell fitted after commissioning.
        #
        # `rtc` is excluded because it is the chip vouching for itself, and
        # seeding it from its own reading launders drift into a fresh token that
        # asserts the drifted time is correct. `untrusted` has nothing to write.
        if self.dispenser.clock.source in ("rtc", "untrusted"):
            self._last_seeded = time.monotonic()
            return
        self._seed_rtc("periodic")

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
                    # And write it down. This is what the coin cell is for, and
                    # before this line existed nothing on a networked device
                    # ever ran it: the chip was written only by a phone sending
                    # an SC1*C* code, which a device with working internet never
                    # receives. Months of correct operation, and the first power
                    # cut that outlasted the router left the tray shut.
                    self._seed_rtc("NTP synchronised")

                self._reseed_rtc_if_due()

                trusted = self.dispenser.clock.trusted
                if trusted and not last_seen_trusted:
                    log.info("clock is trusted — dispensing is enabled")
                last_seen_trusted = trusted

                for event in self.dispenser.tick():
                    log.info("tray %d %s at %s (%s)", event["tray"],
                             "released" if event["taken"] else "MISSED",
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
        if self._server:
            self._server.shutdown()
            self._server.server_close()
        # Before the dispenser, so a press that arrives during shutdown cannot
        # reach a half-closed servo.
        if self.button:
            self.button.close()
        self.dispenser.close()
        # The DS1302 holds its three lines for the life of the process — it is a
        # singleton precisely so that nothing closes them mid-transfer — so this
        # is the one place they are given back.
        if config.USE_RTC:
            from . import ds1302  # noqa: PLC0415
            ds1302.close_chip()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="snapcare-dispenser",
        description="SnapCare pill dispenser firmware for the Raspberry Pi.",
    )
    parser.add_argument("--port", type=int, default=None,
                        help=f"web server port (default {config.HTTP_PORT})")
    # Built from the registry rather than written out, because the two drifted:
    # `lgpio` was missing from this list while being the only backend that works
    # on Trixie, so `--servo-backend lgpio` — the exact thing the assembly guide
    # tells you to run to rule out auto-detection — exited 2 with "invalid
    # choice".
    parser.add_argument("--servo-backend", default=None,
                        choices=["auto", *sorted(servo_backends())],
                        help="which servo driver to use (default auto)")
    parser.add_argument("--state-dir", default=None,
                        help=f"where to keep the schedule and log (default {config.STATE_DIR})")
    parser.add_argument("--no-wifi", action="store_true",
                        help="do not manage the network — for development on a laptop")
    parser.add_argument("--headless", action="store_true",
                        help="no screen or buzzer — log what they would have done")
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
