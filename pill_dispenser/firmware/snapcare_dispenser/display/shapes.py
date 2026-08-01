"""Circle, triangle, octagon — the half of the vocabulary that is not colour.

Why a shape as well as a colour
-------------------------------
The five-colour vocabulary this project has carried since the Arduino build
works on the LCD and does not exist at all on the OLED, which has one ink. It
also does not exist for somebody with deuteranopia, which is roughly one man in
twelve — and the whole premise of this device is that its user may not be able
to fall back on reading the screen instead.

So every screen carries a **shape** as well, and the shape means the same thing
on both panels and to everybody:

    circle     safe      nothing is wrong; this is the machine working
    triangle   caution   something needs a person, but doses still happen
    octagon    avoid     the machine will not dispense until this is fixed

That is the road-sign grammar on purpose. A circle, a triangle and an octagon
are distinguishable at a glance, at a distance, in one bit, and by somebody who
has never seen this device before — which is more than can be said for any icon
anybody could draw.

The mapping is deliberately coarse. Three levels is what a person can hold; five
would put the burden back on reading.

Drawn, not bitmapped
--------------------
These are geometry rather than pictures, so they are drawn at whatever radius
the panel gives them instead of being stored as art and scaled. A 16x16 glyph
blown up eight times has eight-pixel stair-steps on its edges; a circle computed
at r=60 does not, and the difference between a smooth octagon and a lumpy one is
exactly the difference between "that is a stop sign" and "that is a blob".
"""
from __future__ import annotations

import math
from enum import Enum

from .canvas import Canvas, Tone


class Shape(Enum):
    SAFE = "safe"        # circle
    CAUTION = "caution"  # triangle
    AVOID = "avoid"      # octagon


#: What each state of the machine means, in the three-level grammar.
#:
#: `DUE` is a **circle** and that is the judgement call in this table. A dose
#: waiting for you is the machine doing its job, not a warning — putting a
#: triangle on it would spend the caution level on the single most ordinary
#: event in the device's life, and a person who sees a warning three times a day
#: stops reading warnings.
#:
#: `MISSED` is a triangle: a dose did not happen and somebody should know, but
#: the machine is still working and the next dose will still be offered.
#:
#: Nothing here is an octagon. The octagon is reserved for `blocked` — a clock
#: nothing has vouched for, or no GPIO — because those are the states where the
#: tray will not open at all, and it is the only level that means "this will not
#: get better on its own".
FOR_TONE: dict[Tone, Shape] = {
    Tone.DUE: Shape.SAFE,
    Tone.RELEASED: Shape.SAFE,
    Tone.SCHEDULE: Shape.SAFE,
    Tone.IDLE: Shape.SAFE,
    Tone.MISSED: Shape.CAUTION,
    Tone.NETWORK: Shape.CAUTION,
}


#: The smallest radius at which each shape still reads as itself.
#:
#: Measured, not guessed: below r=7 the octagon's eight flats are shorter than
#: the midpoint circle's own steps and the two rasterise to **identical pixels**
#: at r=3, 5 and 6. An octagon that looks like a circle does not merely fail to
#: communicate — it says *safe* on a machine that will not dispense, which is
#: the one lie this vocabulary exists to prevent.
#:
#: `draw` therefore clamps up to these rather than honouring a radius that
#: cannot carry the meaning. A shape one or two pixels larger than its box is a
#: cosmetic problem; a shape that reads as the wrong severity is not.
MIN_RADIUS: dict["Shape", int] = {}      # filled below, once Shape exists


def _line(canvas: Canvas, x0: int, y0: int, x1: int, y1: int, value: int) -> None:
    """Bresenham. Integer only, so it is the same on every panel."""
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    err = dx + dy
    while True:
        canvas.pixel(x0, y0, value)
        if x0 == x1 and y0 == y1:
            return
        doubled = 2 * err
        if doubled >= dy:
            err += dy
            x0 += sx
        if doubled <= dx:
            err += dx
            y0 += sy


def _circle(canvas: Canvas, cx: int, cy: int, radius: int, value: int) -> None:
    """One-pixel outline, by the midpoint algorithm."""
    if radius < 1:
        return
    x, y, err = radius, 0, 1 - radius
    while x >= y:
        for px, py in ((x, y), (y, x), (-y, x), (-x, y),
                       (-x, -y), (-y, -x), (y, -x), (x, -y)):
            canvas.pixel(cx + px, cy + py, value)
        y += 1
        if err < 0:
            err += 2 * y + 1
        else:
            x -= 1
            err += 2 * (y - x) + 1


def _polygon(canvas: Canvas, points: list[tuple[int, int]], value: int) -> None:
    for index, point in enumerate(points):
        nxt = points[(index + 1) % len(points)]
        _line(canvas, point[0], point[1], nxt[0], nxt[1], value)


def _snap(value: float) -> int:
    """Round symmetrically, so a shape that ought to be symmetric is.

    `cos(pi/6)` and `cos(5*pi/6)` differ in the last bit, which is nothing until
    the two land either side of a .5 boundary — and then the triangle's two base
    vertices round to different rows and its base is drawn as a diagonal step.
    That is not a subtle artefact at 128x64: it is a shape that no longer reads
    as a triangle. Quantising before rounding collapses the pair back together.
    """
    return math.floor(round(value, 6) + 0.5)


def _regular(cx: int, cy: int, radius: int, sides: int,
             rotation: float) -> list[tuple[int, int]]:
    return [(_snap(cx + radius * math.cos(rotation + 2 * math.pi * i / sides)),
             _snap(cy + radius * math.sin(rotation + 2 * math.pi * i / sides)))
            for i in range(sides)]


class _Sink:
    """Collects pixels instead of drawing them. Enough of `Canvas` for the
    rasterisers above, which only ever call `pixel`."""

    def __init__(self):
        self.pixels: set[tuple[int, int]] = set()

    def pixel(self, x: int, y: int, _value: int) -> None:
        self.pixels.add((x, y))


def draw(canvas: Canvas, cx: int, cy: int, radius: int, shape: Shape,
         value: int, thickness: int = 1) -> None:
    """One shape, centred on `(cx, cy)`, `radius` to its furthest point.

    `thickness` is concentric outlines. Two or three is what makes a shape
    readable across a room on the LCD; one is right on a 128x64 panel, where a
    thick outline eats the space the tray number needs.

    **Rasterised into a set and mirrored before it is drawn**, which is not
    fussiness. Bresenham walks from one endpoint to the other, so the triangle's
    two sloping sides — drawn apex-to-left and right-to-apex — do not land on
    reflected pixels. At r=40 nobody would notice; at r=13 on a 128x64 panel one
    side has its steps a row above the other and the triangle visibly leans.
    Unioning with the mirror costs a few hundred set operations per repaint and
    makes the shape symmetric by construction at every size.
    """
    radius = max(radius, MIN_RADIUS[shape])
    sink = _Sink()
    for step in range(max(1, thickness)):
        inner = radius - step
        if inner < 2:
            break
        if shape is Shape.SAFE:
            _circle(sink, cx, cy, inner, value)
        elif shape is Shape.CAUTION:
            # Point up, and sat slightly low: an equilateral triangle's visual
            # centre is below its centroid, so one centred by arithmetic looks
            # like it is falling out of the top of its box.
            _polygon(sink, _regular(cx, cy + inner // 8, inner, 3,
                                    -math.pi / 2), value)
        else:
            # Flat top and flat sides, which is the stop sign somebody has
            # actually seen — a vertex-up octagon reads as a circle.
            _polygon(sink, _regular(cx, cy, inner, 8, math.pi / 8), value)

    for x, y in sink.pixels | {(2 * cx - x, y) for x, y in sink.pixels}:
        canvas.pixel(x, y, value)


def fill_hint(shape: Shape) -> int:
    """How much of the shape's bounding box the shape actually covers, x100.

    Used to size whatever is drawn *inside* it. A triangle at radius r has less
    than half the usable area of a circle at the same radius, so a glyph that
    fits in the circle spills out of the triangle — which is how a caution
    screen ends up looking like a smudge.
    """
    return {Shape.SAFE: 70, Shape.CAUTION: 45, Shape.AVOID: 82}[shape]


MIN_RADIUS.update({
    Shape.SAFE: 3,
    Shape.CAUTION: 4,
    Shape.AVOID: 7,
})
