"""A tap on the glass releases a due dose, and does nothing else at all.

The screen is the only control this build fits, so the tap path carries the
whole release model on its own. The rule it has to hold is the rule the rest of
the firmware is built on: nothing leaves a hopper until a person has been
*offered* it. A tap is how somebody accepts a dose, never how they ask for one.

There was a mode that inverted this — any tap dropped a pill, so the machine had
something visible to do when pressed. These tests are what stops it coming back.
A hopper that can be walked empty one tap at a time by a visitor, a cleaner, or
the person themselves pressing twice because they were not sure, is a hopper
that runs out mid-week — and every pill taken that way is missing from a later
dose with nothing anywhere recording why.
"""
from __future__ import annotations

from datetime import datetime

import pytest

from snapcare_dispenser import daemon


@pytest.fixture
def machine(dispenser):
    """A `Daemon` with its constructor bypassed — only the press path is under
    test, and building a real one opens a server, a radio and a cloud link."""
    box = daemon.Daemon.__new__(daemon.Daemon)
    box.dispenser = dispenser
    box.servos = dispenser.servos
    return box


def test_a_tap_with_nothing_due_opens_nothing(machine):
    """The one that matters, and the one that regressed."""
    before = sum(machine.dispenser.servos.drops.values())
    machine._touch_pressed()  # noqa: SLF001
    assert sum(machine.dispenser.servos.drops.values()) == before


def test_a_tap_with_nothing_due_records_nothing(machine):
    """A carer reads the dose log to decide whether medication was taken. An
    idle tap must not put anything in front of them to interpret."""
    machine._touch_pressed()  # noqa: SLF001
    assert machine.dispenser.events(limit=1) == []


def test_many_taps_with_nothing_due_still_open_nothing(machine):
    """A hopper is not walkable one tap at a time."""
    for _ in range(20):
        machine._touch_pressed()  # noqa: SLF001
    assert sum(machine.dispenser.servos.drops.values()) == 0
    assert machine.dispenser.events(limit=1) == []


def test_a_tap_releases_a_due_dose(machine, clock):
    """The whole purpose of the glass."""
    ok, _ = machine.dispenser.apply_payload("SC1*W*1:0800-127-000")
    assert ok
    clock.set(datetime(2026, 7, 29, 8, 0))
    machine.dispenser.tick()
    assert [d.tray for d in machine.dispenser.awaiting_release] == [1]

    machine._touch_pressed()  # noqa: SLF001

    assert machine.dispenser.servos.drops[1] == 1
    assert machine.dispenser.awaiting_release == []


def test_a_tap_releases_a_due_dose_exactly_once(machine, clock):
    """Otherwise the press that matters gives out two pills."""
    ok, _ = machine.dispenser.apply_payload("SC1*W*1:0800-127-000")
    assert ok
    clock.set(datetime(2026, 7, 29, 8, 0))
    machine.dispenser.tick()

    machine._touch_pressed()  # noqa: SLF001
    machine._touch_pressed()  # noqa: SLF001

    assert machine.dispenser.servos.drops[1] == 1


def test_a_released_dose_is_recorded_as_a_dose_and_not_a_manual_drop(machine,
                                                                    clock):
    """A tap on the glass is the same event as a release from the app, and the
    log a carer reads has to say so."""
    ok, _ = machine.dispenser.apply_payload("SC1*W*1:0800-127-000")
    assert ok
    clock.set(datetime(2026, 7, 29, 8, 0))
    machine.dispenser.tick()

    machine._touch_pressed()  # noqa: SLF001

    event = machine.dispenser.events(limit=1)[0]
    assert event["reason"] != "manual"
    assert event["taken"] is True


def test_a_tap_before_the_dose_is_due_does_not_consume_it(machine, clock):
    """A tap at 07:50 must leave the 08:00 dose to be offered normally."""
    ok, _ = machine.dispenser.apply_payload("SC1*W*1:0800-127-000")
    assert ok

    clock.set(datetime(2026, 7, 29, 7, 50))
    machine._touch_pressed()  # noqa: SLF001

    clock.set(datetime(2026, 7, 29, 8, 0))
    machine.dispenser.tick()
    assert [d.tray for d in machine.dispenser.awaiting_release] == [1], \
        "the scheduled dose was swallowed by an idle tap"


def test_a_machine_that_cannot_move_claims_nothing(machine, clock, monkeypatch):
    """`release` refuses without a GPIO library rather than reporting a dose
    nothing delivered. The person is standing right there."""
    ok, _ = machine.dispenser.apply_payload("SC1*W*1:0800-127-000")
    assert ok
    clock.set(datetime(2026, 7, 29, 8, 0))
    machine.dispenser.tick()

    monkeypatch.setattr(type(machine.dispenser), "servos_usable",
                        property(lambda _self: False))
    machine._touch_pressed()  # noqa: SLF001

    assert sum(machine.dispenser.servos.drops.values()) == 0
    assert machine.dispenser.events(limit=1) == []


def test_a_tap_wakes_the_panel_even_with_nothing_due(machine):
    """The other half of what a tap means: somebody standing over the machine
    at three in the morning asking it to be readable."""
    woken = []
    machine.dispenser.indicator.attention = lambda: woken.append(True)

    machine._touch_pressed()  # noqa: SLF001

    assert woken == [True]


def test_a_panel_that_throws_while_waking_still_releases(machine, clock):
    """A palette is never worth a dose."""
    ok, _ = machine.dispenser.apply_payload("SC1*W*1:0800-127-000")
    assert ok
    clock.set(datetime(2026, 7, 29, 8, 0))
    machine.dispenser.tick()

    def boom():
        raise RuntimeError("the panel is gone")

    machine.dispenser.indicator.attention = boom

    machine._touch_pressed()  # noqa: SLF001

    assert machine.dispenser.servos.drops[1] == 1
