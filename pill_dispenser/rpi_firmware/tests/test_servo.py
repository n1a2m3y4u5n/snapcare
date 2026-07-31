"""The servo layer: the shape of a drop, and the pin map behind it."""
from __future__ import annotations

import threading
import time

import pytest

from snapcare_dispenser import config
from snapcare_dispenser.servo import MockBackend, TrayServos, make_backend


def test_a_drop_runs_two_round_trips_then_stops():
    """The motion the hardware spec describes, from a tray resting at 0°:

        180° -> 0° -> 180° -> 0°, then silence.

    Two round trips, because one tip can leave a pill on the lip of the gate to
    ride back with the horn. The trailing zero is the part worth asserting:
    without it the servo is still being commanded to hold 0°, humming and
    drawing current for the twenty-three hours until the next dose, holding a
    position it is already mechanically resting in.
    """
    lo, hi = config.SERVO_MIN_US, config.SERVO_MAX_US
    backend = MockBackend()
    trays = TrayServos(backend=backend, pins={1: 17}, sleep=lambda _s: None)
    trays.drop(1)

    assert backend.angles(17) == [hi, lo, hi, lo, 0]


def test_every_command_in_the_stroke_gets_the_same_second():
    """Open loop: nothing on an SG90 reports arrival, so the wait is the guarantee.

    Including the last one. Cutting the signal the instant 0° is commanded
    would release the pin with the tray still part-way open.
    """
    waits = []
    trays = TrayServos(backend=MockBackend(), pins={1: 17}, sleep=waits.append)
    trays.drop(1)

    assert waits == [config.SERVO_STEP_S] * 4
    assert config.SERVO_STEP_S >= config.SERVO_TRAVEL_S, "a step must cover a traverse"


def test_only_one_servo_moves_at_a_time():
    """Eight SG90s starting together is a current step that browns out the board.

    The failure that guards against is not a blown regulator — it is a reset
    while a compartment is open.
    """
    class Tracking(MockBackend):
        """Counts pins that are being driven, not threads that want to be.

        The distinction is the whole test. Eight threads all *calling* drop is
        exactly the situation being guarded against; what must never happen is
        eight pins receiving pulses at once.
        """

        def __init__(self):
            super().__init__()
            self.driving: set[int] = set()
            self.peak = 0

        def set_pulse(self, gpio, microseconds):
            super().set_pulse(gpio, microseconds)
            self.driving.add(gpio)
            self.peak = max(self.peak, len(self.driving))

        def stop(self, gpio):
            super().stop(gpio)
            self.driving.discard(gpio)

    backend = Tracking()
    # A real sleep, so the threads genuinely overlap in time rather than each
    # running to completion before the next is scheduled.
    trays = TrayServos(backend=backend, pins={n: 10 + n for n in range(1, 9)},
                       sleep=lambda _s: time.sleep(0.005))

    threads = [threading.Thread(target=trays.drop, args=(n,)) for n in range(1, 9)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert backend.peak == 1, "two servos were driven at once"
    assert sum(trays.drops.values()) == 8
    assert backend.driving == set(), "every pin was released"


def test_the_pin_is_released_even_if_the_sweep_is_interrupted():
    class Exploding(MockBackend):
        def set_pulse(self, gpio, microseconds):
            super().set_pulse(gpio, microseconds)
            if microseconds == config.SERVO_MIN_US:
                raise RuntimeError("the servo jammed on the way back")

    backend = Exploding()
    trays = TrayServos(backend=backend, pins={1: 17}, sleep=lambda _s: None)
    with pytest.raises(RuntimeError):
        trays.drop(1)

    # A servo left holding against a jam cooks itself and browns out the board.
    assert backend.angles(17)[-1] == 0


def test_an_interrupted_drop_is_not_counted():
    class Exploding(MockBackend):
        def set_pulse(self, gpio, microseconds):
            raise RuntimeError("no power to the servo rail")

    trays = TrayServos(backend=Exploding(), pins={1: 17}, sleep=lambda _s: None)
    with pytest.raises(RuntimeError):
        trays.drop(1)
    assert trays.drops[1] == 0


def test_an_unwired_tray_is_refused():
    trays = TrayServos(backend=MockBackend(), pins={1: 17}, sleep=lambda _s: None)
    with pytest.raises(KeyError):
        trays.drop(4)


def test_per_tray_trim_is_applied(monkeypatch):
    monkeypatch.setattr(config, "SERVO_TRIM", {1: (520, 2450)})
    backend = MockBackend()
    trays = TrayServos(backend=backend, pins={1: 17}, sleep=lambda _s: None)
    trays.drop(1)
    assert backend.angles(17) == [2450, 520, 2450, 520, 0]


# ── the pin map ─────────────────────────────────────────────────────────────

def test_all_eight_trays_are_accepted_by_default():
    """Plugging a servo into a reserved pin is the whole job — no config edit.

    The cost is stated in `config.INSTALLED_TRAYS`: an SG90 reports nothing, so
    a schedule for a tray that is not physically there is accepted and silently
    never dispensed. `SNAPCARE_TRAYS` is how a build buys the refusal back.
    """
    assert sorted(config.tray_gpio()) == list(range(1, 9))
    assert config.INSTALLED_TRAYS == config.MAX_TRAYS


def test_a_build_can_still_declare_how_many_are_fitted(monkeypatch):
    monkeypatch.setattr(config, "INSTALLED_TRAYS", 3)
    assert sorted(config.tray_gpio()) == [1, 2, 3]


def test_the_full_map_is_eight_trays_on_distinct_pins():
    pins = config.tray_gpio(installed=config.MAX_TRAYS)
    assert sorted(pins) == list(range(1, 9))
    assert len(set(pins.values())) == 8


def test_the_number_of_fitted_trays_can_be_set_from_the_environment(monkeypatch):
    assert sorted(config.tray_gpio(installed=5)) == [1, 2, 3, 4, 5]
    monkeypatch.setattr(config, "INSTALLED_TRAYS", 8)
    assert sorted(config.tray_gpio()) == list(range(1, 9))


@pytest.mark.parametrize("count", [0, -1, 9, 99])
def test_an_impossible_tray_count_is_refused(count):
    with pytest.raises(ValueError):
        config.tray_gpio(installed=count)


def test_the_pins_avoid_the_ones_that_cost_hardware():
    """See the comment above TRAY_GPIO for why each of these is excluded.

    Checked over the whole eight, not just the fitted three — a pin that is
    wrong for tray 6 is worth catching now, not when the sixth hopper is fitted.
    """
    pins = set(config.tray_gpio(installed=config.MAX_TRAYS).values())
    assert not pins & {0, 1}, "GPIO 0/1 are the HAT ID EEPROM"
    # GPIO 2/3 have permanent pull-ups; a servo signal idling high before the
    # software starts slams the horn to one end at power-on. They are also
    # where the RTC lives on this build.
    assert not pins & {2, 3}, "GPIO 2/3 are I2C and are pulled up"
    assert not pins & {14, 15}, "GPIO 14/15 are the serial console"


def test_no_servo_collides_with_a_fitted_peripheral():
    """The ring, the buzzer and the button are on pins too, and a clash there
    is a servo that twitches every time the buzzer sounds."""
    pins = set(config.tray_gpio(installed=config.MAX_TRAYS).values())
    for name, pin in (("LED ring", config.RING_GPIO),
                      ("buzzer", config.BUZZER_GPIO),
                      ("button", config.BUTTON_GPIO)):
        assert pin not in pins, f"the {name} pin is also a servo pin"

    assert len({config.RING_GPIO, config.BUZZER_GPIO, config.BUTTON_GPIO}) == 3


def test_the_ring_is_on_a_pin_that_can_actually_drive_one():
    """rpi_ws281x generates the 800 kHz waveform with PWM or PCM, and only
    these four pins are wired to those peripherals. Any other choice is a ring
    that never lights and an error message about DMA."""
    assert config.RING_GPIO in (10, 12, 18, 21)


def test_the_pin_map_can_be_patched_from_the_environment(monkeypatch):
    monkeypatch.setenv("SNAPCARE_TRAY_GPIO", "1=21, 2=20")
    pins = config.tray_gpio()
    assert pins[1] == 21 and pins[2] == 20
    assert pins[3] == config.TRAY_GPIO[3], "an override must patch, not replace"


def test_two_trays_on_one_pin_is_refused(monkeypatch):
    """The symptom would be the right pill count from the wrong compartment.

    Nobody notices that until the wrong medication has been taken for a week,
    so it has to fail at startup instead.
    """
    monkeypatch.setenv("SNAPCARE_TRAY_GPIO", f"2={config.TRAY_GPIO[1]}")
    with pytest.raises(ValueError, match="both tray 1 and tray 2"):
        config.tray_gpio()


@pytest.mark.parametrize("override", ["9=17", "0=17", "1=99"])
def test_an_impossible_pin_map_is_refused(monkeypatch, override):
    monkeypatch.setenv("SNAPCARE_TRAY_GPIO", override)
    with pytest.raises(ValueError):
        config.tray_gpio()


# ── backend selection ───────────────────────────────────────────────────────

def test_the_mock_backend_can_be_asked_for_by_name():
    assert make_backend("mock").name == "mock"


def test_auto_falls_back_to_the_mock_off_a_pi():
    # No pigpiod and no RPi.GPIO on a development machine. The point is that it
    # falls back rather than raising: the API and the scheduler have to be
    # runnable end to end without hardware.
    backend = make_backend("auto")
    assert backend.name in ("pigpio", "rpigpio", "mock")


def test_an_unknown_backend_is_refused():
    with pytest.raises(ValueError):
        make_backend("magic")


def test_the_mock_backend_reports_itself_as_steady():
    """So the status page only warns about jitter when the fallback is real."""
    assert make_backend("mock").steady is True
