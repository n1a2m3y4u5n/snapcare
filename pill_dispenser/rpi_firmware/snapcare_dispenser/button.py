"""The confirm button — the one input the device has.

Two wires: the button between the pin and GND, with the chip's internal pull-up
enabled in software. No external resistor, no debounce capacitor.

What it is actually for
-----------------------
It turns "the machine dispensed a dose" into "a person took it". Those are
different facts and only the second is the one a carer wants. Without it, the
log can honestly say the servo swept and the pills left the hopper, and say
nothing at all about whether they were swallowed, left in the cup, or knocked
onto the floor by a cat.

Debouncing, and why it is not a loop with a sleep in it
------------------------------------------------------
A mechanical switch does not close once. It closes, bounces open, closes again —
a few hundred microseconds to a couple of milliseconds of chatter, every edge of
which the GPIO hardware will happily report. Undebounced, one press records
several confirmations, and the dose log grows a burst of duplicate events with
identical timestamps.

pigpio has this in hardware-adjacent form: `set_glitch_filter` discards any edge
whose level does not then hold for N microseconds, applied before the callback
is ever queued. That is both more correct and far cheaper than sampling from
Python, and it is why this is the preferred path.

The polling fallback exists so a device without pigpio still has a working
button, and so the tests can drive one without any GPIO at all.
"""
from __future__ import annotations

import logging
import threading
import time
from typing import Callable

from . import config

log = logging.getLogger(__name__)


class ConfirmButton:
    """Calls `on_press` once per press. Never raises into its caller."""

    def __init__(self, on_press: Callable[[], None], gpio: int | None = None,
                 backend: str = "auto"):
        self.gpio = gpio if gpio is not None else config.BUTTON_GPIO
        self._on_press = on_press
        self._stop = threading.Event()
        self._pi = None
        self._callback = None
        self._thread: threading.Thread | None = None
        self.backend = "none"

        if backend in ("auto", "pigpio") and self._start_pigpio():
            self.backend = "pigpio"
        elif backend in ("auto", "poll") and self._start_polling():
            self.backend = "poll"
        else:
            log.info("no confirm button available on GPIO %d", self.gpio)

    # ── the good path ───────────────────────────────────────────────────────

    def _start_pigpio(self) -> bool:
        try:
            import pigpio  # noqa: PLC0415

            pi = pigpio.pi()
            if not pi.connected:
                return False

            pi.set_mode(self.gpio, pigpio.INPUT)
            # The pull-up is what makes two wires enough: the pin idles high and
            # the button pulls it to ground.
            pi.set_pull_up_down(self.gpio, pigpio.PUD_UP)
            pi.set_glitch_filter(self.gpio, config.BUTTON_DEBOUNCE_US)

            # FALLING_EDGE, because the press is the pin going to ground. Acting
            # on the release instead would feel like a delay to anybody who
            # holds the button down, which is most people who are unsure whether
            # a device has noticed them.
            self._callback = pi.callback(self.gpio, pigpio.FALLING_EDGE,
                                         lambda *_args: self._fire())
            self._pi = pi
            log.info("confirm button on GPIO %d (pigpio, %d µs debounce)",
                     self.gpio, config.BUTTON_DEBOUNCE_US)
            return True
        except Exception as exc:  # noqa: BLE001
            log.debug("pigpio button unavailable (%s)", exc)
            return False

    # ── the fallback ────────────────────────────────────────────────────────

    def _start_polling(self) -> bool:
        try:
            import RPi.GPIO as GPIO  # noqa: PLC0415

            GPIO.setmode(GPIO.BCM)
            GPIO.setwarnings(False)
            GPIO.setup(self.gpio, GPIO.IN, pull_up_down=GPIO.PUD_UP)
        except Exception as exc:  # noqa: BLE001
            log.debug("RPi.GPIO button unavailable (%s)", exc)
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
        log.info("confirm button on GPIO %d (RPi.GPIO polling)", self.gpio)
        return True

    # ── common ──────────────────────────────────────────────────────────────

    def _fire(self) -> None:
        try:
            self._on_press()
        except Exception:  # noqa: BLE001
            # A handler that throws must not kill the callback thread, or the
            # button silently stops working for the rest of the device's life.
            log.exception("the confirm button handler failed")

    def close(self) -> None:
        self._stop.set()
        if self._callback is not None:
            self._callback.cancel()
        if self._pi is not None:
            self._pi.stop()
        if self._thread is not None:
            self._thread.join(timeout=2)
