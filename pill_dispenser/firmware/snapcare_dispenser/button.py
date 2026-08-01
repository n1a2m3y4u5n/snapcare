"""The take-dose button — the one input the device has.

Two wires: the button between the pin and GND, with the chip's internal pull-up
enabled in software. No external resistor, no debounce capacitor.

What it is actually for
-----------------------
It is the physical twin of the release button on the app's main screen, and it
does exactly the same thing: `Dispenser.release()`. Press it while a dose is
due and the tray sweeps, the pills land in the cup, and the event goes up to
the server marked taken. Press it at any other time and **nothing happens** —
no tray moves, nothing is recorded.

That last rule is the whole safety model and it is worth being blunt about.
This is not a "dispense" button. A dose is offered at its scheduled minute and
sits on `awaiting_release` for the length of the grace window; the button is
one of the two ways to accept the offer. Outside a window there is no offer to
accept, so the button is inert — which is what stops somebody curious, or a
child, or a cat, from walking a hopper empty one press at a time.

It also is not a *confirm* button, which is what used to be wired to this pin.
That button existed because the old firmware dropped pills at the scheduled
minute whether or not anybody was there, so "the servo swept" and "a person
took it" were two different facts and the second needed its own input. Asking
first collapses them: the press that releases the dose is the press that says
somebody was standing there to take it. One fact, one wire, and no way for the
log to record a dose that is still sitting in the hopper.

Why a button at all, when the app has one
-----------------------------------------
Because the app is on a phone, and the person this project is built around may
not have it, may not have it charged, or may not be the person who set it up. A
carer on the other side of the country taps release in the app; the person in
the room presses the button. Both land in the same place with the same rules.

Debouncing, and why it is not a loop with a sleep in it
------------------------------------------------------
A mechanical switch does not close once. It closes, bounces open, closes again —
a few hundred microseconds to a couple of milliseconds of chatter, every edge of
which the GPIO hardware will happily report. Undebounced, one press fires the
handler several times.

Here that is harmless rather than dangerous, which is worth saying because it
changes what the debouncing is *for*: the second call finds nothing left in
`_due` and returns an empty list, so a bouncing switch cannot double-dispense.
What it can do is fill the log with noise and make `--selftest` unable to tell a
working button from a chattering one. So the debouncing stays, and its job is
now diagnosis rather than safety.

Both GPIO libraries have this below Python. pigpio's `set_glitch_filter` and
lgpio's `gpio_set_debounce_micros` each discard an edge whose level does not
then hold for N microseconds, applied before any callback is queued. That is
both more correct and far cheaper than sampling from Python, and it is why
those are the preferred paths.

The polling fallback exists so a device with neither still has a working
button, and so the tests can drive one without any GPIO at all. It samples at
50 Hz, so it is a real button and a slightly late one.
"""
from __future__ import annotations

import logging
import threading
import time
from typing import Callable

from . import config, gpiochip

log = logging.getLogger(__name__)


class TakeDoseButton:
    """Calls `on_press` once per press. Never raises into its caller."""

    def __init__(self, on_press: Callable[[], None], gpio: int | None = None,
                 backend: str = "auto"):
        self.gpio = gpio if gpio is not None else config.BUTTON_GPIO
        self._on_press = on_press
        self._stop = threading.Event()
        self._pi = None
        self._callback = None
        self._lgpio = None
        self._handle = None
        self._thread: threading.Thread | None = None
        self.backend = "none"
        #: Every press this object has seen. Not a statistic — `--selftest`
        #: uses it to tell a button that fires twice per press from one that
        #: fires once, and to tell an unwired button from a shorted one.
        self.presses = 0

        # `none` is a real choice, not a failure: the tests use it, and so does
        # a build with no button fitted. Anything else unrecognised is a typo
        # and falls through to the same inert object with a warning.
        starters = {"pigpio": self._start_pigpio, "lgpio": self._start_lgpio,
                    "polling": self._start_polling}
        order = ("pigpio", "lgpio", "polling") if backend == "auto" else (backend,)

        for name in order:
            start = starters.get(name)
            if start and start():
                self.backend = name
                return

        if backend == "none":
            log.debug("take-dose button disabled by request")
            return

        log.warning(
            "no take-dose button on GPIO %d — a dose can still be released from "
            "the app or the device's own page, but not by the person standing "
            "in front of the machine",
            self.gpio,
        )

    # ── the good path ───────────────────────────────────────────────────────

    def _start_pigpio(self) -> bool:
        pi = None  # so the cleanup below is safe when the import itself fails
        try:
            import pigpio  # noqa: PLC0415

            pi = pigpio.pi()
            if not pi.connected:
                # The daemon is not running. Close the socket the client just
                # opened before moving on, or it is held for the life of the
                # process for nothing.
                pi.stop()
                return False

            pi.set_mode(self.gpio, pigpio.INPUT)
            # The pull-up is what makes two wires enough: the pin idles high and
            # the button pulls it to ground.
            pi.set_pull_up_down(self.gpio, pigpio.PUD_UP)
            pi.set_glitch_filter(self.gpio, config.BUTTON_DEBOUNCE_US)

            # FALLING_EDGE, because the press is the pin going to ground. Acting
            # on the release instead would feel like a delay to anybody who
            # holds the button down, which is most people who are unsure whether
            # a device has noticed them — and on this build the thing they are
            # unsure about is whether their medication is coming.
            self._callback = pi.callback(self.gpio, pigpio.FALLING_EDGE,
                                         lambda *_args: self._fire())
            self._pi = pi
            log.info("take-dose button on GPIO %d (pigpio, %d µs debounce)",
                     self.gpio, config.BUTTON_DEBOUNCE_US)
            return True
        except Exception as exc:  # noqa: BLE001
            log.info("pigpio button unavailable (%s)", exc)
            if pi is not None:
                # Not cosmetic. Every `pigpio.pi()` opens a socket to the
                # daemon, and a constructor that returns without closing an
                # unusable one leaks it for the life of the process.
                try:
                    pi.stop()
                except Exception:  # noqa: BLE001
                    pass
            return False

    def _start_lgpio(self) -> bool:
        """The same debouncing, through the gpiochip character device.

        `gpio_claim_alert` takes the edge flags *before* the line flags, which
        is the opposite way round from how they read; transposing them claims
        the wrong pull and the button then never registers.

        The pull-up is part of the claim here rather than a separate call —
        lgpio has no equivalent of `set_pull_up_down`.
        """
        try:
            import lgpio  # noqa: PLC0415

            handle = gpiochip.open_chip()
            if handle is None:
                log.info("lgpio button unavailable (%s)", gpiochip.unavailable_reason())
                return False

            lgpio.gpio_claim_alert(handle, self.gpio, lgpio.FALLING_EDGE,
                                   lgpio.SET_PULL_UP)
            lgpio.gpio_set_debounce_micros(handle, self.gpio, config.BUTTON_DEBOUNCE_US)

            # The handle must be passed exactly as `gpiochip_open` returned it:
            # lgpio recovers the chip number from its high bits to route the
            # notification. A masked handle here is a callback that never fires,
            # silently, with nothing logged anywhere.
            self._callback = lgpio.callback(handle, self.gpio, lgpio.FALLING_EDGE,
                                            lambda *_args: self._fire())
            self._lgpio = lgpio
            self._handle = handle
            log.info("take-dose button on GPIO %d (lgpio, %d µs debounce)",
                     self.gpio, config.BUTTON_DEBOUNCE_US)
            return True
        except Exception as exc:  # noqa: BLE001
            log.info("lgpio button unavailable (%s)", exc)
            return False

    # ── the fallback ────────────────────────────────────────────────────────

    def _start_polling(self) -> bool:
        try:
            import RPi.GPIO as GPIO  # noqa: PLC0415

            GPIO.setmode(GPIO.BCM)
            GPIO.setwarnings(False)
            GPIO.setup(self.gpio, GPIO.IN, pull_up_down=GPIO.PUD_UP)
        except Exception as exc:  # noqa: BLE001
            log.info("RPi.GPIO button unavailable (%s)", exc)
            return False

        def loop():
            settled = config.BUTTON_DEBOUNCE_US / 1_000_000
            was_down = False
            while not self._stop.is_set():
                is_down = GPIO.input(self.gpio) == 0
                if is_down and not was_down:
                    # Sample again after the bounce window; a real press is
                    # still down, a bounce is not.
                    time.sleep(settled)
                    if GPIO.input(self.gpio) == 0:
                        self._fire()
                was_down = is_down
                self._stop.wait(0.02)

        self._thread = threading.Thread(target=loop, name="button", daemon=True)
        self._thread.start()
        log.info("take-dose button on GPIO %d (RPi.GPIO polling)", self.gpio)
        return True

    # ── common ──────────────────────────────────────────────────────────────

    def _fire(self) -> None:
        # Counted before the handler runs, and outside the try, so a press is
        # recorded even by a build whose handler is failing. `--selftest` reads
        # this to tell "you pressed it once and it registered once" from "you
        # pressed it once and it registered four times".
        self.presses += 1
        try:
            self._on_press()
        except Exception:  # noqa: BLE001
            # A handler that throws must not kill the callback thread, or the
            # button silently stops working for the rest of the device's life.
            # It runs on lgpio's notification thread, so there is nowhere above
            # this for an exception to go.
            log.exception("the take-dose button handler failed")

    def close(self) -> None:
        self._stop.set()
        if self._callback is not None:
            self._callback.cancel()
        if self._pi is not None:
            self._pi.stop()
        if self._lgpio is not None and self._handle is not None:
            try:
                self._lgpio.gpio_free(self._handle, self.gpio)
            except Exception:  # noqa: BLE001 - shutdown must not raise
                pass
        if self._thread is not None:
            self._thread.join(timeout=2)
