"""Driving the eight tray servos.

The servo rests at 0°. One pill drop is two round trips from there — 180°, 0°,
180°, 0° — because a single tip can leave a pill on the lip of the gate to ride
back with the horn. Nothing on an SG90 reports its position, so the move is
open-loop: the firmware commands an angle and waits `SERVO_STEP_S` for the horn
to get there.

Three things here are not obvious and all three cost hardware if they are got
wrong.

**Pulses stop between doses.** After the sweep, the signal to that pin is cut
entirely rather than being held at 0°. A servo that is still being told to hold
a position draws current continuously, hums, fights anyone who nudges the tray,
and heats up — for twenty-three hours and fifty-nine minutes out of the day, to
hold a position it is already mechanically resting in. Cutting the signal makes
the tray silent and cold between doses, and is what the Arduino build was doing
when it attached the Servo object only for the moment it moved.

**Only one servo moves at a time.** A stalled SG90 pulls around 700 mA. Eight of
them starting together is a current step no small supply survives, and the
failure mode is not a blown regulator — it is a brown-out that reboots the Pi
*while a compartment is open*. The lock below is what makes "one at a time" true
even when the schedule owes three doses at the same minute and the web page is
being poked at the same time.

**Timing comes from the DMA controller, not from Python.** `pigpio` generates
pulses with the Pi's DMA engine, so a busy CPU cannot lengthen one. RPi.GPIO's
software PWM is timed by a Python thread, and every kernel preemption of that
thread shows up as a twitch and an audible buzz. It is the fallback, not the
choice, and the firmware says so at startup.
"""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass

from . import config

log = logging.getLogger(__name__)

#: Servo control is a 50 Hz frame. Only the software-PWM fallback needs to know.
SERVO_FRAME_HZ = 50


class ServoBackend:
    """The three-call interface every backend provides."""

    name = "none"
    #: Whether pulse timing is immune to CPU load. False means visible jitter.
    steady = False

    def set_pulse(self, gpio: int, microseconds: int) -> None:
        raise NotImplementedError

    def stop(self, gpio: int) -> None:
        """Cut the signal to this pin — the servo goes limp and silent."""
        raise NotImplementedError

    def close(self) -> None:
        pass


class PigpioBackend(ServoBackend):
    """DMA-timed pulses. Needs `pigpiod` running: `sudo systemctl enable --now pigpiod`."""

    name = "pigpio"
    steady = True

    def __init__(self):
        import pigpio  # imported here so the module loads on a laptop

        self._pi = pigpio.pi()
        if not self._pi.connected:
            # pigpio is a daemon, not a library. The import succeeding proves
            # nothing about whether anything can actually drive a pin, and a
            # dispenser that reports itself healthy while every drop silently
            # does nothing is the worst outcome available here.
            raise RuntimeError(
                "pigpio is installed but pigpiod is not running — "
                "sudo systemctl enable --now pigpiod"
            )

    def set_pulse(self, gpio: int, microseconds: int) -> None:
        self._pi.set_servo_pulsewidth(gpio, microseconds)

    def stop(self, gpio: int) -> None:
        self._pi.set_servo_pulsewidth(gpio, 0)  # 0 means "send no pulses"

    def close(self) -> None:
        for gpio in config.tray_gpio().values():
            try:
                self._pi.set_servo_pulsewidth(gpio, 0)
            except Exception:  # noqa: BLE001 - shutdown must not raise
                pass
        self._pi.stop()


class RpiGpioBackend(ServoBackend):
    """Software PWM. Works with nothing installed but jitters under load."""

    name = "rpigpio"
    steady = False

    def __init__(self):
        import RPi.GPIO as GPIO

        self._GPIO = GPIO
        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)
        self._pwm: dict[int, object] = {}

    def _channel(self, gpio: int):
        if gpio not in self._pwm:
            self._GPIO.setup(gpio, self._GPIO.OUT)
            channel = self._GPIO.PWM(gpio, SERVO_FRAME_HZ)
            channel.start(0)
            self._pwm[gpio] = channel
        return self._pwm[gpio]

    def set_pulse(self, gpio: int, microseconds: int) -> None:
        # A 50 Hz frame is 20 000 µs, so the duty cycle is the pulse width as a
        # fraction of that.
        duty = (microseconds / (1_000_000 / SERVO_FRAME_HZ)) * 100
        self._channel(gpio).ChangeDutyCycle(duty)

    def stop(self, gpio: int) -> None:
        if gpio in self._pwm:
            self._pwm[gpio].ChangeDutyCycle(0)

    def close(self) -> None:
        for channel in self._pwm.values():
            channel.stop()
        self._pwm.clear()
        self._GPIO.cleanup()


@dataclass
class MockMove:
    """One recorded command, so a test can assert on the shape of the motion."""

    at: float
    gpio: int
    microseconds: int  # 0 = pulses stopped


class MockBackend(ServoBackend):
    """Records what it was told to do. This is what the test suite drives.

    It is also what runs if you start the firmware on a laptop, so the
    scheduler, the API and the web page can all be exercised end to end with no
    Pi, no servos and no pills.
    """

    name = "mock"
    steady = True

    def __init__(self):
        self.moves: list[MockMove] = []
        self._clock = time.monotonic

    def set_pulse(self, gpio: int, microseconds: int) -> None:
        self.moves.append(MockMove(self._clock(), gpio, microseconds))

    def stop(self, gpio: int) -> None:
        self.moves.append(MockMove(self._clock(), gpio, 0))

    def angles(self, gpio: int) -> list[int]:
        """The pulse widths this pin was given, in order, for readable asserts."""
        return [m.microseconds for m in self.moves if m.gpio == gpio]


def make_backend(preference: str | None = None) -> ServoBackend:
    """Pick a driver. `auto` tries pigpio, then RPi.GPIO, then the mock."""
    choice = (preference or config.SERVO_BACKEND or "auto").lower()

    if choice == "mock":
        return MockBackend()
    if choice == "pigpio":
        return PigpioBackend()
    if choice == "rpigpio":
        return RpiGpioBackend()
    if choice != "auto":
        raise ValueError(f"unknown servo backend {choice!r}")

    try:
        return PigpioBackend()
    except Exception as exc:  # noqa: BLE001 - any failure means "try the next one"
        log.info("pigpio unavailable (%s)", exc)

    try:
        backend = RpiGpioBackend()
        log.warning(
            "falling back to RPi.GPIO software PWM — servos will jitter and hum "
            "audibly. Install pigpio and enable pigpiod for steady pulses."
        )
        return backend
    except Exception as exc:  # noqa: BLE001
        log.info("RPi.GPIO unavailable (%s)", exc)

    log.warning(
        "no GPIO available — running with the mock servo backend. "
        "Drops will be logged and nothing will physically move."
    )
    return MockBackend()


class TrayServos:
    """The eight trays, and the one operation the rest of the firmware needs."""

    def __init__(self, backend: ServoBackend | None = None,
                 pins: dict[int, int] | None = None,
                 sleep=time.sleep):
        self.backend = backend or make_backend()
        self.pins = pins if pins is not None else config.tray_gpio()
        self._sleep = sleep
        # Not an optimisation. See the module docstring: this is what keeps
        # eight servos from ever starting together on one supply.
        self._lock = threading.Lock()
        self.drops: dict[int, int] = {tray: 0 for tray in self.pins}

    @property
    def trays(self) -> list[int]:
        return sorted(self.pins)

    def gpio_for(self, tray: int) -> int:
        if tray not in self.pins:
            raise KeyError(f"tray {tray} is not wired — see TRAY_GPIO in config.py")
        return self.pins[tray]

    def drop(self, tray: int) -> None:
        """One pill drop: two round trips from the resting 0°, then silence.

            (resting at 0°) -> 180° -> 0° -> 180° -> 0°

        Four commands, `SERVO_STEP_S` apart. The stroke runs twice because one
        tip does not reliably clear the gate — a pill can sit on the lip and
        ride back with the horn, which reads as a dose given and is not one.

        Blocks for about `4 * SERVO_STEP_S` — four seconds at the default
        figures — and blocks every other tray for the same period. Callers that
        must stay responsive should run this on a worker thread; the daemon does.
        """
        gpio = self.gpio_for(tray)
        rest_us, far_us = config.servo_range(tray)
        stroke = (far_us, rest_us, far_us, rest_us)

        with self._lock:
            log.info("tray %d: drop (GPIO %d)", tray, gpio)
            try:
                for pulse_us in stroke:
                    self.backend.set_pulse(gpio, pulse_us)
                    # Open loop: nothing reports arrival, so the wait is the
                    # only thing that says the horn got there. The last one
                    # matters as much as the rest — cutting the signal early
                    # leaves the tray part-way open.
                    self._sleep(config.SERVO_STEP_S)
            finally:
                # Even if the sweep was interrupted, stop driving the pin. A
                # servo left holding against a jam is a servo that cooks itself
                # and browns out the board doing it.
                self.backend.stop(gpio)

        self.drops[tray] = self.drops.get(tray, 0) + 1

    def park(self, tray: int) -> None:
        """Send one tray to its rest position and release it.

        For a servo installed with the horn on wrong, or one that was knocked
        out of position with the power off. Not part of any dose path.
        """
        gpio = self.gpio_for(tray)
        rest_us, _ = config.servo_range(tray)
        with self._lock:
            self.backend.set_pulse(gpio, rest_us)
            self._sleep(config.SERVO_TRAVEL_S)
            self.backend.stop(gpio)

    def close(self) -> None:
        self.backend.close()
