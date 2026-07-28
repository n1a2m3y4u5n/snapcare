"""The scheduler — the part whose bugs are invisible until the pills are gone.

Every test here describes a way a real dispenser could hurt somebody: a dose
given twice, a course that never ends, a power cut turning into three doses in
one hand, a jammed servo that gets logged as a delivery.
"""
from __future__ import annotations

from snapcare_dispenser import sc1
from snapcare_dispenser.scheduler import Due, Scheduler

MON, TUE, WED, THU, FRI, SAT, SUN = range(7)
DAY = 20_000  # any monotonic day number; only its differences matter


def plan(*, slot=1, times=("0800",), days=sc1.EVERY_DAY, duration=0):
    return sc1.SlotSchedule(
        slot=slot,
        times=sorted(sc1.parse_hhmm(t) for t in times),
        days=days,
        duration_days=duration,
    )


def at(hhmm: str) -> int:
    return sc1.parse_hhmm(hhmm)


def test_nothing_is_due_before_its_time():
    s = Scheduler()
    s.load([plan(times=("0800",))], DAY)
    assert s.next(DAY, WED, at("0759")).what is Due.NOTHING


def test_a_dose_is_due_at_its_time():
    s = Scheduler()
    s.load([plan(slot=3, times=("0800",))], DAY)
    decision = s.next(DAY, WED, at("0800"))
    assert (decision.what, decision.slot, decision.minutes) == (Due.DISPENSE, 3, at("0800"))


def test_a_dose_is_not_given_twice():
    s = Scheduler()
    s.load([plan(times=("0800",))], DAY)
    first = s.next(DAY, WED, at("0800"))
    s.confirm(first, DAY)
    assert s.next(DAY, WED, at("0801")).what is Due.NOTHING
    assert s.next(DAY, WED, at("2359")).what is Due.NOTHING


def test_an_unconfirmed_dose_stays_owed():
    """A servo that jammed must leave the dose owed, not silently delivered.

    This is why `confirm` is a separate call from `next`. The caller only says
    so after the sweep has actually returned.
    """
    s = Scheduler()
    s.load([plan(times=("0800",))], DAY)
    assert s.next(DAY, WED, at("0800")).what is Due.DISPENSE
    assert s.next(DAY, WED, at("0805")).what is Due.DISPENSE   # still owed
    s.confirm(s.next(DAY, WED, at("0805")), DAY)
    assert s.next(DAY, WED, at("0806")).what is Due.NOTHING


def test_the_same_dose_comes_round_again_the_next_day():
    s = Scheduler()
    s.load([plan(times=("0800",))], DAY)
    s.confirm(s.next(DAY, WED, at("0800")), DAY)
    assert s.next(DAY + 1, THU, at("0800")).what is Due.DISPENSE


def test_a_late_dose_inside_the_window_is_still_given():
    s = Scheduler(grace_minutes=60)
    s.load([plan(times=("0800",))], DAY)
    assert s.next(DAY, WED, at("0859")).what is Due.DISPENSE


def test_a_dose_past_its_window_is_reported_and_never_given():
    """The core safety rule. Both halves of it matter.

    Firing everything that accumulated during a power cut is an overdose;
    dropping it silently hides from a carer that medication was not taken.
    """
    s = Scheduler(grace_minutes=60)
    s.load([plan(times=("0800",))], DAY)
    decision = s.next(DAY, WED, at("0901"))
    assert decision.what is Due.MISSED
    assert decision.minutes == at("0800")


def test_a_missed_dose_is_reported_once_and_not_forever():
    s = Scheduler(grace_minutes=60)
    s.load([plan(times=("0800",))], DAY)
    first = s.next(DAY, WED, at("1200"))
    assert first.what is Due.MISSED
    s.confirm(first, DAY)
    assert s.next(DAY, WED, at("1201")).what is Due.NOTHING


def test_a_device_off_all_day_does_not_empty_the_tray_into_one_hand():
    """Three doses owed after a long outage: one late, two out of their windows."""
    s = Scheduler(grace_minutes=60)
    s.load([plan(times=("0800", "1300", "2000"))], DAY)

    outcomes = []
    for _ in range(4):
        decision = s.next(DAY, WED, at("2030"))
        if not decision:
            break
        outcomes.append((decision.what, sc1.format_hhmm(decision.minutes)))
        s.confirm(decision, DAY)

    assert outcomes == [
        (Due.MISSED, "0800"),     # long past its window
        (Due.MISSED, "1300"),     # ditto
        (Due.DISPENSE, "2000"),   # 30 minutes late, still inside the hour
    ]


def test_pending_doses_come_out_in_the_order_they_were_scheduled():
    """The log a carer reads must not say the 20:00 dose preceded the 08:00 one."""
    s = Scheduler(grace_minutes=24 * 60)
    s.load([plan(slot=1, times=("2000",)), plan(slot=2, times=("0800",))], DAY)

    order = []
    for _ in range(3):
        decision = s.next(DAY, WED, at("2100"))
        if not decision:
            break
        order.append(sc1.format_hhmm(decision.minutes))
        s.confirm(decision, DAY)
    assert order == ["0800", "2000"]


# ── days of the week ────────────────────────────────────────────────────────

def test_a_day_mask_is_respected():
    monday_wednesday_friday = 0b0010101
    s = Scheduler()
    s.load([plan(times=("0800",), days=monday_wednesday_friday)], DAY)

    assert s.next(DAY, MON, at("0800")).what is Due.DISPENSE
    assert s.next(DAY, TUE, at("0800")).what is Due.NOTHING
    assert s.next(DAY, WED, at("0800")).what is Due.DISPENSE
    assert s.next(DAY, SAT, at("0800")).what is Due.NOTHING
    assert s.next(DAY, SUN, at("0800")).what is Due.NOTHING


def test_a_dose_skipped_by_the_day_mask_is_not_reported_as_missed():
    """Not due is not the same as missed, and a carer must not be told it was."""
    s = Scheduler(grace_minutes=60)
    s.load([plan(times=("0800",), days=1 << MON)], DAY)
    assert s.next(DAY, TUE, at("2300")).what is Due.NOTHING


# ── course length ───────────────────────────────────────────────────────────

def test_a_course_runs_for_its_duration_and_then_stops():
    s = Scheduler()
    s.load([plan(times=("0800",), duration=3)], DAY)

    for offset in range(3):
        decision = s.next(DAY + offset, WED, at("0800"))
        assert decision.what is Due.DISPENSE, f"day {offset} should still be dispensing"
        s.confirm(decision, DAY + offset)

    assert s.next(DAY + 3, WED, at("0800")).what is Due.NOTHING
    assert s.course_complete(1, DAY + 3)
    assert not s.course_complete(1, DAY + 2)


def test_a_duration_of_zero_never_ends():
    s = Scheduler()
    s.load([plan(times=("0800",), duration=0)], DAY)
    assert not s.course_complete(1, DAY + 10_000)
    assert s.next(DAY + 10_000, WED, at("0800")).what is Due.DISPENSE


def test_a_finished_course_stops_reporting_missed_doses_too():
    s = Scheduler(grace_minutes=60)
    s.load([plan(times=("0800",), duration=1)], DAY)
    s.confirm(s.next(DAY, WED, at("0800")), DAY)
    assert s.next(DAY + 5, MON, at("2300")).what is Due.NOTHING


# ── restarting ──────────────────────────────────────────────────────────────

def test_restoring_keeps_a_dose_from_being_given_twice():
    """The bug this whole mechanism exists for.

    A power cut at 08:30, after the 08:00 dose. Without carried-over state the
    device comes back, finds the dose inside its grace window, and dispenses it
    a second time.
    """
    slots = [plan(times=("0800",))]
    first = Scheduler()
    first.load(slots, DAY)
    first.confirm(first.next(DAY, WED, at("0800")), DAY)

    after_reboot = Scheduler()
    after_reboot.restore(slots, first.state)
    assert after_reboot.next(DAY, WED, at("0830")).what is Due.NOTHING

    # And a genuinely new schedule must *not* inherit it.
    fresh = Scheduler()
    fresh.load(slots, DAY)
    assert fresh.next(DAY, WED, at("0830")).what is Due.DISPENSE


def test_restoring_a_tray_that_is_new_to_the_schedule():
    slots = [plan(slot=1), plan(slot=2, times=("0900",))]
    first = Scheduler()
    first.load([plan(slot=1)], DAY)
    first.confirm(first.next(DAY, WED, at("0800")), DAY)

    after = Scheduler()
    after.restore(slots, first.state)
    decision = after.next(DAY, WED, at("0930"))
    assert decision.slot == 2               # tray 1 is remembered as already done
    assert decision.what is Due.DISPENSE


# ── the status page ─────────────────────────────────────────────────────────

def test_upcoming_looks_only_at_today():
    s = Scheduler()
    s.load([plan(slot=1, times=("0800", "2000")), plan(slot=2, times=("1300",))], DAY)
    assert s.upcoming(DAY, WED, at("0900")) == (2, at("1300"))
    assert s.upcoming(DAY, WED, at("2100")) is None


def test_upcoming_ignores_a_tray_that_is_not_due_today():
    s = Scheduler()
    s.load([plan(times=("2000",), days=1 << MON)], DAY)
    assert s.upcoming(DAY, WED, at("0900")) is None
    assert s.upcoming(DAY, MON, at("0900")) == (1, at("2000"))


# ── a long run ──────────────────────────────────────────────────────────────

def test_thirty_days_of_ticking_dispenses_exactly_the_right_doses():
    """Minute by minute for a month, which is where an off-by-one shows up.

    A Mon/Wed/Fri course of 14 days at two times a day. The arithmetic for
    "how many of those are there" is done independently of the scheduler, so
    the two have to agree for the right reason.
    """
    monday_wednesday_friday = 0b0010101
    s = Scheduler(grace_minutes=60)
    s.load([plan(times=("0800", "2000"), days=monday_wednesday_friday, duration=14)], DAY)

    dispensed = 0
    for offset in range(30):
        weekday = (MON + offset) % 7   # start the run on a Monday
        for minute in range(0, 24 * 60):
            while True:
                decision = s.next(DAY + offset, weekday, minute)
                if not decision:
                    break
                assert decision.what is Due.DISPENSE, "no dose should ever be late here"
                dispensed += 1
                s.confirm(decision, DAY + offset)

    # 14 days from a Monday covers Mon/Wed/Fri twice over, and the following
    # Monday is day 14, which is one past the end of the course.
    expected_days = sum(1 for offset in range(14) if (MON + offset) % 7 in (MON, WED, FRI))
    assert dispensed == expected_days * 2
