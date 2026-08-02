"""The pictures in the status bar — seven slots, eight glyphs, because the radio
slot has one for a house network and one for the device's own hotspot. Each of
them says *which subsystem*, and never *how bad*.

Why there are pictures at all
-----------------------------
The founding constraint of this project is that the person in front of the
machine cannot be assumed to read, so the channel to them is a colour and a
picture. There is no room in a 26 px status-bar slot for the word "network", and
there would be no point in one: the person who needs the bar most is the person
who cannot use the word.

What these pictures are for has changed, and it is worth stating plainly because
it is what stops this file growing again. A glyph used to be the whole message
of a dose screen — a cup, a hand coming down on a button, a cross. It is not any
more. A dose state is now a field colour, a solid shape and a printed time, and
the glyphs that survive do one job each: they name the *subsystem* a status-bar
chip is about. Severity is the solid shape drawn underneath the icon, out of
`shapes.py`, and none of it is carried in here. That separation is the whole
reason the bar can be learnt at all — the picture never moves and never changes
meaning, and only the shape below it does.

That still makes this file a load-bearing one. A driver that transposes a byte
shows a corrupt screen and somebody notices in a second. A glyph that reads as
the wrong subsystem shows a perfectly clean bar that sends somebody to check the
wrong thing, and nobody notices until the fault they were actually being told
about is still there a week later.

Why 16x16, and why nothing else
-------------------------------
Every glyph is exactly sixteen columns by sixteen rows and is blitted at scale
1 into the bar's slot: 2.8 mm on this panel, 9.8 arcmin at a metre, which is
what declares the bar an arm's-length-to-1.5 m element rather than something to
be read from the doorway. The hero band is the three-metre element and it is
drawn as geometry, not as pictures, precisely because a 16x16 bitmap magnified
to that size is not a large picture — it is a small one with stair-steps.

Sixteen square, all of them, so the row is a row: a glyph that was 14 wide would
sit off the grid its neighbours share, and a bar whose icons do not line up
looks broken before anybody has read a single one of them.

The order of the definitions below is the order of the slots on the bar. That is
not tidiness — it is so that a person editing one of these can see what it will
be sitting next to, which is the only thing that decides whether a picture is
distinguishable or not.

No glyph is ever negated
------------------------
`SLASH` and `SLASH_MASK` — a gutter cut in the background colour and a bar drawn
in the foreground over it — used to be how this firmware said "not this one",
because with one ink and no room for a word there was nothing else. They are
gone with the monochrome panel. At the scale the bar draws these the bar itself
would be three pixels across a 16 px picture — 1.8 arcmin at a metre, near
enough to the acuity floor that it would be a smudge on the icon rather than a
line through it — and all it can ever say is "not". The solid octagon that now
sits under the icon says which of three levels it is instead, is the same
silhouette the hero band is showing at that moment, and costs one shape rather
than two blits.

Why the ASCII art is here
-------------------------
The art above each tuple is the source. The numbers are the build. They are
kept side by side because a glyph is the one thing in this firmware that cannot
be reviewed by reading the code — nobody can look at `0x16DE` and say whether
that row of the card is right — and because the next person to change one of
these will be doing it by eye, on a bench, next to the panel.

The art is a *comment* and the tuple is what runs. It would be neater to parse
the art at import, and it is deliberately not done: that would mean a docstring
typo is a broken screen at 3am on a device in somebody's kitchen, and it would
put a parser on the path between power-on and the first frame. Edit the picture,
re-derive the row (each row is one 16-bit int, MSB leftmost, `#` is 1), and
change both — then `as_art` renders the tuple back so the two can be compared
character for character instead of trusted.
"""
from __future__ import annotations

#: Columns per row. Passed straight to `Canvas.blit` as its `span`.
SPAN = 16
#: Rows per glyph. Equal to SPAN — every glyph is square, so a layout can pick
#: one scale from the smaller of a box's two dimensions and be done.
ROWS = 16


# ── the bar, in slot order ──────────────────────────────────────────────────

# Slot 0: the radio, whenever it is on somebody's house network. Three arcs and
# a dot — the one icon in here that the person has already learnt from every
# phone they have ever held, so it is drawn conventionally and no cleverness is
# applied to it. The arcs get visibly shorter as they get closer to the dot;
# equal-length arcs read as a rainbow rather than a signal.
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

# Slot 0 while the device is running its own setup hotspot. The same dot and the
# same innermost arc as `WIFI`, with the two outer arcs gone and the whole thing
# lifted to sit centred in its box — a signal meter showing one bar, which is
# the one thing every phone on earth has already taught everybody.
#
# It is *not* drawn as WIFI-with-the-top-blanked, tempting as that is. That
# leaves the picture hanging off the bottom of its box, and next to seven icons
# that are all centred, a bottom-heavy one looks like a rendering fault rather
# than a weak signal.
#
#   ................   0x0000
#   ................   0x0000
#   ................   0x0000
#   ................   0x0000
#   ................   0x0000
#   ......####......   0x03C0
#   .....##..##.....   0x0660
#   ................   0x0000
#   ......####......   0x03C0
#   .....######.....   0x07E0
#   .....######.....   0x07E0
#   ......####......   0x03C0
#   ................   0x0000
#   ................   0x0000
#   ................   0x0000
#   ................   0x0000
WIFI_LOW = (
    0x0000, 0x0000, 0x0000, 0x0000,
    0x0000, 0x03C0, 0x0660, 0x0000,
    0x03C0, 0x07E0, 0x07E0, 0x03C0,
    0x0000, 0x0000, 0x0000, 0x0000,
)

# Slot 1: the relay — the server the pairing and the schedules come through,
# which is somewhere else entirely. It has to be a *different silhouette* from
# the clock and the wifi arcs, because all three sit in the same row and the
# whole value of that row is telling at a glance which chip has gone red. A
# globe was the first attempt and it was wrong for exactly that reason: a circle
# with lines in it next to a circle with hands in it is one picture.
#
#   ................   0x0000
#   ................   0x0000
#   ................   0x0000
#   ................   0x0000
#   .........####...   0x0078
#   ..###...######..   0x38FC
#   .#####.########.   0x7DFE
#   ################   0xFFFF
#   ################   0xFFFF
#   ################   0xFFFF
#   ################   0xFFFF
#   .##############.   0x7FFE
#   ................   0x0000
#   ................   0x0000
#   ................   0x0000
#   ................   0x0000
CLOUD = (
    0x0000, 0x0000, 0x0000, 0x0000,
    0x0078, 0x38FC, 0x7DFE, 0xFFFF,
    0xFFFF, 0xFFFF, 0xFFFF, 0x7FFE,
    0x0000, 0x0000, 0x0000, 0x0000,
)

# Slot 2: whether anything has vouched for the time. A round clock face with two
# hands. The hands are set to three o'clock rather than to anything meaningful;
# a glyph that tried to show the real time would be a second clock disagreeing
# with the digits at the other end of the same bar.
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

# Slot 3: the trays, and whether this machine can dispense out of them at all.
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

# Slot 4: the supply. A lightning bolt, because that is the symbol Raspberry Pi
# OS itself puts in the corner of a desktop when the 5V rail sags, and the
# symbol moulded into the supply the person is being asked to go and change.
# Under-voltage is silent, browns out a servo mid-sweep and corrupts the card,
# so it earns a slot; but it is only ever actionable as "that power supply or
# that cable", and a picture of a plug would say the opposite — that something
# has come unplugged, on a machine that is plainly still running.
#
# Diagonal mass, which nothing else in the row has: the neighbours are arcs, a
# cloud, a circle, a capsule, a landscape battery and a portrait card. Even out
# of focus this one is the slanted one. The tail tapers to two pixels so that
# it reads as a bolt rather than as a chevron.
#
#   .........#####..   0x007C
#   ........#####...   0x00F8
#   .......#####....   0x01F0
#   ......#####.....   0x03E0
#   .....#####......   0x07C0
#   ....#####.......   0x0F80
#   ...###########..   0x1FFC
#   ...##########...   0x1FF8
#   .........####...   0x0078
#   ........####....   0x00F0
#   .......####.....   0x01E0
#   ......####......   0x03C0
#   .....####.......   0x0780
#   ....###.........   0x0E00
#   ...###..........   0x1C00
#   ..##............   0x3000
BOLT = (
    0x007C, 0x00F8, 0x01F0, 0x03E0,
    0x07C0, 0x0F80, 0x1FFC, 0x1FF8,
    0x0078, 0x00F0, 0x01E0, 0x03C0,
    0x0780, 0x0E00, 0x1C00, 0x3000,
)

# Slot 5: the backup cell in the RTC, drawn nearly flat on purpose — one bar
# left in a case that holds four. A full battery would be the wrong picture
# whatever the state, because this chip is only ever worth looking at when
# somebody needs to change the cell; nothing in this firmware has a reason to
# say "the cell is fine", and the severity mark below says that anyway.
#
#   ................   0x0000
#   ................   0x0000
#   ................   0x0000
#   ................   0x0000
#   ##############..   0xFFFC
#   ##############..   0xFFFC
#   ##..........####   0xC00F
#   ##.####.....####   0xDE0F
#   ##.####.....####   0xDE0F
#   ##..........####   0xC00F
#   ##############..   0xFFFC
#   ##############..   0xFFFC
#   ................   0x0000
#   ................   0x0000
#   ................   0x0000
#   ................   0x0000
BATTERY = (
    0x0000, 0x0000, 0x0000, 0x0000,
    0xFFFC, 0xFFFC, 0xC00F, 0xDE0F,
    0xDE0F, 0xC00F, 0xFFFC, 0xFFFC,
    0x0000, 0x0000, 0x0000, 0x0000,
)

# Slot 6: the SD card the schedule is written to. A card that has gone read-only
# is a machine that will re-dispense yesterday's plan after the next power cut
# and say nothing, so it earns a slot; the action is always "replace the card",
# and the picture therefore has to be of the card itself rather than of a disc
# or a folder — a disc at this size is the clock face again, and a folder means
# "files", which is not a thing anybody can hold in their hand.
#
# The silhouette does the work: a portrait rectangle with one corner cut off is
# an SD card and nothing else in the row is portrait at all. The three notches
# are the contacts, and they are the only interior detail in the picture — cut
# *out* of the body rather than drawn on it, so that they survive whichever ink
# the chip is drawn in.
#
#   ................   0x0000
#   .....##########.   0x07FE
#   ....###########.   0x0FFE
#   ...############.   0x1FFE
#   ...############.   0x1FFE
#   ...############.   0x1FFE
#   ...#.##.##.####.   0x16DE
#   ...#.##.##.####.   0x16DE
#   ...#.##.##.####.   0x16DE
#   ...############.   0x1FFE
#   ...############.   0x1FFE
#   ...############.   0x1FFE
#   ...############.   0x1FFE
#   ...############.   0x1FFE
#   ...############.   0x1FFE
#   ................   0x0000
CARD = (
    0x0000, 0x07FE, 0x0FFE, 0x1FFE,
    0x1FFE, 0x1FFE, 0x16DE, 0x16DE,
    0x16DE, 0x1FFE, 0x1FFE, 0x1FFE,
    0x1FFE, 0x1FFE, 0x1FFE, 0x0000,
)


#: Every glyph by name, for the selftest's render-them-all page and for anything
#: that wants to walk the set rather than name one. Not used for lookup by the
#: bar — that names the constant, so a typo is an ImportError at start-up rather
#: than a blank rectangle in somebody's kitchen.
ALL: dict[str, tuple[int, ...]] = {
    "WIFI": WIFI,
    "WIFI_LOW": WIFI_LOW,
    "CLOUD": CLOUD,
    "CLOCK": CLOCK,
    "PILL": PILL,
    "BOLT": BOLT,
    "BATTERY": BATTERY,
    "CARD": CARD,
}


def as_art(glyph: tuple[int, ...], span: int = SPAN) -> str:
    """Render a glyph back to the ASCII art above it.

    This is the check that keeps the pictures in the comments honest about the
    numbers underneath them: paste the output next to the comment and they must
    match character for character. It is also what to print when somebody is
    trying to work out whether a panel is wrong or a glyph is.
    """
    return "\n".join(
        "".join("#" if (row >> (span - 1 - col)) & 1 else "." for col in range(span))
        for row in glyph
    )
