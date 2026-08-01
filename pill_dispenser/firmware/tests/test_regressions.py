"""Defects found by review, each pinned by the case that produced it.

Every test here reproduces something that was once true of this firmware and
must never be true again. They are grouped by what fails rather than by module,
because the interesting ones cross module boundaries — a scheduler mark and a
servo drop, a clock step and an expired dose.

The rule for adding one: name the input and the wrong outcome in the docstring.
A regression test whose failure message does not say what broke is a test that
gets deleted the next time it goes red.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta

import pytest

from snapcare_dispenser import config, sc1
from snapcare_dispenser.clock import Clock
from snapcare_dispenser.display.canvas import Tone
from snapcare_dispenser.indicators import FittedIndicator
from snapcare_dispenser.scheduler import Decision, Due, Scheduler
from snapcare_dispenser.store import Store


def offer_at(dispenser, clock, when: datetime):
    clock.set(when)
    dispenser.tick()
    return dispenser


# ── the high-water mark must only move forward ──────────────────────────────

def test_releasing_a_later_dose_first_does_not_resurrect_an_earlier_one(
        dispenser, servos, clock):
    """Two doses, 08:00 and 08:30. The app releases 08:30 by name — which is
    what a push notification about that dose sends — and 08:00 then expires.

    `confirm` used to write the mark unconditionally, so settling 08:00 at 09:01
    rewound it from 510 to 480 and un-suppressed the 08:30 dose that had already
    been delivered. The next tick offered it again and the next tap dropped a
    second pill.
    """
    dispenser.set_schedule(sc1.decode_any_schedule("SC1*W*1:0800.0830-127-000"),
                           source="test")
    offer_at(dispenser, clock, datetime(2026, 7, 29, 8, 30))
    assert len(dispenser.awaiting_release) == 2

    dispenser.release(tray=1, minutes=8 * 60 + 30)
    assert servos.drops[1] == 1

    clock.set(datetime(2026, 7, 29, 9, 1))
    dispenser.tick()                     # 08:00 expires here
    assert dispenser.awaiting_release == [], "nothing may be re-offered"
    assert dispenser.release() == []
    assert servos.drops[1] == 1, "the 08:30 dose was dispensed twice"


def test_a_bare_release_spanning_midnight_does_not_rewind_a_whole_day(
        dispenser, servos, clock):
    """00:15 and 23:30 on the same tray, both owed, released in one press.

    `release()` settles earliest-first, so the last `confirm` of the batch
    carried the *later* time. With an unconditional write the mark ended on
    (day, 1410) — and when the day rolled the comparison rewound a full day, so
    both doses came back.
    """
    dispenser.set_schedule(sc1.decode_any_schedule("SC1*W*1:0015.2330-127-000"),
                           source="test")
    offer_at(dispenser, clock, datetime(2026, 7, 29, 23, 30))
    released = dispenser.release()

    assert len(released) == 1, "only 23:30 is inside its window"
    before = servos.drops[1]
    assert dispenser.release() == []
    assert servos.drops[1] == before


def test_confirm_never_moves_the_mark_backwards():
    """The property itself, without a dispenser around it."""
    scheduler = Scheduler(grace_minutes=60)
    scheduler.load(sc1.decode_any_schedule("SC1*W*1:0800.2000-127-000"), today=100)

    scheduler.confirm(Decision(what=Due.DISPENSE, slot=1, minutes=1200), day=100)
    state = scheduler.state[1]
    assert (state.last_day, state.last_minutes) == (100, 1200)

    scheduler.confirm(Decision(what=Due.MISSED, slot=1, minutes=480), day=100)
    assert (state.last_day, state.last_minutes) == (100, 1200), "the mark rewound"

    scheduler.confirm(Decision(what=Due.DISPENSE, slot=1, minutes=480), day=101)
    assert (state.last_day, state.last_minutes) == (101, 480), "a new day must advance it"


# ── a dose the device slept through has to be said ──────────────────────────

def test_a_dose_missed_while_the_device_was_off_is_reported(
        dispenser, servos, clock, store):
    """Unplugged Monday 09:00, back Tuesday 09:00, with doses at 08:00 and 20:00.

    `next` only ever considered the day it was asked about, so Monday's 20:00
    dose produced no event at any point — not dispensed, not missed, not
    reported. The carer's log simply had a hole in it.
    """
    dispenser.set_schedule(sc1.decode_any_schedule("SC1*W*1:0800.2000-127-000"),
                           source="test")
    offer_at(dispenser, clock, datetime(2026, 7, 29, 8, 0))
    dispenser.release()                                   # Wednesday breakfast

    clock.set(datetime(2026, 7, 30, 9, 0))                # back a day later
    for _ in range(4):
        dispenser.tick()

    reasons = {(e["time"], e["taken"]) for e in store.read_events(limit=20)}
    assert ("2000", False) in reasons, "the overnight dose was never reported"


def test_catch_up_does_not_invent_misses_for_a_schedule_loaded_today(
        dispenser, store, clock):
    """A tray that has never acted has no evidence about any past day.

    Reporting a week of misses the moment a prescription is accepted would be a
    fabrication, and it is what a naive backwards sweep does.
    """
    clock.set(datetime(2026, 7, 29, 21, 0))
    dispenser.set_schedule(sc1.decode_any_schedule("SC1*W*1:0800-127-030"),
                           source="test")
    for _ in range(4):
        dispenser.tick()

    past = [e for e in store.read_events(limit=50) if e["taken"] is False]
    assert len(past) <= 1, f"invented misses: {past}"


# ── an offer must not outlive its window ────────────────────────────────────

def test_a_frozen_offer_cannot_be_released_hours_later(
        dispenser, servos, clock, store):
    """The clock stops being vouched for while a dose is waiting.

    `tick` returns early when `blocked_reason()` is set, so `_expire_due` never
    runs and `_due` freezes. Before `release` checked the deadline itself, the
    stale offer stayed releasable for the rest of uptime and a tap at 14:00
    drove the servo and logged the 08:00 dose as taken at 14:00.
    """
    dispenser.set_schedule(sc1.decode_any_schedule("SC1*W*1:0800-127-000"),
                           source="test")
    offer_at(dispenser, clock, datetime(2026, 7, 29, 8, 0))
    assert len(dispenser.awaiting_release) == 1

    clock.distrust()
    clock.set(datetime(2026, 7, 29, 14, 0))
    assert dispenser.tick() == [], "a blocked device does no scheduling work"

    assert dispenser.release() == [], "an expired offer must not open a tray"
    assert servos.drops.get(1, 0) == 0
    assert not any(e["taken"] for e in store.read_events(limit=20))


def test_release_refuses_outright_on_an_untrusted_clock(dispenser, servos, clock):
    """Inside the window, but nothing is vouching for the time.

    Refusing is the honest answer: the event this would write is stamped with a
    time the device does not believe, and a carer reads that stamp.
    """
    dispenser.set_schedule(sc1.decode_any_schedule("SC1*W*1:0800-127-000"),
                           source="test")
    offer_at(dispenser, clock, datetime(2026, 7, 29, 8, 0))

    clock.distrust()
    with pytest.raises(RuntimeError, match="clock"):
        dispenser.release()
    assert servos.drops.get(1, 0) == 0


# ── the screen and the chirp must describe the machine, not the last event ──

def test_settling_one_dose_leaves_the_alert_up_for_another(dispenser, clock):
    """Two trays due at 08:00; release tray 2 by name from a notification.

    `dose_released` clears the alert unconditionally, so the screen went blue and
    the room went quiet while tray 1 was still owed. Nobody released it and it
    expired an hour later.
    """
    indicator = FittedIndicator(display=None, buzzer=None)
    dispenser.indicator = indicator

    dispenser.set_schedule(
        sc1.decode_any_schedule("SC1*W*1:0800-127-000/2:0800-127-000"), source="test")
    offer_at(dispenser, clock, datetime(2026, 7, 29, 8, 0))
    assert len(dispenser.awaiting_release) == 2

    dispenser.release(tray=2, minutes=480)

    assert [d.tray for d in dispenser.awaiting_release] == [1]
    assert indicator._showing is Tone.DUE, "the screen stopped describing tray 1"  # noqa: SLF001
    assert indicator._alerting.is_set(), "the chirp stopped for a dose still owed"  # noqa: SLF001

    dispenser.release(tray=1, minutes=480)
    assert indicator._showing is Tone.RELEASED  # noqa: SLF001
    assert not indicator._alerting.is_set()  # noqa: SLF001


def test_replacing_the_schedule_mid_alert_stops_the_chirp(dispenser, clock):
    """A new prescription arrives while a dose is chirping.

    `schedule_accepted` only paints violet. The withdrawn offer left `_alerting`
    set with nothing in `_due` for `_expire_due` to settle, so the buzzer
    sounded every twenty seconds indefinitely for a dose that no longer existed.
    """
    indicator = FittedIndicator(display=None, buzzer=None)
    dispenser.indicator = indicator

    dispenser.set_schedule(sc1.decode_any_schedule("SC1*W*1:0800-127-000"),
                           source="test")
    offer_at(dispenser, clock, datetime(2026, 7, 29, 8, 0))
    assert indicator._alerting.is_set()  # noqa: SLF001

    dispenser.apply_payload("SC1*W*2:1200-127-000", source="test")

    assert dispenser.awaiting_release == []
    assert not indicator._alerting.is_set(), "the chirp outlived the dose"  # noqa: SLF001
    assert indicator._showing is Tone.SCHEDULE  # noqa: SLF001


# ── the log must not lose an event to a torn line ───────────────────────────

def test_an_event_after_a_torn_line_is_still_readable(tmp_path):
    """A power cut mid-write leaves a fragment with no newline.

    A plain append then glued the *next* event onto that fragment, so
    `read_events` discarded one damaged line and silently lost a dose the servo
    had physically delivered.
    """
    store = Store(tmp_path / "state")
    store.append_event({"at": "2026-07-29T08:00:00+09:00", "tray": 1, "taken": True})

    # exactly what a cut mid-write leaves behind
    with open(store.event_file, "a", encoding="utf-8") as handle:
        handle.write('{"at":"2026-07-29T12:00:00+09:00","tra')

    store.append_event({"at": "2026-07-29T20:00:00+09:00", "tray": 2, "taken": True})

    events = store.read_events(limit=10)
    trays = sorted(e["tray"] for e in events)
    assert trays == [1, 2], f"the second dose was swallowed: {events}"


# ── an NTP step must not double the correction ──────────────────────────────

def test_a_clock_step_is_absorbed_rather_than_added(monkeypatch):
    """The weekend power cut.

    `fake-hwclock` restores Friday; the RTC vouches for Monday, so a correction
    of about +3 days is applied. `timedatectl set-time` is refused because NTP
    is enabled, so the correction stays internal — and when timesyncd steps the
    system clock forward by the same amount, `datetime.now() + offset` was six
    days out. The 08:00 dose was then expired as missed, confirmed against its
    real day so it could never be re-offered, and reported to the carer as
    refused.
    """
    wall = [datetime(2026, 7, 24, 19, 0)]          # fake-hwclock: Friday evening
    mono = [1000.0]
    clock = Clock(source=lambda: wall[0], monotonic=lambda: mono[0])
    monkeypatch.setattr("snapcare_dispenser.clock._try_set_system_clock",
                        lambda _t: False)          # what NTP being enabled causes
    monkeypatch.setattr("snapcare_dispenser.clock.rtc.vouch", lambda _t: True)

    real = datetime(2026, 7, 27, 7, 58)            # what the chip actually says
    clock.accept(sc1.ClockSet.from_datetime(real), source="rtc")
    assert clock.now() == real

    wall[0] += timedelta(seconds=120)
    mono[0] += 120
    assert clock.now() == datetime(2026, 7, 27, 8, 0), "elapsed time must pass through"

    # timesyncd steps the system clock to the truth
    stepped = datetime(2026, 7, 27, 8, 0, 3)
    wall[0] = stepped
    mono[0] += 1

    assert abs((clock.now() - stepped).total_seconds()) < 2, \
        f"the step was added to the correction: {clock.now()}"


def test_ordinary_drift_does_not_throw_the_correction_away(monkeypatch):
    """The two clocks disagree by milliseconds all the time. Only a *step*
    counts, or a device would drop a good RTC correction on the first tick."""
    wall = [datetime(2026, 7, 24, 19, 0)]
    mono = [0.0]
    clock = Clock(source=lambda: wall[0], monotonic=lambda: mono[0])
    monkeypatch.setattr("snapcare_dispenser.clock._try_set_system_clock",
                        lambda _t: False)
    monkeypatch.setattr("snapcare_dispenser.clock.rtc.vouch", lambda _t: True)

    clock.accept(sc1.ClockSet.from_datetime(datetime(2026, 7, 27, 7, 58)), source="rtc")
    for _ in range(60):
        wall[0] += timedelta(seconds=10, milliseconds=3)   # 0.3 ms/s of skew
        mono[0] += 10
    assert clock.now().date() == datetime(2026, 7, 27).date()


# ── the WiFi profile that must survive a mistyped password ──────────────────

def test_a_preconfigured_profile_counts_as_a_saved_network(monkeypatch):
    """Raspberry Pi Imager writes the pre-seeded network as a profile named
    `preconfigured`, whatever its SSID is.

    `saved_ssids` returned profile *names*, so `"MyHome" in {"preconfigured"}`
    was False — and the cleanup that must run only for a network the device did
    not already know ran anyway, deleting the only profile it had.
    """
    from snapcare_dispenser import wifi

    def nmcli(*args, **_kwargs):
        class R:
            returncode = 0
            stdout = ("802-11-wireless.ssid:MyHome\n"
                      if "802-11-wireless.ssid" in args
                      else "preconfigured:802-11-wireless\n")
        return R()

    monkeypatch.setattr(wifi, "_nmcli", nmcli)
    assert wifi.saved_ssids() == {"MyHome"}
    assert wifi.has_known_network() is True
