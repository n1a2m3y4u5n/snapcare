"""What has to survive a power cut, and how it is written so that it does.

Three things are persisted:

  schedule.json    the plan, plus the payload it arrived as
  scheduler.json   what has already been dispensed
  events.jsonl     the dose log

The second is the one that matters. Without it, a Pi that reboots at 08:30
comes back with no memory of the 08:00 dose, finds it inside the grace window,
and dispenses it again. A power cut during a thunderstorm becomes a double
dose, and nothing anywhere reports a problem.

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
        # The rename itself is only durable once the directory entry is on the
        # card. Without this the file can still be missing after a power cut,
        # even though the data was fsynced.
        dir_fd = os.open(str(path.parent), os.O_RDONLY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise


def _read_json(path: Path):
    """Parse a stored file, or None if it is missing or damaged.

    A corrupt file is treated as an absent one and reported loudly. The
    alternative — crashing at boot — leaves a tray that never opens and no way
    to find out why without a keyboard and a monitor.
    """
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except (json.JSONDecodeError, OSError, UnicodeDecodeError) as exc:
        log.error("%s is unreadable (%s) — treating it as absent", path, exc)
        return None


class Store:
    def __init__(self, directory: Path | None = None):
        self.dir = Path(directory) if directory else config.STATE_DIR
        self.schedule_file = self.dir / config.SCHEDULE_FILE.name
        self.state_file = self.dir / config.SCHEDULER_STATE_FILE.name
        self.event_file = self.dir / config.EVENT_LOG_FILE.name
        self.identity_file = self.dir / config.IDENTITY_FILE.name
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

    def load_state(self, payload: str) -> dict[int, SlotState]:
        """Stored state, but only if it belongs to `payload`.

        A mismatch returns nothing, which makes the caller start the courses
        fresh — the right answer when the schedule really did change, and
        harmless when it did not, because a schedule is only ever saved
        together with the state that goes with it.
        """
        data = _read_json(self.state_file)
        if not isinstance(data, dict):
            return {}
        if data.get("payload") != payload:
            log.info("stored dispensing state is for a different schedule — ignoring it")
            return {}

        out: dict[int, SlotState] = {}
        for slot_text, raw in (data.get("slots") or {}).items():
            try:
                out[int(slot_text)] = SlotState(
                    start_day=int(raw["startDay"]),
                    last_day=int(raw["lastDay"]),
                    last_minutes=int(raw["lastMinutes"]),
                    ever_fired=bool(raw["everFired"]),
                )
            except (KeyError, TypeError, ValueError):
                log.error("dispensing state for tray %s is damaged — dropping it", slot_text)
        return out

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
        with open(self.event_file, "a+b") as handle:
            if handle.seek(0, os.SEEK_END):        # 0 is an empty file
                handle.seek(-1, os.SEEK_END)
                if handle.read(1) != b"\n":
                    line = "\n" + line
            handle.write(line.encode("utf-8"))
            handle.flush()
            os.fsync(handle.fileno())
        self._trim_events()

    def read_events(self, limit: int = 100) -> list[dict]:
        """The most recent events, newest first. Damaged lines are skipped."""
        try:
            lines = self.event_file.read_text(encoding="utf-8").splitlines()
        except (FileNotFoundError, OSError, UnicodeDecodeError):
            return []

        out = []
        for line in reversed(lines):
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

    def _trim_events(self) -> None:
        """Keep the log bounded. An SD card that fills up stops the device."""
        try:
            lines = self.event_file.read_text(encoding="utf-8").splitlines()
        except (FileNotFoundError, OSError, UnicodeDecodeError):
            return
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
