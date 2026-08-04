"""The status band — six chips, a date and a clock, in the same places forever.

What this replaced, and why it is nailed down
---------------------------------------------
The subsystem row used to be a screen of its own: `screens.status` shrank its
glyphs to fit whatever it had to say and **sorted the faults to the front**, so
the same machine showed the same subsystem in three different places on three
different days. A row that moves cannot be learnt, and a row nobody has learnt
has to be read — which on this device is the one thing that cannot be assumed.

So the bar is static in the strongest sense available. Six slots, fixed order,
fixed x, fixed size. It never reorders, never reflows, never shrinks, never
truncates and is never tinted by whatever the hero band is flooding with. The
person who has learnt that the fourth picture is the trays has learnt it for the
life of the device, and can go straight to it from the doorway.

The cost is that the row is full. A new subsystem does not get a slot: it goes to
`/api/status`, to `--selftest`, or it escalates into `Health.problem` and borrows
an existing chip through `PROBLEM_SLOT`. That is a real constraint on future work
and it is the point of the file rather than an oversight in it.

Two elements per chip, and only one of them ever moves
------------------------------------------------------
A chip is a 16x16 identity glyph and, under it, a solid severity shape:

    absent     dim icon, **no mark at all**
    ok         bright icon, solid circle
    attention  bright icon, solid triangle
    fault      bright icon, solid octagon

The picture says *which subsystem* and never *how bad*; the shape says *how bad*
and never *which*. Keeping those in two channels is what lets somebody read the
bar peripherally — the icons are a constant they stop seeing, and a shape
appearing under one of them is the whole message.

**Absence is not a fault and it is not a tick.** A subsystem that has told us
nothing keeps its dim icon and draws no mark, so a blank `Health()` is six dim
icons, no marks, no date and `--:--`. Blanking the slot instead was considered and is
worse twice over: the gap makes the row's geometry look broken, and it moves
every icon after it, which is the reordering this file exists to prevent. A green
tick on no evidence is not on the table at all — `health.py` defaults every field
to the honest empty value precisely so that nothing downstream can invent one.

An unrecognised value is treated as absence too. The cost is worth stating: a
state added to `network.py` or to the relay client and not added to the maps
below shows as a dim icon until somebody does. That is the failure this direction
should have — silence about a subsystem, rather than a confident circle under it.

Why the geometry is module constants
------------------------------------
Every number here is a formula over the panel `display` is laid out against, not
a literal, and the results are constants rather than functions of the canvas
because the other two bands are written against them: `screens` starts its hero
at `BAR_H`. One canvas-shaped exception, and it is deliberate — the band is
cleared and the clock is right-aligned against `canvas.width`, so a surface that
is not the panel still gets a clean band with a readable clock at its right edge
rather than a stripe of stale pixels and a clipped digit.

Clearing the whole band before drawing is not tidiness either. `numerals` is
proportional, so `"12:34"` and `"09:00"` are different widths; repainting over
the previous string's own box leaves a stroke of the last minute standing beside
the new one.
"""
from __future__ import annotations

from . import PANEL_HEIGHT, PANEL_WIDTH, glyphs, numerals
from .canvas import Canvas
from .health import PRECEDENCE, Health
from .shapes import Shape, fill

__all__ = ["BAR_H", "SLOTS", "SLOT_X", "PROBLEM_SLOT", "draw", "key"]

#: The panel this band is laid out for. Taken from the package rather than
#: restated, because `NoDisplay` hands out a canvas of exactly this size so that
#: a build with no screen lays out identically to one with a screen — and two
#: copies of the panel's size is how those two quietly stop agreeing.
W = PANEL_WIDTH
H = PANEL_HEIGHT

#: y 0..35. Three twentieths of the panel: enough for a 16 px picture over a
#: 13 px mark with air around both, and not one row more — every row here is a
#: row the hero band does not get, and the hero is the element read from three
#: metres.
BAR_H = H * 3 // 20                                     # 36

#: The band's own bottom edge, in `RULE`. Two pixels rather than one because a
#: single row against `INK` is 1.09:1 and simply is not there; two is still
#: furniture and is what stops the bar and the hero reading as one dark field.
RULE_H = 2
#: The rows a chip may use. The rule is not one of them.
FACE_H = BAR_H - RULE_H                                 # 34

#: Side inset, and the same air the clock keeps on the right.
BAR_PAD = W // 40                                       # 8
#: Slot to slot. Six of these plus both insets is 176 px of a 320 px band,
#: which is what leaves the date and the clock their own end of the bar.
SLOT_PITCH = W * 13 // 160                              # 26
#: The chip itself: four pixels narrower than the pitch, so there are two pixels
#: of air on each side of it. Two 16 px pictures with nothing between them read
#: as one 32 px picture, and the row's whole value is that they do not.
SLOT_W = SLOT_PITCH - 4                                 # 22

#: Severity radius. Small on purpose and it works because the shapes are solid:
#: at r=6 the circle, triangle and octagon are 113, 52 and 129 lit pixels, and
#: the octagon has a 5 px flat top against the circle's single-pixel apex.
#: Filled shapes separate *better* at small radii than outlines do, which is the
#: opposite of the reasoning that produced `shapes.MIN_RADIUS`.
MARK_R = 6
#: One row between the picture and the mark. They are two facts about one
#: subsystem, so they are one stack with a hairline in it rather than two things
#: sharing a slot; more air here and the mark starts to look like it belongs to
#: the chip below rather than the one above.
ICON_GAP = 1

_STACK_H = glyphs.ROWS + ICON_GAP + 2 * MARK_R + 1      # 30
#: The stack, centred in the face: 2 above, 2 below.
ICON_Y = (FACE_H - _STACK_H) // 2                       # 2
ICON_X = (SLOT_W - glyphs.SPAN) // 2                    # 3
MARK_CY = ICON_Y + glyphs.ROWS + ICON_GAP + MARK_R      # 25

#: The clock, and the date beside it. One row, bottoms aligned, right-aligned
#: against the band's own edge.
#:
#: The clock was 26 px. The date grew a year — `26-08-04`, the descending order
#: being the one nobody misreads — and eight characters plus a clock at 26 want
#: 183 px against the 152 the band has left after six chips. So one of the two
#: had to give up size, and it is the clock.
#:
#: Stacking them was tried first and is worse than it sounds. The face is 34 rows
#: and a numeral's ink reaches a pen radius *outside* its nominal box, so two rows
#: that fit on paper have the clock grazing the band's top edge and the date's
#: feet cut off by the rule. Two rows need a taller band, and every row this band
#: takes is a row the hero loses — and the hero is the element read from three
#: metres.
#:
#: 20 px of cap height: 12.2 arcmin at a metre, against 15.9 for the 26 px it
#: used to be. Still an arm's-length-to-1.5 m element, which is all this band ever
#: claimed to be — the three-metre element is the hero and always was.
CLOCK_H = 20

#: The date, left of the clock and smaller than it. Three fifths.
#:
#: Two numbers the same size beside each other are one number with a space in it,
#: and `26-08-04 17:26` read that way is thirteen digits of nothing. Making one
#: plainly smaller is what splits them into two facts, and it says which is which
#: without a label: the minute is what you came to the machine for, the date is
#: what you check once.
DATE_H = 12
#: Between them. Wider than the space inside either so the pair does not fuse
#: back into one string.
DATE_GAP = 8

#: Centred in the face, and the date's **bottom** on the clock's. Bottoms rather
#: than centres: they sit on one line, which is how a person reads them as one
#: reading rather than as two things that happen to be near each other.
CLOCK_Y = (FACE_H - CLOCK_H) // 2                       # 7
DATE_Y = CLOCK_Y + CLOCK_H - DATE_H                     # 15

#: The order, forever. Connectivity first — that is the journey that breaks —
#: then whether a dose can be trusted to come out, then the machine's own health.
#:
#: There were seven. `CELL` — the RTC's coin cell — has folded into `CLOCK`, and
#: it is the one merge this row can take without breaking its own rule. The rule
#: is that a picture names a **subsystem**; the coin cell is not a subsystem, it
#: is the battery of the chip the third picture already names. `health._cell`
#: reads it out of the same `rtc.read_status()` that `clock_source` comes from.
#: Two chips over one subsystem is the redundancy this file warns about
#: elsewhere — "a third rendering of one fact is how somebody ends up acting on
#: the wrong one" — and it was sitting in the row the whole time.
#:
#: What the slot bought back is the date. The panel had a time and no date, so
#: the strip's row of doses meant *some* day, and a device that had been sitting
#: stopped since Tuesday looked exactly like one that stopped a minute ago. The
#: detail the merge gives up — flat cell versus a clock vouched for by the
#: network — is still whole in `/api/status` and `--selftest`, which is where
#: this file has always said that detail belongs.
SLOTS: tuple[str, ...] = ("WIFI", "RELAY", "CLOCK", "TRAY", "POWER", "CARD")

#: The four renderings. Strings rather than an enum because they are half of
#: what `key` returns, and a repaint decision that can be read in a log line is
#: worth more here than the type.
ABSENT = "absent"
OK = "ok"
ATTENTION = "attention"
FAULT = "fault"

#: What each state draws under the icon, as `(shape, palette name)`. `ABSENT` is
#: deliberately not in here: the absence of an entry is the absence of a mark.
_SEVERITY: dict[str, tuple[Shape, str]] = {
    OK: (Shape.SAFE, "OK"),
    ATTENTION: (Shape.CAUTION, "ATTN"),
    FAULT: (Shape.AVOID, "FAULT"),
}

#: Every picture the bar can draw. The constants are named directly, so a typo
#: is an ImportError at start-up rather than a blank chip in somebody's kitchen;
#: the names are what `key` compares and what a log line shows.
_ICONS: dict[str, tuple[int, ...]] = {
    "WIFI": glyphs.WIFI,
    "WIFI_LOW": glyphs.WIFI_LOW,
    "CLOUD": glyphs.CLOUD,
    "CLOCK": glyphs.CLOCK,
    "PILL": glyphs.PILL,
    "BOLT": glyphs.BOLT,
    "BATTERY": glyphs.BATTERY,
    "CARD": glyphs.CARD,
}

#: The identity glyph each slot wears. `WIFI` is the one slot with two pictures
#: — the arcs for somebody's house network, one bar for the device running its
#: own setup hotspot — because "on a network" and "*being* the network" are the
#: two states a person acts on completely differently, and both are amber.
_SLOT_ICON: dict[str, str] = {
    "WIFI": "WIFI",
    "RELAY": "CLOUD",
    "CLOCK": "CLOCK",
    "TRAY": "PILL",
    "POWER": "BOLT",
    "CARD": "CARD",
}

# ── the state maps, first match wins ────────────────────────────────────────
#
# `""` is absent by omission in every one of them, and so is any value not
# listed: `.get(value, ABSENT)` is the rule, and the module docstring argues why
# silence is the right answer to a word this file has never heard of.

_WIFI = {"online": OK,
         # Joining settles within a minute either way, and the hotspot is the
         # device waiting to be set up. Both need a person eventually; neither
         # is broken.
         "joining": ATTENTION, "hotspot": ATTENTION,
         # No network at all, and no attempt in flight to change that.
         "failed": FAULT, "offline": FAULT}

#: `off` and `unpaired` are absent rather than a caution, and that is the same
#: judgement `health._relay_standing` makes: both are somebody's *decision*, and
#: a triangle nobody can ever clear is a triangle everybody learns to read past.
_RELAY = {"connected": OK,
          "connecting": ATTENTION, "retrying": ATTENTION, "offline": ATTENTION,
          "unsupported": FAULT, "incompatible": FAULT,
          "off": ABSENT, "unpaired": ABSENT}

#: `api` and `cloud` are a caution rather than fine: the tray opens on the word
#: of something that was true when a phone last spoke to us. `untrusted` is the
#: fault that shuts the tray, and it is the one the hero is already red about.
_CLOCK = {"ntp": OK, "rtc": OK,
          "api": ATTENTION, "cloud": ATTENTION,
          "untrusted": FAULT}

#: Under-voltage is a fault and not a caution. It has no symptom a person can
#: see, it corrupts the card and browns out a servo mid-sweep, and the fix is one
#: glance at a plug — the cheapest fault on the bar to be wrong about.
_POWER = {"ok": OK, "low": FAULT}

#: A flat coin cell is a forecast, not a fault: everything works today and stops
#: working the morning the power and the router go together.
_CELL = {"ok": OK, "flat": ATTENTION}

#: `low` is a caution and `readonly` a fault, but both are the same silent
#: failure — doses given, nothing written down — which is why `health` raises a
#: `card` problem for either and the forced fault below can override this.
_CARD = {"ok": OK, "low": ATTENTION, "readonly": FAULT}

#: Which chip goes red beside a blocked hero. The hero says *how bad*, the bar
#: says *which*, and this is the whole of the redundancy pair between them.
#:
#: Written in `PRECEDENCE` order so the two can be read side by side. Both
#: directions are checked at import: every slug must name a slot, and every slot
#: named must exist. A slug with nowhere to go is a fault the bar silently
#: cannot show, which is worse than no bar at all — it is a bar that says the
#: machine is fine while the hero says it is stopped.
PROBLEM_SLOT: dict[str, str] = {
    "gpio": "TRAY",
    "clock": "CLOCK",
    "card": "CARD",
    "trays": "TRAY",
    "power": "POWER",
    "wifi": "WIFI",
    "relay": "RELAY",
    # The coin cell has no chip of its own any more. It borrows the one for the
    # subsystem it powers, which is what `PROBLEM_SLOT` is for.
    "cell": "CLOCK",
}

#: The widest string the clock can ever be. Every digit and `?` advance by 0.72
#: of the size and `-` and `:` by less, so five characters of `0` is the
#: worst case — and `_clock` guarantees five characters.
_WIDEST_CLOCK = "00:00"
#: Same argument for the date: `_date` guarantees five characters, and `00-00`
#: is the widest five this face can draw.
_WIDEST_DATE = "00-00"


def SLOT_X(index: int) -> int:  # noqa: N802 - a geometry constant that takes an index
    """The left edge of slot `index`. Slot 6 ends at 186 on the panel."""
    return BAR_PAD + index * SLOT_PITCH


# ── the couplings this file cannot be allowed to forget ─────────────────────

if set(PRECEDENCE) - set(PROBLEM_SLOT):
    # A commit that adds a slug to `PRECEDENCE` adds it here in the same commit.
    # Caught at import, where the traceback names both files, rather than by a
    # person standing in front of a stopped machine whose bar is all circles.
    raise ValueError("a Health.problem slug names no status-bar slot: "
                     f"{sorted(set(PRECEDENCE) - set(PROBLEM_SLOT))}")

if set(PROBLEM_SLOT.values()) - set(SLOTS) or set(_SLOT_ICON) != set(SLOTS):
    raise ValueError("the status bar's slot tables disagree about the slots")

if (set(_SLOT_ICON.values()) | {"WIFI_LOW"}) - set(_ICONS):
    raise ValueError("a status-bar slot names a picture that does not exist")

if (numerals.text_width(_WIDEST_CLOCK, CLOCK_H) + DATE_GAP
        + numerals.text_width(_WIDEST_DATE, DATE_H)) > W - BAR_PAD - (
        SLOT_X(len(SLOTS) - 1) + SLOT_W):
    # The space between the last chip and the clock is deliberate and nothing
    # else may be placed in it — but the reason it is *safe* is this inequality,
    # and geometry gets edited. Without the check, the first sign would be a
    # date overlapping the SD-card chip at four minutes past ten on the 30th.
    #
    # Both strings are bounded by construction (`_clock` and `_date` each return
    # exactly five characters), which is what makes this a proof rather than a
    # hope. Widening the row back to seven slots trips it here, at import, with
    # a traceback that names this line.
    raise ValueError("the status bar's clock and date do not clear the last slot")


def _tray(health: Health) -> str:
    """The trays chip, the one slot whose state is not a table lookup.

    Two fields decide it because two different things can be true of a tray: it
    will not open at all (the two slugs that mean no servo can be driven), or
    there is simply no prescription loaded. The third case the spec gives this
    slot — nothing has been read yet — is handled once for the whole bar in
    `_read`, rather than by this slot alone.

    A loaded count of zero is a caution rather than absence, and it is the
    call in this file. A dispenser with no schedule is a working machine that
    will never dispense anything, which is exactly the state somebody needs to be
    told about — it is what a device looks like after a factory reset, and it
    looks identical to a healthy one from across the room.
    """
    if str(health.problem or "") in ("gpio", "trays"):
        # Agrees with `PROBLEM_SLOT` by construction: both slugs map to this
        # slot, so the forced fault below would reach the same answer. Stated
        # here as well so the slot's own map is complete on its own terms.
        return FAULT
    if not health.trays_loaded:
        return ATTENTION
    return OK


def _clock_chip(health: Health) -> str:
    """The third chip, which now answers for the clock *and* its battery.

    Worst of the two, and the order matters rather than being arithmetic: a
    stopped clock is a shut tray today, a flat cell is a shut tray after the next
    power cut. So `untrusted` outranks `flat` outranks a time vouched for by
    something off-device.

    A flat cell against a perfectly good `ntp` clock is the case this merge
    exists to keep: it is exactly the state where nothing is wrong yet and
    something is about to be, and losing it was the only real cost of giving the
    battery's slot to the date.
    """
    own = _CLOCK.get(str(health.clock_source or ""), ABSENT)
    if own == FAULT:
        return own
    cell = _CELL.get(str(health.cell or ""), ABSENT)
    return cell if PRECEDENCE_MARK.index(cell) > PRECEDENCE_MARK.index(own) else own


#: The four renderings, least to most severe. Only `_clock_chip` needs them
#: ordered, and it needs them ordered rather than nested in ifs because the
#: point it is making is "worst of two".
PRECEDENCE_MARK: tuple[str, ...] = (ABSENT, OK, ATTENTION, FAULT)


def _reads_as_time(text: str) -> bool:
    """Is this five characters shaped like `HH:MM`?

    The bar prints a clock it can vouch for and otherwise prints the dashes.
    `health.now` is always `f"{hour:02d}:{minute:02d}"` today, so this only ever
    rejects something that has already gone wrong upstream — but it is what makes
    the clock's width *bounded*, and a bounded width is what makes the
    no-collision check above a proof rather than an expectation. A `now` of
    `"an hour ago"` would otherwise run 300 px left across every chip.
    """
    return (len(text) == 5 and text[2] == ":"
            and text[:2].isdigit() and text[3:].isdigit())


def _clock(health: Health) -> tuple[str, bool]:
    """`(text, muted)` — the time, or the honest absence of one.

    Muted rather than red, and that is the one place this file argues with the
    obvious. A clock nothing has vouched for is already a red octagon under the
    CLOCK chip and, if it is what stopped the tray, a red hero band as well. A
    third rendering of one fact is how somebody ends up acting on the wrong one —
    and a red clock reads as "this time is wrong" when the truth is that there is
    no time at all. `TEXT_MUTE` is the palette's "no claim is being made".
    """
    now = str(health.now or "")
    if _reads_as_time(now) and str(health.clock_source or "") != "untrusted":
        return now, False
    return "--:--", True


def _reads_as_date(text: str) -> bool:
    """Is this eight characters shaped like `YY-MM-DD`? Same job as `_reads_as_time`."""
    return (len(text) == 8 and text[2] == "-" and text[5] == "-"
            and text[:2].isdigit() and text[3:5].isdigit() and text[6:].isdigit())


def _date(health: str | Health) -> str:
    """Today as `YY-MM-DD`, or `""` when this machine has no business naming a day.

    Tied to the same trust the clock is tied to, and that is why it is a
    function rather than a read of `health.today`. A machine whose clock nothing
    vouches for does not know what day it is either, and a confident `04-08`
    beside a `--:--` would be the panel claiming the harder half of a fact it
    has just disclaimed the easier half of.

    Empty rather than dashes, and this is the one place the date does *not*
    copy the clock. `--:--` works because the colon survives — it still reads as
    a clock with nothing in it. `-----` is five dashes: it reads as a rule, or
    as a rendering fault, and it certainly does not read as a date. The clock's
    own dashes are already saying the whole of what there is to say, and a
    second disclaimer of one fact is the redundancy this file spends its
    docstring arguing against.
    """
    if isinstance(health, str):  # pragma: no cover - guard against a typo'd call
        raise TypeError("_date takes a Health")
    today = str(health.today or "")
    if _reads_as_date(today) and str(health.clock_source or "") != "untrusted":
        return today
    return ""


def _read(health: Health) -> tuple[tuple[str, str], ...]:
    """`(picture, state)` per slot, in slot order. The whole of what is drawn.

    One function behind both `draw` and `key`, rather than a state map here and
    a summary there. That is the only way the two cannot drift: a bar that
    repaints on something it does not draw is a wasted 5.76 ms, and one that
    draws something it does not compare is a chip that stays green after the
    subsystem under it has failed.
    """
    if not health.known:
        # Nothing has been read yet, so nothing here is a claim: six dim
        # pictures, no marks, no date, and the clock's dashes. `known` is the only field
        # that separates "we asked and the answer was nothing" from "nobody has
        # asked yet", and this is the bar saying the second one.
        #
        # It matters because one field's empty value is not empty. `wifi`
        # defaults to `"offline"` rather than `""` — an honest word for a radio
        # nobody is managing, and a red octagon in the map below — so without
        # this the boot frame would open with a fault against a machine that has
        # not yet looked at its own radio. The rest of the fields default to
        # `""` and would reach the same answer through their own maps.
        return tuple((_SLOT_ICON[name], ABSENT) for name in SLOTS)

    wifi = str(health.wifi or "")
    chips = {
        "WIFI": ("WIFI_LOW" if wifi == "hotspot" else "WIFI",
                 _WIFI.get(wifi, ABSENT)),
        "RELAY": (_SLOT_ICON["RELAY"], _RELAY.get(str(health.relay or ""), ABSENT)),
        "CLOCK": (_SLOT_ICON["CLOCK"], _clock_chip(health)),
        "TRAY": (_SLOT_ICON["TRAY"], _tray(health)),
        "POWER": (_SLOT_ICON["POWER"], _POWER.get(str(health.power or ""), ABSENT)),
        "CARD": (_SLOT_ICON["CARD"], _CARD.get(str(health.storage or ""), ABSENT)),
    }

    # The forced fault, last, so it outranks every table above it. It applies
    # even to a slot that was reading `absent`: a hero refusing to dispense over
    # the relay, beside a dim relay chip, would be the panel disagreeing with
    # itself in front of the person it is asking for help.
    forced = PROBLEM_SLOT.get(str(health.problem or ""))
    if forced is not None:
        chips[forced] = (chips[forced][0], FAULT)

    return tuple(chips[name] for name in SLOTS)


def key(health: Health) -> tuple:
    """Everything this band renders, for the dirty-region compare.

    Deliberately *not* the `Health` — nineteen of its fields never reach the bar,
    and comparing it would repaint the band every time a dose changed state at
    the other end of the panel.

    It does not describe the **palette**. Night is a substitution the whole frame
    makes at once, so the caller that swaps palettes must repaint all three bands
    rather than expecting this to notice; folding it in here would mean every
    band carrying the same field for one twice-daily event.
    """
    return _read(health) + (_clock(health), _date(health))


def draw(canvas: Canvas, health: Health, theme: dict[str, int]) -> None:
    """Paint the band, y 0..BAR_H-1. Total: any `Health` lands on a frame.

    Drawn in every state except the hotspot takeover, which needs the whole
    panel for a QR that has to scan. A blocked machine keeps its bar in full and
    that is the point of it: the fix is at the other end of a browser, so a
    stopped device must still be able to say which subsystem and what address.
    """
    canvas.rect(0, 0, canvas.width, BAR_H, theme["BAR_BG"])
    canvas.rect(0, BAR_H - RULE_H, canvas.width, RULE_H, theme["RULE"])

    for index, (icon, state) in enumerate(_read(health)):
        left = SLOT_X(index)
        canvas.blit(left + ICON_X, ICON_Y, _ICONS[icon], glyphs.SPAN,
                    theme["TEXT_MUTE"] if state == ABSENT else theme["TEXT"])
        severity = _SEVERITY.get(state)
        if severity is not None:
            shape, colour = severity
            fill(canvas, left + SLOT_W // 2, MARK_CY, MARK_R, shape,
                 theme[colour])

    # The clock keeps the right edge. It was there before the date was, people
    # who have used this machine know where it is, and the date arriving must
    # not move it — a fixed place is the whole argument of this file.
    text, muted = _clock(health)
    clock_x = canvas.width - BAR_PAD - numerals.text_width(text, CLOCK_H)
    numerals.draw(canvas, clock_x, CLOCK_Y, CLOCK_H, text,
                  theme["TEXT_MUTE"] if muted else theme["TEXT"])

    # And the date off its left, dimmer. It is the element you look at on
    # purpose, never the one that should catch an eye that was passing.
    day = _date(health)
    if day:
        numerals.draw(canvas,
                      clock_x - DATE_GAP - numerals.text_width(day, DATE_H),
                      DATE_Y, DATE_H, day, theme["TEXT_DIM"])
