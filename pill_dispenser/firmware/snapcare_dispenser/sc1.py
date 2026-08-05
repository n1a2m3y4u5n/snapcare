"""SC1 — the wire format shared by the phone, the paper sheet and the device.

This is the fourth implementation of a grammar that already exists in three:

    lib/hardware/protocol.ts                       the phone app  (TypeScript)
    pill_dispenser/form_sheet_parser/schedule.py   the sheet reader (Python)
    pill_dispenser/firmware/libraries/SC1/         the AVR firmware (C++)
    this file                                      the Raspberry Pi firmware

They share no code. The only thing keeping them speaking the same language is
that all four assert on the same vectors, so `tests/test_sc1.py` here replays
the cases from `firmware/test/test_sc1.cpp` verbatim. That is not ceremony: a
grammar drift has no symptom on hardware except a device that silently stops
accepting schedules, and no error is printed anywhere when that happens.

The messages
------------
    phone  -> device   SC1*S*1:0800.2000/2:1800
                       trays and times; whatever is loaded drops every day

    phone  -> device   SC1*W*1:0800.2000-127-030/3:1900-021-000
                       the same, plus a day-of-week mask and a course length,
                       which the paper sheet can express and `S` cannot

    phone  -> device   SC1*C*202607251930*4
                       wall-clock time. A Pi has no RTC, so this matters more
                       here than it did on the Arduino build. See config.py.

    device -> phone    SC1*E*1*0800*T*07
                       one dose, taken or missed

Why parsers here return None instead of raising
-----------------------------------------------
Kept from the AVR firmware, where the input was whatever QR happened to be in
front of the camera. The input is different here — HTTP request bodies — but
the reason survives intact: this server is reachable by anything on the home
network, so "what is this" has to be answerable before "parse this", and a
parser that throws on a stranger's data is a parser that can be used to stop
the dispenser.

Two deliberate differences from the C++
---------------------------------------
Both are noted at the function that makes them, and both are in the direction
of refusing more, not less:

  * `decode_clock` rejects a stamp whose weekday contradicts its date. The C++
    trusts the weekday as sent. Here the weekday is what the day mask is
    matched against, so a wrong one dispenses on the wrong days of the week —
    and the sender always knows the right answer, so a disagreement means the
    message is corrupt and neither field can be trusted.

  * Leading *and* trailing whitespace is stripped, as the TypeScript does; the
    C++ skips only leading spaces. Payloads arrive here through HTTP forms and
    text boxes, which pick up a trailing newline constantly.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime

PROTOCOL = "SC1"
SEP = "*"
SLOT_SEP = "/"
TIME_SEP = "."
ATTR_SEP = "-"

#: Physical trays. The protocol allows slot numbers to 99, but accepting one
#: the machine does not have loses a dose with no error anywhere.
MAX_SLOTS = 8

#: Drop times per tray. Three a day is the practical ceiling; six is slack.
MAX_TIMES = 6

#: Day bits, Monday first — the order the paper sheet prints them in, so a mask
#: can be checked against the paper by eye.
MON, TUE, WED, THU, FRI, SAT, SUN = (1 << i for i in range(7))
EVERY_DAY = 0b1111111  # 127

#: The longest device -> phone payload. Inherited from a 128x64 OLED that could
#: only draw QR version 1, and kept because the phone app's `encodeEvent`
#: throws above it — an event this firmware emits has to be one the app can
#: still parse if it is ever shown on a screen again.
MAX_DEVICE_PAYLOAD = 20


@dataclass
class SlotSchedule:
    """One tray's plan.

    Times are minutes since midnight, not the HHMM of the wire format. HHMM is
    not a number you can do arithmetic on — 0800 + 30 is not 0830 — and "is it
    time yet" is the single most common thing this is asked. Converting once,
    at the parser boundary, means the scheduling code cannot get it wrong.
    """

    slot: int
    times: list[int] = field(default_factory=list)  # minutes since midnight, ascending
    days: int = EVERY_DAY
    duration_days: int = 0  # 0 = ongoing

    @property
    def hhmm(self) -> list[str]:
        return [format_hhmm(t) for t in self.times]

    @property
    def is_daily(self) -> bool:
        return self.days == EVERY_DAY

    def due_on_day(self, weekday: int) -> bool:
        """Is this tray due on this weekday? 0 = Monday .. 6 = Sunday."""
        if not 0 <= weekday <= 6:
            return False
        return bool(self.days & (1 << weekday))


@dataclass
class DoseEvent:
    slot: int
    minutes: int  # the scheduled time this reports on
    taken: bool
    seq: int  # 0..99, wraps; lets the phone drop a re-read message


@dataclass
class ClockSet:
    year: int
    month: int
    day: int
    hour: int
    minute: int
    weekday: int  # 0 = Monday, matching the day mask

    def to_datetime(self) -> datetime:
        return datetime(self.year, self.month, self.day, self.hour, self.minute)

    @classmethod
    def from_datetime(cls, when: datetime) -> "ClockSet":
        return cls(when.year, when.month, when.day, when.hour, when.minute, when.weekday())


# ── time ────────────────────────────────────────────────────────────────────

def parse_hhmm(text: str) -> int | None:
    """'0800' -> 480. None unless it is four digits and a real time of day."""
    if not re.fullmatch(r"\d{4}", text):
        return None
    hours, minutes = int(text[:2]), int(text[2:])
    if hours > 23 or minutes > 59:
        return None
    return hours * 60 + minutes


def format_hhmm(minutes: int) -> str:
    """480 -> '0800'."""
    return f"{(minutes // 60) % 24:02d}{minutes % 60:02d}"


# ── which direction is this ─────────────────────────────────────────────────

def message_kind(payload: str) -> str | None:
    """'schedule' | 'weekly' | 'event' | 'clock', or None.

    Always call this first. Every decoder below refuses rather than
    misinterpreting, but knowing what a payload claims to be before parsing it
    is what lets the caller ignore an unrecognised one quietly instead of
    reporting a parse failure for something that was never addressed to it.
    """
    parts = payload.strip().upper().split(SEP)
    if len(parts) < 2 or parts[0] != PROTOCOL:
        return None
    return {"S": "schedule", "W": "weekly", "E": "event", "C": "clock"}.get(parts[1])


def _body(payload: str, kind: str) -> str | None:
    """Strip the `SC1*<kind>*` prefix, or None if it is not that message."""
    if payload is None:
        return None
    text = payload.strip().upper()
    prefix = f"{PROTOCOL}{SEP}{kind}{SEP}"
    if not text.startswith(prefix):
        return None
    return text[len(prefix):]


def _read_uint(text: str, max_digits: int) -> int | None:
    """The C++ `readUint`: 1..max_digits digits and nothing else.

    The digit cap is load-bearing. A corrupted '99999' must not wrap into a
    plausible 1..8 and open the wrong compartment, so more digits than allowed
    is a rejection rather than a truncation.
    """
    if not text or len(text) > max_digits or not text.isdigit():
        return None
    return int(text)


def _parse_slot_times(chunk: str) -> SlotSchedule | None:
    """'1:0800.2000' -> a SlotSchedule with days/duration left at the default."""
    slot_text, sep, times_text = chunk.partition(":")
    if not sep:
        return None

    slot = _read_uint(slot_text, 2)
    if slot is None or not 1 <= slot <= MAX_SLOTS:
        return None

    out = SlotSchedule(slot=slot, days=EVERY_DAY, duration_days=0)
    for piece in times_text.split(TIME_SEP):
        minutes = parse_hhmm(piece)
        if minutes is None:
            return None
        # Sorted and unique, as the C++ `insertTime` does. **The second one is
        # dropped, not refused.**
        #
        # It used to reject the whole payload, and that is worse than it sounds:
        # one tray listed at `0800.0800` — a double tap in the app, a form sheet
        # read twice, a merge of two prescriptions that share a morning — threw
        # away every other tray's plan with it, and the person got "that
        # schedule code did not parse" and no schedule at all.
        #
        # What the duplicate can never be allowed to mean is two pills. One tray
        # cannot dispense twice at one minute — the scheduler's high-water mark
        # is `(day, minutes)`, so the second would be suppressed at some points
        # in the code and honoured at others — so the ambiguity is settled here,
        # once, at the edge, and everything downstream sees a schedule that
        # simply has one dose at eight.
        if minutes in out.times:
            continue
        if len(out.times) >= MAX_TIMES:
            return None
        out.times.append(minutes)
    if not out.times:
        return None
    out.times.sort()
    return out


def _collect(slots: list[SlotSchedule]) -> list[SlotSchedule] | None:
    """Refuse a payload that gives one tray two plans."""
    seen: set[int] = set()
    for s in slots:
        if s.slot in seen:
            return None
        seen.add(s.slot)
    return slots


def decode_schedule(payload: str) -> list[SlotSchedule] | None:
    """Parse `SC1*S*...`. An empty body is a valid instruction: clear the tray."""
    body = _body(payload, "S")
    if body is None:
        return None
    if body == "":
        return []

    slots = []
    for chunk in body.split(SLOT_SEP):
        parsed = _parse_slot_times(chunk)
        if parsed is None:
            return None
        slots.append(parsed)
    return _collect(slots)


def decode_weekly(payload: str) -> list[SlotSchedule] | None:
    """Parse `SC1*W*...`, which additionally carries the day mask and duration."""
    body = _body(payload, "W")
    if body is None:
        return None
    if body == "":
        return []

    slots = []
    for chunk in body.split(SLOT_SEP):
        bits = chunk.split(ATTR_SEP)
        if len(bits) != 3:
            return None
        slot_times, mask_text, duration_text = bits

        parsed = _parse_slot_times(slot_times)
        if parsed is None:
            return None

        mask = _read_uint(mask_text, 3)
        # A mask of zero is a tray that is loaded and never opens. That is not a
        # schedule, it is a way to lose a course of medication quietly.
        if mask is None or not 1 <= mask <= EVERY_DAY:
            return None

        duration = _read_uint(duration_text, 3)
        if duration is None:
            return None

        parsed.days = mask
        parsed.duration_days = duration
        slots.append(parsed)
    return _collect(slots)


def decode_any_schedule(payload: str) -> list[SlotSchedule] | None:
    """Parse either schedule form. The sender decides; the device need not care."""
    kind = message_kind(payload)
    if kind == "schedule":
        return decode_schedule(payload)
    if kind == "weekly":
        return decode_weekly(payload)
    return None


def encode_schedule(slots: list[SlotSchedule]) -> str:
    """Strict `SC1*S*` — lossy, and only exact when every tray runs all seven days.

    `S` has no field for days of the week and none for a course length. A plan
    marked Mon/Wed/Fri for 30 days encodes to the same string as one marked
    every day forever, so check `loses_detail` before showing this to anyone.
    """
    body = SLOT_SEP.join(
        f"{s.slot}:{TIME_SEP.join(s.hhmm)}" for s in slots if s.times
    )
    return SEP.join([PROTOCOL, "S", body])


def encode_weekly(slots: list[SlotSchedule]) -> str:
    """`SC1*W*` — the lossless form.

    Fixed three-digit widths for the mask and the duration, so 8-bit firmware
    can read them with pointer arithmetic instead of a tokenizer, and every
    character stays inside the QR alphanumeric set — straying out of it costs
    8 bits a character instead of 5.5 and is what stops a code fitting.
    """
    body = SLOT_SEP.join(
        ATTR_SEP.join([
            f"{s.slot}:{TIME_SEP.join(s.hhmm)}",
            f"{s.days:03d}",
            f"{min(s.duration_days, 999):03d}",
        ])
        for s in slots if s.times
    )
    return SEP.join([PROTOCOL, "W", body])


def loses_detail(slots: list[SlotSchedule]) -> list[str]:
    """What an `SC1*S*` rendering of this plan would throw away."""
    notes = []
    partial = [s for s in slots if not s.is_daily]
    if partial:
        notes.append(
            "SC1*S* cannot carry days of the week, so these trays would drop "
            "every day: " + ", ".join(f"tray {s.slot}" for s in partial)
        )
    if any(s.duration_days for s in slots):
        notes.append(
            "SC1*S* cannot carry a duration, so a course with an end date would "
            "run until the tray is empty"
        )
    return notes


# ── device -> phone ─────────────────────────────────────────────────────────

def encode_event(event: DoseEvent) -> str | None:
    """Write `SC1*E*...`, or None if it would not fit MAX_DEVICE_PAYLOAD.

    None means "do not try to display this". A truncated QR is not a shorter
    message — it is an unreadable one, or worse, a scannable prefix that parses
    into a different, plausible dose.
    """
    if not 1 <= event.slot <= 99:
        return None
    if not 0 <= event.minutes < 24 * 60:
        return None

    payload = SEP.join([
        PROTOCOL, "E",
        str(event.slot),
        format_hhmm(event.minutes),
        "T" if event.taken else "M",
        f"{event.seq % 100:02d}",
    ])
    return payload if len(payload) <= MAX_DEVICE_PAYLOAD else None


def decode_event(payload: str) -> DoseEvent | None:
    """Parse `SC1*E*...`. Present so the round trip can be proved under test."""
    body = _body(payload, "E")
    if body is None:
        return None

    parts = body.split(SEP)
    if len(parts) != 4:
        return None
    slot_text, time_text, flag, seq_text = parts

    slot = _read_uint(slot_text, 2)
    if slot is None or not 1 <= slot <= 99:
        return None

    minutes = parse_hhmm(time_text)
    if minutes is None:
        return None

    if flag not in ("T", "M"):
        return None

    seq = _read_uint(seq_text, 2)
    if seq is None:
        return None

    return DoseEvent(slot=slot, minutes=minutes, taken=(flag == "T"), seq=seq)


# ── clock ───────────────────────────────────────────────────────────────────

def decode_clock(payload: str) -> ClockSet | None:
    """Parse `SC1*C*YYYYMMDDHHMM*W`.

    Stricter than the C++ in one way, on purpose: a stamp whose weekday does
    not match its date is rejected outright. The C++ trusts the weekday as
    sent, which is safe on a board that only uses it to set a DS3231 register.
    Here the weekday is what every day mask is matched against, so accepting a
    wrong one moves the whole week — Monday/Wednesday/Friday medication starts
    coming out on Sunday, Tuesday and Thursday, and the device looks fine.

    The sender always knows the correct weekday, so a disagreement is not a
    sender that guessed; it is a corrupt message, and neither field can be
    believed.
    """
    body = _body(payload, "C")
    if body is None:
        return None

    parts = body.split(SEP)
    if len(parts) != 2:
        return None
    stamp, weekday_text = parts
    if len(stamp) != 12 or not stamp.isdigit():
        return None
    if len(weekday_text) != 1 or not weekday_text.isdigit():
        return None

    try:
        when = datetime(
            int(stamp[0:4]), int(stamp[4:6]), int(stamp[6:8]),
            int(stamp[8:10]), int(stamp[10:12]),
        )
    except ValueError:
        return None  # 30 February and friends

    # Inherited from the DS3231, which stored a two-digit year against a century
    # bit. The Pi has no such limit, but a date outside this range is far more
    # likely to be a corrupt message than a real one, and the three other
    # implementations all draw the line here.
    if not 2000 <= when.year <= 2099:
        return None

    weekday = int(weekday_text)
    if weekday > 6 or weekday != when.weekday():
        return None

    return ClockSet.from_datetime(when)


def encode_clock(when: datetime | None = None) -> str:
    """`SC1*C*YYYYMMDDHHMM*W` — exactly 20 characters, so it fits either screen."""
    t = when or datetime.now()
    return (
        f"{PROTOCOL}{SEP}C{SEP}"
        f"{t.year:04d}{t.month:02d}{t.day:02d}{t.hour:02d}{t.minute:02d}"
        f"{SEP}{t.weekday()}"
    )


# ── JSON, for the web app ───────────────────────────────────────────────────

def slots_to_json(slots: list[SlotSchedule]) -> list[dict]:
    """The shape the device's own web page and API speak.

    HHMM strings rather than minutes, because this crosses into JavaScript,
    where the wire format is what a human reads in a debugger.
    """
    return [
        {
            "tray": s.slot,
            "times": s.hhmm,
            "days": s.days,
            "durationDays": s.duration_days,
        }
        for s in slots
    ]


def slots_from_json(data) -> list[SlotSchedule] | None:
    """The inverse. None on anything malformed, like every decoder here."""
    if not isinstance(data, list):
        return None

    slots = []
    for item in data:
        if not isinstance(item, dict):
            return None
        try:
            slot = int(item["tray"])
            times_raw = item["times"]
            days = int(item.get("days", EVERY_DAY))
            duration = int(item.get("durationDays", 0))
        except (KeyError, TypeError, ValueError):
            return None

        if not 1 <= slot <= MAX_SLOTS:
            return None
        if not 1 <= days <= EVERY_DAY:
            return None
        if not 0 <= duration <= 999:
            return None
        if not isinstance(times_raw, list) or not 1 <= len(times_raw) <= MAX_TIMES:
            return None

        # Deduplicated rather than refused, exactly as `_parse_slot_times`
        # does it — this is the same schedule arriving over a different wire,
        # and the two paths disagreeing about what `["0800", "0800"]` means is
        # how a plan that scans off a sheet gets refused from the app.
        minutes = []
        for t in times_raw:
            parsed = parse_hhmm(str(t).strip())
            if parsed is None:
                return None
            if parsed not in minutes:
                minutes.append(parsed)
        if not minutes:
            return None

        slots.append(SlotSchedule(slot=slot, times=sorted(minutes),
                                  days=days, duration_days=duration))
    return _collect(slots)
