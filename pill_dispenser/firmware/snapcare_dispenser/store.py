"""What has to survive a power cut, and how it is written so that it does.

Four things are persisted:

  schedule.json    the plan, plus the payload it arrived as
  scheduler.json   what has already been dispensed
  events.jsonl     the dose log
  inflight.json    the dose being dropped at this instant, if any

The second is the one that matters. Without it, a Pi that reboots at 08:30
comes back with no memory of the 08:00 dose, finds it inside the grace window,
and dispenses it again. A power cut during a thunderstorm becomes a double
dose, and nothing anywhere reports a problem.

The fourth exists because the other three are written *after* the servo has
already swept. It is the only file whose presence is itself the message: it
means the last thing this machine did was open a tray, and it was not around
to see how that ended.

Writing it safely
-----------------
Every write is to a temporary file in the same directory, fsynced, then
`os.replace`d over the target, and finally the directory itself is fsynced.
`os.replace` is atomic on POSIX, so a reader — or the next boot — sees either
the whole old file or the whole new one, never a half-written one.

This is not theoretical care. The device is a Raspberry Pi running from an SD
card, in a house, plugged into a socket that someone will eventually switch off
at the wall, and the file being written is the one that says whether a dose has
already been given. A truncated JSON file there means the firmware cannot tell,
and the safe reading of "cannot tell" is to refuse to dispense — so a sloppy
write turns a power cut into a day with no medication.
"""
from __future__ import annotations

import json
import logging
import os
import tempfile
from datetime import datetime
from pathlib import Path

from . import config
from .sc1 import SlotSchedule, encode_weekly, slots_from_json, slots_to_json
from .scheduler import SlotState

log = logging.getLogger(__name__)


def _fsync_dir(directory: Path) -> None:
    """Put a directory's own contents on the card.

    A rename, a create and an unlink are all changes to the *directory*, and
    fsyncing the file they touched does not commit them. Without this a file can
    still be missing — or still be present — after a power cut, whatever was
    done to its data.
    """
    dir_fd = os.open(str(directory), os.O_RDONLY)
    try:
        os.fsync(dir_fd)
    finally:
        os.close(dir_fd)


def write_atomic(path: Path, text: str) -> None:
    """Replace `path` with `text`, or leave it exactly as it was."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(dir=str(path.parent), prefix=f".{path.name}.", suffix=".tmp")
    tmp = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
        _fsync_dir(path.parent)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise


class _Damaged:
    """A file that is present and cannot be read.

    Deliberately not `None`. "There is no file" and "there is a file and it is
    rubble" are the same value to a reader that conflates them, and they call
    for opposite answers: the first is a fresh install and the second is an SD
    card that has lost the record of what was already dispensed. Every caller
    that can act on the difference has to be made to look at it, which is what
    a distinct value does and a logged `None` does not.
    """

    def __repr__(self) -> str:
        return "DAMAGED"


DAMAGED = _Damaged()


def _read_json(path: Path):
    """Parse a stored file: the data, `None` if absent, `DAMAGED` if unreadable.

    Damage is reported loudly and never raised. The alternative — crashing at
    boot — leaves a tray that never opens and no way to find out why without a
    keyboard and a monitor.
    """
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except (json.JSONDecodeError, OSError, UnicodeDecodeError) as exc:
        log.error("%s is unreadable (%s)", path, exc)
        return DAMAGED


class Store:
    def __init__(self, directory: Path | None = None):
        self.dir = Path(directory) if directory else config.STATE_DIR
        self.schedule_file = self.dir / config.SCHEDULE_FILE.name
        self.state_file = self.dir / config.SCHEDULER_STATE_FILE.name
        self.event_file = self.dir / config.EVENT_LOG_FILE.name
        self.identity_file = self.dir / config.IDENTITY_FILE.name
        #: The dose currently being dropped. Named here rather than in
        #: `config.py` because this file is the only thing that ever opens it —
        #: it is a crash marker, not a setting, and nothing outside the state
        #: directory should be able to point it somewhere else.
        self.inflight_file = self.dir / "inflight.json"
        self.dir.mkdir(parents=True, exist_ok=True)

    # ── the schedule ────────────────────────────────────────────────────────

    def save_schedule(self, slots: list[SlotSchedule], source: str = "api") -> None:
        write_atomic(self.schedule_file, json.dumps({
            "version": 1,
            "savedAt": datetime.now().isoformat(timespec="seconds"),
            "source": source,
            # The canonical `W` payload is stored alongside the parsed form. It
            # is what tells a restart whether the schedule is the same one — a
            # comparison of parsed structures would have to know which fields
            # count, and this cannot drift from what was actually accepted.
            "payload": encode_weekly(slots),
            "slots": slots_to_json(slots),
        }, indent=2))

    def load_schedule(self) -> tuple[list[SlotSchedule], str]:
        """The stored plan and the `SC1*W*` payload it came from."""
        data = _read_json(self.schedule_file)
        if not isinstance(data, dict):
            return [], ""
        slots = slots_from_json(data.get("slots"))
        if slots is None:
            log.error("stored schedule did not parse — starting with none loaded")
            return [], ""
        return slots, data.get("payload", "")

    # ── what has already been dispensed ─────────────────────────────────────

    def save_state(self, state: dict[int, SlotState], payload: str) -> None:
        write_atomic(self.state_file, json.dumps({
            "version": 1,
            # Stamped with the schedule it belongs to. State from a previous
            # prescription must not be applied to a new one: a tray that
            # yesterday finished a 30-day course would come back "already
            # dispensed today" against a schedule it has never seen.
            "payload": payload,
            "slots": {
                str(slot): {
                    "startDay": s.start_day,
                    "lastDay": s.last_day,
                    "lastMinutes": s.last_minutes,
                    "everFired": s.ever_fired,
                }
                for slot, s in state.items()
            },
        }, indent=2))

    def load_state(self, payload: str) -> tuple[dict[int, SlotState], bool]:
        """Stored state if it belongs to `payload`, and whether it was damaged.

        A mismatch returns nothing, which makes the caller start the courses
        fresh — the right answer when the schedule really did change, and
        harmless when it did not, because a schedule is only ever saved
        together with the state that goes with it.

        The second value is the one this module's own docstring promised and
        never delivered. An empty dict used to mean all three of "fresh
        install", "different prescription" and "this file is rubble", and the
        caller could only fail one way for all of them — open, re-offering
        doses already given. Reproduced: give the 08:00 dose, overwrite
        scheduler.json with a truncated fragment (media damage, which
        `write_atomic` does not pretend to prevent), reboot at 08:30, and the
        tray drops a second pill. True here lets the caller refuse instead.
        """
        data = _read_json(self.state_file)
        if data is DAMAGED:
            return {}, True
        if not isinstance(data, dict):
            return {}, False
        if data.get("payload") != payload:
            log.info("stored dispensing state is for a different schedule — ignoring it")
            return {}, False

        out: dict[int, SlotState] = {}
        damaged = False
        for slot_text, raw in (data.get("slots") or {}).items():
            try:
                out[int(slot_text)] = SlotState(
                    start_day=int(raw["startDay"]),
                    last_day=int(raw["lastDay"]),
                    last_minutes=int(raw["lastMinutes"]),
                    ever_fired=bool(raw["everFired"]),
                )
            except (KeyError, TypeError, ValueError):
                # Not dropped quietly any more. One unreadable tray is one tray
                # whose morning dose we can no longer account for, which is the
                # same not-knowing as an unreadable file.
                log.error("dispensing state for tray %s is damaged", slot_text)
                damaged = True
        return out, damaged

    # ── the dose being dropped right now ────────────────────────────────────

    def save_inflight(self, intent: dict) -> None:
        """Write down which dose is about to be dropped, before the horn moves.

        `TrayServos.drop` takes about two seconds and the gate is open for one
        of them. Everything that makes the dose durable — the scheduler mark,
        scheduler.json, the event log — used to happen *after* that, so a cut
        anywhere in the sweep left two indistinguishable outcomes:

          the pills fell and nothing on the card says so, in which case the next
          boot re-offers the dose and a tap drops a second one;

          the pills fell and the card says nothing at all, in which case the
          carer sees a gap they cannot tell from a skipped dose.

        This file turns both into one honest "we do not know", which is the
        direction the rest of this firmware already fails in. It is small and
        written through `write_atomic`, so it is on the card before the servo is
        told to move.
        """
        write_atomic(self.inflight_file, json.dumps(intent, indent=2))

    def load_inflight(self) -> dict | None:
        """The interrupted dose, if the last run was cut mid-sweep."""
        data = _read_json(self.inflight_file)
        return data if isinstance(data, dict) else None

    def clear_inflight(self) -> None:
        """The dose is durable now; the marker has done its job.

        The unlink is followed by a directory fsync for the same reason the
        write is: an unlink that has not reached the card is a file that comes
        back, and a marker that comes back declares a dose interrupted that was
        in fact recorded perfectly.
        """
        try:
            self.inflight_file.unlink()
        except FileNotFoundError:
            return
        except OSError as exc:
            log.error("could not clear %s (%s)", self.inflight_file, exc)
            return
        _fsync_dir(self.dir)

    # ── the dose log ────────────────────────────────────────────────────────

    def append_event(self, record: dict) -> None:
        """One dose, one line.

        Append-only and line-delimited so a power cut can lose at most the last
        line rather than the file. It is opened, written, flushed and fsynced
        each time — twenty-four writes a day is nothing, and the alternative is
        a log that is missing precisely the events around the crash that a
        person would be trying to explain.

        **The newline is checked before writing, not assumed.** "at most the
        last line" is only true if the next write starts on a fresh one. A power
        cut during a write leaves a fragment with no trailing newline, and a
        plain append then glues the *next* event onto that fragment — so
        `read_events` discards one damaged line and silently loses a dose the
        servo physically delivered. One extra byte read per write buys the
        property the docstring above claims.
        """
        self.dir.mkdir(parents=True, exist_ok=True)
        line = json.dumps(record, separators=(",", ":")) + "\n"
        existed = self.event_file.exists()
        with open(self.event_file, "a+b") as handle:
            if handle.seek(0, os.SEEK_END):        # 0 is an empty file
                handle.seek(-1, os.SEEK_END)
                if handle.read(1) != b"\n":
                    line = "\n" + line
            handle.write(line.encode("utf-8"))
            handle.flush()
            os.fsync(handle.fileno())
        if not existed:
            # The data is on the card but the *name* need not be. On the first
            # append after a fresh install — or after `_trim_events` replaced
            # the file — a power cut here loses the whole log rather than the
            # last line, which is the opposite of what this function promises.
            # `write_atomic` has always done this for the other three files.
            _fsync_dir(self.dir)
        self._trim_events()

    def _read_lines(self) -> list[str]:
        """The log as text lines, decoded one line at a time.

        Per line, and from bytes, because the whole-file `read_text` this
        replaced took `UnicodeDecodeError` as an answer about the *file*. One
        flipped bit anywhere in it — an SD-card page of zeros with a stray 0xFF,
        the tail of an interrupted write — and `read_events` returned `[]`
        permanently: the app and the carer's phone showed no dose history at
        all, `_restore` reset the SC1 sequence numbers into ones already sent,
        and `_trim_events` silently stopped trimming, so the file grew without
        bound. Reproduced by flipping byte 10 of a five-event log.

        `errors="replace"` keeps the damage inside the line that carries it,
        where `json.loads` rejects that one line and the other several hundred
        survive — which is what "a power cut can lose at most the last line"
        was always supposed to mean.
        """
        try:
            raw = self.event_file.read_bytes()
        except (FileNotFoundError, OSError):
            return []
        return [chunk.decode("utf-8", errors="replace")
                for chunk in raw.split(b"\n")]

    def read_events(self, limit: int = 100) -> list[dict]:
        """The most recent events, newest first. Damaged lines are skipped."""
        out = []
        for line in reversed(self._read_lines()):
            if len(out) >= limit:
                break
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                continue  # a torn last line from a power cut; the rest is fine
        return out

    #: The fewest bytes a real event line can occupy. `_record` writes eight
    #: keys including an ISO timestamp with an offset, so the true figure is
    #: nearer 150; this is the conservative floor that makes the size gate below
    #: safe rather than clever.
    _MIN_EVENT_BYTES = 48

    def _trim_events(self) -> None:
        """Keep the log bounded. An SD card that fills up stops the device.

        Gated on the file's *size* before anything is read. This runs on every
        append, and after a multi-day outage the catch-up sweep appends up to 48
        events per tick; reading and re-writing a 3000-line log each time is on
        the order of tens of megabytes of SD I/O per tick, at the moment the
        card is most exposed. `stat` is one syscall and answers "definitely
        under the limit" for the entire normal life of the device.
        """
        try:
            size = self.event_file.stat().st_size
        except (FileNotFoundError, OSError):
            return
        if size < config.EVENT_LOG_LIMIT * self._MIN_EVENT_BYTES:
            return
        lines = [line for line in self._read_lines() if line.strip()]
        if len(lines) <= config.EVENT_LOG_LIMIT:
            return
        keep = lines[-config.EVENT_LOG_LIMIT:]
        write_atomic(self.event_file, "\n".join(keep) + "\n")

    # ── device identity ─────────────────────────────────────────────────────

    def load_identity(self) -> dict | None:
        data = _read_json(self.identity_file)
        return data if isinstance(data, dict) else None

    def save_identity(self, identity: dict) -> None:
        write_atomic(self.identity_file, json.dumps(identity, indent=2))
