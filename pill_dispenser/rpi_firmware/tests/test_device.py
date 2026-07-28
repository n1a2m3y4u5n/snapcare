"""The dispenser end to end: schedule in, servo out, and what survives a reboot."""
from __future__ import annotations

from datetime import datetime

import pytest

from snapcare_dispenser import sc1
from snapcare_dispenser.device import Dispenser
from snapcare_dispenser.servo import MockBackend, TrayServos
from snapcare_dispenser.store import Store

from conftest import FakeClock


def gpio_moves(dispenser, tray):
    return dispenser.servos.backend.angles(dispenser.servos.pins[tray])


# ── accepting a plan ────────────────────────────────────────────────────────

def test_a_weekly_payload_is_accepted_and_stored(dispenser):
    ok, message = dispenser.apply_payload("SC1*W*1:0800.2000-127-030/3:1900-021-000")
    assert ok, message
    status = dispenser.status()
    assert status["payload"] == "SC1*W*1:0800.2000-127-030/3:1900-021-000"
    assert [s["tray"] for s in status["slots"]] == [1, 3]


def test_an_s_payload_is_accepted_and_says_what_it_lost(dispenser):
    ok, message = dispenser.apply_payload("SC1*S*1:0800")
    assert ok
    assert "no days or duration" in message


def test_rubbish_is_refused_without_disturbing_the_loaded_plan(dispenser):
    dispenser.apply_payload("SC1*W*1:0800-127-000")
    before = dispenser.status()["payload"]

    for payload in ["", "hello", "SC1*W*1:9999-127-000", "4006381333931",
                    "SC1*E*1*0800*T*01"]:
        ok, _ = dispenser.apply_payload(payload)
        assert not ok, payload

    assert dispenser.status()["payload"] == before


def test_a_plan_for_a_tray_with_no_servo_is_refused(store, clock):
    """Silently accepting it would be a device that reports healthy and never
    dispenses that medication."""
    servos = TrayServos(backend=MockBackend(), pins={1: 17, 2: 27},
                        sleep=lambda _s: None)
    device = Dispenser(store=store, servos=servos, clock=clock)

    ok, message = device.apply_payload("SC1*W*5:0800-127-000")
    assert not ok
    assert "no servo is wired" in message


# ── dispensing ──────────────────────────────────────────────────────────────

def test_a_due_dose_sweeps_the_right_servo(dispenser, clock):
    dispenser.apply_payload("SC1*W*3:0800-127-000")
    clock.set(datetime(2026, 7, 29, 8, 0))

    events = dispenser.tick()
    assert len(events) == 1
    assert events[0]["tray"] == 3 and events[0]["taken"]
    assert events[0]["sc1"].startswith("SC1*E*3*0800*T*")
    assert gpio_moves(dispenser, 3) == [2500, 500, 0]
    assert gpio_moves(dispenser, 1) == []


def test_nothing_moves_before_the_dose_is_due(dispenser, clock):
    dispenser.apply_payload("SC1*W*1:0800-127-000")
    clock.set(datetime(2026, 7, 29, 7, 59))
    assert dispenser.tick() == []
    assert gpio_moves(dispenser, 1) == []


def test_a_dose_is_not_dispensed_twice_in_one_day(dispenser, clock):
    dispenser.apply_payload("SC1*W*1:0800-127-000")
    clock.set(datetime(2026, 7, 29, 8, 0))
    assert len(dispenser.tick()) == 1
    clock.advance(minutes=5)
    assert dispenser.tick() == []
    assert gpio_moves(dispenser, 1).count(2500) == 1


def test_a_dose_past_its_window_is_logged_and_the_tray_stays_shut(dispenser, clock):
    dispenser.apply_payload("SC1*W*1:0800-127-000")
    clock.set(datetime(2026, 7, 29, 12, 0))

    events = dispenser.tick()
    assert len(events) == 1
    assert events[0]["taken"] is False
    assert events[0]["reason"] == "window-closed"
    assert events[0]["sc1"].startswith("SC1*E*1*0800*M*")
    assert gpio_moves(dispenser, 1) == [], "a missed dose must never open the tray"


def test_a_day_of_outage_does_not_empty_three_trays_into_one_hand(dispenser, clock):
    dispenser.apply_payload("SC1*W*1:0800.1300.2000-127-000")
    clock.set(datetime(2026, 7, 29, 20, 15))

    events = dispenser.tick()
    assert [(e["time"], e["taken"]) for e in events] == [
        ("0800", False), ("1300", False), ("2000", True),
    ]
    assert gpio_moves(dispenser, 1).count(2500) == 1


def test_a_jammed_servo_leaves_the_dose_owed(store, clock):
    """Mark-then-move would turn a jam into a dose the log says was given."""
    class Jamming(MockBackend):
        armed = True

        def set_pulse(self, gpio, microseconds):
            if self.armed and microseconds == 2500:
                raise RuntimeError("jammed")
            super().set_pulse(gpio, microseconds)

    backend = Jamming()
    servos = TrayServos(backend=backend, pins={1: 17}, sleep=lambda _s: None)
    device = Dispenser(store=store, servos=servos, clock=clock)
    device.apply_payload("SC1*W*1:0800-127-000")

    clock.set(datetime(2026, 7, 29, 8, 0))
    with pytest.raises(RuntimeError):
        device.tick()
    assert device.events() == [], "nothing may be logged for a dose that never came out"

    backend.armed = False
    clock.advance(minutes=10)
    events = device.tick()
    assert len(events) == 1 and events[0]["taken"]


# ── the clock gate ──────────────────────────────────────────────────────────

def test_nothing_is_dispensed_on_an_untrusted_clock(dispenser, clock):
    """A Pi has no RTC. `fake-hwclock` gives it a plausible, wrong time at boot,
    and a tray acting on that opens on the wrong days looking perfectly fine."""
    dispenser.apply_payload("SC1*W*1:0800-127-000")
    clock.set(datetime(2026, 7, 29, 8, 0))
    clock.distrust()

    assert dispenser.tick() == []
    assert gpio_moves(dispenser, 1) == []
    assert dispenser.status()["dispensing"] is False


def test_a_clock_code_unblocks_dispensing(dispenser, clock):
    dispenser.apply_payload("SC1*W*1:0800-127-000")
    clock.distrust()
    assert dispenser.tick() == []

    # 2026-07-29 08:00 is a Wednesday, which is 2.
    ok, message = dispenser.apply_payload("SC1*C*202607290800*2")
    assert ok, message
    assert dispenser.status()["dispensing"] is True
    assert len(dispenser.tick()) == 1


def test_a_clock_code_whose_weekday_is_wrong_is_refused(dispenser):
    ok, message = dispenser.apply_payload("SC1*C*202607290800*3")
    assert not ok
    assert "clock code" in message


# ── manual operation ────────────────────────────────────────────────────────

def test_a_manual_drop_does_not_cancel_the_scheduled_dose(dispenser, clock):
    """Otherwise checking the machine at the bench would stop it working."""
    dispenser.apply_payload("SC1*W*1:0800-127-000")
    clock.set(datetime(2026, 7, 29, 7, 0))

    record = dispenser.drop_now(1)
    assert record["reason"] == "manual"

    clock.set(datetime(2026, 7, 29, 8, 0))
    assert len(dispenser.tick()) == 1
    assert gpio_moves(dispenser, 1).count(2500) == 2


def test_confirming_records_the_dose_as_taken(dispenser, clock):
    dispenser.apply_payload("SC1*W*1:0800-127-000")
    clock.set(datetime(2026, 7, 29, 8, 0))
    dispenser.tick()

    assert dispenser.status()["awaitingConfirmation"] == {"tray": 1, "time": "0800"}
    record = dispenser.confirm_taken()
    assert record["confirmed"] and record["reason"] == "confirmed"
    assert dispenser.status()["awaitingConfirmation"] is None
    assert dispenser.confirm_taken() is None, "a stray press records nothing"


def test_an_unconfirmed_dose_stands_as_dispensed_rather_than_missed(dispenser, clock):
    """The pills physically left the tray. Logging that as 'missed' would prompt
    somebody to re-administer a dose that has already been given."""
    dispenser.apply_payload("SC1*W*1:0800-127-000")
    clock.set(datetime(2026, 7, 29, 8, 0))
    dispenser.tick()

    clock.advance(hours=1)
    dispenser.tick()
    assert dispenser.status()["awaitingConfirmation"] is None
    assert all(e["taken"] for e in dispenser.events())


def test_dismiss_records_nothing(dispenser, clock):
    dispenser.apply_payload("SC1*W*1:0800-127-000")
    clock.set(datetime(2026, 7, 29, 8, 0))
    dispenser.tick()
    before = len(dispenser.events())

    assert dispenser.dismiss() is True
    assert dispenser.dismiss() is False
    assert len(dispenser.events()) == before


# ── surviving a power cut ───────────────────────────────────────────────────

def test_a_restart_does_not_repeat_the_morning_dose(store, clock):
    """The single most important thing in this file.

    A power cut at 08:30, after the 08:00 dose has already been given. The
    device comes back inside the grace window, and without persisted state it
    would find the dose owed and dispense it a second time.
    """
    def build():
        return Dispenser(store=store,
                         servos=TrayServos(backend=MockBackend(),
                                           pins={n: 10 + n for n in range(1, 9)},
                                           sleep=lambda _s: None),
                         clock=clock)

    first = build()
    first.apply_payload("SC1*W*1:0800-127-000")
    clock.set(datetime(2026, 7, 29, 8, 0))
    assert len(first.tick()) == 1

    clock.set(datetime(2026, 7, 29, 8, 30))
    second = build()   # the reboot
    assert second.status()["payload"] == "SC1*W*1:0800-127-000"
    assert second.tick() == []
    assert gpio_moves(second, 1) == []


def test_the_next_days_dose_still_happens_after_a_restart(store, clock):
    def build():
        return Dispenser(store=store,
                         servos=TrayServos(backend=MockBackend(), pins={1: 17},
                                           sleep=lambda _s: None),
                         clock=clock)

    first = build()
    first.apply_payload("SC1*W*1:0800-127-000")
    clock.set(datetime(2026, 7, 29, 8, 0))
    first.tick()

    clock.set(datetime(2026, 7, 30, 8, 0))
    second = build()
    assert len(second.tick()) == 1


def test_a_new_schedule_forgets_what_the_old_one_dispensed(store, clock):
    """Correct for a new prescription, and the reason `load` and `restore` are
    different calls."""
    device = Dispenser(store=store,
                       servos=TrayServos(backend=MockBackend(), pins={1: 17},
                                         sleep=lambda _s: None),
                       clock=clock)
    device.apply_payload("SC1*W*1:0800-127-000")
    clock.set(datetime(2026, 7, 29, 8, 0))
    assert len(device.tick()) == 1

    device.apply_payload("SC1*W*1:0800.1200-127-000")   # a different plan
    clock.advance(minutes=1)
    assert len(device.tick()) == 1, "the new course starts from scratch"


def test_state_from_a_different_schedule_is_not_applied(store, clock, tmp_path):
    device = Dispenser(store=store,
                       servos=TrayServos(backend=MockBackend(), pins={1: 17},
                                         sleep=lambda _s: None),
                       clock=clock)
    device.apply_payload("SC1*W*1:0800-127-000")
    clock.set(datetime(2026, 7, 29, 8, 0))
    device.tick()

    # Rewrite the schedule file only, leaving stale state behind — which is
    # what a half-completed write during a power cut would leave.
    store.save_schedule(sc1.decode_weekly("SC1*W*1:0900-127-000"), source="test")
    revived = Dispenser(store=store,
                        servos=TrayServos(backend=MockBackend(), pins={1: 17},
                                          sleep=lambda _s: None),
                        clock=clock)
    clock.set(datetime(2026, 7, 29, 9, 0))
    assert len(revived.tick()) == 1


def test_a_corrupt_state_file_does_not_stop_the_device(store, clock):
    store.state_file.write_text("{ this is not json")
    store.schedule_file.write_text("neither is this")
    device = Dispenser(store=store,
                       servos=TrayServos(backend=MockBackend(), pins={1: 17},
                                         sleep=lambda _s: None),
                       clock=clock)
    assert device.status()["slots"] == []
    ok, _ = device.apply_payload("SC1*W*1:0800-127-000")
    assert ok


def test_the_event_log_survives_a_restart_and_the_sequence_continues(store, clock):
    def build():
        return Dispenser(store=store,
                         servos=TrayServos(backend=MockBackend(), pins={1: 17},
                                           sleep=lambda _s: None),
                         clock=clock)

    first = build()
    first.drop_now(1)
    first.drop_now(1)
    assert [e["seq"] for e in first.events()] == [1, 0]

    second = build()
    record = second.drop_now(1)
    assert record["seq"] == 2, "the sequence must not restart and confuse the phone"
    assert len(second.events()) == 3


def test_the_event_log_is_bounded(store, clock, monkeypatch):
    from snapcare_dispenser import config
    monkeypatch.setattr(config, "EVENT_LOG_LIMIT", 10)
    device = Dispenser(store=store,
                       servos=TrayServos(backend=MockBackend(), pins={1: 17},
                                         sleep=lambda _s: None),
                       clock=clock)
    for _ in range(25):
        device.drop_now(1)
    assert len(device.events(limit=500)) == 10


def test_status_reports_the_pin_map_and_the_servo_driver(dispenser):
    status = dispenser.status()
    assert status["trays"] == list(range(1, 9))
    assert status["pins"]["1"] == 11
    assert status["servoBackend"] == "mock"


def test_the_next_dose_is_reported(dispenser, clock):
    dispenser.apply_payload("SC1*W*1:0800.2000-127-000")
    clock.set(datetime(2026, 7, 29, 9, 0))
    assert dispenser.status()["nextDose"] == {"tray": 1, "time": "2000"}


def test_a_store_backed_by_an_unwritable_path_fails_loudly(tmp_path):
    """Better a device that will not start than one that cannot remember doses."""
    blocker = tmp_path / "state"
    blocker.write_text("I am a file, not a directory")
    with pytest.raises(OSError):
        Store(blocker)
