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


def drops(dispenser, tray):
    """How many drops this tray has run.

    Taken from the servo's own tally rather than counted out of the pulse
    stream, so these tests say "one dose" and go on saying it if the shape of
    the stroke changes — it now passes 180° twice per drop.
    """
    return dispenser.servos.drops.get(tray, 0)


def waiting(dispenser):
    """The (tray, time) pairs this device is currently offering."""
    return [(d.tray, sc1.format_hhmm(d.minutes)) for d in dispenser.awaiting_release]


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


# ── offering, and releasing ─────────────────────────────────────────────────

def test_a_due_dose_is_offered_and_opens_nothing_until_it_is_released(dispenser, clock):
    """The whole model in one test. At its minute the dose is *offered* — the
    ring goes green, the chirp starts — and the hopper is untouched. Only the
    tap opens it."""
    dispenser.apply_payload("SC1*W*3:0800-127-000")
    clock.set(datetime(2026, 7, 29, 8, 0))

    assert dispenser.tick() == [], "an offer is not an event; nothing has happened yet"
    assert waiting(dispenser) == [(3, "0800")]
    assert gpio_moves(dispenser, 3) == [], "the tray must not open until somebody asks"
    assert dispenser.events() == [], "and nothing may be written down either"

    records = dispenser.release()
    assert len(records) == 1
    assert records[0]["tray"] == 3 and records[0]["taken"]
    assert records[0]["reason"] == "released" and records[0]["confirmed"]
    assert records[0]["sc1"].startswith("SC1*E*3*0800*T*")
    assert gpio_moves(dispenser, 3) == [2500, 500, 2500, 500, 0]
    assert gpio_moves(dispenser, 1) == []
    assert waiting(dispenser) == []


def test_nothing_is_offered_before_the_dose_is_due(dispenser, clock):
    dispenser.apply_payload("SC1*W*1:0800-127-000")
    clock.set(datetime(2026, 7, 29, 7, 59))
    assert dispenser.tick() == []
    assert waiting(dispenser) == []
    assert dispenser.release() == [], "there is nothing to release yet"
    assert gpio_moves(dispenser, 1) == []


def test_a_dose_is_offered_once_and_released_once(dispenser, clock):
    """The tick runs every fifteen seconds. Without the skip set it would
    re-raise the alert four times a minute for the whole hour."""
    dispenser.apply_payload("SC1*W*1:0800-127-000")
    clock.set(datetime(2026, 7, 29, 8, 0))
    dispenser.tick()

    for _ in range(4):
        clock.advance(minutes=1)
        assert dispenser.tick() == []
        assert waiting(dispenser) == [(1, "0800")], "still the same one dose"

    assert len(dispenser.release()) == 1
    clock.advance(minutes=5)
    assert dispenser.tick() == []
    assert dispenser.release() == [], "a second tap must not open the tray again"
    assert drops(dispenser, 1) == 1


def test_a_dose_past_its_window_is_logged_and_never_offered(dispenser, clock):
    """The device was off for the whole hour, so nobody was ever asked."""
    dispenser.apply_payload("SC1*W*1:0800-127-000")
    clock.set(datetime(2026, 7, 29, 12, 0))

    events = dispenser.tick()
    assert len(events) == 1
    assert events[0]["taken"] is False
    assert events[0]["reason"] == "window-closed"
    assert events[0]["sc1"].startswith("SC1*E*1*0800*M*")
    assert waiting(dispenser) == []
    assert gpio_moves(dispenser, 1) == [], "a missed dose must never open the tray"


def test_a_dose_nobody_releases_is_recorded_missed_and_the_tray_stays_shut(dispenser, clock):
    """The safety property the whole model exists for.

    The old build dropped the pills at 08:00 and asked for a button press
    afterwards, so an unconfirmed dose was a cup of pills sitting in an empty
    room — and the honest reading of that was "given", because they had
    physically left the hopper. Asking first inverts it: nothing left the
    hopper, so nothing was given, and that is what the log has to say.
    """
    dispenser.apply_payload("SC1*W*1:0800-127-000")
    clock.set(datetime(2026, 7, 29, 8, 0))
    dispenser.tick()
    assert waiting(dispenser) == [(1, "0800")]

    clock.set(datetime(2026, 7, 29, 9, 1))   # one minute past the grace window
    events = dispenser.tick()

    assert len(events) == 1
    assert events[0]["taken"] is False
    assert events[0]["reason"] == "not-released"
    assert events[0]["sc1"].startswith("SC1*E*1*0800*M*")
    assert waiting(dispenser) == []
    assert gpio_moves(dispenser, 1) == [], "the pills must still be in the machine"
    assert dispenser.release() == [], "and the window cannot be reopened by a late tap"


def test_a_dose_offered_late_keeps_the_remainder_of_its_window_not_a_fresh_one(dispenser, clock):
    """A power cut until 08:45 leaves fifteen minutes of the 08:00 hour, not
    another hour. The deadline comes from the dose, not from when it was
    noticed."""
    dispenser.apply_payload("SC1*W*1:0800-127-000")
    clock.set(datetime(2026, 7, 29, 8, 45))
    dispenser.tick()
    assert waiting(dispenser) == [(1, "0800")]

    clock.set(datetime(2026, 7, 29, 9, 1))
    events = dispenser.tick()
    assert len(events) == 1 and events[0]["reason"] == "not-released"


def test_a_day_of_outage_does_not_offer_three_doses_at_once(dispenser, clock):
    """Three doses one tap away is the same overdose as three doses in one
    hand. The two that are past their window are reported and never offered."""
    dispenser.apply_payload("SC1*W*1:0800.1300.2000-127-000")
    clock.set(datetime(2026, 7, 29, 20, 15))

    events = dispenser.tick()
    assert [(e["time"], e["taken"]) for e in events] == [("0800", False), ("1300", False)]
    assert waiting(dispenser) == [(1, "2000")], "only the one still inside its window"

    assert len(dispenser.release()) == 1
    assert drops(dispenser, 1) == 1


def test_two_trays_due_at_once_are_released_together(dispenser, clock):
    """Two medications for 08:00 are two medications for 08:00. Making somebody
    tap twice is how the second one gets forgotten."""
    dispenser.apply_payload("SC1*W*1:0800-127-000/2:0800-127-000")
    clock.set(datetime(2026, 7, 29, 8, 0))
    dispenser.tick()
    assert waiting(dispenser) == [(1, "0800"), (2, "0800")]

    records = dispenser.release()
    assert sorted(r["tray"] for r in records) == [1, 2]
    assert drops(dispenser, 1) == 1 and drops(dispenser, 2) == 1


def test_a_release_can_name_one_dose(dispenser, clock):
    """What a notification about a specific dose sends, and what the relay's
    command channel passes through."""
    dispenser.apply_payload("SC1*W*1:0800-127-000/2:0800-127-000")
    clock.set(datetime(2026, 7, 29, 8, 0))
    dispenser.tick()

    records = dispenser.release(tray=2, minutes=8 * 60)
    assert [r["tray"] for r in records] == [2]
    assert waiting(dispenser) == [(1, "0800")], "the other is untouched and still owed"
    assert drops(dispenser, 1) == 0


def test_a_release_naming_a_dose_that_is_not_due_moves_nothing(dispenser, clock):
    """A stale notification tapped an hour late. Not an error, and not a pill."""
    dispenser.apply_payload("SC1*W*1:0800-127-000")
    clock.set(datetime(2026, 7, 29, 8, 0))
    dispenser.tick()

    assert dispenser.release(tray=1, minutes=13 * 60) == [], "wrong time"
    assert dispenser.release(tray=4) == [], "wrong tray"
    assert drops(dispenser, 1) == 0
    assert waiting(dispenser) == [(1, "0800")], "the real dose is still waiting"


def test_a_jammed_servo_leaves_the_dose_owed(store, clock):
    """Mark-then-move would turn a jam into a dose the log says was given. The
    dose stays offered, so a second tap inside the window still gets it."""
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
    device.tick()
    with pytest.raises(RuntimeError):
        device.release()
    assert device.events() == [], "nothing may be logged for a dose that never came out"
    assert waiting(device) == [(1, "0800")], "and the dose is still owed"

    backend.armed = False
    clock.advance(minutes=10)
    records = device.release()
    assert len(records) == 1 and records[0]["taken"]


# ── the clock gate ──────────────────────────────────────────────────────────

def test_nothing_is_offered_on_an_untrusted_clock(dispenser, clock):
    """A Pi has no RTC. `fake-hwclock` gives it a plausible, wrong time at boot,
    and a tray acting on that opens on the wrong days looking perfectly fine."""
    dispenser.apply_payload("SC1*W*1:0800-127-000")
    clock.set(datetime(2026, 7, 29, 8, 0))
    clock.distrust()

    assert dispenser.tick() == []
    assert waiting(dispenser) == [], "and nothing may be offered either"
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

    dispenser.tick()
    assert waiting(dispenser) == [(1, "0800")]
    assert len(dispenser.release()) == 1


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
    dispenser.tick()
    assert waiting(dispenser) == [(1, "0800")]
    assert len(dispenser.release()) == 1
    assert drops(dispenser, 1) == 2


def test_the_status_page_carries_what_is_waiting(dispenser, clock):
    """This is what the app reads to decide whether to show a release button and
    when to stop showing it."""
    dispenser.apply_payload("SC1*W*1:0800-127-000")
    clock.set(datetime(2026, 7, 29, 8, 0))
    dispenser.tick()

    # Compared against what the machine's own zone produces rather than a fixed
    # string, so the suite passes wherever it is run. The property being
    # asserted is that both stamps carry an offset at all: a naive one is
    # reinterpreted in the *reader's* zone, and `expiresAt` is what the app uses
    # to stop offering a dose the device will no longer deliver.
    from datetime import datetime as _dt

    def local(text):
        return _dt.fromisoformat(text).astimezone().isoformat(timespec="seconds")

    waiting_now = dispenser.status()["awaitingRelease"]
    assert all(_dt.fromisoformat(w[k]).utcoffset() is not None
               for w in waiting_now for k in ("dueAt", "expiresAt"))
    assert waiting_now == [{
        "tray": 1,
        "time": "0800",
        "dueAt": local("2026-07-29T08:00:00"),
        "expiresAt": local("2026-07-29T09:00:00"),
    }]

    dispenser.release()
    assert dispenser.status()["awaitingRelease"] == []


def test_dismiss_silences_without_cancelling_the_dose(dispenser, clock):
    """Somebody silencing a chime at 3 a.m. is not saying they will skip their
    medication. The dose stays owed and stays releasable."""
    dispenser.apply_payload("SC1*W*1:0800-127-000")
    clock.set(datetime(2026, 7, 29, 8, 0))
    dispenser.tick()
    before = len(dispenser.events())

    assert dispenser.dismiss() is True
    assert len(dispenser.events()) == before, "silencing records nothing"
    assert waiting(dispenser) == [(1, "0800")], "and cancels nothing"

    assert len(dispenser.release()) == 1, "a silenced dose can still be released"
    assert dispenser.dismiss() is False, "nothing is alerting now"


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
    first.tick()
    assert len(first.release()) == 1

    clock.set(datetime(2026, 7, 29, 8, 30))
    second = build()   # the reboot
    assert second.status()["payload"] == "SC1*W*1:0800-127-000"
    assert second.tick() == []
    assert waiting(second) == [], "the dose was taken; it must not be offered again"
    assert second.release() == []
    assert gpio_moves(second, 1) == []


def test_a_restart_mid_window_re_offers_a_dose_that_was_never_released(store, clock):
    """`_due` is memory, not a file, and that is the right choice: the offer is
    rebuilt from the schedule, which the scheduler never marked dealt with."""
    def build():
        return Dispenser(store=store,
                         servos=TrayServos(backend=MockBackend(), pins={1: 17},
                                           sleep=lambda _s: None),
                         clock=clock)

    first = build()
    first.apply_payload("SC1*W*1:0800-127-000")
    clock.set(datetime(2026, 7, 29, 8, 0))
    first.tick()
    assert waiting(first) == [(1, "0800")]      # offered, and not taken

    clock.set(datetime(2026, 7, 29, 8, 20))
    second = build()                            # the reboot
    assert second.tick() == []
    assert waiting(second) == [(1, "0800")], "still owed, still inside its window"
    assert len(second.release()) == 1


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
    first.release()

    clock.set(datetime(2026, 7, 30, 8, 0))
    second = build()
    assert second.tick() == []
    assert waiting(second) == [(1, "0800")]
    assert len(second.release()) == 1


def test_a_new_schedule_forgets_what_the_old_one_dispensed(store, clock):
    """Correct for a new prescription, and the reason `load` and `restore` are
    different calls."""
    device = Dispenser(store=store,
                       servos=TrayServos(backend=MockBackend(), pins={1: 17},
                                         sleep=lambda _s: None),
                       clock=clock)
    device.apply_payload("SC1*W*1:0800-127-000")
    clock.set(datetime(2026, 7, 29, 8, 0))
    device.tick()
    assert len(device.release()) == 1

    device.apply_payload("SC1*W*1:0800.1200-127-000")   # a different plan
    clock.advance(minutes=1)
    device.tick()
    assert waiting(device) == [(1, "0800")], "the new course starts from scratch"


def test_a_new_schedule_withdraws_a_dose_that_was_still_being_offered(store, clock):
    """Releasing it would drop a pill against a prescription that has just been
    replaced — and the tray it named may not even be in the new one."""
    device = Dispenser(store=store,
                       servos=TrayServos(backend=MockBackend(), pins={1: 17, 2: 27},
                                         sleep=lambda _s: None),
                       clock=clock)
    device.apply_payload("SC1*W*1:0800-127-000")
    clock.set(datetime(2026, 7, 29, 8, 0))
    device.tick()
    assert waiting(device) == [(1, "0800")]

    device.apply_payload("SC1*W*2:1200-127-000")
    assert waiting(device) == [], "the old offer is withdrawn"
    assert device.release() == []
    assert device.servos.drops.get(1, 0) == 0


def test_state_from_a_different_schedule_is_not_applied(store, clock, tmp_path):
    device = Dispenser(store=store,
                       servos=TrayServos(backend=MockBackend(), pins={1: 17},
                                         sleep=lambda _s: None),
                       clock=clock)
    device.apply_payload("SC1*W*1:0800-127-000")
    clock.set(datetime(2026, 7, 29, 8, 0))
    device.tick()
    device.release()

    # Rewrite the schedule file only, leaving stale state behind — which is
    # what a half-completed write during a power cut would leave.
    store.save_schedule(sc1.decode_weekly("SC1*W*1:0900-127-000"), source="test")
    revived = Dispenser(store=store,
                        servos=TrayServos(backend=MockBackend(), pins={1: 17},
                                          sleep=lambda _s: None),
                        clock=clock)
    clock.set(datetime(2026, 7, 29, 9, 0))
    revived.tick()
    assert waiting(revived) == [(1, "0900")]


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
