"""Deciding when a tray should open.

A direct port of `firmware/libraries/SC1/src/Scheduler.cpp`, kept separate from
everything that touches hardware for the same reason it was separate there.

Every other part of this firmware fails visibly: a servo does not move, a page
does not load, a QR does not scan. Scheduling fails *invisibly*. It opens a
tray twice, or skips a day, or fires four doses at once after a power cut, and
nobody finds out until the pills are gone. That is exactly the class of bug
that needs a test suite rather than somebody watching a tray for a week, so the
logic lives here, imports nothing, and is driven by a clock the tests supply.

The model
---------
Time arrives as (day-number, weekday, minutes-since-midnight). The day number
is any monotonic count of days — only its differences are used — so the caller
passes `date.toordinal()` and never has to think about it again.

A dose is due when its minute has arrived and it has not already been dealt
with today. "Dealt with" is remembered per tray as the last day and time it
acted on.

Late doses
----------
A device unplugged for six hours comes back to find several doses in the past.
Firing them all is a double or triple dose delivered into one hand. Dropping
them silently is also wrong: the 08:00 dose noticed at 08:20 is simply late,
and refusing it makes a working device look broken.

So a dose is dispensed only within `grace_minutes` of its time. Past that it is
reported as missed and the tray never opens. The phone learns about it either
way, because a missed dose is a fact the person's carer needs, and a device
that quietly drops doses is worse than one that admits to it.
"""
from __future__ import annotations

from dataclasses import dataclass, field, replace
from enum import Enum

from .sc1 import SlotSchedule

DEFAULT_GRACE_MINUTES = 60


class Due(Enum):
    NOTHING = "nothing"
    DISPENSE = "dispense"  # open this tray now
    MISSED = "missed"      # this dose's window closed unopened; report, do not open


@dataclass(frozen=True)
class Decision:
    what: Due = Due.NOTHING
    slot: int = 0
    minutes: int = 0  # the scheduled time this refers to

    def __bool__(self) -> bool:
        return self.what is not Due.NOTHING


@dataclass
class SlotState:
    """What has already happened for one tray.

    `start_day` is when the course began, which is what makes "for 30 days"
    mean anything. `last_day`/`last_minutes` identify the most recent dose
    acted on, and are the only thing standing between a reboot and a second
    breakfast dose — so they are persisted, not just held in memory.
    """

    start_day: int = 0
    last_day: int = 0
    last_minutes: int = 0
    ever_fired: bool = False


class Scheduler:
    def __init__(self, grace_minutes: int = DEFAULT_GRACE_MINUTES):
        self.grace_minutes = grace_minutes
        self._slots: list[SlotSchedule] = []
        self._state: dict[int, SlotState] = {}

    # ── loading ─────────────────────────────────────────────────────────────

    def load(self, slots: list[SlotSchedule], today: int) -> None:
        """Adopt a *new* schedule and start every course from `today`.

        This forgets what has already been dispensed, which is right for a new
        prescription and catastrophic for a reboot. `restore` is the one to use
        when the schedule has not actually changed.
        """
        self._slots = [replace(s, times=list(s.times)) for s in slots]
        self._state = {s.slot: SlotState(start_day=today) for s in self._slots}

    def restore(self, slots: list[SlotSchedule], state: dict[int, SlotState]) -> None:
        """Come back up after a restart with the memory intact.

        A tray with no stored state is new to this schedule and gets a fresh
        one; a tray whose state we still hold keeps it. Without this, every
        power cut re-runs the day's doses from the beginning.
        """
        self._slots = [replace(s, times=list(s.times)) for s in slots]
        self._state = {}
        for s in self._slots:
            self._state[s.slot] = state.get(s.slot, SlotState())

    @property
    def slots(self) -> list[SlotSchedule]:
        return self._slots

    @property
    def state(self) -> dict[int, SlotState]:
        return self._state

    def slot_for(self, slot: int) -> SlotSchedule | None:
        for s in self._slots:
            if s.slot == slot:
                return s
        return None

    # ── the decision ────────────────────────────────────────────────────────

    def next(self, day: int, weekday: int, minutes: int) -> Decision:
        """What should happen at this instant.

        Call repeatedly until it returns NOTHING: one tick can owe more than
        one action, and each call reports at most one so the caller can drive a
        single servo, record a single event, and come back for the rest.
        """
        best = Decision()
        best_minutes = 0

        for s in self._slots:
            st = self._state.get(s.slot)
            if st is None:
                continue

            if s.duration_days and day >= st.start_day + s.duration_days:
                continue  # the course has finished
            if not s.due_on_day(weekday):
                continue

            for due in s.times:
                if minutes < due:
                    continue  # not yet

                # Already handled? Same day, and at or past this dose's time.
                if st.ever_fired and st.last_day == day and st.last_minutes >= due:
                    continue

                what = Due.DISPENSE if minutes - due <= self.grace_minutes else Due.MISSED

                # Among everything owed right now, act on the *earliest* dose
                # first. After a power cut several are pending at once, and
                # delivering them out of order writes a log in which the 20:00
                # dose precedes the 08:00 one it followed — and that log is what
                # a carer reads to decide whether a dose was taken.
                if best.what is Due.NOTHING or due < best_minutes:
                    best = Decision(what=what, slot=s.slot, minutes=due)
                    best_minutes = due

        return best

    def confirm(self, decision: Decision, day: int) -> None:
        """Record that a decision was carried out.

        Separate from `next` so a caller that fails to act — a servo that
        jammed, a brown-out mid-move — does not mark the dose done. Nothing is
        considered delivered until the code that delivers it says so.
        """
        if not decision:
            return
        st = self._state.get(decision.slot)
        if st is None:
            return
        # A missed dose is marked exactly like a delivered one. It has been
        # dealt with — reported — and leaving it unmarked would make the device
        # rediscover and re-report it on every tick, forever.
        st.last_day = day
        st.last_minutes = decision.minutes
        st.ever_fired = True

    def course_complete(self, slot: int, day: int) -> bool:
        s = self.slot_for(slot)
        st = self._state.get(slot)
        if s is None or st is None:
            return True  # nothing loaded for this tray: nothing left to do
        if s.duration_days == 0:
            return False  # ongoing
        return day >= st.start_day + s.duration_days

    # ── for the status page ─────────────────────────────────────────────────

    def upcoming(self, day: int, weekday: int, minutes: int) -> tuple[int, int] | None:
        """The next (slot, minutes) still to come today, ignoring what is owed.

        Only used to show "next dose at 19:00" on the status page. It looks at
        today alone; a tray whose next dose is on Thursday reports nothing
        rather than a time that would be read as today's.
        """
        best: tuple[int, int] | None = None
        for s in self._slots:
            st = self._state.get(s.slot)
            if st is None:
                continue
            if s.duration_days and day >= st.start_day + s.duration_days:
                continue
            if not s.due_on_day(weekday):
                continue
            for due in s.times:
                if due <= minutes:
                    continue
                if best is None or due < best[1]:
                    best = (s.slot, due)
        return best
