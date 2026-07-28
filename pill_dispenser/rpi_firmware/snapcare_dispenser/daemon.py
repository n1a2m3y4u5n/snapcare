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
3. Give any known network some seconds to come up. If none does, raise the
   setup hotspot, which is the same SSID and passphrase as the printed label,
   every time.
4. Tick.

The tick loop
-------------
Deliberately dull. It asks the dispenser what is owed, and the dispenser is the
only thing that can open a tray. Nothing here decides anything.

The one piece of judgement in this file is that a failing tick must not stop
the loop. A servo that jams, a full SD card, a store that cannot be written —
all of those are logged and retried on the next tick. The alternative is a
process that exits, and a dispenser that has silently stopped dispensing is the
failure this whole project is written against.
"""
from __future__ import annotations

import argparse
import logging
import signal
import sys
import threading
import time

from . import config, provisioning, qr, wifi
from .button import ConfirmButton
from .clock import Clock
from .device import Dispenser
from .indicators import LogIndicator, make_indicator
from .server import serve_forever
from .servo import TrayServos, make_backend
from .store import Store

log = logging.getLogger("snapcare")


class Daemon:
    def __init__(self, port: int | None = None, backend: str | None = None,
                 state_dir=None, manage_wifi: bool = True,
                 identity: provisioning.Identity | None = None,
                 headless: bool = False):
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
        self.port = port
        self.manage_wifi = manage_wifi
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

    # ── network ─────────────────────────────────────────────────────────────

    def bring_up_network(self) -> None:
        if not self.manage_wifi:
            log.info("WiFi management disabled; leaving the network alone")
            return
        if not wifi.available():
            log.warning("NetworkManager is not available — not managing WiFi")
            return

        if wifi.status().mode == "connected":
            log.info("already on %s", wifi.status().ssid)
            return

        if wifi.has_known_network():
            log.info("waiting up to %ds for a known network", config.WIFI_JOIN_TIMEOUT_S)
            deadline = time.monotonic() + config.WIFI_JOIN_TIMEOUT_S
            while time.monotonic() < deadline and not self._stop.is_set():
                if wifi.status().mode == "connected":
                    log.info("joined %s", wifi.status().ssid)
                    return
                self._stop.wait(2)

        log.info("no network — raising the setup hotspot %s", self.identity.ssid)
        ok, message = wifi.start_hotspot(self.identity)
        if ok:
            self.announce_setup()
        else:
            # Worth shouting about: the device is now unreachable by the
            # intended route, and the only remaining way in is a cable.
            log.error("could not raise the setup hotspot: %s", message)

    def announce_setup(self) -> None:
        """Print the join details, so an SSH session is enough to set up a board."""
        log.info("setup network: %s   password: %s",
                 self.identity.ssid, self.identity.passphrase)
        log.info("setup page:    %s", provisioning.setup_url())
        try:
            print("\n" + qr.to_text(self.identity.wifi_qr) + "\n", file=sys.stderr)
        except qr.QREncoderUnavailable:
            log.info("(install segno to print the join code here: pip install segno)")

    def watch_wifi(self) -> None:
        """Fall back to the hotspot if the network disappears for good.

        A router rebooting is not this. NetworkManager reconnects on its own
        within seconds, and raising a hotspot every time the WiFi blinks would
        take the device off the network far more often than it rescued it. This
        only fires after a sustained outage — a house that changed its WiFi
        password, or a device carried to a different building.
        """
        if not self.manage_wifi or not wifi.available():
            return
        state = wifi.status()
        if state.mode in ("connected", "hotspot", "unavailable"):
            return

        log.warning("off the network for %d minutes — raising the setup hotspot",
                    _OFFLINE_GRACE_S // 60)
        ok, message = wifi.start_hotspot(self.identity)
        if ok:
            self.announce_setup()
        else:
            log.error("could not raise the setup hotspot: %s", message)

    # ── the loop ────────────────────────────────────────────────────────────

    def run(self) -> int:
        self._server = serve_forever(self.dispenser, self.port, self.identity)
        self.bring_up_network()

        if not self.dispenser.clock.trusted:
            log.warning(
                "the clock is not trusted yet, so nothing will be dispensed. "
                "It will start once NTP synchronises, or when a phone sets it."
            )

        offline_since: float | None = None
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

                if self.manage_wifi and wifi.available():
                    state = wifi.status()
                    if state.mode == "disconnected":
                        offline_since = offline_since or time.monotonic()
                        if time.monotonic() - offline_since > _OFFLINE_GRACE_S:
                            self.watch_wifi()
                            offline_since = None
                    else:
                        offline_since = None

            except Exception:  # noqa: BLE001
                # See the module docstring: the loop outlives its failures.
                log.exception("tick failed; carrying on")

            self._stop.wait(config.TICK_SECONDS)

        return 0

    def stop(self, *_args) -> None:
        log.info("shutting down")
        self._stop.set()

    def close(self) -> None:
        if self.button:
            self.button.close()
        if self._server:
            self._server.shutdown()
            self._server.server_close()
        self.dispenser.close()


#: How long the device has to be off the network before it gives up and raises
#: its own. Long enough that a router reboot does not trigger it.
_OFFLINE_GRACE_S = 10 * 60


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
    parser.add_argument("--trays", type=int, default=None, metavar="N",
                        help=f"how many hoppers are fitted (default {config.INSTALLED_TRAYS})")
    parser.add_argument("--show-qr", action="store_true",
                        help="print this device's permanent setup QR code and exit")
    parser.add_argument("--show-label", action="store_true",
                        help="print the label values as JSON and exit")
    parser.add_argument("--drop", type=int, metavar="TRAY",
                        help="sweep one tray once and exit — for checking wiring")
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
        return 0

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
                    identity=identity, headless=args.headless)
    signal.signal(signal.SIGTERM, daemon.stop)
    signal.signal(signal.SIGINT, daemon.stop)
    try:
        return daemon.run()
    finally:
        daemon.close()


if __name__ == "__main__":
    raise SystemExit(main())
