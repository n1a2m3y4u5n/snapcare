"""Every colour on the panel, named once and packed once.

Why the palette is a module
---------------------------
Colour is the channel this device leans on hardest, so each value here was
picked by measuring WCAG relative luminance against the surface it sits on, not
by eye. A literal `canvas.rgb(24, 26, 32)` at the point of use is a number
nobody can re-measure, nobody can audit against the table it came from, and
nobody can substitute at night. Naming them here is what makes the contrast
ledger in the design a property of the code rather than a claim about it.

The cost of getting this wrong is not aesthetic. The same pair of colours can
be two perfectly readable 320 px planes and an invisible 13 px chip; light ink
is right on the blue field and a 2.25:1 failure on the green one. Every value
below was measured against the surface and at the size it is actually used at,
and moving one out of this file is how that stops being true.

Why `pack` and why it is cached
-------------------------------
Screens want packed pixels, and packing is the surface's business rather than
this file's — `pack` therefore asks the canvas, so a panel with a different
pixel format is one class away rather than a rewrite here. The cache is keyed
by `(surface class, night)` because those are the only two things the answer
depends on, and it means the night palette costs one dict lookup on a repaint
instead of forty shifts. The returned mapping is shared: treat it as read-only.

Night is a substitution, not a backlight
----------------------------------------
The panel's LED pin is tied to 3V3, the factory never passes a backlight pin,
and `Ili9341.backlight()` returns `False` immediately — this board cannot dim.
So quiet hours move the *pixels*: the three surfaces go darker and the two text
greys each step down one. That is honest about what the hardware can do, and it
keeps the invariant that the panel never blanks.

**State tones, calendar colours and bar severity colours are never substituted**,
and that is a property of the file rather than a promise: `NIGHT` names only
structure colours, so there is no path by which a waiting dose at 3 a.m. is
rendered quietly. It is exactly the dose that must not be.
"""
from __future__ import annotations

from .canvas import INK_DARK, INK_LIGHT, TONE_RGB, Canvas, Tone

__all__ = ["STRUCTURE", "ABSOLUTE", "TONES", "SEVERITY", "CALENDAR",
           "PALETTE", "NIGHT", "pack"]

#: 8-8-8, the format everything below is written in and the format the contrast
#: ratios in the comments were computed in.
Rgb = tuple[int, int, int]


#: The planes and the ink on them. Contrast is against `INK` unless stated.
#:
#: The two plane colours sit within 1.1:1 of the hero's charcoal and the rule
#: only 1.62:1 above it, which looks like a mistake written down and is not:
#: these are 320 px-wide edges, where luminance discrimination is far better
#: than the ~1 arcmin threshold that governs detail, and a bar that announced
#: itself with a hard step would compete with the states for attention. They are
#: furniture. They are meant to be noticed once and then never again.
STRUCTURE: dict[str, Rgb] = {
    # The same charcoal as `Tone.IDLE` — one is the resting state and the other
    # is the surface it rests on, and they must not drift apart or the hero
    # would show a seam at rest.
    "INK": TONE_RGB[Tone.IDLE],           # L 0.0052
    "BAR_BG": (24, 26, 32),               # L 0.0104, status bar plane
    "STRIP_BG": (18, 20, 26),             # L 0.0070, schedule band plane
    "RULE": (52, 56, 66),                 # L 0.0395, band separators
    # The ink `Rgb565.tone` hands back for the dark fields, under the name the
    # screens use for it. Defined in `canvas.py` because `tone()` needs it and
    # this module imports that one, not the other way round.
    "TEXT": INK_LIGHT,                    # L 0.8768, 16.78:1 on INK
    "TEXT_DIM": (122, 132, 150),          # L 0.2284, 5.04:1 on INK
    # Deliberately quiet at 2.83:1 — identity, absence, "no claim is being
    # made". Never a fact somebody has to read.
    "TEXT_MUTE": (86, 92, 104),           # L 0.1063
}

#: The two absolutes, which are neither state nor structure and are never
#: substituted. `WHITE` exists for the setup QR: a code must be dark-on-light
#: whatever field it is standing on, and a QR rendered in `TEXT` on a night
#: palette is a QR a phone declines to read, which is a device nobody can set
#: up. `BLACK` is the ink on the four light fields.
ABSOLUTE: dict[str, Rgb] = {
    "WHITE": (255, 255, 255),
    "BLACK": INK_DARK,
}

#: The state fields, under the tone's own name. Taken from `canvas.TONE_RGB`
#: rather than restated, so `theme["DUE"]` and `canvas.tone(Tone.DUE).bg` are
#: the same green by construction — a hero band and a strip mark that disagreed
#: by a shade would break the keyline tether between them.
TONES: dict[str, Rgb] = {tone.name: rgb for tone, rgb in TONE_RGB.items()}

#: The calendar's own two, and both are measured against `INK` because the
#: calendar's surface is the panel's black.
#:
#: **TODAY** is the box behind the middle column's date, and it is a pastel
#: rather than a saturated red for one reason: it is not a warning. Every other
#: red on this device means something is wrong, so today's marker had to be a
#: red nobody reads as an alarm — and a pale one lets the date sit on it in
#: black at 9.76:1, where light ink on a saturated red would be 1.79:1 and
#: illegible. Against the black surface it is 8.87:1, so it carries from a
#: doorway as a shape before anybody reads the date in it.
#:
#: **NEW_PLAN** is the frame drawn round the calendar for ten seconds after a
#: schedule arrives. Amber, because that is this palette's "somebody should
#: look" — but a third of the way down from `ATTN` towards the surface, at
#: 4.31:1, because it is a *notice about a change* and not a fault. It replaced
#: a violet screen that took the whole panel to say the calendar had changed.
CALENDAR: dict[str, Rgb] = {
    "TODAY": (244, 143, 143),             # 8.87:1 on INK, black on it 9.76:1
    "NEW_PLAN": (196, 118, 32),           # 4.31:1 on INK
}

#: The status bar's three severity marks, against `BAR_BG`.
#:
#: `ATTN` and `FAULT` are lifted off the `MISSED` amber and the `BLOCKED` red
#: rather than reused. Those two were chosen to be read *through*, with ink on
#: them, and on the bar plane they measure 4.6:1 and 2.7:1 — survivable in a
#: 320x148 field and not in a 13 px chip, where the red would simply be a dark
#: smudge. Lifted, they are 9.0:1 and 4.2:1. `OK` is the due green unchanged:
#: at 8.9:1 it already carries, and the bar's "this subsystem is fine" and the
#: hero's "a dose is waiting" being the same green is the truth about them.
SEVERITY: dict[str, Rgb] = {
    "OK": (0, 214, 96),                   # 8.93:1, circle
    "ATTN": (255, 168, 0),                # 8.99:1, triangle
    "FAULT": (232, 58, 58),               # 4.22:1, octagon
}

#: What quiet hours replace, and nothing else. `TEXT` steps down to the settled
#: grey and `TEXT_DIM` to the mute one, so the whole text hierarchy shifts by
#: one rank and keeps its ordering; the three planes lose about a third of their
#: luminance. `RULE` stays put — it is already near the floor, and a separator
#: that vanishes at night is a panel that looks broken rather than dimmed.
NIGHT: dict[str, Rgb] = {
    "TEXT": STRUCTURE["TEXT_DIM"],
    "TEXT_DIM": STRUCTURE["TEXT_MUTE"],
    "INK": (10, 11, 14),
    "BAR_BG": (20, 22, 28),
    "STRIP_BG": (14, 16, 20),
}

_TABLES = (STRUCTURE, ABSOLUTE, TONES, SEVERITY, CALENDAR)

#: Every name, in one flat namespace, because that is what `pack` returns and a
#: screen should not have to know which table a colour came from.
PALETTE: dict[str, Rgb] = {name: rgb
                           for table in _TABLES for name, rgb in table.items()}

if len(PALETTE) != sum(len(table) for table in _TABLES):
    # A name in two tables would resolve to whichever table merged last, which
    # is a palette that depends on the order of the lines above. Caught at
    # import, where the traceback names the file, rather than in a kitchen.
    raise ValueError("two palette tables share a name")

if set(NIGHT) - set(STRUCTURE):
    # The one substitution rule, enforced instead of documented: quiet hours may
    # dim the furniture and may not touch a state.
    raise ValueError("the night palette may only substitute structure colours")


#: Keyed by `(surface class, night)`. Two entries per surface, forever, so this
#: never needs eviction.
_PACKED: dict[tuple[type, bool], dict[str, int]] = {}


def pack(canvas: Canvas, night: bool = False) -> dict[str, int]:
    """Every palette name, packed into this surface's pixels.

    Handed to a screen as `theme`, so drawing reads `theme["BAR_BG"]` and a
    typo is a `KeyError` naming the colour rather than a black rectangle in
    somebody's kitchen.

    The result is memoised and **shared**, so a screen must not mutate it. The
    twenty-three shifts this saves are microseconds and not the reason: the
    reason is that the answer changes twice a day, so `pack` can be called at
    the top of every draw function — where it is obvious what palette is in use
    — instead of being threaded through call signatures to avoid repeating it.
    """
    key = (type(canvas), bool(night))
    packed = _PACKED.get(key)
    if packed is None:
        source = {**PALETTE, **NIGHT} if night else PALETTE
        packed = {name: canvas.rgb(*rgb) for name, rgb in source.items()}
        _PACKED[key] = packed
    return packed
