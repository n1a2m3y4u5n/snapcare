"""The fitted peripherals: the ring, the buzzer, the button and the RTC.

None of these need the parts to be present. What is being tested is the
behaviour around them — that a missing one degrades instead of crashing, that a
present one is driven in the right order, and that the RTC is believed only when
it deserves to be.
"""
from __future__ import annotations

from datetime import datetime

import pytest

from snapcare_dispenser import config, indicators, rtc
from snapcare_dispenser.button import ConfirmButton
from snapcare_dispenser.clock import Clock
from snapcare_dispenser.indicators import (
    AMBER, BLUE, GREEN, OFF, VIOLET, FittedIndicator, LogIndicator, make_indicator,
)


class FakeRing:
    def __init__(self):
        self.colours = []

    def fill(self, colour):
        self.colours.append(colour)

    def close(self):
        self.colours.append("closed")


class FakeBuzzer:
    def __init__(self):
        self.beeps = 0

    def beep(self, seconds=None):
        self.beeps += 1

    def off(self):
        pass

    def close(self):
        pass


# ── the colour vocabulary ───────────────────────────────────────────────────

def test_each_event_shows_its_colour():
    """Carried over from the Arduino build unchanged, so somebody who has used
    one device understands the other."""
    ring = FakeRing()
    indicator = FittedIndicator(ring=ring, buzzer=None)

    indicator.dose_ready(1)
    indicator.dose_taken(1)
    indicator.dose_missed(2)
    indicator.schedule_accepted()
    indicator.clear()

    assert ring.colours == [GREEN, BLUE, AMBER, VIOLET, OFF]


def test_the_ring_reports_itself_as_fitted():
    assert FittedIndicator(ring=FakeRing(), buzzer=None).fitted == ("ring",)
    assert FittedIndicator(ring=None, buzzer=FakeBuzzer()).fitted == ("buzzer",)
    assert FittedIndicator(ring=FakeRing(), buzzer=FakeBuzzer()).fitted == ("ring", "buzzer")
    assert LogIndicator().fitted == ()


# ── the chirp ───────────────────────────────────────────────────────────────

def test_the_buzzer_sounds_while_a_dose_waits_and_stops_when_confirmed(monkeypatch):
    """The chirp is what fetches somebody from another room. Without it the
    confirm button is close to useless — nobody acknowledges what they never
    noticed — and the log fills with unconfirmed doses."""
    monkeypatch.setattr(config, "BUZZER_REPEAT_S", 0.01)
    buzzer = FakeBuzzer()
    indicator = FittedIndicator(ring=None, buzzer=buzzer)

    try:
        indicator.dose_ready(1)
        _wait_until(lambda: buzzer.beeps >= 3, "the buzzer never repeated")

        indicator.dose_taken(1)
        settled = buzzer.beeps
        _sleep(0.1)
        assert buzzer.beeps == settled, "the chirp continued after confirmation"
    finally:
        indicator.close()


def test_dismissing_also_silences_the_chirp(monkeypatch):
    monkeypatch.setattr(config, "BUZZER_REPEAT_S", 0.01)
    buzzer = FakeBuzzer()
    indicator = FittedIndicator(ring=None, buzzer=buzzer)
    try:
        indicator.dose_ready(1)
        _wait_until(lambda: buzzer.beeps >= 1, "the buzzer never sounded")
        indicator.clear()
        settled = buzzer.beeps
        _sleep(0.1)
        assert buzzer.beeps == settled
    finally:
        indicator.close()


def test_nothing_sounds_when_no_dose_is_waiting(monkeypatch):
    monkeypatch.setattr(config, "BUZZER_REPEAT_S", 0.01)
    buzzer = FakeBuzzer()
    indicator = FittedIndicator(ring=None, buzzer=buzzer)
    try:
        indicator.schedule_accepted()
        _sleep(0.08)
        assert buzzer.beeps == 0
    finally:
        indicator.close()


# ── degrading ───────────────────────────────────────────────────────────────

def test_a_failing_ring_does_not_take_the_dispenser_down():
    """The pills still come out; the device is just dark."""
    class BrokenRing(FakeRing):
        def fill(self, colour):
            raise OSError("the ring is not there")

    indicator = FittedIndicator(ring=BrokenRing(), buzzer=None)
    indicator.dose_ready(1)      # must not raise
    indicator.dose_taken(1)
    assert indicator.ring is None, "a broken ring is dropped rather than retried forever"


def test_a_device_with_neither_part_still_works(monkeypatch):
    monkeypatch.setattr(indicators, "Ring",
                        lambda *a, **k: (_ for _ in ()).throw(OSError("no ring")))
    monkeypatch.setattr(indicators, "Buzzer",
                        lambda *a, **k: (_ for _ in ()).throw(OSError("no buzzer")))
    indicator = make_indicator()
    assert isinstance(indicator, LogIndicator)
    indicator.dose_ready(1)      # must not raise


def test_one_missing_part_does_not_disable_the_other(monkeypatch):
    monkeypatch.setattr(indicators, "Ring", lambda *a, **k: FakeRing())
    monkeypatch.setattr(indicators, "Buzzer",
                        lambda *a, **k: (_ for _ in ()).throw(OSError("no buzzer")))
    indicator = make_indicator()
    try:
        assert indicator.fitted == ("ring",)
    finally:
        indicator.close()


# ── the confirm button ──────────────────────────────────────────────────────

def test_a_button_with_no_gpio_is_inert_rather_than_fatal():
    presses = []
    button = ConfirmButton(lambda: presses.append(1))
    try:
        # On a laptop there is no GPIO of any kind, and that has to be a device
        # that runs without a button rather than a device that will not start.
        assert button.backend in ("none", "pigpio", "poll")
    finally:
        button.close()


def test_a_handler_that_throws_does_not_kill_the_button():
    """Otherwise the button silently stops working for the rest of the device's
    life, and nothing anywhere says so."""
    calls = []

    def handler():
        calls.append(1)
        raise RuntimeError("the dispenser was busy")

    button = ConfirmButton(handler, backend="none")
    try:
        button._fire()
        button._fire()
        assert len(calls) == 2
    finally:
        button.close()


def test_the_button_and_the_web_page_take_the_same_path(dispenser, clock):
    """A press and a tap must be indistinguishable downstream, or the dose log
    would record where the confirmation came from rather than that it happened."""
    dispenser.apply_payload("SC1*W*1:0800-127-000")
    clock.set(datetime(2026, 7, 29, 8, 0))
    dispenser.tick()

    button = ConfirmButton(lambda: dispenser.confirm_taken(), backend="none")
    try:
        button._fire()
    finally:
        button.close()

    assert dispenser.status()["awaitingConfirmation"] is None
    assert dispenser.events()[0]["reason"] == "confirmed"


def test_a_press_with_nothing_waiting_records_nothing(dispenser):
    before = len(dispenser.events())
    ConfirmButton(lambda: dispenser.confirm_taken(), backend="none")._fire()
    assert len(dispenser.events()) == before


# ── the RTC ─────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def fresh_rtc_cache():
    rtc.invalidate()
    yield
    rtc.invalidate()


def test_no_rtc_is_not_a_trustworthy_rtc(monkeypatch):
    monkeypatch.setattr(rtc, "kernel_rtc_present", lambda *a: False)
    state = rtc.read_status()
    assert not state.present and not state.trustworthy
    assert state.running is None


def test_a_stopped_oscillator_is_not_trusted(monkeypatch):
    """The failure this check exists for. A dead coin cell does not make the
    chip vanish from the bus — it makes it answer, promptly, with nonsense."""
    monkeypatch.setattr(rtc, "kernel_rtc_present", lambda *a: True)
    monkeypatch.setattr(rtc, "_read_status_uncached", lambda *a: rtc.RtcState(
        present=True, running=False, detail="oscillator stopped"))
    assert not rtc.read_status().trustworthy


def test_a_running_oscillator_is_trusted(monkeypatch):
    monkeypatch.setattr(rtc, "_read_status_uncached", lambda *a: rtc.RtcState(
        present=True, running=True, detail="fine"))
    assert rtc.read_status().trustworthy


def test_being_unable_to_read_the_flag_is_not_the_same_as_a_failed_chip(monkeypatch):
    """None means 'we could not tell'; False means 'this chip is lying'. Only
    the second is a statement about the hardware, and the status page says so."""
    monkeypatch.setattr(rtc, "_read_status_uncached", lambda *a: rtc.RtcState(
        present=True, running=None, detail="smbus2 is not installed"))
    state = rtc.read_status()
    assert state.present and state.running is None
    assert not state.trustworthy, "uncertain must fall towards the tray staying shut"


def test_the_status_is_cached(monkeypatch):
    calls = []

    def counted(*_args):
        calls.append(1)
        return rtc.RtcState(present=True, running=True, detail="fine")

    monkeypatch.setattr(rtc, "_read_status_uncached", counted)
    for _ in range(20):
        rtc.read_status()
    assert len(calls) == 1, "the I2C bus was opened on every tick"


# ── the RTC and the clock together ──────────────────────────────────────────

def test_a_healthy_rtc_lets_the_device_dispense_with_no_network(monkeypatch):
    """The whole reason for fitting one: correct time through a power cut, on a
    device that may never see NTP."""
    monkeypatch.setattr("snapcare_dispenser.clock.ntp_synchronised", lambda *a, **k: False)
    monkeypatch.setattr(rtc, "_read_status_uncached", lambda *a: rtc.RtcState(
        present=True, running=True, detail="fine"))

    clock = Clock(source=lambda: datetime(2026, 7, 29, 8, 0))
    assert clock.source == "rtc"
    assert clock.trusted


def test_a_flat_rtc_battery_leaves_the_tray_shut(monkeypatch):
    monkeypatch.setattr("snapcare_dispenser.clock.ntp_synchronised", lambda *a, **k: False)
    monkeypatch.setattr(rtc, "_read_status_uncached", lambda *a: rtc.RtcState(
        present=True, running=False, detail="oscillator stopped"))

    clock = Clock(source=lambda: datetime(2026, 7, 29, 8, 0))
    assert clock.source == "untrusted"
    assert not clock.trusted


def test_ntp_outranks_the_rtc(monkeypatch):
    """NTP is continuously corrected; the RTC drifts. When both are available
    the answer should say so."""
    monkeypatch.setattr("snapcare_dispenser.clock.ntp_synchronised", lambda *a, **k: True)
    monkeypatch.setattr(rtc, "_read_status_uncached", lambda *a: rtc.RtcState(
        present=True, running=True, detail="fine"))

    assert Clock(source=lambda: datetime(2026, 7, 29, 8, 0)).source == "ntp"


def test_a_clock_that_predates_the_firmware_is_never_trusted(monkeypatch):
    """No correct clock can read 2019, whatever is vouching for it."""
    monkeypatch.setattr("snapcare_dispenser.clock.ntp_synchronised", lambda *a, **k: True)
    assert not Clock(source=lambda: datetime(2019, 1, 1)).trusted


def test_the_status_page_explains_an_untrusted_rtc(monkeypatch):
    monkeypatch.setattr("snapcare_dispenser.clock.ntp_synchronised", lambda *a, **k: False)
    monkeypatch.setattr(rtc, "_read_status_uncached", lambda *a: rtc.RtcState(
        present=True, running=False, detail="its battery is flat"))

    status = Clock(source=lambda: datetime(2026, 7, 29, 8, 0)).status()
    assert status["trusted"] is False
    assert status["rtc"]["present"] is True
    assert "battery is flat" in status["rtc"]["detail"]


# ── helpers ─────────────────────────────────────────────────────────────────

def _sleep(seconds):
    import time
    time.sleep(seconds)


def _wait_until(predicate, message, timeout=3.0):
    import time
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.005)
    raise AssertionError(message)
