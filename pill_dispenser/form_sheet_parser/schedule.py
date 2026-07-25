"""Turn read sheets into something the dispenser can be told.

One sheet describes one tray layer: which layer, which days of the week, for
how long, and at what hour it should drop. The dispenser is reached optically —
the phone draws a QR, the device's camera reads it — using the `SC1` protocol
defined in `lib/hardware/protocol.ts`.

The awkward part, and the reason this module exists rather than being three
lines inside the parser
-----------------------------------------------------------------------------
The sheet says more than `SC1*S*` can carry. An `S` message is slots and times
and nothing else:

    SC1*S*1:0800.2000/2:1800

There is no field for *which days* and none for *how long*. A sheet marked
MON/WED/FRI for 30 days encodes to the same `S` payload as one marked every day
forever. Silently flattening that would be the worst kind of bug: the schedule
would look right on screen and dispense pills on four days the prescriber did
not ask for.

So both are produced, and the caller is told which is which.

`encode_schedule` emits strict `S`. It is what the current app understands, and
it is exact whenever the sheet selects all seven days — the common case, since
most prescriptions are daily. When the sheet selects fewer, this function
reports the loss instead of hiding it.

`encode_weekly` emits `SC1*W*`, a superset with the day mask and duration
attached. This is safe to hand to an app that predates it: `messageKind` in the
TypeScript returns null for a kind letter it does not know, and `decodeSchedule`
refuses anything whose second field is not `S`. Neither throws, so an older
build ignores a `W` code rather than crashing on it — the reader just says it
found nothing it recognised. Firmware in this repo understands both.

Capacity is not a constraint in this direction. The 20-character ceiling in the
protocol applies to the device's 128x64 OLED drawing a code for the *phone* to
read. Going the other way the phone has a large screen and the limit is the
device camera; at 640x480 a version-10 code (395 alphanumeric characters) reads
comfortably, and a full eight-layer weekly plan is around 190.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

# Bit order is Monday-first, matching the sheet's own left-to-right layout, so
# a mask can be checked against the paper by eye during debugging.
ALL_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
DAY_BIT = {d: 1 << i for i, d in enumerate(ALL_DAYS)}
EVERY_DAY = 0b1111111  # 127

# `ongoing` is 0: the dispenser treats "no end" as a duration of zero days
# remaining-to-count rather than needing a separate flag.
DURATION_DAYS = {"7d": 7, "14d": 14, "30d": 30, "90d": 90, "ongoing": 0}

PROTOCOL = "SC1"
SEP = "*"        # between protocol fields
SLOT_SEP = "/"   # between slots
TIME_SEP = "."   # between times within a slot
ATTR_SEP = "-"   # between a slot's times, day mask and duration (W messages)

# The dispenser has eight physical layers; the protocol allows slots to 99, but
# accepting a slot the hardware does not have is a way to lose a dose silently.
MAX_LAYER = 8


@dataclass
class LayerPlan:
    """One tray layer's schedule, assembled from one or more sheets."""

    layer: int
    times: list[str] = field(default_factory=list)   # HHMM, sorted, unique
    days: int = EVERY_DAY                            # bitmask, see DAY_BIT
    duration_days: int = 0                           # 0 = ongoing

    @property
    def day_names(self) -> list[str]:
        return [d for d in ALL_DAYS if self.days & DAY_BIT[d]]

    @property
    def is_daily(self) -> bool:
        return self.days == EVERY_DAY

    def describe(self) -> str:
        when = "every day" if self.is_daily else " ".join(self.day_names)
        span = "ongoing" if not self.duration_days else f"for {self.duration_days} days"
        times = " and ".join(f"{t[:2]}:{t[2:]}" for t in self.times)
        return f"layer {self.layer}: {times}, {when}, {span}"


@dataclass
class SchedulePlan:
    """Every layer of one dispenser, plus whatever went wrong assembling it."""

    layers: list[LayerPlan] = field(default_factory=list)
    problems: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return bool(self.layers) and not self.problems

    @property
    def loses_days(self) -> bool:
        """True when an `S` payload cannot express this plan faithfully."""
        return any(not layer.is_daily for layer in self.layers)

    @property
    def loses_duration(self) -> bool:
        return any(layer.duration_days for layer in self.layers)

    def describe(self) -> str:
        return "\n".join(layer.describe() for layer in self.layers)


# ── sheet -> plan ───────────────────────────────────────────────────────────

def sheet_to_layer_plan(sheet, strict: bool = True) -> tuple[LayerPlan | None, list[str]]:
    """Convert one `SheetResult` into a `LayerPlan`.

    Returns (plan, problems). With `strict` the sheet's own complaints are
    fatal: a sheet the reader was unsure about must not become a schedule. The
    non-strict path exists for a review screen that wants to show the caregiver
    a best guess alongside the warnings, and is never the path to the hardware.
    """
    problems: list[str] = []
    if getattr(sheet, "problems", None):
        problems.extend(sheet.problems)
        if strict:
            return None, problems

    values = sheet.values if hasattr(sheet, "values") else dict(sheet)

    layer_raw = values.get("layer")
    hour_raw = values.get("hour")
    days_raw = values.get("days") or []
    duration_raw = values.get("duration")

    if layer_raw is None:
        problems.append("no layer selected — cannot tell which compartment this is")
        return None, problems
    if hour_raw is None:
        problems.append("no drop time selected")
        return None, problems

    try:
        layer = int(layer_raw)
        hour = int(hour_raw)
    except (TypeError, ValueError):
        problems.append(f"layer/hour not numeric: layer={layer_raw!r} hour={hour_raw!r}")
        return None, problems

    if not 1 <= layer <= MAX_LAYER:
        problems.append(f"layer {layer} is outside the {MAX_LAYER}-layer tray")
        return None, problems
    if not 0 <= hour <= 23:
        problems.append(f"hour {hour} is not a time of day")
        return None, problems

    unknown = [d for d in days_raw if d not in DAY_BIT]
    if unknown:
        problems.append(f"unknown days: {unknown}")
        return None, problems

    mask = 0
    for d in days_raw:
        mask |= DAY_BIT[d]
    if mask == 0:
        problems.append("no days selected — this layer would never drop")
        return None, problems

    if duration_raw is None:
        problems.append("no duration selected; treating as ongoing")
        duration = 0
    elif duration_raw not in DURATION_DAYS:
        problems.append(f"unknown duration {duration_raw!r}; treating as ongoing")
        duration = 0
    else:
        duration = DURATION_DAYS[duration_raw]

    return LayerPlan(layer=layer, times=[f"{hour:02d}00"], days=mask,
                     duration_days=duration), problems


def sheets_to_schedule(sheets, strict: bool = True) -> SchedulePlan:
    """Merge a stack of sheets — one per layer — into a whole-tray plan.

    A caregiver may hand in two sheets for the same layer to ask for a morning
    and an evening dose. Those merge into one layer with two times. What cannot
    merge is a disagreement: two sheets naming the same layer with different
    days or different durations describe two incompatible regimens, and picking
    one of them would be a decision this code has no standing to make.
    """
    plan = SchedulePlan()
    by_layer: dict[int, LayerPlan] = {}

    for idx, sheet in enumerate(sheets, start=1):
        layer_plan, problems = sheet_to_layer_plan(sheet, strict=strict)
        plan.problems.extend(f"sheet {idx}: {p}" for p in problems)
        if layer_plan is None:
            continue

        existing = by_layer.get(layer_plan.layer)
        if existing is None:
            by_layer[layer_plan.layer] = layer_plan
            continue

        if existing.days != layer_plan.days:
            plan.problems.append(
                f"sheet {idx}: layer {layer_plan.layer} was already given days "
                f"{' '.join(existing.day_names)}, this sheet says "
                f"{' '.join(layer_plan.day_names)}"
            )
            continue
        if existing.duration_days != layer_plan.duration_days:
            plan.problems.append(
                f"sheet {idx}: layer {layer_plan.layer} was already given duration "
                f"{existing.duration_days or 'ongoing'}, this sheet says "
                f"{layer_plan.duration_days or 'ongoing'}"
            )
            continue

        for t in layer_plan.times:
            if t in existing.times:
                plan.problems.append(
                    f"sheet {idx}: layer {layer_plan.layer} already drops at "
                    f"{t[:2]}:{t[2:]} — duplicate sheet?"
                )
            else:
                existing.times.append(t)

    for layer_plan in by_layer.values():
        layer_plan.times = sorted(set(layer_plan.times))
    plan.layers = [by_layer[k] for k in sorted(by_layer)]

    if not plan.layers and not plan.problems:
        plan.problems.append("no sheets produced a usable layer")
    return plan


# ── plan -> optical payload ─────────────────────────────────────────────────

def encode_schedule(plan: SchedulePlan) -> str:
    """Strict `SC1*S*` — exactly the grammar `decodeSchedule` in the app parses.

    Faithful only for all-seven-days layers. Check `plan.loses_days` before
    relying on it; `encode_weekly` is the lossless form.
    """
    body = SLOT_SEP.join(
        f"{layer.layer}:{TIME_SEP.join(layer.times)}"
        for layer in plan.layers if layer.times
    )
    return SEP.join([PROTOCOL, "S", body])


def encode_weekly(plan: SchedulePlan) -> str:
    """`SC1*W*` — the same plan with the day mask and duration kept.

        SC1*W*1:0800.2000-127-030/3:1900-021-000

    Per slot: times, then a three-digit day mask (bit 0 = Monday), then a
    three-digit duration in days with 000 meaning ongoing. Fixed widths so an
    8-bit firmware can read the fields with pointer arithmetic instead of a
    tokenizer, and every character is in the QR alphanumeric set, which encodes
    at 5.5 bits rather than the 8 that byte mode would cost.
    """
    body = SLOT_SEP.join(
        ATTR_SEP.join([
            f"{layer.layer}:{TIME_SEP.join(layer.times)}",
            f"{layer.days:03d}",
            f"{min(layer.duration_days, 999):03d}",
        ])
        for layer in plan.layers if layer.times
    )
    return SEP.join([PROTOCOL, "W", body])


def decode_weekly(payload: str) -> SchedulePlan | None:
    """Parse a `W` payload back. The firmware's reader, mirrored for testing.

    Returns None rather than raising: this is fed by a camera, which reads
    whatever QR happens to be in frame, and a parser that throws on a stranger's
    code would stop the scan loop dead.
    """
    parts = payload.strip().upper().split(SEP)
    if len(parts) != 3 or parts[0] != PROTOCOL or parts[1] != "W":
        return None
    plan = SchedulePlan()
    if parts[2] == "":
        return plan

    for chunk in parts[2].split(SLOT_SEP):
        bits = chunk.split(ATTR_SEP)
        if len(bits) != 3:
            return None
        slot_times, mask_text, dur_text = bits
        if ":" not in slot_times:
            return None
        slot_text, _, times_text = slot_times.partition(":")
        if not (slot_text.isdigit() and mask_text.isdigit() and dur_text.isdigit()):
            return None

        layer = int(slot_text)
        if not 1 <= layer <= MAX_LAYER:
            return None
        times = times_text.split(TIME_SEP)
        if not times or not all(_valid_time(t) for t in times):
            return None
        mask = int(mask_text)
        if not 1 <= mask <= EVERY_DAY:
            return None

        plan.layers.append(LayerPlan(layer=layer, times=times, days=mask,
                                     duration_days=int(dur_text)))
    return plan


def _valid_time(t: str) -> bool:
    return bool(re.fullmatch(r"\d{4}", t)) and int(t[:2]) < 24 and int(t[2:]) < 60


def encode_clock(when=None) -> str:
    """`SC1*C*YYYYMMDDHHMM*W` — wall-clock time, for setting the device's RTC.

    The dispenser has no keyboard, no screen a person reads, and no network. Its
    DS3231 holds time across a power cut on a coin cell, but that cell dies
    eventually — and a clock that has lost power does not report *no* time, it
    reports a wrong one, confidently. A tray acting on a wrong clock opens
    compartments at the wrong hours and looks fine doing it, so the firmware
    refuses to dispense until something vouches for the time.

    This is that something. The only channel the device has is the one it
    already uses — a code held in front of the camera — so the computer that
    knows the time prints one.

    The weekday is carried rather than derived on the device: the arithmetic
    costs flash on an AVR and is a classic source of off-by-one errors, and the
    sender already knows the answer. Monday is 0, matching the day mask.

    Exactly 20 characters, which is also the device screen's limit, so a clock
    code fits on either side of the link.
    """
    from datetime import datetime

    t = when or datetime.now()
    return (f"{PROTOCOL}{SEP}C{SEP}"
            f"{t.year:04d}{t.month:02d}{t.day:02d}{t.hour:02d}{t.minute:02d}"
            f"{SEP}{t.weekday()}")


def decode_clock(payload: str):
    """Parse a clock payload back to a datetime, or None. Mirrors the firmware."""
    from datetime import datetime

    parts = payload.strip().upper().split(SEP)
    if len(parts) != 4 or parts[0] != PROTOCOL or parts[1] != "C":
        return None
    stamp, weekday = parts[2], parts[3]
    if not (len(stamp) == 12 and stamp.isdigit() and len(weekday) == 1 and weekday.isdigit()):
        return None
    try:
        when = datetime(int(stamp[:4]), int(stamp[4:6]), int(stamp[6:8]),
                        int(stamp[8:10]), int(stamp[10:12]))
    except ValueError:
        return None            # 30 February and friends
    # The DS3231 stores a two-digit year against a century bit.
    if not 2000 <= when.year <= 2099:
        return None
    if int(weekday) != when.weekday():
        return None            # the stamp and the weekday disagree; trust neither
    return when


def payload_notes(plan: SchedulePlan) -> list[str]:
    """What the caller should tell the user before showing a strict `S` code."""
    notes = []
    if plan.loses_days:
        partial = [f"layer {l.layer} ({' '.join(l.day_names)})"
                   for l in plan.layers if not l.is_daily]
        notes.append(
            "the SC1*S* code cannot carry days of the week, so these layers would "
            "drop every day: " + ", ".join(partial)
        )
    if plan.loses_duration:
        notes.append(
            "the SC1*S* code cannot carry a duration, so a course with an end date "
            "would run until the tray is emptied"
        )
    return notes
