"""The demonstration drop: a tap with no dose behind it still opens a tray.

This mode deliberately inverts the rule the rest of the firmware is built on —
nothing leaves a hopper until somebody has been offered it — because the machine
is demonstrated far more often than it is deployed and one that does nothing
visible when you press it demonstrates badly.

What these tests hold is the line around that. A demonstration drop may open a
tray; it may **not** touch the schedule, and it may not be recorded as anything
a carer would read as a dose. If those two ever stop being true, the mode has
stopped being a demonstration and started being a way to lose a dose.
"""
from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from snapcare_dispenser import config, daemon


@pytest.fixture
def machine(dispenser, monkeypatch):
    """A `Daemon` with its constructor bypassed — only the press path is under
    test, and building a real one opens a server, a radio and a cloud link."""
    box = daemon.Daemon.__new__(daemon.Daemon)
    box.dispenser = dispenser
    box.servos = dispenser.servos
    box._demo_next = 0
    monkeypatch.setattr(config, "TOUCH_DEMO_DROP", True)
    monkeypatch.setattr(config, "TOUCH_DEMO_TRAY", 0)
    return box


def test_a_tap_with_nothing_due_still_drops_a_pill(machine):
    """The whole point of the mode: press it, something happens."""
    before = dict(machine.dispenser.servos.drops)
    machine._touch_pressed()  # noqa: SLF001
    after = dict(machine.dispenser.servos.drops)
    assert sum(after.values()) == sum(before.values()) + 1


def test_a_demonstration_drop_is_not_recorded_as_a_dose(machine):
    """A carer reads the dose log to decide whether medication was taken. A
    demonstration must never be able to answer that question for them."""
    machine._touch_pressed()  # noqa: SLF001
    event = machine.dispenser.events(limit=1)[0]
    assert event["reason"] == "manual"
    assert event["taken"] is True and event["confirmed"] is True


def test_a_demonstration_drop_does_not_consume_the_real_dose(machine, clock):
    """The one that matters. `drop_now` deliberately does not touch the
    scheduler, so a tap at 07:50 must not stop the 08:00 dose being offered —
    otherwise a demonstration in the morning costs somebody their medication."""
    ok, _ = machine.dispenser.apply_payload("SC1*W*1:0800-127-000")
    assert ok

    clock.set(datetime(2026, 7, 29, 7, 50))
    machine._touch_pressed()  # noqa: SLF001

    clock.set(datetime(2026, 7, 29, 8, 0))
    machine.dispenser.tick()
    waiting = machine.dispenser.awaiting_release
    assert [d.tray for d in waiting] == [1], "the scheduled dose was swallowed"


def test_a_tap_that_releases_a_real_dose_does_not_also_drop_one(machine, clock):
    """Otherwise the press that matters gives out two pills."""
    ok, _ = machine.dispenser.apply_payload("SC1*W*1:0800-127-000")
    assert ok
    clock.set(datetime(2026, 7, 29, 8, 0))
    machine.dispenser.tick()

    before = sum(machine.dispenser.servos.drops.values())
    machine._touch_pressed()  # noqa: SLF001
    assert sum(machine.dispenser.servos.drops.values()) == before + 1


def test_the_mode_can_be_switched_off(machine, monkeypatch):
    """A machine somebody relies on has to be able to keep the release model."""
    monkeypatch.setattr(config, "TOUCH_DEMO_DROP", False)
    before = sum(machine.dispenser.servos.drops.values())
    machine._touch_pressed()  # noqa: SLF001
    assert sum(machine.dispenser.servos.drops.values()) == before


def test_repeated_taps_spread_across_the_fitted_trays(machine):
    """Cycling shows every hopper works, and does not empty one of them over a
    long demonstration while the rest stay full."""
    fitted = sorted(machine.dispenser.servos.pins)
    for _ in range(2 * len(fitted)):
        machine._touch_pressed()  # noqa: SLF001
    opened = machine.dispenser.servos.drops
    assert all(opened[tray] == 2 for tray in fitted), opened


def test_a_pinned_tray_is_honoured(machine, monkeypatch):
    """For a demonstration where only one hopper is loaded."""
    monkeypatch.setattr(config, "TOUCH_DEMO_TRAY", 2)
    for _ in range(3):
        machine._touch_pressed()  # noqa: SLF001
    assert machine.dispenser.servos.drops[2] == 3
    assert machine.dispenser.servos.drops[1] == 0


def test_a_machine_that_cannot_move_claims_nothing(machine, monkeypatch):
    """`drop_now` refuses without a GPIO library rather than reporting a drop
    nothing performed — this is the path the assembly guide uses to prove
    wiring, and a green tick there on a dead machine is the worst possible
    moment for one."""
    monkeypatch.setattr(type(machine.dispenser), "servos_usable",
                        property(lambda _self: False))
    machine._touch_pressed()  # noqa: SLF001
    assert sum(machine.dispenser.servos.drops.values()) == 0
    assert machine.dispenser.events(limit=1) == []
