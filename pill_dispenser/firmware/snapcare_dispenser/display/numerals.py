"""The numbers, drawn with a round pen rather than scaled from a bitmap.

Why this exists
---------------
The times and the tray numbers are the only text on this device that somebody
genuinely has to read, and until now they were the 5x7 font in `font.py` blown
up by a whole number. At the size a clock wants on a 320x240 panel that is a
scale of eight or ten, and an eight-times-scaled bitmap is not a large character
— it is a small character with eight-pixel stair-steps on every edge. It reads as
a machine from the 1980s, and at a glance from across a room the steps blur into
the strokes and cost legibility rather than adding it.

So the numerals are geometry, for exactly the reason `shapes.py` gives for the
circle and the octagon being geometry: a shape computed at the size it is drawn
has no stair-steps, and the difference between a smooth digit and a lumpy one is
the difference between a device somebody trusts and one they do not.

How a digit is built
--------------------
Each character is a set of **strokes** in a unit box — x and y both 0..1, y
downwards — and a stroke is a polyline. Curves are polylines too, sampled finely
enough that the pen covers the corners.

Drawing is stamping a filled disc along that path, which is what a marker pen
does. It gives round terminals and round joins for free, it needs no polygon
filling and no anti-aliasing, and it is correct at every size because nothing is
ever scaled: at size 20 the pen is 1 px across and at size 80 it is 6.

What it is not
--------------
Not a font, and deliberately not one. There are ten digits, a colon, a hyphen, a
space and a question mark, and that is the whole set — the same discipline
`font.py` keeps and for the same reason. Anything that wants a letter uses
`font.py`; anything that wants a sentence belongs in the app, where there is a
reader.

`font.py` stays for the small text — an SSID, an IP address — where 5x7 is the
right tool and a stroked numeral would be mush.
"""
from __future__ import annotations

import math

__all__ = ["draw", "draw_char", "text_width", "fit", "CHARACTERS"]

#: Full turn, named because every arc below is expressed as a sweep from one
#: angle to another and the wrap past 2*pi is what makes an arc go over the top
#: of a digit rather than under it. Getting that backwards does not fail — it
#: draws a mirrored digit that still looks like a digit, which is the kind of
#: bug that reaches a device.
TAU = math.pi * 2

#: How wide a character's ink is allowed to be, as a fraction of its height.
#: Digits are drawn inside this and the advance below adds the sidebearing.
_ASPECT = 0.72


def _arc(cx: float, cy: float, rx: float, ry: float,
         start: float, end: float, steps: int) -> list[tuple[float, float]]:
    """An elliptical arc as a polyline, in unit-box coordinates.

    `steps` is chosen per digit rather than globally: a quarter turn needs far
    fewer samples than a full oval, and every extra sample is a disc stamped on
    top of one already there.
    """
    return [(cx + rx * math.cos(start + (end - start) * i / steps),
             cy + ry * math.sin(start + (end - start) * i / steps))
            for i in range(steps + 1)]


#: The bowls most digits are built from. Kept as names so that 3, 6, 8 and 9
#: agree with each other — a 6 whose bowl is a different size from an 8's reads
#: as a different typeface on the same line.
_BOWL_X = 0.30
_TOP_Y = 0.26
_BOTTOM_Y = 0.74
_BOWL_Y = 0.26

_STROKES: dict[str, list[list[tuple[float, float]]]] = {
    "0": [_arc(0.50, 0.50, _BOWL_X, 0.44, -math.pi / 2, math.pi * 1.5, 40)],
    "1": [[(0.28, 0.22), (0.50, 0.08), (0.50, 0.92)]],
    "2": [
        _arc(0.50, _TOP_Y, _BOWL_X, _BOWL_Y, math.pi, TAU + 0.35, 24)
        + [(0.18, 0.90)],
        [(0.18, 0.90), (0.84, 0.90)],
    ],
    "3": [
        _arc(0.50, _TOP_Y, _BOWL_X, _BOWL_Y, math.pi, TAU + math.pi / 3, 24),
        _arc(0.50, _BOTTOM_Y, _BOWL_X, _BOWL_Y, -math.pi / 3, math.pi, 24),
    ],
    "4": [
        [(0.62, 0.08), (0.16, 0.66), (0.86, 0.66)],
        [(0.62, 0.34), (0.62, 0.92)],
    ],
    "5": [
        [(0.76, 0.10), (0.28, 0.10), (0.24, 0.44)],
        _arc(0.50, 0.64, _BOWL_X, 0.28, -math.pi * 0.72, math.pi * 0.95, 26),
    ],
    "6": [
        _arc(0.50, _BOTTOM_Y, _BOWL_X, _BOWL_Y, -math.pi, math.pi, 36),
        [(0.20, 0.74), (0.24, 0.34)],
        _arc(0.52, 0.30, 0.28, 0.22, math.pi, math.pi * 1.7, 14),
    ],
    "7": [[(0.18, 0.10), (0.82, 0.10), (0.40, 0.92)]],
    "8": [
        _arc(0.50, _TOP_Y, 0.26, 0.22, -math.pi / 2, math.pi * 1.5, 30),
        _arc(0.50, _BOTTOM_Y, _BOWL_X, _BOWL_Y, -math.pi / 2, math.pi * 1.5, 34),
    ],
    "9": [
        _arc(0.50, _TOP_Y, _BOWL_X, _BOWL_Y, -math.pi, math.pi, 36),
        [(0.80, 0.26), (0.76, 0.66)],
        _arc(0.48, 0.70, 0.28, 0.22, 0, math.pi * 0.7, 14),
    ],
    "-": [[(0.20, 0.50), (0.80, 0.50)]],
    "?": [
        _arc(0.50, 0.30, 0.24, 0.20, math.pi, TAU + 0.6, 20) + [(0.50, 0.62)],
        [(0.50, 0.84), (0.50, 0.86)],
    ],
    " ": [],
    #: Two discs rather than a stroke — see `draw_char`.
    ":": [],
}

#: Advance width as a fraction of the character's height, where it is not the
#: default. A `1` is mostly sidebearing and a `:` is nearly all of it; giving
#: either the full width opens a hole in the middle of a clock.
_ADVANCE = {"1": 0.52, ":": 0.34, " ": 0.34, "-": 0.52}
_DEFAULT_ADVANCE = 0.72

#: Everything this module can draw. Anything else becomes `?`.
CHARACTERS = frozenset(_STROKES)

#: Stroke weight as a fraction of the character's height. 0.15 is about what a
#: medium-weight sans-serif uses; below about 0.10 the digits go spindly from a
#: distance and above about 0.20 the counters in 6, 8 and 9 close up.
_WEIGHT = 0.15


def _disc(canvas, cx: int, cy: int, radius: int, value: int) -> None:
    """A filled circle, as horizontal runs.

    Runs rather than pixels because `Rgb565.rect` slice-assigns a row in one
    step, and a pen laid down a few thousand times per frame is the one place in
    this module where that difference is measurable.
    """
    if radius <= 0:
        canvas.rect(cx, cy, 1, 1, value)
        return
    limit = radius * radius + radius
    for offset in range(-radius, radius + 1):
        span = math.isqrt(max(0, limit - offset * offset))
        canvas.rect(cx - span, cy + offset, 2 * span + 1, 1, value)


def _pen(size: int, weight: float) -> int:
    return max(1, round(size * weight / 2))


def text_width(text: str, size: int) -> int:
    """How wide `text` will be drawn at `size` pixels tall."""
    return sum(round(size * _ADVANCE.get(char, _DEFAULT_ADVANCE)) for char in text)


def fit(text: str, room: int, ceiling: int, floor: int = 8) -> int:
    """The largest size at which `text` still fits in `room` pixels.

    Returns `floor` when even that does not fit, and the caller decides whether
    to draw it anyway or drop it. This exists because every screen in this
    package sizes its clock against the space it happens to have, and a clock
    that overflows its box is silently clipped by `Canvas.pixel` — a plausible
    looking screen with a digit sliced off, which is the class of bug nobody
    reports.
    """
    if not text or room <= 0:
        return floor
    size = max(floor, ceiling)
    while size > floor and text_width(text, size) > room:
        size -= 1
    return size


def draw_char(canvas, x: int, y: int, size: int, char: str, value: int,
              weight: float = _WEIGHT) -> int:
    """One character, in a `size`-tall box with its top-left at `(x, y)`.

    Returns the advance, so a caller can lay out a string without asking this
    module where it got to.
    """
    pen = _pen(size, weight)

    if char == ":":
        # Two discs, positioned by eye against the digits rather than at the
        # thirds: a colon on the geometric centre of a clock sits visually low,
        # because the digits' own weight is in their bowls.
        for at in (0.34, 0.70):
            _disc(canvas, x + round(size * 0.17), y + round(size * at), pen, value)
        return round(size * _ADVANCE[":"])

    strokes = _STROKES.get(char)
    if strokes is None:
        strokes = _STROKES["?"]
        char = "?"

    # The pen is a disc of radius `pen`, so centres spaced `pen` apart overlap by
    # half and the stroke is continuous. Stepping a pixel at a time instead —
    # which is the obvious way to write this — stamps six times as many discs at
    # the size the clock is drawn and buys nothing visible at all.
    step = max(1, pen)

    for stroke in strokes:
        previous: tuple[int, int] | None = None
        for unit_x, unit_y in stroke:
            here = (x + round(unit_x * size * _ASPECT), y + round(unit_y * size))
            if here == previous:
                # Finely sampled arcs land on the same pixel repeatedly at small
                # sizes. Skipping those is most of the saving on a tray number.
                continue
            if previous is None:
                _disc(canvas, here[0], here[1], pen, value)
            else:
                distance = max(abs(here[0] - previous[0]), abs(here[1] - previous[1]))
                for i in range(1, max(1, -(-distance // step)) + 1):
                    count = max(1, -(-distance // step))
                    _disc(canvas,
                          previous[0] + (here[0] - previous[0]) * i // count,
                          previous[1] + (here[1] - previous[1]) * i // count,
                          pen, value)
            previous = here

    return round(size * _ADVANCE.get(char, _DEFAULT_ADVANCE))


def draw(canvas, x: int, y: int, size: int, text: str, value: int,
         weight: float = _WEIGHT) -> int:
    """A run of characters. Returns the x it ended at.

    Total, like everything else that puts ink on this panel: an unknown
    character becomes `?` rather than a gap or an exception, because a screen
    that raises is a dispenser that stopped dispensing over a string.
    """
    for char in str(text):
        x += draw_char(canvas, x, y, size, char, value, weight)
    return x


def draw_centred(canvas, x: int, y: int, width: int, size: int, text: str,
                 value: int, weight: float = _WEIGHT) -> None:
    """A run centred inside `width`, starting at `x`."""
    draw(canvas, x + (width - text_width(text, size)) // 2, y, size, text,
         value, weight)
