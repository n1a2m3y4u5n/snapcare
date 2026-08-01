"""The take-dose button, and the rule that makes it safe.

The button is the physical twin of the app's release button, and the whole of
its safety model is one sentence: it releases what is already due and does
nothing at all otherwise. These tests are that sentence.

None of them need a GPIO. `TakeDoseButton(backend="none")` is a real
configuration — a build with no button fitted — and `_fire` is the same entry
point the interrupt takes, so driving it directly exercises the code that runs.
"""
from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from snapcare_dispenser import config, gpiochip, sc1
from snapcare_dispenser.button import TakeDoseButton
from snapcare_dispenser.device import Dispenser


# ── the button on its own ───────────────────────────────────────────────────

def test_a_build_with_no_button_is_inert_rather_than_broken():
    """A dispenser with no button fitted is a valid build — the app still
    releases doses. It must construct, report itself honestly, and never fire."""
    fired = []
    button = TakeDoseButton(lambda: fired.append(1), backend="none")
    try:
        assert button.backend == "none"
        assert button.presses == 0
        assert not fired
    finally:
        button.close()


def test_a_press_calls_the_handler_once_and_is_counted():
    fired = []
    button = TakeDoseButton(lambda: fired.append(1), backend="none")
    try:
        button._fire()  # noqa: SLF001 - exactly what the interrupt calls
        assert fired == [1]
        assert button.presses == 1
    finally:
        button.close()


def test_a_handler_that_throws_does_not_kill_the_button():
    """It runs on the GPIO library's notification thread, where there is nowhere
    above it for an exception to go. A button that stops working after one bad
    press is a button nobody can tell is broken."""
    calls = []

    def handler():
        calls.append(1)
        raise RuntimeError("the servo jammed")

    button = TakeDoseButton(handler, backend="none")
    try:
        button._fire()  # noqa: SLF001 - must not raise
        button._fire()  # noqa: SLF001
        assert len(calls) == 2, "the second press still reached the handler"
        assert button.presses == 2
    finally:
        button.close()


def test_presses_are_counted_before_the_handler_runs():
    """`--selftest` reads this count to tell a working button from a chattering
    one, so a handler that throws must still leave the press recorded."""
    button = TakeDoseButton(lambda: (_ for _ in ()).throw(OSError("boom")),
                            backend="none")
    try:
        button._fire()  # noqa: SLF001
        assert button.presses == 1
    finally:
        button.close()


def test_the_button_pin_clashes_with_nothing_else_on_the_header():
    """Two things on one pin means a press moves a hopper. Asserted here rather
    than left to a reading of config.py, because the tray map is the file people
    edit and this is the pin most likely to be re-used by accident."""
    assert config.BUTTON_GPIO not in config.tray_gpio().values()
    assert config.BUTTON_GPIO != config.BUZZER_GPIO
    assert config.BUTTON_GPIO not in (config.DISPLAY_DC_GPIO,
                                      config.DISPLAY_RESET_GPIO)
    assert config.BUTTON_GPIO not in (config.RTC_SCLK_GPIO, config.RTC_IO_GPIO,
                                      config.RTC_CE_GPIO)


# ── what a press actually does ──────────────────────────────────────────────

def offer(dispenser, clock, payload="SC1*W*1:0800-127-000"):
    """Put a dose on the wire, wind the clock to it, and let the tick offer it."""
    dispenser.set_schedule(sc1.decode_any_schedule(payload), source="test")
    clock.set(datetime(2026, 7, 29, 8, 0))
    dispenser.tick()
    return dispenser


def test_a_press_with_a_dose_due_opens_the_tray_and_records_it(
        dispenser, servos, clock, store):
    offer(dispenser, clock)
    assert len(dispenser.awaiting_release) == 1

    released = dispenser.release()

    assert [r["tray"] for r in released] == [1]
    assert released[0]["taken"] is True
    assert released[0]["reason"] == "released"
    assert servos.drops[1] == 1
    assert dispenser.awaiting_release == []


def test_a_press_with_nothing_due_does_nothing_at_all(dispenser, servos, clock, store):
    """The whole safety model. This is a take-dose button, not a dispense
    button — otherwise a curious visitor walks a hopper empty one press at a
    time, and every one of those pills is missing from a dose later."""
    dispenser.set_schedule(sc1.decode_any_schedule("SC1*W*1:0800-127-000"),
                           source="test")
    clock.set(datetime(2026, 7, 29, 12, 0))
    dispenser.tick()
    # 12:00 is well past the 08:00 window, so the tick recorded a miss and is
    # offering nothing. That is the state an idle machine spends its day in.
    assert dispenser.awaiting_release == []
    before = len(store.read_events(limit=50))

    assert dispenser.release() == []
    assert servos.drops.get(1, 0) == 0, "no tray moved"
    assert len(store.read_events(limit=50)) == before, "and nothing was written down"


def test_a_second_press_during_the_bounce_releases_nothing_more(
        dispenser, servos, clock):
    """Debouncing is for diagnosis here, not safety — but that is only true
    because the second call finds nothing left waiting. If that stopped being
    true, a chattering switch would empty a hopper."""
    offer(dispenser, clock)

    first = dispenser.release()
    second = dispenser.release()

    assert len(first) == 1
    assert second == []
    assert servos.drops[1] == 1


def test_a_press_after_the_window_closed_releases_nothing(
        dispenser, servos, clock, store):
    """Pressing the button at 09:30 for an 08:00 dose the device has already
    written off must not produce a pill. The device's own sense of what is due
    is the authority — the same rule a stale notification hits."""
    offer(dispenser, clock)

    clock.advance(minutes=config.GRACE_MINUTES + 1)
    dispenser.tick()                       # the window closes here
    assert dispenser.awaiting_release == []

    assert dispenser.release() == []
    assert servos.drops.get(1, 0) == 0

    events = store.read_events(limit=10)
    assert len(events) == 1
    assert events[0]["taken"] is False
    assert events[0]["reason"] == "not-released"


def test_a_press_releases_every_tray_due_at_the_same_minute(
        dispenser, servos, clock):
    """Two trays owed at 08:00 are two medications for 08:00. Making somebody
    press twice is how the second one gets forgotten."""
    offer(dispenser, clock, "SC1*W*1:0800-127-000/2:0800-127-000")
    assert len(dispenser.awaiting_release) == 2

    released = dispenser.release()

    assert sorted(r["tray"] for r in released) == [1, 2]
    assert servos.drops[1] == 1 and servos.drops[2] == 1


def test_a_press_on_a_device_that_cannot_move_refuses_rather_than_claiming(
        dispenser, clock, store, monkeypatch):
    """The one moment somebody is standing there having asked for medication. A
    device that recorded a dose it could not physically deliver would put the
    lie exactly where a carer reads it."""
    offer(dispenser, clock)
    assert len(dispenser.awaiting_release) == 1
    before = len(store.read_events(limit=50))

    # A mock backend on a laptop is the dev harness and is fine. The same mock
    # backend on a Raspberry Pi means every GPIO library is missing and nothing
    # can move — same code, opposite meanings, and this is what tells them apart.
    monkeypatch.setattr(gpiochip, "on_raspberry_pi", lambda *a, **k: True)
    assert not dispenser.servos_usable

    with pytest.raises(RuntimeError, match="lgpio"):
        dispenser.release()

    assert len(store.read_events(limit=50)) == before
    assert len(dispenser.awaiting_release) == 1, "the dose is still owed"
