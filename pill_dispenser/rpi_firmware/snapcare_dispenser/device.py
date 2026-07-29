"""The dispenser itself — the one object that is allowed to open a tray.

Everything above this (the HTTP API, the web page, the daemon loop) asks this
class to do things. Everything below it (the scheduler, the servos, the store,
the clock) is a component it owns. That shape exists so that there is exactly
one place where "a tray opened" can happen, and it is the same place whether
the cause was the schedule, a nurse pressing a button on the web page, or the
phone app posting a payload.

The three rules that live here
------------------------------
**Nothing opens on an untrusted clock.** Checked on every tick, not at startup,
because a Pi acquires a trustworthy clock partway through its life — when the
WiFi comes up and NTP corrects it — and a device that decided at boot would
stay shut all day for a network that arrived thirty seconds later.

**A dose is recorded only after the servo has returned.** `Scheduler.confirm`
is called after `drop`, never before. If the sweep raises, the dose stays owed
and the next tick tries again inside its grace window. The alternative — mark
first, move second — turns a jammed servo into a dose the log says was given.

**A missed dose is recorded too.** It is marked exactly like a delivered one,
because it has been dealt with. Leaving it unmarked would make the device
rediscover it on every tick and re-report it forever, and the phone's log would
fill with the same 08:00 dose a thousand times.
"""
from __future__ import annotations

import logging
import threading
from datetime import datetime

from . import config, sc1
from .clock import Clock
from .indicators import Indicator, LogIndicator
from .scheduler import Decision, Due, Scheduler
from .servo import TrayServos
from .store import Store

log = logging.getLogger(__name__)


class Dispenser:
    def __init__(self, store: Store | None = None, servos: TrayServos | None = None,
                 clock: Clock | None = None, indicator: Indicator | None = None,
                 grace_minutes: int | None = None, on_event=None):
        self.store = store or Store()
        self.servos = servos or TrayServos()
        self.clock = clock or Clock()
        self.indicator = indicator or LogIndicator()
        #: Called with every recorded dose, whatever caused it.
        #:
        #: The cloud link hangs off this rather than off the callers, because
        #: there are five ways a dose gets recorded — the scheduler, the button,
        #: the web console, the app's `/dropout` link, a confirmation timing
        #: out — and hanging it off each of them means the day somebody adds a
        #: sixth, that one is silently not reported. This is the one place they
        #: all pass through.
        self.on_event = on_event
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
        self._pending: tuple[int, int, datetime] | None = None  # tray, minutes, since
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
            self._pending = None
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

    # ── dispensing ──────────────────────────────────────────────────────────

    def tick(self) -> list[dict]:
        """One pass of the scheduler. Returns the events it recorded.

        Loops until the scheduler is satisfied, because a single tick can owe
        several doses — after a power cut, or when two trays share a time. The
        cap is a guard against a bug here becoming a servo that never stops:
        eight trays times six times a day is the most that can legitimately be
        owed at one instant.
        """
        with self._lock:
            if not self.clock.trusted:
                return []

            events = []
            for _ in range(sc1.MAX_SLOTS * sc1.MAX_TIMES):
                day = self.clock.day_number()
                decision = self.scheduler.next(day, self.clock.weekday(), self.clock.minutes())
                if not decision:
                    break
                events.append(self._carry_out(decision, day))
            self._expire_pending()
            return events

    def _carry_out(self, decision: Decision, day: int) -> dict:
        if decision.what is Due.DISPENSE:
            self.servos.drop(decision.slot)
            # Only now. If the sweep above raised, this line is never reached,
            # the dose stays owed, and the next tick retries it inside its
            # grace window rather than logging a dose that never came out.
            self.scheduler.confirm(decision, day)
            self._save_state()
            self._pending = (decision.slot, decision.minutes, self.clock.now())
            self.indicator.dose_ready(decision.slot)
            return self._record(decision.slot, decision.minutes, taken=True,
                                reason="dispensed", confirmed=False)

        self.scheduler.confirm(decision, day)
        self._save_state()
        self.indicator.dose_missed(decision.slot)
        log.warning("tray %d: dose at %s was missed — window closed",
                    decision.slot, sc1.format_hhmm(decision.minutes))
        return self._record(decision.slot, decision.minutes, taken=False,
                            reason="window-closed", confirmed=False)

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
            self.servos.drop(tray)
            return self._record(tray, self.clock.minutes(), taken=True,
                                reason="manual", confirmed=True)

    def confirm_taken(self) -> dict | None:
        """The person pressed the button, or tapped the page.

        Turns the standing green alert into a recorded confirmation. Returns
        None when nothing was waiting, which is what a stray press is.
        """
        with self._lock:
            if self._pending is None:
                return None
            tray, minutes, _ = self._pending
            self._pending = None
            self.indicator.dose_taken(tray)
            return self._record(tray, minutes, taken=True,
                                reason="confirmed", confirmed=True)

    def dismiss(self) -> bool:
        """Silence a standing alert without claiming the dose was taken.

        The pills are physically in the cup either way, so this does not record
        a missed dose — it records nothing at all. Somebody silencing a chime
        at 3 a.m. is not making a statement about medication.
        """
        with self._lock:
            had_alert = self._pending is not None
            self._pending = None
            self.indicator.clear()
            return had_alert

    def _expire_pending(self) -> None:
        """Stop the alert after `CONFIRM_TIMEOUT_S` and let it stand as taken.

        The dose has physically left the tray, so the honest reading is that it
        was given. Recording it as missed because nobody pressed a button would
        put a false negative into the log a carer reads — and the direction of
        that error matters: "they did not take it" prompts someone to
        re-administer a dose that has already been dispensed.
        """
        if self._pending is None:
            return
        tray, _, since = self._pending
        if (self.clock.now() - since).total_seconds() < config.CONFIRM_TIMEOUT_S:
            return
        log.info("tray %d: no confirmation within %d minutes; the dose stands as dispensed",
                 tray, config.CONFIRM_TIMEOUT_S // 60)
        self._pending = None
        self.indicator.clear()

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
            pending = None
            if self._pending:
                tray, due, _ = self._pending
                pending = {"tray": tray, "time": sc1.format_hhmm(due)}

            return {
                "trays": self.servos.trays,
                "trayCount": len(self.servos.pins),
                "pins": {str(t): g for t, g in sorted(self.servos.pins.items())},
                "servoBackend": self.servos.backend.name,
                "servoSteady": self.servos.backend.steady,
                "clock": self.clock.status(),
                "dispensing": self.clock.trusted,
                "scheduleSource": self._source,
                "payload": self._payload,
                "slots": sc1.slots_to_json(slots),
                "notes": sc1.loses_detail(slots),
                "nextDose": ({"tray": upcoming[0], "time": sc1.format_hhmm(upcoming[1])}
                             if upcoming else None),
                "awaitingConfirmation": pending,
                "dropCounts": {str(t): n for t, n in sorted(self.servos.drops.items())},
                "indicators": list(self.indicator.fitted),
            }

    def events(self, limit: int = 50) -> list[dict]:
        return self.store.read_events(limit=limit)

    def close(self) -> None:
        self.servos.close()
        self.indicator.close()
