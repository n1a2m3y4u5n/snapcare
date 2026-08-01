"""The pictures. This is the sentence the person actually reads.

Why there are pictures at all
-----------------------------
The founding constraint of this project is that the person in front of the
machine cannot be assumed to read, so the channel to them is a colour and a
picture. The LED ring this screen replaces had five colours and nothing else;
the screen keeps the colours and adds the thing a ring could never do — say
*which tray* and *what time*. Everything else on a dose screen is one of the
bitmaps below.

That makes this file the load-bearing one. A driver that transposes a byte
shows a corrupt screen and somebody notices in a second. A glyph that reads as
the wrong thing shows a perfectly clean screen that means something else, and
nobody notices until a dose is missed.

Why 16x16, and why nothing else
-------------------------------
Every glyph is exactly sixteen columns by sixteen rows. Sixteen is the largest
size that still fits, unscaled, on the smallest panel anyone might reasonably
bolt to this thing (a 72x40 OLED), and it divides cleanly into every panel we
actually ship to:

    72x40 OLED     16x16 at scale 1
    128x32 strip   16x16 at scale 1
    128x64 OLED    32x32 at scale 2       — the panel on the bench today
    240x320 LCD    96x96 or 128x128       — the ILI9341, scale 6 or 8

`Canvas.blit` only scales by whole numbers, deliberately: a smoothed icon on a
128x64 monochrome panel is a smudge, and a 16x16 design magnified 6x has edges
that survive being looked at from the other side of a room. The cost is that
there is no intermediate size — a panel that wants 40 px of glyph gets 32 — and
that is the right way for the trade to cut, because a crisp small picture beats
a soft large one at the distance this is read from.

Why the ASCII art is here
-------------------------
The art above each tuple is the source. The numbers are the build. They are
kept side by side because a glyph is the one thing in this firmware that cannot
be reviewed by reading the code — nobody can look at `0x8631` and say whether
that row of the cup is right — and because the next person to change one of
these will be doing it by eye, on a bench, next to the panel.

The art is a *comment* and the tuple is what runs. It would be neater to parse
the art at import, and it is deliberately not done: that would mean a docstring
typo is a broken screen at 3am on a device in somebody's kitchen, and it would
put a parser on the path between power-on and the first frame. Edit the picture,
re-derive the row (each row is one 16-bit int, MSB leftmost, `#` is 1), and
change both. `tests` and `--selftest` render every glyph back to ASCII, so the
two cannot silently drift apart.
"""
from __future__ import annotations

#: Columns per row. Passed straight to `Canvas.blit` as its `span`.
SPAN = 16
#: Rows per glyph. Equal to SPAN — every glyph is square, so a layout can pick
#: one scale from the smaller of a box's two dimensions and be done.
ROWS = 16


# ── the dose vocabulary ─────────────────────────────────────────────────────

# A capsule, half filled, lying on its side. It has to be unmistakably a *pill*
# and not a dot or a blob, which is why it is a two-tone capsule rather than a
# tablet: a filled circle at this size is a bullet point, and the eye reads it
# as decoration. The hollow right half is what makes it a medicine capsule.
#
#   ................   0x0000
#   ................   0x0000
#   ....########....   0x0FF0
#   ..############..   0x3FFC
#   .##############.   0x7FFE
#   #########......#   0xFF81
#   #########......#   0xFF81
#   #########......#   0xFF81
#   #########......#   0xFF81
#   #########......#   0xFF81
#   #########......#   0xFF81
#   .##############.   0x7FFE
#   ..############..   0x3FFC
#   ....########....   0x0FF0
#   ................   0x0000
#   ................   0x0000
PILL = (
    0x0000, 0x0000, 0x0FF0, 0x3FFC,
    0x7FFE, 0xFF81, 0xFF81, 0xFF81,
    0xFF81, 0xFF81, 0xFF81, 0x7FFE,
    0x3FFC, 0x0FF0, 0x0000, 0x0000,
)

# Two pills in a medicine cup — the "they are out, take them" picture, which is
# the blue state. The cup tapers and has a heavy rim so that it cannot be read
# as a box or a tray, and the pills sit *inside* it rather than above it: pills
# drawn falling would say "it is happening", and by the time this screen is up
# it has already happened.
#
#   ................   0x0000
#   ................   0x0000
#   ################   0xFFFF
#   ################   0xFFFF
#   #..............#   0x8001
#   #..............#   0x8001
#   #....##...##...#   0x8631
#   #...####.####..#   0x8F79
#   .#..####.####.#.   0x4F7A
#   .#...##...##..#.   0x4632
#   .#............#.   0x4002
#   ..#..........#..   0x2004
#   ..#..........#..   0x2004
#   ...#........#...   0x1008
#   ...#........#...   0x1008
#   ...##########...   0x1FF8
CUP = (
    0x0000, 0x0000, 0xFFFF, 0xFFFF,
    0x8001, 0x8001, 0x8631, 0x8F79,
    0x4F7A, 0x4632, 0x4002, 0x2004,
    0x2004, 0x1008, 0x1008, 0x1FF8,
)

# A hand with one finger coming down onto a button, with two impact ticks
# beside the fingertip. This is the whole instruction for the green state and it
# has to work with no caption, because the person it is aimed at is the one who
# cannot read the caption.
#
# The fist is a blob with two knuckle creases rather than an anatomical hand:
# at 16 px, detail turns to noise the moment it is scaled, and what carries the
# meaning is the silhouette — mass above, one finger below, a plate under it.
# The gap between the fingertip and the button is deliberate. A finger already
# touching reads as "pressed"; a finger a hair above it, with the ticks, reads
# as "press".
#
#   ...##########...   0x1FF8
#   ..############..   0x3FFC
#   .##############.   0x7FFE
#   .##############.   0x7FFE
#   .##############.   0x7FFE
#   .###.####.#####.   0x77BE
#   ..##.####.####..   0x37BC
#   ......####......   0x03C0
#   ......####......   0x03C0
#   ......####......   0x03C0
#   ..#....##....#..   0x2184
#   .#............#.   0x4002
#   ....########....   0x0FF0
#   ..############..   0x3FFC
#   ..############..   0x3FFC
#   ..############..   0x3FFC
PRESS = (
    0x1FF8, 0x3FFC, 0x7FFE, 0x7FFE,
    0x7FFE, 0x77BE, 0x37BC, 0x03C0,
    0x03C0, 0x03C0, 0x2184, 0x4002,
    0x0FF0, 0x3FFC, 0x3FFC, 0x3FFC,
)

# Missed. Corner to corner, three pixels thick, no rounding — it fills the whole
# box so that on the monochrome panel, where amber does not exist, the *shape*
# of the lit area is different from every other screen even out of focus. This
# is the one glyph that is allowed to be aggressive.
#
#   ##............##   0xC003
#   ###..........###   0xE007
#   .###........###.   0x700E
#   ..###......###..   0x381C
#   ...###....###...   0x1C38
#   ....###..###....   0x0E70
#   .....######.....   0x07E0
#   ......####......   0x03C0
#   ......####......   0x03C0
#   .....######.....   0x07E0
#   ....###..###....   0x0E70
#   ...###....###...   0x1C38
#   ..###......###..   0x381C
#   .###........###.   0x700E
#   ###..........###   0xE007
#   ##............##   0xC003
CROSS = (
    0xC003, 0xE007, 0x700E, 0x381C,
    0x1C38, 0x0E70, 0x07E0, 0x03C0,
    0x03C0, 0x07E0, 0x0E70, 0x1C38,
    0x381C, 0x700E, 0xE007, 0xC003,
)

# Accepted — a new schedule arrived and the device believed it. Wide and short,
# which is what stops it being confused with the cross at a glance: the cross
# reaches all four corners, the tick reaches none of them and leans right.
#
#   ................   0x0000
#   ................   0x0000
#   ................   0x0000
#   ................   0x0000
#   ..............##   0x0003
#   .............###   0x0007
#   ............###.   0x000E
#   ...........###..   0x001C
#   ###.......###...   0xE038
#   .###.....###....   0x7070
#   ..###...###.....   0x38E0
#   ...###.###......   0x1DC0
#   ....#####.......   0x0F80
#   .....###........   0x0700
#   ................   0x0000
#   ................   0x0000
TICK = (
    0x0000, 0x0000, 0x0000, 0x0000,
    0x0003, 0x0007, 0x000E, 0x001C,
    0xE038, 0x7070, 0x38E0, 0x1DC0,
    0x0F80, 0x0700, 0x0000, 0x0000,
)

# Waiting to be put on a network. Three arcs and a dot — the one icon in here
# that the person has already learnt from every phone they have ever held, so
# it is drawn conventionally and no cleverness is applied to it. The arcs get
# visibly shorter as they get closer to the dot; equal-length arcs read as a
# rainbow rather than a signal.
#
#   ....########....   0x0FF0
#   ..############..   0x3FFC
#   .###........###.   0x700E
#   ##............##   0xC003
#   ................   0x0000
#   .....######.....   0x07E0
#   ...##########...   0x1FF8
#   ..##........##..   0x300C
#   ................   0x0000
#   ......####......   0x03C0
#   .....##..##.....   0x0660
#   ................   0x0000
#   ......####......   0x03C0
#   .....######.....   0x07E0
#   .....######.....   0x07E0
#   ......####......   0x03C0
WIFI = (
    0x0FF0, 0x3FFC, 0x700E, 0xC003,
    0x0000, 0x07E0, 0x1FF8, 0x300C,
    0x0000, 0x03C0, 0x0660, 0x0000,
    0x03C0, 0x07E0, 0x07E0, 0x03C0,
)

# Nothing is happening. A round clock face with two hands, because the resting
# screen's job is to say "awake, and I know what time it is" — see the argument
# in `screens.idle`. The hands are set to three o'clock rather than anything
# meaningful; a glyph that tried to show the real time would be a second clock
# disagreeing with the digits next to it.
#
#   .....######.....   0x07E0
#   ...##......##...   0x1818
#   ..#..........#..   0x2004
#   .#.....##.....#.   0x4182
#   .#.....##.....#.   0x4182
#   #......##......#   0x8181
#   #......##......#   0x8181
#   #......#####...#   0x81F1
#   #.......####...#   0x80F1
#   #..............#   0x8001
#   #..............#   0x8001
#   .#............#.   0x4002
#   .#............#.   0x4002
#   ..#..........#..   0x2004
#   ...##......##...   0x1818
#   .....######.....   0x07E0
CLOCK = (
    0x07E0, 0x1818, 0x2004, 0x4182,
    0x4182, 0x8181, 0x8181, 0x81F1,
    0x80F1, 0x8001, 0x8001, 0x4002,
    0x4002, 0x2004, 0x1818, 0x07E0,
)


# ── the two that mean "go and fetch somebody" ───────────────────────────────

# The device will not dispense. A triangle with a bang in it is the one warning
# shape that survives translation into every language and none, which is exactly
# what is wanted from a machine that has decided not to give somebody their
# medication. It sits on a solid base so that it is unmistakably a triangle and
# not an arrow — an arrow on a screen invites somebody to press something.
#
#   .......##.......   0x0180
#   .......##.......   0x0180
#   ......####......   0x03C0
#   ......####......   0x03C0
#   .....##..##.....   0x0660
#   .....##..##.....   0x0660
#   ....##.##.##....   0x0DB0
#   ....##.##.##....   0x0DB0
#   ...##..##..##...   0x1998
#   ...##..##..##...   0x1998
#   ..##...##...##..   0x318C
#   ..##........##..   0x300C
#   .##....##....##.   0x6186
#   .##....##....##.   0x6186
#   ################   0xFFFF
#   ################   0xFFFF
WARN = (
    0x0180, 0x0180, 0x03C0, 0x03C0,
    0x0660, 0x0660, 0x0DB0, 0x0DB0,
    0x1998, 0x1998, 0x318C, 0x300C,
    0x6186, 0x6186, 0xFFFF, 0xFFFF,
)

# The prohibition sign, used as the *cause* half of the blocked screen when the
# cause is the mechanism rather than the clock. Bar from upper left to lower
# right, per ISO 7010 — drawn the other way it reads as a "no smoking" sign with
# the smoke missing, which is a surprisingly common way to get this wrong.
#
#   .....######.....   0x07E0
#   ...##########...   0x1FF8
#   ..####....####..   0x3C3C
#   .####.......###.   0x780E
#   .#####.......##.   0x7C06
#   ##..###.......##   0xCE03
#   ##...###......##   0xC703
#   ##....###.....##   0xC383
#   ##.....###....##   0xC1C3
#   ##......###...##   0xC0E3
#   ##.......###..##   0xC073
#   .##.......#####.   0x603E
#   .###.......####.   0x701E
#   ..####....####..   0x3C3C
#   ...##########...   0x1FF8
#   .....######.....   0x07E0
BARRED = (
    0x07E0, 0x1FF8, 0x3C3C, 0x780E,
    0x7C06, 0xCE03, 0xC703, 0xC383,
    0xC1C3, 0xC0E3, 0xC073, 0x603E,
    0x701E, 0x3C3C, 0x1FF8, 0x07E0,
)


#: Every glyph by name, for the selftest's render-them-all page and for anything
#: that wants to walk the set rather than name one. Not used for lookup by the
#: screens — those name the constant, so a typo is an ImportError at start-up
#: rather than a blank rectangle in somebody's kitchen.
ALL: dict[str, tuple[int, ...]] = {
    "PILL": PILL,
    "CUP": CUP,
    "PRESS": PRESS,
    "CROSS": CROSS,
    "TICK": TICK,
    "WIFI": WIFI,
    "CLOCK": CLOCK,
    "WARN": WARN,
    "BARRED": BARRED,
}


def as_art(glyph: tuple[int, ...], span: int = SPAN) -> str:
    """Render a glyph back to the ASCII art above it.

    This is the check that keeps the pictures in the comments honest about the
    numbers underneath them: paste the output next to the comment and they must
    match character for character. It is also what `--selftest` prints when
    somebody is trying to work out whether a panel is wrong or a glyph is.
    """
    return "\n".join(
        "".join("#" if (row >> (span - 1 - col)) & 1 else "." for col in range(span))
        for row in glyph
    )
