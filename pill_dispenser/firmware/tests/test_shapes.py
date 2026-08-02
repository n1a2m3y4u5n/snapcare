"""The shape code: circle, triangle, octagon, square.

This is the half of the vocabulary that survives a colour-blind reader and a
doorway, so it is the half that has to be right. The failures here are not
crashes — they are a triangle that reads as a circle at the size it is actually
drawn, or a shape that leans because the rasteriser is not symmetric, and both
of those quietly remove the severity channel that colour cannot carry for
roughly one man in twelve.

Losing the monochrome panel has not made any of that less load-bearing. It has
made it easier to *assume* it is, because there is no longer a surface where the
picture visibly had to carry everything — so every assertion below is about the
silhouette and none of them is about a colour.

What is exercised here is `draw`, the outline renderer, because that is what
these tests were written against and outlines are still what the panel means by
"we do not know". The severity marks are `shapes.fill` now and the filled shapes
have their own measured areas and minimum radii to pin; that suite is a later
commit, not this one.
"""
from __future__ import annotations

import pytest

from snapcare_dispenser.display import shapes
from snapcare_dispenser.display.canvas import Rgb565, Tone
from snapcare_dispenser.display.shapes import Shape


def lit(canvas: Rgb565) -> set[tuple[int, int]]:
    """Every pixel that was drawn on, as coordinates.

    A fresh surface is all zero bytes, so "drawn on" is "not zero" — which holds
    only because each test below puts one shape in one non-zero value on a
    canvas nothing else has touched. It reads the buffer rather than asking the
    canvas for a pixel back, because there is no such accessor: a read path on
    the drawing surface would exist for the tests alone and the panel would
    never use it.
    """
    buf = canvas.buffer()
    stride = canvas.width * 2
    return {(x, y)
            for y in range(canvas.height)
            for x in range(canvas.width)
            if buf[y * stride + x * 2] or buf[y * stride + x * 2 + 1]}


RADII = [6, 9, 13, 17, 24, 40]


# ── they must be symmetric, or they lean ────────────────────────────────────

@pytest.mark.parametrize("shape", list(Shape))
@pytest.mark.parametrize("radius", RADII)
def test_every_shape_is_left_right_symmetric(shape, radius):
    """Bresenham walks from one endpoint to the other, so a triangle's two
    sloping sides do not land on reflected pixels unless something forces it.

    At r=40 nobody notices. At r=13 one side has its steps a row above the other
    and the triangle visibly leans, which is around the size the strip and the
    status bar draw their marks at.
    """
    canvas = Rgb565(128, 96)
    shapes.draw(canvas, 63, 47, radius, shape, 1)
    pixels = lit(canvas)
    assert pixels, "nothing was drawn"
    assert pixels == {(126 - x, y) for x, y in pixels}


# ── they must be distinguishable from each other ────────────────────────────

@pytest.mark.parametrize("radius", RADII)
def test_the_shapes_are_not_each_other(radius):
    # Four of them now. The square joined for "not yet", and it is told from the
    # octagon by nothing but the corner cut, which is the pair to watch.
    canvas_by_shape = {}
    for shape in Shape:
        canvas = Rgb565(128, 96)
        shapes.draw(canvas, 63, 47, radius, shape, 1)
        canvas_by_shape[shape] = lit(canvas)
    assert len(set(map(frozenset, canvas_by_shape.values()))) == len(Shape)


@pytest.mark.parametrize("radius", RADII)
def test_a_triangle_is_narrow_at_the_top_and_wide_at_the_bottom(radius):
    """The property that makes it a triangle rather than a blob, asserted at
    every size it is actually drawn at.

    A shape whose top and bottom rows are the same width is a circle or an
    octagon, whatever the code that drew it intended.
    """
    canvas = Rgb565(128, 96)
    shapes.draw(canvas, 63, 47, radius, Shape.CAUTION, 1)
    pixels = lit(canvas)
    rows = sorted({y for _x, y in pixels})

    def width_at(y):
        xs = [x for x, yy in pixels if yy == y]
        return max(xs) - min(xs) + 1

    assert width_at(rows[0]) <= 3, "the apex must be a point"
    assert width_at(rows[-1]) > radius, "the base must span the shape"


@pytest.mark.parametrize("radius", RADII)
def test_an_octagon_has_a_flat_top(radius):
    """A vertex-up octagon reads as a circle. The flat top and flat sides are
    what make it the stop sign somebody has actually seen."""
    canvas = Rgb565(128, 96)
    shapes.draw(canvas, 63, 47, radius, Shape.AVOID, 1)
    pixels = lit(canvas)
    top = min(y for _x, y in pixels)
    xs = [x for x, y in pixels if y == top]
    assert max(xs) - min(xs) + 1 >= radius * 0.6, "the top row is not flat"


def test_a_circle_has_no_flat_top():
    """The check above, inverted — otherwise it would pass on a circle too."""
    canvas = Rgb565(128, 96)
    shapes.draw(canvas, 63, 47, 24, Shape.SAFE, 1)
    pixels = lit(canvas)
    top = min(y for _x, y in pixels)
    xs = [x for x, y in pixels if y == top]
    assert max(xs) - min(xs) + 1 < 24 * 0.6


# ── they must stay inside the canvas ────────────────────────────────────────

def test_a_shape_larger_than_the_canvas_is_clipped_not_fatal():
    canvas = Rgb565(72, 40)
    shapes.draw(canvas, 36, 20, 200, Shape.AVOID, 1, thickness=4)
    assert len(canvas.buffer()) == 72 * 40 * 2


@pytest.mark.parametrize("shape", list(Shape))
def test_a_shape_asked_for_too_small_is_grown_rather_than_faked(shape):
    """Below its minimum radius a shape stops reading as itself — measured, not
    assumed: at r=3, 5 and 6 the outlined octagon rasterises to the *identical
    pixels* as the outlined circle.

    An octagon that looks like a circle says `safe` on a machine that will not
    dispense, which is the one lie this vocabulary exists to prevent. So `draw`
    clamps up. A shape two pixels larger than its box is cosmetic; a shape that
    reads as the wrong severity is not.
    """
    canvas = Rgb565(64, 64)
    shapes.draw(canvas, 32, 32, 1, shape, 1)
    pixels = lit(canvas)
    assert pixels, "a shape asked for at r=1 must still be drawn legibly"

    reference = Rgb565(64, 64)
    shapes.draw(reference, 32, 32, shapes.MIN_RADIUS[shape], shape, 1)
    assert pixels == lit(reference)


@pytest.mark.parametrize("radius", range(2, 12))
def test_an_octagon_is_never_a_circle_at_any_requested_radius(radius):
    """The specific accessibility failure this clamp exists for."""
    circle, octagon = Rgb565(64, 64), Rgb565(64, 64)
    shapes.draw(circle, 32, 32, radius, Shape.SAFE, 1)
    shapes.draw(octagon, 32, 32, radius, Shape.AVOID, 1)
    assert lit(circle) != lit(octagon)


# ── the meaning, which is the part that must never drift ────────────────────

def test_the_octagon_is_reserved_for_a_machine_that_will_not_dispense():
    """Three levels is what a person can hold, and the top one only means
    something if it is rare. A triangle three times a day teaches somebody to
    ignore triangles; an octagon on an ordinary dose would do the same to the
    one shape that means "this will not get better on its own".

    It used to be reserved by being in no tone's map at all, which worked while
    amber was doing double duty for "a dose was missed" and "the machine is
    stopped". `Tone.BLOCKED` split that pair, so the octagon now has exactly one
    tone and the assertion is that it still has exactly one.
    """
    assert shapes.FOR_TONE[Tone.BLOCKED] is Shape.AVOID
    assert [tone for tone, shape in shapes.FOR_TONE.items()
            if shape is Shape.AVOID] == [Tone.BLOCKED]


def test_a_dose_waiting_for_you_is_not_a_warning():
    assert shapes.FOR_TONE[Tone.DUE] is Shape.SAFE
    assert shapes.FOR_TONE[Tone.RELEASED] is Shape.SAFE


def test_a_missed_dose_and_a_missing_network_are_both_caution():
    assert shapes.FOR_TONE[Tone.MISSED] is Shape.CAUTION
    assert shapes.FOR_TONE[Tone.NETWORK] is Shape.CAUTION


def test_every_tone_has_a_shape():
    """A tone with no shape is a screen that loses its severity channel for
    everybody who cannot use the colour it is drawn in."""
    for tone in Tone:
        assert tone in shapes.FOR_TONE, tone
