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

So a dose is offered only within `grace_minutes` of its time. Past that it is
reported as missed and the tray never opens. The phone learns about it either
way, because a missed dose is a fact the person's carer needs, and a device
that quietly drops doses is worse than one that admits to it.

What DISPENSE means, and what it does not
-----------------------------------------
`Due.DISPENSE` says the tray *may* open, not that it should open now. The tray
itself is opened by a person tapping release in the app; `device.py` holds the
dose in the meantime and hands the same window back here as a miss if nobody
ever taps. That split is why `next` takes a `skip` set — see below.
"""
from __future__ import annotations

from collections.abc import Collection
from dataclasses import dataclass, field, replace
from enum import Enum

from .sc1 import SlotSchedule

DEFAULT_GRACE_MINUTES = 60


class Due(Enum):
    NOTHING = "nothing"
    DISPENSE = "dispense"  # this tray may open — offer it to the person
    MISSED = "missed"      # this dose's window closed unopened; report, do not open


@dataclass(frozen=True)
class Decision:
    what: Due = Due.NOTHING
    slot: int = 0
    minutes: int = 0  # the scheduled time this refers to
    #: Which day this dose belongs to, when that is not today.
    #:
    #: 0 — the default — means "the day the caller asked about", which is every
    #: decision except one: a dose the device slept through belongs to a day
    #: that has already ended, and confirming it against today would move the
    #: high-water mark a day forward and swallow today's doses with it.
    day: int = 0

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

    def next(self, day: int, weekday: int, minutes: int,
             skip: Collection[tuple[int, int]] = ()) -> Decision:
        """What should happen at this instant.

        Call repeatedly until it returns NOTHING: one tick can owe more than
        one action, and each call reports at most one so the caller can drive a
        single servo, record a single event, and come back for the rest.

        `skip` is the set of `(slot, minutes)` the caller is already dealing
        with — doses offered to the person and waiting on a tap. They are not
        finished, so they must not be marked through `confirm`, and they are
        not new, so they must not be offered again on the next tick fifteen
        seconds later. Without this the alert would be re-raised four times a
        minute for the whole hour.

        Keeping them out of `_state` rather than in it is what preserves the
        rule the whole module is built on: nothing is recorded as dealt with
        until the code that deals with it says so. A dose the person never taps
        comes back through here as a miss, because as far as this class is
        concerned it was never handled at all.
        """
        # Yesterday and the days before it, before today.
        #
        # Everything below this only ever looks at `day`, so a dose the device
        # slept through was invisible forever: unplug on Monday at 09:00 and
        # come back on Tuesday, and Monday's 20:00 dose produced no event at
        # any point — not dispensed, not missed, not reported. A cut from 23:00
        # to 00:05 lost that night's 23:30 dose the same way. The module
        # docstring and `device.py` both promise a missed dose is *said*, and a
        # dose nobody was told about is the one thing a carer cannot act on.
        stale = self._overdue_before(day, weekday, skip)
        if stale:
            return stale

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

                # Already handled? The mark is a high-water mark over
                # `(day, minutes)`, so anything at or below it is settled.
                #
                # This used to read `st.last_day == day and st.last_minutes >=
                # due`, which agrees with `confirm`'s rule — and with
                # `_overdue_before`'s — only while the day number never goes
                # backwards. When it does, for any of the reasons a clock moves
                # (a DST correction on a stale system clock, NTP correcting a
                # fast clock across a midnight, a phone posting `SC1*C*` with an
                # earlier date), `last_day != day` un-suppressed every dose
                # already given while `confirm` went on refusing to re-mark
                # them. Reproduced: release the 08:00 dose, rewind the clock one
                # day, then tick and release four times — drops went 1,2,3,4,5,
                # unbounded, once per fifteen-second tick for the whole window.
                #
                # Comparing the same tuple all three places compare makes the
                # rewind fail towards the tray staying shut: nothing is offered
                # again until real time passes the mark.
                if st.ever_fired and (day, due) <= (st.last_day, st.last_minutes):
                    continue

                if (s.slot, due) in skip:
                    continue  # already offered, still waiting on a tap

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

    #: How far back `next` will look for doses the device slept through.
    #:
    #: A week covers every realistic outage — a holiday, a tripped breaker
    #: nobody noticed, a device boxed up and moved. Past that the day masks stop
    #: being useful evidence anyway, and reporting a fortnight of misses one
    #: tick at a time would bury the ones that matter under a wall of them.
    CATCHUP_DAYS = 7

    def _overdue_before(self, day: int, weekday: int,
                        skip: Collection[tuple[int, int]] = ()) -> Decision:
        """The earliest un-acted dose from a day that has already ended.

        Returned as `MISSED` without qualification: the window closed while the
        device was off, so there is nothing to offer and nothing to decide. The
        caller records it and marks it dealt with, exactly as it does for a dose
        whose window closed while the device was watching.

        Earliest first, and one per call, for the same reason as the main loop —
        the log a carer reads has to be in the order things happened.

        `skip` is the same collection `next` applies to today, and it has to be
        applied here too. A dose offered at 23:30 with an hour of grace is still
        owed at 00:00 — and one minute after midnight it belongs to a day that
        has ended, so this method found it and called it MISSED while the person
        still had half their window left. Reproduced with
        `SC1*W*1:0800.2330-127-000`: the tick at 00:00:15 wrote a
        `window-closed` miss and stopped the chirp, and a tap at 00:00 then
        wrote a contradictory `released` line for the same dose. Every dose
        scheduled after 23:00 was affected, every night.
        """
        for back in range(self.CATCHUP_DAYS, 0, -1):
            past_day = day - back
            past_weekday = (weekday - back) % 7
            for s in self._slots:
                st = self._state.get(s.slot)
                if st is None or not st.ever_fired:
                    # `ever_fired` is False for a tray that has never acted, and
                    # its `last_day` is the 0 sentinel — so there is no evidence
                    # about what happened on any past day, and inventing a week
                    # of misses for a schedule loaded this morning would be a
                    # fabrication, not a report.
                    continue
                if past_day < st.start_day:
                    continue  # before this course began
                if s.duration_days and past_day >= st.start_day + s.duration_days:
                    continue  # after it ended
                if not s.due_on_day(past_weekday):
                    continue
                for due in sorted(s.times):
                    if (past_day, due) <= (st.last_day, st.last_minutes):
                        continue  # already dealt with
                    if (s.slot, due) in skip:
                        continue  # offered last night, still waiting on a tap
                    return Decision(what=Due.MISSED, slot=s.slot, minutes=due,
                                    day=past_day)
        return Decision()

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

        # The mark is a **high-water mark**, and it must only ever move forward.
        #
        # `next` suppresses a dose with `st.last_day == day and st.last_minutes
        # >= due`, so the mark says "everything up to here on this day is dealt
        # with". This used to assign unconditionally — which is correct only if
        # doses are always settled in time order, and they are not:
        #
        #   * the app and the relay release a *named* dose, so the 08:30 one can
        #     be taken before the 08:00 one has expired;
        #   * `release()` with no arguments settles earliest-first, so the last
        #     confirm of the batch is the latest dose — and if the batch spans
        #     midnight the mark then rewinds a whole day.
        #
        # Either way the rewind un-suppresses a dose that has already been
        # delivered, the next tick offers it again, and a second press of the
        # button drops a second pill. Reproduced with
        # `SC1*W*1:0800.0830-127-000`: release 08:30 by name, let 08:00 expire
        # at 09:01, and the same tick re-offers 08:30.
        #
        # `ever_fired` has to stay in the guard: `last_day` is 0 on a fresh
        # tray, which would otherwise read as a mark far in the future's past
        # and swallow the first real dose.
        # A dose from a day that has already ended carries that day with it —
        # see `Decision.day`. Marking it against today would advance the
        # high-water mark past everything owed today.
        day = decision.day or day

        if st.ever_fired and (day, decision.minutes) <= (st.last_day, st.last_minutes):
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

    def day_plan(self, day: int, weekday: int) -> list[tuple[int, int]]:
        """Every `(slot, minutes)` this day is supposed to see, ascending.

        The whole day, not the rest of it: the panel's schedule band draws what
        has already happened as well as what has not, so a person can see at a
        glance that the morning dose was taken. What each one *did* is not this
        class's business — it comes from `Dispenser.today_outcomes` and from the
        doses currently waiting on a tap — and keeping the plan and the outcome
        apart is what lets a dose with no record at all render as "nothing is
        known" rather than as a confident claim either way.

        Deliberately the same two filters `upcoming` applies, and no others: a
        course that has run its `duration_days` and a day the mask excludes are
        both days on which the tray genuinely has nothing scheduled. Sorted by
        minute, then by tray, so two trays at 08:00 always draw in the same
        order — a schedule band whose columns swap between frames is one nobody
        can read.
        """
        plan: list[tuple[int, int]] = []
        for s in self._slots:
            st = self._state.get(s.slot)
            if st is None:
                continue
            if s.duration_days and day >= st.start_day + s.duration_days:
                continue
            if not s.due_on_day(weekday):
                continue
            plan.extend((s.slot, due) for due in s.times)
        return sorted(plan, key=lambda pair: (pair[1], pair[0]))

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
