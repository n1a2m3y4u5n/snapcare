"""Driving the eight tray servos.

The servo rests at 0°. One pill drop is out and back — 180°, wait, 0° — with the
gate held open for a full second in between, which is what gives a pill time to
clear it under its own weight. Nothing on an SG90 reports its position, so the
move is open-loop: the firmware commands an angle and waits `SERVO_STEP_S` for
the horn to get there.

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

**Where the timing comes from decides how good it is.** There are three answers
and they are not close to each other:

    pigpio    DMA-timed. A busy CPU cannot lengthen a pulse. Best, and gone
              from Raspberry Pi OS as of the Trixie rebase — see gpiochip.py.
    lgpio     timed by an ordinary thread calling clock_nanosleep, at normal
              priority. Scheduler jitter reaches the servo. Good enough, and
              in practice the only thing available on a current card.
    RPi.GPIO  software PWM timed by a *Python* thread. Every preemption is a
              twitch and an audible buzz. Last resort.

The firmware says which one it got, at startup and in `/api/status`, and
`--selftest` will not sign off a build that landed on the last one.

**A backend that cannot move anything must not be quiet about it.** The mock
records what it was told and moves nothing, which is exactly right on a laptop
and catastrophic on a Pi: without `moves_hardware` below, a device with no GPIO
library at all runs the scheduler, writes "dispensed" into the dose log, and
publishes it to the carer's phone — a full record of medication that is still
sitting in the hopper. `device.py` refuses to dispense in that state instead.
"""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass

from . import config, gpiochip

log = logging.getLogger(__name__)

#: Servo control is a 50 Hz frame. The software-PWM fallback needs it to work
#: out a duty cycle, and lgpio takes it as an argument.
SERVO_FRAME_HZ = 50


class ServoBackend:
    """The three-call interface every backend provides."""

    name = "none"
    #: Whether pulse timing is immune to CPU load. False means visible jitter.
    steady = False
    #: How the pulses are timed, for a status page that can say something
    #: useful rather than repeating a boolean.
    quality = "none"
    #: **Does a command to this backend move a physical horn?** False for the
    #: mock, and the one flag that stands between a dead device and a dose log
    #: full of medication nobody received.
    moves_hardware = False

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
    quality = "dma"
    moves_hardware = True

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


class LgpioBackend(ServoBackend):
    """Thread-timed pulses through the gpiochip character device.

    What replaced pigpio on Raspberry Pi OS, and on a Trixie card the only
    thing there is. `python3-lgpio` is preinstalled on every Pi OS Lite image
    since 2023 and needs no daemon.

    Honestly: the pulses are timed by a normal-priority thread, so a loaded Pi
    can stretch one and the horn fidgets. Better than Python-timed PWM by a
    wide margin, worse than DMA, and the status page says which one this is.

    Two lgpio specifics are load-bearing here:

    - **`tx_servo` takes the handle first** and a frequency argument pigpio
      does not have. Transposing them against pigpio's `set_servo_pulsewidth`
      is a pulse width interpreted as a GPIO number.
    - **Stopping does not drive the line low.** See `gpiochip.stop_pin`: a stop
      that lands mid-pulse leaves the signal high, which is a pulse that never
      ends. Every stop here goes through that helper.
    """

    name = "lgpio"
    steady = False
    quality = "threaded"
    moves_hardware = True

    def __init__(self):
        import lgpio  # noqa: PLC0415 - imported here so the module loads on a laptop

        self._lgpio = lgpio
        handle = gpiochip.open_chip()
        if handle is None:
            raise RuntimeError(gpiochip.unavailable_reason())
        self._handle = handle
        self._claimed: set[int] = set()

    def _claim(self, gpio: int) -> None:
        if gpio in self._claimed:
            return
        # Claimed low. A servo line that idles high before the first command
        # slams the horn to one end, which with a loaded tray on it is a
        # mechanical stop taking the full torque.
        self._lgpio.gpio_claim_output(self._handle, gpio, 0)
        self._claimed.add(gpio)

    def set_pulse(self, gpio: int, microseconds: int) -> None:
        self._claim(gpio)
        self._lgpio.tx_servo(self._handle, gpio, microseconds, SERVO_FRAME_HZ)

    def stop(self, gpio: int) -> None:
        try:
            self._lgpio.tx_servo(self._handle, gpio, 0)
        except Exception:  # noqa: BLE001 - nothing may be transmitting
            pass
        # Not optional, and not the same thing. See the module docstring in
        # gpiochip.py: the line above stops the pulse train and leaves the pin
        # wherever it was.
        gpiochip.stop_pin(self._handle, gpio)

    def close(self) -> None:
        for gpio in list(self._claimed):
            try:
                self.stop(gpio)
                self._lgpio.gpio_free(self._handle, gpio)
            except Exception:  # noqa: BLE001 - shutdown must not raise
                pass
        self._claimed.clear()


class RpiGpioBackend(ServoBackend):
    """Software PWM. Works with nothing installed but jitters under load."""

    name = "rpigpio"
    steady = False
    quality = "python"
    moves_hardware = True

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
    #: Nothing can jitter what nothing drives, so this is `True` in the only
    #: sense the field has — and `moves_hardware` below is the field that
    #: actually matters about this class.
    steady = True
    quality = "none"
    moves_hardware = False

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


#: `auto` walks this in order, best first. Naming one explicitly skips the walk
#: and lets the failure raise, which is what a bench session wants.
_BACKENDS = {
    "pigpio": PigpioBackend,
    "lgpio": LgpioBackend,
    "rpigpio": RpiGpioBackend,
    "mock": MockBackend,
}


def servo_backends() -> tuple[str, ...]:
    """Every driver name `make_backend` accepts, for a CLI or a status page.

    Derived rather than duplicated. The hand-written copy in `daemon.py` had
    fallen a driver behind — it was missing `lgpio`, which on Raspberry Pi OS
    Trixie is the only one that exists.
    """
    return tuple(_BACKENDS)


def make_backend(preference: str | None = None) -> ServoBackend:
    """Pick a driver. `auto` tries pigpio, then lgpio, then RPi.GPIO, then the mock.

    pigpio stays first because DMA timing is genuinely better, but it is no
    longer the expected answer: it is absent from Raspberry Pi OS Trixie
    entirely, so on a current card the walk lands on lgpio and that is fine.
    """
    choice = (preference or config.SERVO_BACKEND or "auto").lower()

    if choice != "auto":
        if choice not in _BACKENDS:
            raise ValueError(f"unknown servo backend {choice!r}")
        # Deliberately not caught. Somebody who asked for a named backend wants
        # to be told why it is not there, not handed a different one.
        return _BACKENDS[choice]()

    for name in ("pigpio", "lgpio", "rpigpio"):
        try:
            backend = _BACKENDS[name]()
        except Exception as exc:  # noqa: BLE001 - any failure means "try the next one"
            log.info("%s unavailable (%s)", name, exc)
            continue

        if backend.quality == "python":
            log.warning(
                "falling back to RPi.GPIO software PWM — servos will jitter and "
                "hum audibly. Install python3-lgpio for steadier pulses."
            )
        elif backend.quality == "threaded":
            log.info(
                "servo pulses are timed by lgpio's thread, not by DMA — a "
                "loaded Pi can stretch one. This is the expected driver on "
                "Raspberry Pi OS Trixie, where pigpio is no longer packaged."
            )
        return backend

    # Not `warning`. On a Raspberry Pi this is a device that cannot dispense,
    # and `device.py` will refuse to pretend otherwise — so it is an error even
    # though the process carries on running and serving its pages.
    log.error(
        "NO GPIO LIBRARY IS AVAILABLE — nothing can physically move. "
        "Install one:  sudo apt install python3-lgpio. "
        "Until then this device will refuse to dispense rather than log doses "
        "that never left the hopper."
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

    def settle(self, seconds: float) -> None:
        """조용히 기다린다. 알약이 칸을 다 통과할 때까지.

        여기 있는 이유는 하나뿐이다 — 시험이 진짜로 기다리지 않게 하려고. 이 클래스는
        `sleep` 을 주입받고(`__init__`), 시험은 그것을 무동작으로 바꿔 놓는다. 호출부가
        `time.sleep` 을 직접 부르면 배출이 여럿 걸린 시험 하나가 몇 초씩 걸린다.

        서보 락을 잡지 않는다. 아무것도 안 움직이는 시간이고, 다른 스레드가 이 사이에
        트레이를 열어야 한다면 그것은 이 대기가 막을 수 있는 종류의 문제가 아니다.
        """
        self._sleep(seconds)

    def drop(self, tray: int) -> None:
        """One pill drop: out, hold, back, then silence.

            (resting at 0°) -> 180° -> wait -> 0°

        Two commands, `SERVO_STEP_S` apart. The hold at the far end is what
        actually does the work: the gate is open for a full second, which is
        long enough for a pill to clear it under its own weight rather than
        being swept past.

        Blocks for about `2 * SERVO_STEP_S` and holds the servo lock for the
        same period, so no other tray moves meanwhile. Callers that must stay
        responsive should run this on a worker thread; the daemon does.
        """
        gpio = self.gpio_for(tray)
        rest_us, far_us = config.servo_range(tray)
        stroke = (far_us, rest_us)

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
