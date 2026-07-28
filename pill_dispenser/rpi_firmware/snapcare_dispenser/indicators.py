"""How the device talks to the person standing in front of it.

The project's founding constraint is that the person cannot be assumed to read.
So the channel to them is a colour and a sound, never text — which is why the
Arduino build had an LED ring and a piezo and no display facing the user, and
why this build has the same two things.

The pairing is the point, and it is not redundancy. A ring alone only works if
somebody happens to be looking at it. The chirp is what fetches a person from
another room; the colour is what tells them what is going on once they arrive.
And without the sound the confirm button is close to useless — nobody presses a
button to acknowledge something they never noticed, so the dose log fills with
"dispensed, unconfirmed" and stops telling a carer anything.

The colour vocabulary is carried over from the Arduino firmware unchanged, so
somebody who has used one device understands the other:

    green + chirp   a dose is in the cup; take it and press the button
    blue            recorded as taken
    amber           the dose went untaken, or its window closed
    violet          a new schedule was accepted

Everything above this module calls the five methods on `Indicator`. What they do
depends on which class is installed, so a device built without a ring still
works — it just relies on the phone for notification, and says so on its status
page rather than pretending a light is blinking.
"""
from __future__ import annotations

import logging
import threading

from . import config

log = logging.getLogger(__name__)

#: The colour vocabulary, as GRB-agnostic RGB tuples.
GREEN = (0, 200, 60)
BLUE = (0, 90, 255)
AMBER = (255, 130, 0)
VIOLET = (150, 0, 255)
OFF = (0, 0, 0)


class Indicator:
    """No-op base. Every method must be safe to call from any thread."""

    #: What this device actually has fitted, for the status page.
    fitted: tuple[str, ...] = ()

    def dose_ready(self, tray: int) -> None: ...
    def dose_taken(self, tray: int) -> None: ...
    def dose_missed(self, tray: int) -> None: ...
    def schedule_accepted(self) -> None: ...
    def clear(self) -> None: ...
    def close(self) -> None: ...


class LogIndicator(Indicator):
    """Writes what a fitted ring and buzzer would have done.

    This is what runs on a laptop and what the tests assert against. It is not
    a placeholder for a broken device — a dispenser with neither part fitted is
    a valid build, and this is the honest description of it.
    """

    fitted = ()

    def dose_ready(self, tray: int) -> None:
        log.info("indicator: green + chirp — tray %d is ready", tray)

    def dose_taken(self, tray: int) -> None:
        log.info("indicator: blue — tray %d recorded as taken", tray)

    def dose_missed(self, tray: int) -> None:
        log.info("indicator: amber — tray %d was missed", tray)

    def schedule_accepted(self) -> None:
        log.info("indicator: violet — new schedule accepted")

    def clear(self) -> None:
        log.debug("indicator: off")


# ── the ring ────────────────────────────────────────────────────────────────

class Ring:
    """A WS2812 ring, or nothing at all.

    `rpi_ws281x` generates the 800 kHz waveform with the PWM peripheral and the
    DMA controller, which is why the data line has to be GPIO 18, 12, 21 or 10
    and why this needs root.

    **On coexisting with pigpio**: both want DMA, and both can want PWM. pigpio
    times itself from PCM by default, which leaves PWM0 free for the ring, so
    the default configuration of each happens to be compatible. If a ring ever
    flickers when a servo moves, that is the thing to look at first — start
    pigpiod with `-t 0` to pin it to PCM explicitly.
    """

    def __init__(self, gpio: int | None = None, pixels: int | None = None,
                 brightness: int | None = None):
        from rpi_ws281x import Color, PixelStrip  # noqa: PLC0415

        self._Color = Color
        self._pixels = pixels if pixels is not None else config.RING_PIXELS
        self._strip = PixelStrip(
            self._pixels,
            gpio if gpio is not None else config.RING_GPIO,
            800_000,  # WS2812 bit rate
            10,       # DMA channel
            False,    # not inverted; no level shifter in the signal path
            brightness if brightness is not None else config.RING_BRIGHTNESS,
            0,        # PWM channel
        )
        self._strip.begin()
        self.fill(OFF)

    def fill(self, colour: tuple[int, int, int]) -> None:
        packed = self._Color(*colour)
        for index in range(self._pixels):
            self._strip.setPixelColor(index, packed)
        self._strip.show()

    def close(self) -> None:
        try:
            self.fill(OFF)
        except Exception:  # noqa: BLE001 - shutdown must not raise
            pass


# ── the buzzer ──────────────────────────────────────────────────────────────

class Buzzer:
    """A piezo element driven as a square wave by pigpio.

    Any GPIO will do — the tone is software-timed PWM from the same daemon that
    drives the servos, so this does not compete for a hardware PWM channel with
    the ring.
    """

    def __init__(self, gpio: int | None = None):
        import pigpio  # noqa: PLC0415

        self._pi = pigpio.pi()
        if not self._pi.connected:
            raise RuntimeError("pigpiod is not running")
        self.gpio = gpio if gpio is not None else config.BUZZER_GPIO
        self._pi.set_mode(self.gpio, pigpio.OUTPUT)
        self.off()

    def beep(self, seconds: float | None = None) -> None:
        import time  # noqa: PLC0415

        self._pi.set_PWM_frequency(self.gpio, config.BUZZER_HZ)
        self._pi.set_PWM_dutycycle(self.gpio, 128)  # square wave, loudest
        time.sleep(seconds if seconds is not None else config.BUZZER_BEEP_S)
        self.off()

    def off(self) -> None:
        self._pi.set_PWM_dutycycle(self.gpio, 0)

    def close(self) -> None:
        try:
            self.off()
            self._pi.stop()
        except Exception:  # noqa: BLE001
            pass


# ── the two together ────────────────────────────────────────────────────────

class FittedIndicator(Indicator):
    """The build the contest unit ships with: a ring, a buzzer, or both.

    The repeating chirp runs on its own thread rather than from the scheduler
    tick. A dose alert has to keep sounding every twenty seconds until somebody
    presses the button, and hanging that off the tick would either make the tick
    slow or make the interval depend on it.
    """

    def __init__(self, ring: Ring | None = None, buzzer: Buzzer | None = None):
        self.ring = ring
        self.buzzer = buzzer
        self.fitted = tuple(
            name for name, part in (("ring", ring), ("buzzer", buzzer)) if part
        )
        self._alerting = threading.Event()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        if buzzer:
            self._thread = threading.Thread(target=self._chirp_loop,
                                            name="buzzer", daemon=True)
            self._thread.start()

    def _chirp_loop(self) -> None:
        while not self._stop.is_set():
            # Waits without spinning, and wakes the instant an alert starts.
            if self._alerting.wait(timeout=1.0):
                try:
                    self.buzzer.beep()
                except Exception:  # noqa: BLE001
                    # A failing buzzer must never take the dispenser down with
                    # it. The pills still come out; the room is just quieter.
                    log.exception("the buzzer failed; carrying on without it")
                    return
                self._stop.wait(config.BUZZER_REPEAT_S)

    def _show(self, colour: tuple[int, int, int]) -> None:
        if not self.ring:
            return
        try:
            self.ring.fill(colour)
        except Exception:  # noqa: BLE001
            log.exception("the LED ring failed; carrying on without it")
            self.ring = None

    def dose_ready(self, tray: int) -> None:
        log.info("indicator: green + chirp — tray %d is ready", tray)
        self._show(GREEN)
        self._alerting.set()

    def dose_taken(self, tray: int) -> None:
        log.info("indicator: blue — tray %d recorded as taken", tray)
        self._alerting.clear()
        self._show(BLUE)

    def dose_missed(self, tray: int) -> None:
        log.info("indicator: amber — tray %d was missed", tray)
        self._alerting.clear()
        self._show(AMBER)

    def schedule_accepted(self) -> None:
        log.info("indicator: violet — new schedule accepted")
        self._show(VIOLET)

    def clear(self) -> None:
        self._alerting.clear()
        self._show(OFF)

    def close(self) -> None:
        self._stop.set()
        self._alerting.clear()
        if self._thread:
            self._thread.join(timeout=2)
        if self.ring:
            self.ring.close()
        if self.buzzer:
            self.buzzer.close()


def make_indicator(want_ring: bool = True, want_buzzer: bool = True) -> Indicator:
    """Fit whatever is actually present, and log what is not.

    A part that fails to initialise is reported and skipped rather than being
    fatal. A dispenser that will not start because its buzzer is unplugged is
    strictly worse than a quiet one: the pills are what matter.
    """
    ring = buzzer = None

    if want_ring:
        try:
            ring = Ring()
        except Exception as exc:  # noqa: BLE001
            log.info("no LED ring (%s)", exc)

    if want_buzzer:
        try:
            buzzer = Buzzer()
        except Exception as exc:  # noqa: BLE001
            log.info("no buzzer (%s)", exc)

    if not ring and not buzzer:
        log.warning(
            "neither an LED ring nor a buzzer is available — the device will "
            "dispense silently and rely on the phone to notify anyone"
        )
        return LogIndicator()

    log.info("indicators fitted: %s", ", ".join(
        name for name, part in (("ring", ring), ("buzzer", buzzer)) if part))
    return FittedIndicator(ring=ring, buzzer=buzzer)
