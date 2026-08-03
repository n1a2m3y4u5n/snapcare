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
# ── 되살린 것 ──────────────────────────────────────────────────────────────
#
# 아래 여덟은 `1354de8` 에 있다가 `631e92e` 에서 사라졌다. 이름이 바뀐 것이 아니라
# 정의만 빠졌고, screens.py 는 그대로 부르고 있어서 **모듈을 임포트하는 순간 죽었다** —
# 펌웨어 시험 전체가 한 줄도 못 돌았다. 그 판의 것을 글자 그대로 되돌린다(그림도 함께,
# `as_art` 가 주석과 숫자를 맞춰 보기 때문이다).

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
# The bar itself, three columns inside the mask's five.
#
#   ##..............   0xC000
#   ###.............   0xE000
#   .###............   0x7000
#   ..###...........   0x3800
#   ...###..........   0x1C00
#   ....###.........   0x0E00
#   .....###........   0x0700
#   ......###.......   0x0380
#   .......###......   0x01C0
#   ........###.....   0x00E0
#   .........###....   0x0070
#   ..........###...   0x0038
#   ...........###..   0x001C
#   ............###.   0x000E
#   .............###   0x0007
#   ..............##   0x0003
SLASH = (
    0xC000, 0xE000, 0x7000, 0x3800,
    0x1C00, 0x0E00, 0x0700, 0x0380,
    0x01C0, 0x00E0, 0x0070, 0x0038,
    0x001C, 0x000E, 0x0007, 0x0003,
)
# ── the bar that turns any picture into its own negation ────────────────────

# `SLASH_MASK` and `SLASH` are one thing in two halves, and they are the reason
# the status screen can say "the clock is not to be trusted" without a word of
# text: draw the mask in the *background* colour over whatever picture is there,
# then the bar in the foreground colour inside it.
#
# Drawing the bar alone does not work and it took a wasted evening to see why.
# The bar is one ink and so is everything under it, so over a filled glyph —
# CLOUD, BATTERY, PILL — it lands on pixels that are already lit and vanishes
# completely. The screen then shows a perfectly clean picture that means the
# opposite of what it says. The mask cuts a one-pixel gutter either side of the
# bar first, so the bar reads on any glyph, on either polarity, on both panels.
#
# Upper left to lower right, per ISO 7010 and per `BARRED` above.
#
#   ###.............   0xE000
#   ####............   0xF000
#   #####...........   0xF800
#   .#####..........   0x7C00
#   ..#####.........   0x3E00
#   ...#####........   0x1F00
#   ....#####.......   0x0F80
#   .....#####......   0x07C0
#   ......#####.....   0x03E0
#   .......#####....   0x01F0
#   ........#####...   0x00F8
#   .........#####..   0x007C
#   ..........#####.   0x003E
#   ...........#####   0x001F
#   ............####   0x000F
#   .............###   0x0007
SLASH_MASK = (
    0xE000, 0xF000, 0xF800, 0x7C00,
    0x3E00, 0x1F00, 0x0F80, 0x07C0,
    0x03E0, 0x01F0, 0x00F8, 0x007C,
    0x003E, 0x001F, 0x000F, 0x0007,
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

ALL: dict[str, tuple[int, ...]] = {
    "WIFI": WIFI,
    "WIFI_LOW": WIFI_LOW,
    "CLOUD": CLOUD,
    "CLOCK": CLOCK,
    "PILL": PILL,
    "BOLT": BOLT,
    "BATTERY": BATTERY,
    "CARD": CARD,
    "CUP": CUP,
    "PRESS": PRESS,
    "CROSS": CROSS,
    "TICK": TICK,
    "SLASH": SLASH,
    "SLASH_MASK": SLASH_MASK,
    "WARN": WARN,
    "BARRED": BARRED,
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
