"""The dispenser itself — the one object that is allowed to open a tray.

Everything above this (the HTTP API, the web page, the daemon loop) asks this
class to do things. Everything below it (the scheduler, the servos, the store,
the clock) is a component it owns. That shape exists so that there is exactly
one place where "a tray opened" can happen, and it is the same place whether
the cause was a tap in the app over the LAN, a tap that came in through the
relay, or a nurse checking a hopper from the device's own page.

A tray opens when a person asks for it
--------------------------------------
The scheduler decides when a dose *may* be taken. It does not open anything.
At its minute the device lights the ring green, starts chirping, and puts the
dose on `awaiting_release` — and there it stays until somebody taps release in
the app, which is what actually drives the servo.

The old build dropped the pills at the scheduled minute and asked for a button
press afterwards to say they had been taken. The two facts that arrangement
produced were "the servo swept" and "somebody pressed a button", and neither is
the fact anybody wanted. Pills fell into a cup at 08:00 whether or not the
person was in the house, and the button could be pressed by a visitor, a cat,
or nobody at all while the log filled with "dispensed, unconfirmed".

Asking first collapses that into one fact. The pills do not leave the hopper
until a person has said they are there to take them, so a dose that came out is
a dose somebody asked for, and a dose nobody asked for stays in the machine
where the next person to look can still count it.

The four rules that live here
-----------------------------
**Nothing opens on an untrusted clock.** Checked on every tick, not at startup,
because a Pi acquires a trustworthy clock partway through its life — when the
WiFi comes up and NTP corrects it — and a device that decided at boot would
stay shut all day for a network that arrived thirty seconds later.

**A dose is recorded only after the servo has returned.** `Scheduler.confirm`
is called after `drop`, never before. If the sweep raises, the dose stays owed
and can still be released inside its grace window. The alternative — mark
first, move second — turns a jammed servo into a dose the log says was given.

**A dose nobody asks for is never dropped.** When the grace window closes on an
untapped dose the tray stays shut and the dose is recorded missed. That is the
whole point of the release model: unattended pills in an open cup are how a
double dose happens, and "no pills came out today" is exactly what a carer
needs to be told.

**A missed dose is recorded too.** It is marked exactly like a delivered one,
because it has been dealt with. Leaving it unmarked would make the device
rediscover it on every tick and re-report it forever, and the phone's log would
fill with the same 08:00 dose a thousand times.
"""
from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from . import config, gpiochip, sc1
from .clock import Clock
from .indicators import Indicator, LogIndicator
from .scheduler import Decision, Due, Scheduler, SlotState
from .servo import TrayServos
from .store import Store

log = logging.getLogger(__name__)

#: How a recorded dose appears in the day's ledger, by the reason it was
#: recorded under. A reason that is not in here leaves **no entry at all**, and
#: that absence is the whole point of the table:
#:
#:   `manual` is a nurse checking a hopper at the bench, not a scheduled dose.
#:   Its minute is the current minute, so letting it in would mark whatever
#:   happens to be scheduled for that minute as taken — a false claim about a
#:   dose still sitting in the machine.
#:
#:   `interrupted` is the one case where the firmware genuinely does not know
#:   whether the pills fell. It says so by leaving the ledger silent, which the
#:   panel draws as an outline: solid means we know, outline means we do not.
_LEDGER = {
    "released": "taken",
    "not-released": "missed",
    "window-closed": "missed",
}

#: How far back the ledger is rebuilt at boot. Eight trays at six doses a day is
#: 48 events, so this covers several days of history — far more than the one day
#: the ledger holds — while never reading a 3000-line log to find this morning.
_LEDGER_LOOKBACK = 200


def _stamp(when: datetime) -> str:
    """An ISO timestamp with an offset on it.

    Everything this firmware measures is local time on the device, and the
    device is usually in a different timezone from whoever is reading the app.
    A naive string is silently reinterpreted in the reader's zone, which turns
    a nine-hour gap into a dispenser that has been "unplugged since Tuesday" or
    one that has "just been heard from" for three days.
    """
    return when.astimezone().isoformat(timespec="seconds")


@dataclass(frozen=True)
class DueDose:
    """A dose that has been offered to the person and is waiting on a tap.

    `deadline` is computed from the dose's own scheduled instant rather than
    from when the device noticed it, so a dose picked up late after a power cut
    gets the remainder of its window and not a fresh one. Past it, the tray
    stays shut and the dose is recorded missed.
    """

    tray: int
    minutes: int          # the scheduled time, minutes since midnight
    day: int              # the scheduler day number this dose belongs to
    due_at: datetime
    deadline: datetime

    @property
    def key(self) -> tuple[int, int]:
        return (self.tray, self.minutes)

    def tenths_left(self, now: datetime) -> int:
        """How much of the release window remains, in tenths, 0..10.

        Quantised deliberately. This is drawn as a bar on the due screen, and
        the panel repaints only when something it shows has changed — a value in
        seconds would change on every fifteen-second tick and cost a full 38 ms
        frame four times a minute for the whole hour. Tenths change at most ten
        times in a sixty-minute window.

        Measured from the dose's own scheduled instant, so a dose picked up late
        after a power cut shows the remainder of its window rather than a fresh
        one — the same rule `deadline` itself follows.
        """
        window = (self.deadline - self.due_at).total_seconds()
        if window <= 0:
            return 0
        left = (self.deadline - now).total_seconds()
        return max(0, min(10, int(left * 10 // window)))

    def to_json(self) -> dict:
        # Offset-aware, because the reader is usually in a different timezone
        # from the machine. `expiresAt` is what the app uses to stop offering a
        # dose the device will no longer deliver, and a naive string is parsed
        # by a browser in *its* zone — so a carer an hour away either saw a
        # release button that did nothing or lost one that would have worked.
        return {
            "tray": self.tray,
            "time": sc1.format_hhmm(self.minutes),
            "dueAt": _stamp(self.due_at),
            "expiresAt": _stamp(self.deadline),
        }


class Dispenser:
    def __init__(self, store: Store | None = None, servos: TrayServos | None = None,
                 clock: Clock | None = None, indicator: Indicator | None = None,
                 grace_minutes: int | None = None, on_event=None, on_change=None):
        self.store = store or Store()
        self.servos = servos or TrayServos()
        self.clock = clock or Clock()
        self.indicator = indicator or LogIndicator()
        #: Called with every recorded dose, whatever caused it.
        #:
        #: The cloud link hangs off this rather than off the callers, because
        #: there are four ways a dose gets recorded — a release, a dose whose
        #: window closed untapped, a dose already past its window when the
        #: scheduler found it, and a manual drop from the bench — and hanging it
        #: off each of them means the day somebody adds a fifth, that one is
        #: silently not reported. This is the one place they all pass through.
        self.on_event = on_event
        #: Called when something the app should hear about *now* changed, but no
        #: dose was recorded. In practice: a dose has just become due and is
        #: waiting on a tap.
        #:
        #: This is the whole latency budget of the release model. The app cannot
        #: offer a release button for a dose it does not know about, so the
        #: report that carries `awaitingRelease` has to go up at the moment the
        #: dose is offered rather than at the next heartbeat five minutes later.
        self.on_change = on_change
        self.scheduler = Scheduler(
            grace_minutes if grace_minutes is not None else config.GRACE_MINUTES
        )

        # One lock over every state change. Requests arrive on the HTTP
        # server's threads while the daemon's tick runs on its own; without
        # this, a schedule posted mid-tick could be half-replaced under the
        # scheduler's feet.
        self._lock = threading.RLock()

        self._payload = ""
        self._source = "none"
        #: Doses offered and waiting on a tap, keyed by (tray, scheduled minute).
        #:
        #: Deliberately not persisted. A device that reboots mid-window
        #: rediscovers the dose through the scheduler on its first tick — the
        #: scheduler never marked it dealt with — so the offer is rebuilt from
        #: the schedule rather than restored from a file that could disagree
        #: with it.
        self._due: dict[tuple[int, int], DueDose] = {}
        self._seq = 0
        #: Trays this machine has no servo for that the stored schedule names.
        #: Reported rather than merely dropped — see `_restore`.
        self._unfitted: tuple[int, ...] = ()
        #: True when scheduler.json exists and cannot be read. See
        #: `blocked_reason`; this is the one flag that fails the tray shut on a
        #: damaged card rather than on a damaged clock.
        self._state_unknown = False
        #: Today's taken/missed ledger, keyed by `(tray, scheduled minute)`.
        #: See `today_outcomes` for why an absent key is load-bearing.
        self._outcomes: dict[tuple[int, int], str] = {}
        self._outcomes_day = 0
        #: True while the chirp has been stopped because the device is blocked
        #: with a dose still owed. See `tick`.
        self._silenced_by_block = False
        self._restore()

    # ── startup ─────────────────────────────────────────────────────────────

    def _restore(self) -> None:
        slots, payload = self.store.load_schedule()
        self._payload = payload
        self._source = "restored" if slots else "none"

        # A tray with no servo behind it cannot deliver anything, and a plan
        # that names one is a medication this machine will silently never give.
        # `set_schedule` has always refused those; `_restore` did not, so a
        # schedule accepted while eight trays were configured and read back
        # after `SNAPCARE_TRAYS=4` — exactly the change config.py recommends —
        # offered a dose for tray 7 and then raised `KeyError` out of `release`
        # into three callers that catch only `RuntimeError`. Reproduced: the app
        # got a 500, the button press vanished, and an hour later the dose was
        # recorded `not-released` — a refusal the person never made.
        #
        # Dropped from the running scheduler, never from the card. schedule.json
        # still holds the full prescription, so putting the servo back (or
        # correcting `SNAPCARE_TRAYS`) brings the tray back on the next boot.
        self._unfitted = tuple(sorted({s.slot for s in slots
                                       if s.slot not in self.servos.pins}))
        if self._unfitted:
            log.error("the stored schedule names tray(s) %s, which have no servo "
                      "on this machine (%s) — those trays are NOT loaded and "
                      "nothing will be dispensed from them",
                      list(self._unfitted), sorted(self.servos.pins))
            slots = [s for s in slots if s.slot in self.servos.pins]

        state, damaged = self.store.load_state(payload)
        #: True when the record of what has already been dispensed exists and
        #: cannot be read. See `blocked_reason`.
        self._state_unknown = damaged
        self.scheduler.restore(slots, state)

        # If the stored state did not match the schedule, `restore` gave every
        # tray a blank one with start_day 0, which would make a course of "30
        # days" have expired three million days ago. Start those courses today.
        today = self.clock.day_number()
        for slot_state in self.scheduler.state.values():
            if slot_state.start_day == 0:
                slot_state.start_day = today

        recent = self.store.read_events(limit=_LEDGER_LOOKBACK)
        if recent:
            self._seq = (int(recent[0].get("seq", 0)) + 1) % 100
        self._outcomes_day = today
        self._outcomes = self._outcomes_from(recent, today)

        if slots:
            log.info("restored a schedule for %d tray(s): %s",
                     len(slots), payload)
        else:
            log.info("no schedule stored — nothing will be dispensed until one arrives")

        self._settle_interrupted_dose()

    def _settle_interrupted_dose(self) -> None:
        """Close out a dose the last run was cut in the middle of dropping.

        `inflight.json` is written before the horn moves and removed once the
        dose is durable, so finding one at boot means the machine lost power
        somewhere inside a two-second sweep. Nothing on the card can say whether
        the pills cleared the gate, and there is no sensor that could.

        So it is settled the only honest way: the dose is marked dealt with, so
        it is never offered a second time, and it is written to the log as
        `taken` but **not** confirmed, with the reason `interrupted`. A carer
        reading that line learns exactly what the machine knows. The alternative
        — re-offering it — is a double dose the person has no way to detect,
        and this codebase's rule is that the tray fails shut.

        The tray is parked first. A servo cut mid-sweep simply stops where it
        is, which for the first of the two commands is the gate held open, and
        nothing else in the firmware ever closes it: `TrayServos.park` says in
        its own docstring that it is not part of any dose path. One tray, half a
        second, and only when this file exists — not a sweep of all eight at
        boot, which would be four seconds and a current spike on a supply
        `config.py` already warns about.
        """
        intent = self.store.load_inflight()
        if not intent:
            return
        try:
            tray = int(intent["tray"])
            minutes = int(intent["minutes"])
            day = int(intent["day"])
        except (KeyError, TypeError, ValueError):
            log.error("the interrupted-dose marker is unreadable (%s) — clearing it",
                      intent)
            self.store.clear_inflight()
            return

        log.warning("tray %d: the %s dose was interrupted mid-drop — recording it "
                    "as given but unconfirmed, and closing the tray",
                    tray, sc1.format_hhmm(minutes))
        if tray in self.servos.pins:
            try:
                self.servos.park(tray)
            except Exception:  # noqa: BLE001
                # A tray that will not park is worth saying and is not worth
                # refusing to boot over; the dose still has to be settled.
                log.exception("tray %d could not be parked after an interrupted drop",
                              tray)

        self.scheduler.confirm(
            Decision(what=Due.DISPENSE, slot=tray, minutes=minutes), day)
        self._save_state()
        self._record(tray, minutes, taken=True, reason="interrupted",
                     confirmed=False, day=day)
        self.store.clear_inflight()

    # ── the schedule ────────────────────────────────────────────────────────

    def set_schedule(self, slots: list[sc1.SlotSchedule], source: str = "api") -> None:
        """Adopt a schedule. Only a tray whose plan actually changed forgets.

        This used to call `Scheduler.load` unconditionally, which rebuilds every
        tray's `SlotState` with `ever_fired=False`. That is right for a new
        prescription and a double dose for everything else, because a schedule
        arriving is not the same event as a schedule *changing*:

          * a carer opens the schedule screen in the app and taps Save twice;
          * the same paper form sheet is photographed again;
          * `cloud.json` is lost to a power cut, so `CloudLink` restarts from
            `desiredRev = 0` and re-applies the plan already running — its own
            comment calls that a no-op, and it was a second pill;
          * a second medication is added at 08:20, rebuilding tray 1 with it.

        Reproduced against the real classes in every one of those shapes: the
        08:00 dose already in the person's hand was offered again, the chirp
        restarted, and the next tap dropped another pill.

        So identity is decided *before* the scheduler is touched, at two
        granularities. The canonical `SC1*W*` payload answers "is this the same
        plan" — the same string `Store.save_schedule` has always written for
        exactly that question on a restart — and per-slot comparison answers
        "is this the same plan *for this tray*". Anything that genuinely
        changed still starts from scratch, which it must: an 08:00 mark left
        over from yesterday's drug would suppress today's first dose of the one
        that replaced it.

        The cost, stated: a course re-sent unchanged does not restart its
        `duration_days` countdown. Re-prescribing the same drug for another
        thirty days therefore needs a payload that differs (a changed time, a
        changed duration), because SC1 has no "start again" verb. That is the
        right way round — a course that silently never ends is the failure that
        was reproduced, and one that ends on time is one a carer sees.
        """
        with self._lock:
            unknown = [s.slot for s in slots if s.slot not in self.servos.pins]
            if unknown:
                # Accepting a plan for a tray with no servo would report a
                # perfectly healthy device that silently never dispenses that
                # medication. Refusing is the recoverable failure.
                raise ValueError(
                    f"no servo is wired for tray(s) {unknown} — "
                    f"this machine has {sorted(self.servos.pins)}"
                )

            payload = sc1.encode_weekly(slots)
            today = self.clock.day_number()

            if payload == self._payload and self.scheduler.slots \
                    and not self._state_unknown:
                # Byte-identical to what is already running. Nothing about the
                # plan changed, so nothing about the dispensing record may
                # change either — and scheduler.json is deliberately left
                # untouched rather than rewritten with the same contents, so a
                # cut during a cloud resync cannot damage the one file that
                # remembers this morning's dose.
                #
                # The standing offer survives too. It was made against this
                # exact plan and is still owed; withdrawing it would take the
                # alert down over a dose nobody has taken.
                #
                # Not taken when the record is damaged (`_state_unknown`), and
                # that is the whole recovery route: there is no dispensing state
                # to preserve, so the same payload sent again means "start a
                # fresh record", which is exactly what `blocked_reason` tells
                # whoever is standing there to do. Without this exception a
                # machine with a damaged card could only be revived by inventing
                # a schedule that differs from the one it should be running.
                self._source = source
                self.store.save_schedule(slots, source=source)
                self.indicator.schedule_accepted()
                log.info("the schedule from %s is the one already running; "
                         "keeping what has been dispensed: %s", source, payload)
                return

            carried = self._unchanged_slot_state(slots)
            if carried:
                self.scheduler.restore(slots, carried)
                # `restore` hands a tray that is new to this plan a blank state
                # with `start_day` 0, which would make a course of "30 days"
                # have expired three million days ago. Same fixup as `_restore`.
                for slot_state in self.scheduler.state.values():
                    if slot_state.start_day == 0:
                        slot_state.start_day = today
            else:
                self.scheduler.load(slots, today)

            self._payload = payload
            self._source = source
            self.store.save_schedule(slots, source=source)
            self.store.save_state(self.scheduler.state, self._payload)
            # A fresh record has just been written, so whatever was unreadable
            # about the old one no longer stands between this machine and a
            # dose. This is the operator's way out of the damaged-card refusal:
            # re-send the prescription.
            self._state_unknown = False

            # A dose offered under a plan that has just been replaced is
            # withdrawn rather than carried over: releasing it would drop a pill
            # against a prescription that no longer exists, and the tray it
            # names may not even be in the new one. A tray whose own line is
            # unchanged keeps its offer, for the same reason the identity path
            # above keeps it.
            #
            # `clear()` before `schedule_accepted()`, and it has to be the
            # indicator's `clear` and not just the dict's: `schedule_accepted`
            # only paints violet and never touches the chirp, so withdrawing an
            # offer that was mid-alert left the buzzer sounding every twenty
            # seconds for a dose that no longer existed — indefinitely, since
            # nothing was left in `_due` for `_expire_due` to settle.
            withdrawn = [key for key in self._due if key[0] not in carried]
            if withdrawn:
                for key in withdrawn:
                    del self._due[key]
                self.indicator.clear()
            self.indicator.schedule_accepted()
            # A dose still owed outranks a card about a plan. Without this the
            # acknowledgement would sit on the panel over a tray that is still
            # waiting on a tap.
            self._reassert_alert()
            log.info("new schedule from %s: %s", source, self._payload)

    def _unchanged_slot_state(self, slots: list[sc1.SlotSchedule]) -> dict[int, SlotState]:
        """The dispensing state of every tray whose plan is unchanged.

        Compared field by field rather than by the tray's encoded line, because
        `times` is a list whose order is not part of the prescription — the same
        two doses written in the other order is the same plan, and treating it
        as a new one is the double dose this whole path exists to refuse.
        """
        running = {s.slot: s for s in self.scheduler.slots}
        carried: dict[int, SlotState] = {}
        for wanted in slots:
            was = running.get(wanted.slot)
            state = self.scheduler.state.get(wanted.slot)
            if was is None or state is None:
                continue
            if (sorted(was.times) == sorted(wanted.times)
                    and was.days == wanted.days
                    and was.duration_days == wanted.duration_days):
                carried[wanted.slot] = state
        return carried

    def apply_payload(self, payload: str, source: str = "api") -> tuple[bool, str]:
        """Accept an `SC1*S*` / `SC1*W*` / `SC1*C*` string from anywhere.

        This is the single entry point for the wire format, so the phone app,
        the paper form sheet reader, a serial console and a curl one-liner all
        take exactly the same path through the firmware. There is no second
        protocol to keep in step.
        """
        kind = sc1.message_kind(payload)

        if kind == "clock":
            clock_set = sc1.decode_clock(payload)
            if clock_set is None:
                return False, "that is not a valid clock code"
            if self.clock.source == "ntp":
                # NTP outranks a phone and this is the only place that could
                # quietly overrule it. `Clock.accept` installs an offset with no
                # regard for what is already vouching, and nothing ever takes it
                # off — `daemon.run` latches its NTP check, so `trust_ntp()`,
                # the one thing that clears an offset, never runs again after
                # the first success. Reproduced: with the system clock
                # synchronised and reading 08:00, an `SC1*C*` code for 17:00 was
                # accepted and `now()` read 17:01 for the rest of uptime, from
                # whatever timezone the phone that scanned it was in.
                #
                # `cloud.py` has always refused this on the relay path for the
                # same reason. The LAN and QR paths had no such guard.
                return False, ("this device is already synchronised from the "
                               "network, which is a better authority than a "
                               "phone — the clock was left alone")
            self.clock.accept(clock_set, source=source)
            return True, f"Clock set to {clock_set.to_datetime():%Y-%m-%d %H:%M}."

        if kind in ("schedule", "weekly"):
            slots = sc1.decode_any_schedule(payload)
            if slots is None:
                return False, "that schedule code did not parse"
            try:
                self.set_schedule(slots, source=source)
            except ValueError as exc:
                return False, str(exc)
            note = "" if kind == "weekly" else " (an S code carries no days or duration)"
            return True, f"Schedule accepted for {len(slots)} tray(s){note}."

        if kind == "event":
            # Our own outbound message, handed back. Not an error worth
            # shouting about, but definitely not a schedule.
            return False, "that is a dose event, not a schedule"

        return False, "that is not an SC1 code"

    # ── whether this device can dispense at all ─────────────────────────────

    @property
    def servos_usable(self) -> bool:
        """Can a command to a tray actually move a horn?

        False in exactly one situation: a real Raspberry Pi that found no GPIO
        library at all and fell back to the recorder. On a laptop the recorder
        is the point — `make run` is the whole firmware with the horns swapped
        out, and simulating doses there is what the dev harness is for.

        The distinction has to exist because the two look identical from inside
        the process and mean opposite things. See `gpiochip.on_raspberry_pi`.
        """
        if self.servos.backend.moves_hardware:
            return True
        return not gpiochip.on_raspberry_pi()

    def blocked_reason(self) -> str:
        """Why nothing is being dispensed, or `''` if something can be.

        Three gates, in the order they are checked. All of them fail towards the
        tray staying shut, and all of them are reported rather than being
        silent: a device that will not dispense is a problem somebody notices
        within hours, and a device that logs doses it never gave is one nobody
        notices at all.
        """
        if not self.servos_usable:
            return ("no GPIO library is installed, so no tray can be opened — "
                    "sudo apt install python3-lgpio")
        if not self.clock.trusted:
            return "the clock has not been vouched for by NTP, the RTC or a phone"
        if self._state_unknown and self.scheduler.slots:
            # store.py's own docstring has always promised this direction —
            # "the safe reading of 'cannot tell' is to refuse to dispense" — and
            # the code did the opposite. A damaged scheduler.json read as an
            # absent one, every tray got a blank state, and the doses already
            # given today were offered again. Reproduced end to end: reboot at
            # 08:30 with a truncated state file and tray 1 dropped a second
            # pill.
            #
            # Gated on there being a schedule at all, because with nothing
            # loaded there is nothing the missing record could be hiding, and a
            # device refusing to dispense a prescription it has not got yet is a
            # fault nobody can act on. It clears when a schedule is applied,
            # which writes a fresh record that matches it.
            return ("the record of what has already been dispensed is damaged, "
                    "so a dose already given cannot be told from one still owed "
                    "— re-send the schedule to start a fresh record")
        return ""

    # ── dispensing ──────────────────────────────────────────────────────────

    def tick(self) -> list[dict]:
        """One pass of the scheduler. Returns the events it recorded.

        Two jobs, in this order. First close the window on any dose that was
        offered and never tapped — that has to happen before new work, or a
        machine catching up after a power cut could hold an expired dose open
        for one more tick. Then ask the scheduler what else is owed, looping
        until it is satisfied: a single tick can owe several doses, after a
        power cut or when two trays share a time. The cap is a guard against a
        bug here becoming a loop that never ends — eight trays times six times
        a day is the most that can legitimately be owed at one instant.

        Note what this method no longer does: it does not open a tray. A dose
        found here is *offered*, and `release` is the only thing that moves a
        horn on the schedule's behalf.
        """
        with self._lock:
            # Both gates, not just the clock. A device with no GPIO library
            # would otherwise run the whole scheduler, offer every dose and
            # publish it to the carer's phone, and then fail at the one moment
            # somebody actually tapped release — the exact failure the clock
            # gate above it exists to refuse, arrived at from the other
            # direction.
            if self.blocked_reason():
                if self._due and not self._silenced_by_block:
                    # A dose offered at 08:00 whose clock loses its voucher at
                    # 08:05 stays in `_due` for ever, because `_expire_due` is
                    # below this return. `release` refuses it, so the buzzer was
                    # repeating every twenty seconds, all night, for a dose the
                    # device would not deliver. The offer itself is kept — it
                    # is still owed, and if the clock comes back inside the
                    # window it is still releasable — but the noise is not.
                    self.indicator.silence()
                    self._silenced_by_block = True
                return []

            if self._silenced_by_block:
                # Whatever was wrong has cleared and something is still owed.
                # Put the alert back rather than leaving a silent green screen.
                self._silenced_by_block = False
                self._reassert_alert()

            events = self._expire_due()

            for _ in range(sc1.MAX_SLOTS * sc1.MAX_TIMES):
                day = self.clock.day_number()
                decision = self.scheduler.next(day, self.clock.weekday(),
                                               self.clock.minutes(), skip=self._due)
                if not decision:
                    break
                event = self._carry_out(decision, day)
                if event:
                    events.append(event)
            return events

    def _carry_out(self, decision: Decision, day: int) -> dict | None:
        """Act on one scheduler decision. Returns an event, or None if the dose
        is now waiting on a person rather than finished."""
        if decision.what is Due.DISPENSE:
            self._offer(decision, day)
            return None

        # Already past its window when the scheduler first saw it — the device
        # was off, or blocked on an untrusted clock, for the whole hour. Nobody
        # was ever offered this one, which is what separates it from the
        # `not-released` case below.
        belongs_to = decision.day or day
        self.scheduler.confirm(decision, day)
        self._save_state()
        self.indicator.dose_missed(decision.slot, self._instant_of(belongs_to,
                                                                   decision.minutes))
        log.warning("tray %d: dose at %s was missed — its window had already closed",
                    decision.slot, sc1.format_hhmm(decision.minutes))
        event = self._record(decision.slot, decision.minutes, taken=False,
                             reason="window-closed", confirmed=False, day=belongs_to)
        # `_expire_due` has always done this and this branch never did. Settling
        # a dose the device slept through must not take the alert down over a
        # different dose that is owed right now and waiting on a tap.
        self._reassert_alert()
        return event

    def _offer(self, decision: Decision, day: int) -> None:
        """Paint the due screen, start the chirp, and wait for somebody to ask.

        Nothing is written to the scheduler or the event log here. The dose has
        not happened, and recording it now is what would make the log claim a
        dose that is still sitting in the hopper. It is remembered only in
        `_due`, which is memory — so a device that loses power mid-window comes
        back and rediscovers exactly the same dose from the schedule.
        """
        due_at = self.clock.at_minutes(decision.minutes)
        dose = DueDose(
            tray=decision.slot,
            minutes=decision.minutes,
            day=day,
            due_at=due_at,
            deadline=due_at + timedelta(minutes=self.scheduler.grace_minutes),
        )
        self._due[dose.key] = dose
        self.indicator.dose_due(dose.tray, dose.due_at)
        log.info("tray %d: the %s dose is due — waiting for a release until %s",
                 dose.tray, sc1.format_hhmm(dose.minutes),
                 dose.deadline.strftime("%H:%M"))
        self._notify_change()

    def _expire_due(self) -> list[dict]:
        """Close the window on every dose that was offered and never tapped.

        The tray stays shut. This is the safety property the whole release
        model exists for: pills that nobody asked for are still in the machine,
        where the next person to look can count them, rather than in a cup that
        somebody may or may not have emptied.
        """
        now = self.clock.now()
        expired = sorted((d for d in self._due.values() if now >= d.deadline),
                         key=lambda d: d.minutes)

        events = []
        for dose in expired:
            del self._due[dose.key]
            self.scheduler.confirm(
                Decision(what=Due.MISSED, slot=dose.tray, minutes=dose.minutes), dose.day)
            self._save_state()
            self.indicator.dose_missed(dose.tray, dose.due_at)
            log.warning("tray %d: the %s dose was never released — the tray stayed shut",
                        dose.tray, sc1.format_hhmm(dose.minutes))
            events.append(self._record(dose.tray, dose.minutes, taken=False,
                                       reason="not-released", confirmed=False,
                                       day=dose.day))
        if expired:
            # Amber for the one that lapsed is right only if nothing else is
            # owed. Two trays at 08:00, one released and one not, must not leave
            # the room being told the remaining dose was missed.
            self._reassert_alert()
        return events

    def drop_now(self, tray: int) -> dict:
        """Open a tray immediately, on somebody's explicit instruction.

        Used from the device's own page and from the app's `/dropout` link,
        which is how a nurse checks a tray is loaded correctly at the bench.
        This does *not* touch the scheduler: a manual drop must not cancel a
        scheduled dose, or checking the machine would stop it working.
        """
        with self._lock:
            if tray not in self.servos.pins:
                raise KeyError(f"tray {tray} is not wired")
            if not self.servos_usable:
                # Deliberately not gated on the clock: a manual drop is
                # somebody standing at the bench checking a hopper, and that is
                # exactly what you want to be able to do before the clock has
                # been set. But it must still refuse to *claim* a drop that
                # nothing performed — this is the path the assembly guide uses
                # to prove wiring, and a green tick there on a device that
                # cannot move is the worst possible moment for one.
                raise RuntimeError(
                    "no GPIO library is installed, so nothing can move — "
                    "sudo apt install python3-lgpio")
            self.servos.drop(tray)
            return self._record(tray, self.clock.minutes(), taken=True,
                                reason="manual", confirmed=True)

    def release(self, tray: int | None = None,
                minutes: int | None = None) -> list[dict]:
        """Somebody tapped release in the app. Open the tray, now.

        This is the only path by which the schedule ever opens a tray, and it
        is deliberately identical whether the tap came over the LAN or through
        the relay — the two transports meet here, so there is one place where a
        scheduled dose can be delivered and one set of rules around it.

        With no arguments it releases everything currently due, earliest first.
        Two trays owed at 08:00 are two medications the person has been told to
        take at 08:00, and making them tap twice is how the second one gets
        forgotten. `tray` and `minutes` narrow it, which is what the relay path
        uses to name the exact dose a notification was about.

        Returns the doses actually released — empty when nothing matched, which
        is the honest answer to a stale notification tapped an hour late, a
        command replayed after a reboot, and a curious tap at lunchtime. None
        of those is an error and none of them drops a pill.
        """
        with self._lock:
            # The deadline is checked *here*, not only in `_expire_due`.
            #
            # `tick` returns early whenever `blocked_reason()` is set, so a
            # device whose clock stops being vouched for never reaches
            # `_expire_due`: `_due` freezes with a stale offer in it, and that
            # offer stayed releasable for the rest of uptime. Verified before
            # this line existed — ticks at 09:00, 10:00 and 14:00 all returned
            # `[]` while `awaiting_release` still held the 08:00 dose, and a tap
            # at 14:00 drove the servo and wrote an event stamped 14:00 for the
            # 08:00 dose.
            #
            # An expired dose simply falls out of the filter, so it leaves
            # through the empty-list path the docstring already promises rather
            # than becoming an error somebody has to interpret.
            now = self.clock.now()
            wanted = sorted(
                (d for d in self._due.values()
                 if (tray is None or d.tray == tray)
                 and (minutes is None or d.minutes == minutes)
                 and now < d.deadline),
                key=lambda d: d.minutes)
            if not wanted:
                return []

            # Both gates, in the same order `tick` applies them. `servos_usable`
            # alone was not enough: an untrusted clock stops the scheduler
            # offering doses but did nothing to stop an *already offered* one
            # being released against a time nothing is vouching for.
            blocked = self.blocked_reason()
            if blocked:
                # Refuse rather than claim. This is the one moment the person is
                # standing there having asked for their medication, and a device
                # that recorded a dose it could not physically deliver — or
                # could not date correctly — would put the lie where a carer
                # reads it.
                raise RuntimeError(blocked)

            records = []
            for index, dose in enumerate(wanted):
                if index:
                    # 트레이는 위아래로 쌓여 있다. 위 칸에서 떨어진 알약이 아래 칸을
                    # 지나가는 동안 그 칸이 열리면, 약이 엉뚱한 트레이로 들어간다 —
                    # 기록에는 내줬다고 적히고 실제로는 다음 주까지 아무도 안 여는
                    # 칸에 들어가 있는 상태가 된다.
                    #
                    # 이만큼의 여유는 전에도 사실상 있었는데, 그게 문제였다. 앞선
                    # 배출의 **복귀 스윕**이었을 뿐 누가 정한 값이 아니라서,
                    # `SERVO_STEP_S` 를 줄이면 조용히 사라진다.
                    self.servos.settle(config.SERVO_BETWEEN_S)
                # Written down *before* the horn moves. The sweep is about two
                # seconds and the gate is open for one of them, and everything
                # that makes the dose durable happens after it — so a cut
                # anywhere in there used to leave either a dose that gets
                # dropped again on the next boot or one that was physically
                # given and appears nowhere. `_settle_interrupted_dose` turns
                # both into one honest line.
                self.store.save_inflight({
                    "tray": dose.tray,
                    "minutes": dose.minutes,
                    "day": dose.day,
                    "seq": self._seq,
                    "startedAt": _stamp(self.clock.now()),
                })
                try:
                    # If this raises, everything before it is already recorded
                    # and this dose stays in `_due` — still owed, still
                    # releasable for the rest of its window. A jammed servo must
                    # not become a dose the log says was given.
                    self.servos.drop(dose.tray)
                except KeyError as exc:
                    # A tray with no servo behind it. `_restore` and
                    # `set_schedule` both refuse those now, so this is the
                    # belt-and-braces path for a pin map that changed under a
                    # running process — and it must not escape as a `KeyError`,
                    # because all three callers catch only `RuntimeError` and
                    # turn anything else into a 500 or a silently swallowed
                    # button press.
                    self.store.clear_inflight()
                    raise RuntimeError(str(exc)) from exc
                except Exception:
                    self.store.clear_inflight()
                    raise
                del self._due[dose.key]
                self.scheduler.confirm(
                    Decision(what=Due.DISPENSE, slot=dose.tray, minutes=dose.minutes),
                    dose.day)
                self._save_state()
                self.indicator.dose_released(dose.tray)
                records.append(self._record(dose.tray, dose.minutes, taken=True,
                                            reason="released", confirmed=True,
                                            day=dose.day))
                # Last, and only once the scheduler mark and the log line are
                # both on the card. Until this line runs the dose is covered by
                # the marker; after it, it is covered by the two files.
                self.store.clear_inflight()
            self._reassert_alert()
            return records

    def _reassert_alert(self) -> None:
        """Put the screen and the chirp back if anything is still owed.

        `dose_released` and `dose_missed` both clear the alert unconditionally,
        which is right when the last dose has been settled and a lie when it has
        not. Two trays due at 08:00, release tray 2 by name from a notification,
        and the screen went blue and the room went quiet while tray 1 was still
        waiting — so nobody released it and it expired an hour later.

        A machine whose only channel is a colour cannot afford that: the colour *is* the interface,
        and it has to describe the machine's actual state rather than the last
        thing that happened to it.
        """
        if not self._due:
            return
        soonest = min(self._due.values(), key=lambda d: d.minutes)
        self.indicator.dose_due(soonest.tray, soonest.due_at)

    def dismiss(self) -> bool:
        """Silence the chirp without releasing anything.

        The dose stays owed and stays releasable for the rest of its window —
        somebody silencing a chime at 3 a.m. is not saying they will skip their
        medication, and treating it as a refusal would take the choice away
        from them an hour early.

        So this stops the sound and leaves the due screen up. A blank panel over a
        dose that is still waiting would be the device lying about its own
        state, which is the one thing a machine with no other channel to the
        person cannot afford.
        """
        with self._lock:
            had_alert = bool(self._due)
            self.indicator.silence()
            return had_alert

    @property
    def awaiting_release(self) -> list[DueDose]:
        """The doses offered and waiting on a tap, earliest first."""
        with self._lock:
            return sorted(self._due.values(), key=lambda d: d.minutes)

    def first_waiting(self) -> tuple[int, str, int] | None:
        """The dose the panel is asking about: `(tray, "08:00", tenths left)`.

        One call, one lock, three values that are all bucketed — a tray number,
        a printed time, and a count of tenths — because the caller is the health
        snapshot and everything it carries is compared for equality to decide
        whether to spend 38 ms repainting the panel. A remaining-seconds field
        here would repaint four times a minute for the whole grace hour.

        The earliest waiting dose, not the next scheduled one. Painting a green
        "a dose is waiting" screen and captioning it with a tray twelve hours
        away is the confirmed bug this exists to make impossible: with two doses
        owed and one released, the screen has to keep naming the one still owed.

        `None` when nothing is waiting, which is most of the day.
        """
        with self._lock:
            if not self._due:
                return None
            dose = min(self._due.values(), key=lambda d: d.minutes)
            # With the colon, not `sc1.format_hhmm`'s wire spelling: this one is
            # read by a person from across a room, and `2000` on a panel reads
            # as a year.
            printed = f"{(dose.minutes // 60) % 24:02d}:{dose.minutes % 60:02d}"
            return dose.tray, printed, dose.tenths_left(self.clock.now())

    def today_outcomes(self) -> dict[tuple[int, int], str]:
        """What happened to each of today's doses: `(tray, minute) -> state`.

        `"taken"` or `"missed"`, and **a dose that is not in here is not a dose
        nothing happened to** — it is a dose about which this machine is making
        no claim. The distinction is the whole reason this is a separate ledger
        rather than a field on the schedule:

          a dose still in the future has no entry, and the panel draws it as
          pending;

          a dose in the *past* with no entry is drawn as an outline, meaning
          "we do not know" — because `read_events` can legitimately come back
          empty (an SD card only has to lose one byte), and a machine that
          rendered an empty ledger as a row of confident ticks would be telling
          a carer that six doses were taken on the strength of no evidence at
          all. A false "taken" is the worst error this codebase recognises.

        Written where the distinction is already known — inside `_record`, which
        is the one place every dose passes through — rather than re-derived from
        the scheduler's high-water mark, which cannot tell a delivered dose from
        a missed one because it deliberately marks both the same way.

        Rebuilt at boot from the recent log, so a restart at lunchtime does not
        erase the morning from the panel. Emptied when the day rolls.
        """
        with self._lock:
            self._roll_ledger(self.clock.day_number())
            return dict(self._outcomes)

    @property
    def unfitted_trays(self) -> tuple[int, ...]:
        """Trays the stored schedule names that this machine has no servo for.

        Non-empty means a prescription is on the card and is not being
        dispensed. It is kept as a fact rather than as a log line because
        nothing else can notice it: the trays are dropped from the scheduler at
        restore, so by the time anything asks, the plan looks perfectly
        consistent with the hardware.
        """
        return self._unfitted

    @property
    def state_unknown(self) -> bool:
        """True when scheduler.json is present and unreadable.

        Separate from `blocked_reason`'s sentence so a caller can name the
        subsystem — this is a card fault, not a clock fault, and they need
        different corrective actions from whoever is standing in front of it.
        """
        return self._state_unknown

    def _notify_change(self) -> None:
        if not self.on_change:
            return
        try:
            self.on_change()
        except Exception:  # noqa: BLE001
            # Same rule as `on_event`: this runs under the lock, and a listener
            # that throws must not stop a dose being offered to the person
            # standing in front of the machine.
            log.exception("a change listener failed; the dose is offered regardless")

    # ── recording ───────────────────────────────────────────────────────────

    def _record(self, tray: int, minutes: int, taken: bool,
                reason: str, confirmed: bool, day: int | None = None) -> dict:
        event = sc1.DoseEvent(slot=tray, minutes=minutes, taken=taken, seq=self._seq)
        self._seq = (self._seq + 1) % 100

        today = self.clock.day_number()
        day = day or today
        self._note_outcome(tray, minutes, reason, day, today)

        record = {
            "at": _stamp(self.clock.now()),
            #: Which day this dose *belongs to*, which is not always the day it
            #: was written. A reboot after a long outage emits up to
            #: `CATCHUP_DAYS` of misses in one tick, and every one of them used
            #: to carry the reboot instant and a bare HH:MM — so a carer opening
            #: the app saw six lines reading "08:00 missed" stamped this
            #: morning and could not tell six missed mornings from six misses
            #: today.
            "forDate": date.fromordinal(day).isoformat(),
            "tray": tray,
            "time": sc1.format_hhmm(minutes),
            "taken": taken,
            "confirmed": confirmed,
            "reason": reason,
            "seq": event.seq,
            # The SC1 form is stored alongside the JSON so the log is
            # replayable through any of the four implementations, and so a
            # device that later gets a screen can draw any line of it as a QR.
            "sc1": sc1.encode_event(event) or "",
        }
        self.store.append_event(record)
        if self.on_event:
            try:
                self.on_event(record)
            except Exception:  # noqa: BLE001
                # A listener is a nice-to-have. This runs while a tray is open
                # and holding the lock, so anything it raises must stop here —
                # a broken notifier is not allowed to become a dose that was
                # dispensed and never written down.
                log.exception("an event listener failed; the dose is recorded regardless")
        return record

    def _instant_of(self, day: int, minutes: int) -> datetime:
        """The instant a dose was due, on the day it belongs to.

        `Clock.at_minutes` answers for *today*, which is right for every dose
        the device is watching and wrong for the ones it slept through: a
        machine catching up after a four-day outage told the panel that a dose
        from last Friday was missed at 08:00 this morning.
        """
        at = self.clock.at_minutes(minutes)
        if day and day != self.clock.day_number():
            return datetime.combine(date.fromordinal(day), at.time())
        return at

    def _note_outcome(self, tray: int, minutes: int, reason: str,
                      day: int, today: int) -> None:
        """Add one dose to today's ledger, if it is one this ledger describes."""
        state = _LEDGER.get(reason)
        if state is None or day != today:
            # A dose from a day that has ended is not part of today's picture,
            # and putting it in would mark today's dose at the same minute as
            # settled — a claim about a dose still sitting in the machine.
            return
        self._roll_ledger(today)
        self._outcomes[(tray, minutes)] = state

    def _roll_ledger(self, today: int) -> None:
        """Empty the ledger when the day it describes has ended."""
        if self._outcomes_day != today:
            self._outcomes = {}
            self._outcomes_day = today

    @staticmethod
    def _outcomes_from(events: list[dict], today: int) -> dict[tuple[int, int], str]:
        """Rebuild today's ledger from the event log, oldest line winning last.

        Read at boot so a machine that restarts at lunchtime still knows the
        morning dose was taken — otherwise every reboot would erase the day's
        record from the panel, and a person looking at it would see this
        morning as a dose nothing is known about.

        Every field is re-derived defensively: this is a file on an SD card that
        a bit flip can reach, and one unparseable line must cost its own dose
        rather than the whole ledger.
        """
        out: dict[tuple[int, int], str] = {}
        for record in reversed(events):        # oldest first, so later wins
            state = _LEDGER.get(str(record.get("reason", "")))
            if state is None:
                continue
            try:
                tray = int(record["tray"])
                minutes = sc1.parse_hhmm(str(record["time"]))
                stamp = record.get("forDate")
                if stamp:
                    day = date.fromisoformat(str(stamp)).toordinal()
                else:
                    # Written before `forDate` existed. The `at` stamp is the
                    # instant it was recorded, which is the same day for
                    # everything except a catch-up miss — and those are exactly
                    # the lines that do not belong in today's ledger anyway.
                    day = datetime.fromisoformat(str(record["at"])).date().toordinal()
            except (KeyError, TypeError, ValueError):
                continue
            if minutes is None or day != today:
                continue
            out[(tray, minutes)] = state
        return out

    def _save_state(self) -> None:
        self.store.save_state(self.scheduler.state, self._payload)

    # ── reporting ───────────────────────────────────────────────────────────

    def status(self) -> dict:
        with self._lock:
            day, weekday, minutes = (self.clock.day_number(), self.clock.weekday(),
                                     self.clock.minutes())
            upcoming = self.scheduler.upcoming(day, weekday, minutes)
            slots = self.scheduler.slots
            waiting = [dose.to_json() for dose in self.awaiting_release]

            return {
                "trays": self.servos.trays,
                "trayCount": len(self.servos.pins),
                "pins": {str(t): g for t, g in sorted(self.servos.pins.items())},
                "servoBackend": self.servos.backend.name,
                "servoSteady": self.servos.backend.steady,
                #: `dma` / `threaded` / `python` / `none`. More useful than the
                #: boolean above, which cannot tell lgpio apart from RPi.GPIO.
                "servoTiming": self.servos.backend.quality,
                #: False means a command to a tray moves nothing at all.
                "servoUsable": self.servos_usable,
                "clock": self.clock.status(),
                "dispensing": not self.blocked_reason(),
                #: Empty when doses are being given. Otherwise the sentence to
                #: put on a screen — a device that will not dispense must say
                #: which of the two reasons it is, or nobody can act on it.
                "blockedReason": self.blocked_reason(),
                "scheduleSource": self._source,
                "payload": self._payload,
                #: Trays the stored prescription names that this machine cannot
                #: open. Non-empty means a medication is on the card and is not
                #: being given, which nothing else anywhere reports — the trays
                #: are dropped at restore, so by the time anybody looks, the
                #: plan and the hardware agree perfectly.
                "unfittedTrays": list(self._unfitted),
                #: True when scheduler.json is present and unreadable. Paired
                #: with `blockedReason`, which carries the sentence; this is the
                #: machine-readable half, so the app can name the card rather
                #: than blaming the clock.
                "recordDamaged": self._state_unknown,
                "slots": sc1.slots_to_json(slots),
                "notes": sc1.loses_detail(slots),
                "nextDose": ({"tray": upcoming[0], "time": sc1.format_hhmm(upcoming[1])}
                             if upcoming else None),
                #: The doses waiting on a tap, each with the instant its window
                #: closes. This is what the app watches: a non-empty list is a
                #: release button on its main screen and a push notification,
                #: and `expiresAt` is what lets it stop offering a dose the
                #: device will no longer deliver rather than sending somebody to
                #: tap a button that quietly does nothing.
                "awaitingRelease": waiting,
                "dropCounts": {str(t): n for t, n in sorted(self.servos.drops.items())},
                "indicators": list(self.indicator.fitted),
            }

    def events(self, limit: int = 50) -> list[dict]:
        return self.store.read_events(limit=limit)

    def close(self) -> None:
        self.servos.close()
        self.indicator.close()
