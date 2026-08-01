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
from datetime import datetime, timedelta

from . import config, gpiochip, sc1
from .clock import Clock
from .indicators import Indicator, LogIndicator
from .scheduler import Decision, Due, Scheduler
from .servo import TrayServos
from .store import Store

log = logging.getLogger(__name__)


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

    def to_json(self) -> dict:
        return {
            "tray": self.tray,
            "time": sc1.format_hhmm(self.minutes),
            "dueAt": self.due_at.isoformat(timespec="seconds"),
            "expiresAt": self.deadline.isoformat(timespec="seconds"),
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
        self._restore()

    # ── startup ─────────────────────────────────────────────────────────────

    def _restore(self) -> None:
        slots, payload = self.store.load_schedule()
        self._payload = payload
        self._source = "restored" if slots else "none"

        state = self.store.load_state(payload)
        self.scheduler.restore(slots, state)

        # If the stored state did not match the schedule, `restore` gave every
        # tray a blank one with start_day 0, which would make a course of "30
        # days" have expired three million days ago. Start those courses today.
        today = self.clock.day_number()
        for slot_state in self.scheduler.state.values():
            if slot_state.start_day == 0:
                slot_state.start_day = today

        recent = self.store.read_events(limit=1)
        if recent:
            self._seq = (int(recent[0].get("seq", 0)) + 1) % 100

        if slots:
            log.info("restored a schedule for %d tray(s): %s",
                     len(slots), payload)
        else:
            log.info("no schedule stored — nothing will be dispensed until one arrives")

    # ── the schedule ────────────────────────────────────────────────────────

    def set_schedule(self, slots: list[sc1.SlotSchedule], source: str = "api") -> None:
        """Adopt a new schedule. This forgets what has already been dispensed.

        That is correct for a new prescription and wrong for a restart, which
        is why a restart goes through `_restore` instead. The two are kept
        apart deliberately: conflating them is how a reboot turns into a repeat
        of the day's doses.
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

            today = self.clock.day_number()
            self.scheduler.load(slots, today)
            self._payload = sc1.encode_weekly(slots)
            self._source = source
            self.store.save_schedule(slots, source=source)
            self.store.save_state(self.scheduler.state, self._payload)
            # A dose offered under the old prescription is withdrawn rather than
            # carried over. Releasing it now would drop a pill against a plan
            # that has just been replaced, and the tray it names may not even be
            # in the new schedule.
            self._due.clear()
            self.indicator.schedule_accepted()
            log.info("new schedule from %s: %s", source, self._payload)

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

        Two gates, in the order they are checked. Both fail towards the tray
        staying shut, and both are reported rather than being silent: a device
        that will not dispense is a problem somebody notices within hours, and
        a device that logs doses it never gave is one nobody notices at all.
        """
        if not self.servos_usable:
            return ("no GPIO library is installed, so no tray can be opened — "
                    "sudo apt install python3-lgpio")
        if not self.clock.trusted:
            return "the clock has not been vouched for by NTP, the RTC or a phone"
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
                return []

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
        self.scheduler.confirm(decision, day)
        self._save_state()
        self.indicator.dose_missed(decision.slot)
        log.warning("tray %d: dose at %s was missed — its window had already closed",
                    decision.slot, sc1.format_hhmm(decision.minutes))
        return self._record(decision.slot, decision.minutes, taken=False,
                            reason="window-closed", confirmed=False)

    def _offer(self, decision: Decision, day: int) -> None:
        """Light the ring, start the chirp, and wait for somebody to tap.

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
        self.indicator.dose_due(dose.tray)
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
            self.indicator.dose_missed(dose.tray)
            log.warning("tray %d: the %s dose was never released — the tray stayed shut",
                        dose.tray, sc1.format_hhmm(dose.minutes))
            events.append(self._record(dose.tray, dose.minutes, taken=False,
                                       reason="not-released", confirmed=False))
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
            wanted = sorted(
                (d for d in self._due.values()
                 if (tray is None or d.tray == tray)
                 and (minutes is None or d.minutes == minutes)),
                key=lambda d: d.minutes)
            if not wanted:
                return []

            if not self.servos_usable:
                # Refuse rather than claim. This is the one moment the person is
                # standing there having asked for their medication, and a device
                # that recorded a dose it could not physically deliver would put
                # the lie where a carer reads it.
                raise RuntimeError(
                    "no GPIO library is installed, so nothing can move — "
                    "sudo apt install python3-lgpio")

            records = []
            for dose in wanted:
                # If this raises, everything before it is already recorded and
                # this dose stays in `_due` — still owed, still releasable for
                # the rest of its window. A jammed servo must not become a dose
                # the log says was given.
                self.servos.drop(dose.tray)
                del self._due[dose.key]
                self.scheduler.confirm(
                    Decision(what=Due.DISPENSE, slot=dose.tray, minutes=dose.minutes),
                    dose.day)
                self._save_state()
                self.indicator.dose_released(dose.tray)
                records.append(self._record(dose.tray, dose.minutes, taken=True,
                                            reason="released", confirmed=True))
            return records

    def dismiss(self) -> bool:
        """Silence the chirp without releasing anything.

        The dose stays owed and stays releasable for the rest of its window —
        somebody silencing a chime at 3 a.m. is not saying they will skip their
        medication, and treating it as a refusal would take the choice away
        from them an hour early.

        So this stops the sound and leaves the ring green. A dark ring over a
        dose that is still waiting would be the device lying about its own
        state, which is the one thing a build with no screen cannot afford.
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
                reason: str, confirmed: bool) -> dict:
        event = sc1.DoseEvent(slot=tray, minutes=minutes, taken=taken, seq=self._seq)
        self._seq = (self._seq + 1) % 100

        record = {
            "at": self.clock.now().isoformat(timespec="seconds"),
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
