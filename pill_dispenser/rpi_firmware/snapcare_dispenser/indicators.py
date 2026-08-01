"""How the device talks to the person standing in front of it.

The project's founding constraint is that the person cannot be assumed to read.
So the channel to them is a colour and a sound, never text — which is why the
Arduino build had an LED ring and a piezo and no display facing the user, and
why this build has the same two things.

The pairing is the point, and it is not redundancy. A ring alone only works if
somebody happens to be looking at it. The chirp is what fetches a person from
another room; the colour is what tells them what is going on once they arrive.

That matters more in this build than it did in the last one. The pills do not
leave the hopper until somebody taps release in the app, so the chirp is not a
notification about something that has already happened — it is the entire
prompt. A device with no sound waits an hour for a tap that nobody was told to
make, and then records a missed dose.

The colour vocabulary is carried over from the Arduino firmware, with green
meaning one step earlier in the story than it used to:

    green + chirp   a dose is due; release it from the app to get it
    blue            released — the pills are in the cup
    amber           the dose went untaken, or its window closed
    violet          a new schedule was accepted

One colour is new in this build, and it is deliberately outside that vocabulary:

    cyan            the device is waiting to be put on a WiFi network

It is a light and **never** a sound. A chirp has meant "there are pills in the
cup" since the Arduino build, and spending it on a network problem would teach
the one person the whole project is built around to walk over and find nothing
there. Cyan is also the reason the device is findable at all when setup has not
happened yet: without it, a dispenser sitting on its own hotspot waiting to be
configured is indistinguishable from a dispenser that is switched off, and the
only cue anybody gets is the app staying empty.

A standing dose alert always wins the ring. Medication is the job; the network
is how the schedule got here.

Everything above this module calls the methods on `Indicator`. What they do
depends on which class is installed, so a device built without a ring still
works — it just relies on the phone for notification, and says so on its status
page rather than pretending a light is blinking.
"""
from __future__ import annotations

import logging
import threading

from . import config, gpiochip

log = logging.getLogger(__name__)

#: The colour vocabulary, as GRB-agnostic RGB tuples.
GREEN = (0, 200, 60)
BLUE = (0, 90, 255)
AMBER = (255, 130, 0)
VIOLET = (150, 0, 255)
CYAN = (0, 170, 190)
OFF = (0, 0, 0)


class Indicator:
    """No-op base. Every method must be safe to call from any thread."""

    #: What this device actually has fitted, for the status page.
    fitted: tuple[str, ...] = ()

    def dose_due(self, tray: int) -> None: ...
    def dose_released(self, tray: int) -> None: ...
    def dose_missed(self, tray: int) -> None: ...
    def schedule_accepted(self) -> None: ...
    def network_needs_setup(self) -> None: ...
    def network_online(self) -> None: ...
    def silence(self) -> None: ...
    def clear(self) -> None: ...
    def close(self) -> None: ...


class LogIndicator(Indicator):
    """Writes what a fitted ring and buzzer would have done.

    This is what runs on a laptop and what the tests assert against. It is not
    a placeholder for a broken device — a dispenser with neither part fitted is
    a valid build, and this is the honest description of it.
    """

    fitted = ()

    def dose_due(self, tray: int) -> None:
        log.info("indicator: green + chirp — tray %d is due, waiting for a release", tray)

    def dose_released(self, tray: int) -> None:
        log.info("indicator: blue — tray %d released", tray)

    def dose_missed(self, tray: int) -> None:
        log.info("indicator: amber — tray %d was missed", tray)

    def schedule_accepted(self) -> None:
        log.info("indicator: violet — new schedule accepted")

    def network_needs_setup(self) -> None:
        log.info("indicator: cyan — waiting to be put on a network")

    def network_online(self) -> None:
        log.info("indicator: cyan off — on a network")

    def silence(self) -> None:
        log.info("indicator: chirp silenced; the light stands")

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
    """A piezo element driven as a square wave.

    Any GPIO will do — the tone is software-timed PWM, so this does not compete
    for a hardware PWM channel with the ring.

    **This used to be pigpio and nothing else,** which was the single worst
    consequence of pigpio leaving Raspberry Pi OS. There was no fallback: on a
    Trixie card the buzzer simply did not exist, the failure was logged at INFO
    once at startup, and `/api/status` said nothing about it at all as long as
    the ring had come up. The device then ran in silence — and the module
    docstring above is explicit about what that costs now that the chirp is the
    prompt rather than an announcement. A dose nobody is told about is a dose
    nobody releases, and an hour later it is a missed dose in the log.

    So there are two drivers now, picked the same way the servos pick theirs,
    and `fitted` on the indicator reports which parts are genuinely present.
    """

    def __init__(self, gpio: int | None = None, backend: str = "auto"):
        self.gpio = gpio if gpio is not None else config.BUZZER_GPIO
        self.backend = "none"
        self._pi = None
        self._lgpio = None
        self._handle = None

        tried = []
        for name in (("pigpio", "lgpio") if backend == "auto" else (backend,)):
            try:
                getattr(self, f"_start_{name}")()
            except Exception as exc:  # noqa: BLE001 - try the next driver
                tried.append(f"{name}: {exc}")
                continue
            self.backend = name
            log.info("buzzer on GPIO %d (%s)", self.gpio, name)
            self.off()
            return

        raise RuntimeError("; ".join(tried) or f"unknown buzzer backend {backend!r}")

    def _start_pigpio(self) -> None:
        import pigpio  # noqa: PLC0415

        pi = pigpio.pi()
        if not pi.connected:
            # The import succeeding proves nothing: pigpio is a daemon, and the
            # client library installs on machines where the daemon cannot.
            pi.stop()
            raise RuntimeError("pigpiod is not running")
        self._pi = pi
        self._pi.set_mode(self.gpio, pigpio.OUTPUT)

    def _start_lgpio(self) -> None:
        import lgpio  # noqa: PLC0415

        handle = gpiochip.open_chip()
        if handle is None:
            raise RuntimeError(gpiochip.unavailable_reason())
        self._lgpio = lgpio
        self._handle = handle
        lgpio.gpio_claim_output(handle, self.gpio, 0)

    def beep(self, seconds: float | None = None) -> None:
        import time  # noqa: PLC0415

        duration = seconds if seconds is not None else config.BUZZER_BEEP_S
        if self.backend == "pigpio":
            self._pi.set_PWM_frequency(self.gpio, config.BUZZER_HZ)
            self._pi.set_PWM_dutycycle(self.gpio, 128)  # square wave, loudest
            time.sleep(duration)
        else:
            # lgpio's duty cycle is a percentage, not pigpio's 0-255. Passing
            # 128 here would be clamped to 100% — a pin held high, which is a
            # piezo making no sound at all while drawing current.
            self._lgpio.tx_pwm(self._handle, self.gpio, config.BUZZER_HZ, 50)
            time.sleep(duration)
        self.off()

    def off(self) -> None:
        if self.backend == "pigpio":
            self._pi.set_PWM_dutycycle(self.gpio, 0)
        elif self.backend == "lgpio":
            # Both halves. Cancelling the transmission leaves the pin wherever
            # the timing thread last wrote it, and a piezo left high sits under
            # DC bias for as long as the device is powered.
            gpiochip.stop_pin(self._handle, self.gpio)

    def close(self) -> None:
        try:
            self.off()
            if self.backend == "pigpio":
                self._pi.stop()
            elif self.backend == "lgpio":
                self._lgpio.gpio_free(self._handle, self.gpio)
        except Exception:  # noqa: BLE001 - shutdown must not raise
            pass


# ── the two together ────────────────────────────────────────────────────────

class FittedIndicator(Indicator):
    """The build the contest unit ships with: a ring, a buzzer, or both.

    The repeating chirp runs on its own thread rather than from the scheduler
    tick. A dose alert has to keep sounding every twenty seconds until somebody
    releases the dose, and hanging that off the tick would either make the tick
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
        #: Standing "put me on a network" request, so that a dose can borrow the
        #: ring and hand it back rather than cancelling the hint outright.
        self._needs_network = False
        self._showing = OFF
        # The scheduler tick, the release path on an HTTP thread, the cloud's
        # command poll and the network worker all paint this ring. Filling it is
        # twelve writes and a latch, and two threads interleaving there is one
        # frame of wrong colours on a device whose colours are the entire user
        # interface.
        self._paint = threading.Lock()
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
        with self._paint:
            self._showing = colour
            if not self.ring:
                return
            try:
                self.ring.fill(colour)
            except Exception:  # noqa: BLE001
                log.exception("the LED ring failed; carrying on without it")
                self.ring = None

    def dose_due(self, tray: int) -> None:
        log.info("indicator: green + chirp — tray %d is due, waiting for a release", tray)
        self._show(GREEN)
        self._alerting.set()

    def dose_released(self, tray: int) -> None:
        log.info("indicator: blue — tray %d released", tray)
        self._alerting.clear()
        self._show(BLUE)

    def dose_missed(self, tray: int) -> None:
        log.info("indicator: amber — tray %d was missed", tray)
        self._alerting.clear()
        self._show(AMBER)

    def schedule_accepted(self) -> None:
        log.info("indicator: violet — new schedule accepted")
        self._show(VIOLET)

    def network_needs_setup(self) -> None:
        log.info("indicator: cyan — waiting to be put on a network")
        self._needs_network = True
        # No buzzer, ever, and never over a dose that is still waiting to be
        # taken. Both rules are in the module docstring, and both are about not
        # spending the alert vocabulary on something that is not medication.
        if not self._alerting.is_set():
            self._show(CYAN)

    def network_online(self) -> None:
        if not self._needs_network:
            return
        log.info("indicator: cyan off — on a network")
        self._needs_network = False
        # Only if cyan is what is actually lit. Anything else on the ring is a
        # dose being reported, and that outranks this.
        if self._showing == CYAN:
            self._show(OFF)

    def silence(self) -> None:
        """Stop the chirp; leave the ring showing whatever it was showing.

        Somebody who silences a chime has asked for quiet, not withdrawn their
        medication — the dose is still owed and still releasable. Taking the
        light down too would leave a device with a dose waiting and nothing at
        all to say so, which on a build with no screen is the device lying.
        """
        log.info("indicator: chirp silenced; the light stands")
        self._alerting.clear()

    def clear(self) -> None:
        self._alerting.clear()
        # Back to cyan rather than dark if the network is still not set up: the
        # hint has to outlive the dose that borrowed the ring, or a device that
        # was never configured goes quietly dark after its first dose.
        self._show(CYAN if self._needs_network else OFF)

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
            "neither an LED ring nor a buzzer is available — a dose due here is "
            "announced by the app alone, so a phone that misses the notification "
            "is a dose nobody is told about"
        )
        return LogIndicator()

    if want_buzzer and not buzzer:
        # At WARNING, not INFO, and said in terms of the consequence rather
        # than the missing library. A ring with no chirp only works if somebody
        # happens to be looking at it, and on this build the chirp is the prompt
        # to go and release the dose — not an announcement that it has already
        # been delivered.
        log.warning(
            "NO BUZZER — a due dose will light the ring but nothing will sound. "
            "Nobody releases a dose they were never told about, so expect the "
            "log to fill with doses that expired untaken. "
            "sudo apt install python3-lgpio"
        )

    log.info("indicators fitted: %s", ", ".join(
        name for name, part in (("ring", ring), ("buzzer", buzzer)) if part))
    return FittedIndicator(ring=ring, buzzer=buzzer)
