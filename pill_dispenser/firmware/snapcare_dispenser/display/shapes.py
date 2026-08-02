"""Circle, triangle, octagon, square — the half of the vocabulary that is not colour.

Why a shape as well as a colour
-------------------------------
The colour vocabulary this project has carried since the Arduino build does not
exist for somebody with deuteranopia, which is roughly one man in twelve — and
the whole premise of this device is that its user may not be able to fall back
on reading the screen instead.

So every state carries a **shape** as well, and the shape means the same thing
in both halves of the panel and to everybody:

    circle     safe      nothing is wrong; this is the machine working
    triangle   caution   something needs a person, but doses still happen
    octagon    avoid     the machine will not dispense until this is fixed
    square     pending   it has not happened yet — and no severity at all

That is the road-sign grammar on purpose. A circle, a triangle and an octagon
are distinguishable at a glance, at a distance, and by somebody who has never
seen this device before — which is more than can be said for any icon anybody
could draw.

The severity mapping is deliberately coarse. Three levels is what a person can
hold; five would put the burden back on reading.

The square is the odd one out, deliberately. A dose that is merely still to come
is not a level of severity, and spending one of the three on it would either
teach people to ignore that level or make an ordinary Tuesday look like a
warning. It is drawn from the same family so that it reads as part of the same
system, and it is kept out of `FOR_TONE` — and out of `health.shape_for`, and
out of any severity ordering — so that no state can quietly acquire it as one.

Solid, not outlined
-------------------
These used to be one-pixel outlines with a pictogram drawn inside them. They are
now filled, and nothing is drawn inside a shape any more.

The outline was spending the shape channel on something nobody could resolve. An
outline's ink is two pixels wide however large the shape is, and two pixels on
this panel is 0.41 arcmin at three metres — below the ~1 arcmin acuity floor, so
at the distance the hero band is designed to be read from the outline simply is
not there. A solid shape's difference from its neighbours instead scales with
its size: at r=29 a filled circle is 2629 lit pixels and a filled triangle 1127,
a 57 % difference in mass that survives being out of focus, seen sideways, and
photographed by somebody asking for help down a phone line.

Filled shapes are also *more* distinguishable at small radii than outlines are,
which is the opposite of the outline reasoning that produced the old
`MIN_RADIUS`, and it is what makes the 13 px status-bar chips work: at r=6 the
circle, the triangle and the octagon are 113, 52 and 129 lit pixels, with a 5 px
flat top on the octagon against the circle's single-pixel apex.

Drawn, not bitmapped
--------------------
These are geometry rather than pictures, so they are drawn at whatever radius
the panel gives them instead of being stored as art and scaled. A 16x16 glyph
blown up eight times has eight-pixel stair-steps on its edges; a circle computed
at r=29 does not, and the difference between a smooth octagon and a lumpy one is
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
    PENDING = "pending"  # square — no severity, see the module docstring


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
#: `BLOCKED` is the only octagon, because it is the only tone that means the tray
#: will not open at all — a clock nothing has vouched for, or no GPIO. It is the
#: level that means "this will not get better on its own", and it is worth
#: exactly as much as it is rare.
#:
#: `PENDING` appears nowhere in here on purpose: a tone is a state the machine is
#: *in*, and "not yet" is not one.
FOR_TONE: dict[Tone, Shape] = {
    Tone.DUE: Shape.SAFE,
    Tone.RELEASED: Shape.SAFE,
    Tone.SCHEDULE: Shape.SAFE,
    Tone.IDLE: Shape.SAFE,
    Tone.MISSED: Shape.CAUTION,
    Tone.NETWORK: Shape.CAUTION,
    Tone.BLOCKED: Shape.AVOID,
}


#: The smallest radius at which each **filled** shape still reads as itself.
#:
#: Re-measured for the solid renderer rather than carried across. The outline
#: numbers came from asking where the midpoint circle and the octagon rasterise
#: to *identical pixels*; filled shapes almost never do that, and they fail a
#: different way — the feature that names the shape shrinks until it is inside
#: the noise the raster is making anyway. Each number below is the first radius
#: from which that feature survives, checked at every radius up to 120:
#:
#:   circle   4   below it the disc has only three distinct row widths and comes
#:                out a lozenge: at r=3 it is 1, 5, 5, 7, 5, 5, 1 px wide, which
#:                is a diamond with a pip on it, not a disc
#:   triangle 6   at r=4 and r=5 the raster lands the base exactly as wide as
#:                the shape is tall (7x7 and 9x9). The road-sign triangle is
#:                squat — its base is 15 % wider than its height — and one that
#:                is not reads as an arrowhead, which invites a person to press
#:                something
#:   octagon  6   the first radius at which all eight of its edges are 4 px or
#:                more. Below it the corner cut is 3 px or less, and 3 px is the
#:                length of the steps the filled *circle's* own raster makes at
#:                the same radius (measured: 2-4 px for r <= 12), so the corner
#:                is not evidence of anything. At r=1 the filled octagon and the
#:                filled circle are the same five pixels
#:   square   3   it is told from the octagon by the corner, and at r=2 the
#:                octagon's cut is one pixel — 0.6 arcmin at a metre, under the
#:                ~1 arcmin acuity floor. At that size the two are one shape,
#:                and one of them carries no severity at all
#:
#: None of these criteria is monotone in the last pixel: the octagon's corner cut
#: dips back to 3 px at r=7, because `_snap` rounds the apothem and the corner
#: independently. That is a floor, not a promise about every radius above it —
#: and the radii this design actually draws at (6 on the bar, 10 on the strip, 13
#: for the keyline, 29 and 52 on the hero) are all clear of it.
#:
#: `draw` and `fill` clamp up to these rather than honouring a radius that cannot
#: carry the meaning. A shape one or two pixels larger than its box is a cosmetic
#: problem; a shape that reads as the wrong severity is not — an octagon that
#: looks like a circle says *safe* on a machine that will not dispense, which is
#: the one lie this vocabulary exists to prevent.
MIN_RADIUS: dict["Shape", int] = {}      # filled below, once Shape exists


#: A regular octagon is the intersection of a square and a diamond: every point
#: is within `_APOTHEM * r` of the centre in x and in y, and within
#: `(_APOTHEM + _CORNER) * r` in x plus y. Those two numbers are the flat and the
#: cut, and they are the same vertices `_regular(..., 8, pi/8)` gives the outline
#: — checked at every radius to 120 — so a filled octagon and an outlined one at
#: the same radius are the same octagon.
_APOTHEM = math.cos(math.pi / 8)   # 0.9239 — centre to the middle of a flat
_CORNER = math.sin(math.pi / 8)    # 0.3827 — centre to where the cut begins


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
    That is not a subtle artefact at r=10 on the strip: it is a shape that no
    longer reads as a triangle. Quantising before rounding collapses the pair
    back together.
    """
    return math.floor(round(value, 6) + 0.5)


def _regular(cx: int, cy: int, radius: int, sides: int,
             rotation: float) -> list[tuple[int, int]]:
    return [(_snap(cx + radius * math.cos(rotation + 2 * math.pi * i / sides)),
             _snap(cy + radius * math.sin(rotation + 2 * math.pi * i / sides)))
            for i in range(sides)]


def _half_side(radius: int) -> int:
    """Half the square's side. Shared with the octagon's flat on purpose.

    A square and an octagon at the same radius are then the same width and
    differ by exactly the corner cut, which is the difference that carries the
    meaning; sizing the square off its own corners instead would make "not yet"
    visibly smaller than "will not dispense" and invite the two to be read as a
    scale rather than as two different claims.
    """
    return _snap(radius * _APOTHEM)


class _Sink:
    """Collects pixels instead of drawing them. Enough of `Canvas` for the
    rasterisers above, which only ever call `pixel`."""

    def __init__(self):
        self.pixels: set[tuple[int, int]] = set()

    def pixel(self, x: int, y: int, _value: int) -> None:
        self.pixels.add((x, y))


def _scanlines(cy: int, radius: int, shape: Shape):
    """`(y, half)` per row: the run on row `y` covers `cx - half .. cx + half`.

    Expressed as a half-width about the centre rather than as a left and a right
    edge, because that is what makes every filled shape left-right symmetric by
    construction at every radius — the property the outline renderer has to
    reconstruct by mirroring a pixel set. A shape that leans is a shape that
    looks like a rendering fault, and on the strip it sits next to three others
    that would not lean.
    """
    if shape is Shape.SAFE:
        for dy in range(-radius, radius + 1):
            yield cy + dy, math.isqrt(radius * radius - dy * dy)

    elif shape is Shape.CAUTION:
        # Point up, and sat slightly low: an equilateral triangle's visual centre
        # is below its centroid, so one centred by arithmetic looks like it is
        # falling out of the top of its box. The vertices are the ones `_regular`
        # gives `draw`, so the solid triangle and the outlined one agree.
        drop = radius // 8
        half_base = _snap(radius * math.cos(math.pi / 6))
        height = radius + _snap(radius * math.sin(math.pi / 6))
        apex = cy + drop - radius
        for step in range(height + 1):
            # Integer interpolation from the apex to the base vertex, not a
            # float slope rounded per row: the two base vertices are then the
            # ones the outline uses and the last row is exactly the base.
            yield apex + step, step * half_base // height

    elif shape is Shape.AVOID:
        # Flat top and flat sides, which is the stop sign somebody has actually
        # seen — a vertex-up octagon reads as a circle.
        flat = _half_side(radius)
        corner = flat + _snap(radius * _CORNER)
        for dy in range(-flat, flat + 1):
            yield cy + dy, min(flat, corner - abs(dy))

    else:
        side = _half_side(radius)
        for dy in range(-side, side + 1):
            yield cy + dy, side


def fill(canvas: Canvas, cx: int, cy: int, radius: int, shape: Shape,
         value: int) -> None:
    """One **solid** shape, centred on `(cx, cy)`, `radius` to its furthest point.

    This is the primary renderer: everything the panel says about severity is a
    filled shape, and `draw` survives only for the one thing an outline means
    (see it for what that is).

    One `canvas.rect` per row rather than a pixel at a time, because `Rgb565.rect`
    slice-assigns a whole run in one step — the same trade `numerals._disc` makes.
    Measured on the 2629 pixels of an r=29 circle: 0.043 ms against 0.28 ms per
    pixel, and the gap widens with the radius because a row costs one slice
    assignment whatever its length. Either would fit inside the 38 ms the frame
    takes to reach the panel; this one also fits inside a Pi 3B being 10-20x
    slower than the machine those numbers were taken on.

    Rows off the panel are dropped here rather than left to the surface to clamp.
    `Canvas.rect` would clip them correctly, but a shape asked for at r=200 on a
    240-row panel would still cost 400 calls to find that out, and "clips" ought
    to be something this function does rather than something it gets away with.
    """
    radius = max(radius, MIN_RADIUS[shape])
    for y, half in _scanlines(cy, radius, shape):
        if 0 <= y < canvas.height:
            canvas.rect(cx - half, y, 2 * half + 1, 1, value)


def draw(canvas: Canvas, cx: int, cy: int, radius: int, shape: Shape,
         value: int, thickness: int = 1) -> None:
    """One **outlined** shape, centred on `(cx, cy)`, `radius` to its furthest point.

    Outlines survive for exactly one meaning, and it is worth stating because
    otherwise this function looks like a second way to draw the same thing:
    **solid means "we know", outline means "we do not"**. The only outlined shape
    on the panel is the square that marks a dose the ledger has no entry for —
    `store.read_events` returns `[]` for ever after one bad UTF-8 byte, so an
    empty ledger is a reachable state, and a past dose rendered as a confident
    solid mark would be a false claim about whether somebody took their medicine.

    `thickness` is concentric outlines. Two is what makes an unfilled shape read
    at all against a solid neighbour of the same size; one disappears.

    **Rasterised into a set and mirrored before it is drawn**, which is not
    fussiness. Bresenham walks from one endpoint to the other, so the triangle's
    two sloping sides — drawn apex-to-left and right-to-apex — do not land on
    reflected pixels. At r=40 nobody would notice; at r=10 on the strip one side
    has its steps a row above the other and the triangle visibly leans.
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
            _polygon(sink, _regular(cx, cy + inner // 8, inner, 3,
                                    -math.pi / 2), value)
        elif shape is Shape.AVOID:
            _polygon(sink, _regular(cx, cy, inner, 8, math.pi / 8), value)
        else:
            # Concentric squares step by their own half-side, not by the radius:
            # one pixel off the radius is 0.92 px off the half-side, so two rings
            # derived from the radius can land on the same box (r=7 and r=6 both
            # give 6) and a thickness of 2 comes out 1 px thick.
            half = _half_side(radius) - step
            if half < 1:
                break
            _polygon(sink, [(cx - half, cy - half), (cx + half, cy - half),
                            (cx + half, cy + half), (cx - half, cy + half)],
                     value)

    for x, y in sink.pixels | {(2 * cx - x, y) for x, y in sink.pixels}:
        canvas.pixel(x, y, value)


MIN_RADIUS.update({
    Shape.SAFE: 4,
    Shape.CAUTION: 6,
    Shape.AVOID: 6,
    Shape.PENDING: 3,
})
