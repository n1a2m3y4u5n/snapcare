"""The bottom band: today, as a row of marks with the times under them.

What it is for
--------------
The hero band above says one thing at three metres — the next dose, or the one
thing that is wrong. This band is the other half of the sentence: *and here is
the rest of the day*. It is what makes a green panel mean "one dose owed, two
already taken" instead of just "a dose is owed", and it is the only surface on
the device that remembers this morning.

That memory is why the alert screens keep it. A missed dose holds the hero for
five minutes and then gives it back; the amber triangle stays in this band until
midnight, so nobody has to be standing in the kitchen at the right moment.

Ordered columns, not a time axis
--------------------------------
The marks are evenly spaced in the order the doses fall, and their real times
are printed underneath. The obvious alternative — position on a true 24-hour
rail — was rejected after being drawn: doses cluster (08:00, 08:30) and a rail
has to push overlapping marks apart, so the axis stops telling the truth at
exactly the clustering where somebody most wants to judge a gap. On an ordinary
08:00 / 13:00 / 20:00 day it also spends the first third of the width on hours
nothing is scheduled.

Ordered columns are exactly truthful about *order*, use the whole width, and
put the real answer in numerals under each mark. The cost is stated rather than
hidden: **nothing in this design may ever ask a person to judge a duration from
this band.** Two marks 40 px apart can be five minutes or nine hours.

The marks never shrink
----------------------
A mark carries severity, which is the meaning; a printed time is the reference
somebody reads once they have decided to care. When the two cannot both fit —
six doses or more — the *times* go and the marks re-centre in the band at their
full size. A row of eight 21 px marks read from a doorway is worth more than a
row of eight 11 px times nobody can read from anywhere.

Solid means we know, outline means we do not
--------------------------------------------
Four of the five dose states are a solid colour-coded shape. The fifth,
`unknown` — a dose in the past that the ledger has no entry for — is the one
outlined shape on the whole panel, and it prints no time at all.

It has to exist. `store.read_events` returns `[]` for ever after a single bad
UTF-8 byte, so "the ledger knows nothing about this morning" is a reachable
state and was once a permanent one. Rendering that dose as `taken` is a
confident false claim that somebody took their medicine, and rendering it as
`upcoming` is a confident false claim that they still can. Both are worse than
any layout fault this file could contain, so the shape channel carries the
distinction and carries it for a reader who can use no colour at all.

Anything this module does not recognise lands there too. A future commit that
teaches `health` a sixth dose state and forgets this table gets "no claim
made", never a wrong one.

The divider, and why it is white
--------------------------------
Three pixels of pure achromatic white split the row into what has happened and
what has not. It is the one element here with no hue, on purpose: "where are we
in the day" is the question a colour-blind reader and a badly-lit kitchen both
still need answered. It is not drawn when the clock is untrusted or `now` is
empty, because it is a claim about where we are in the day and this device does
not make claims it cannot support.

The keyline
-----------
The dose the hero is showing gets its mark drawn twice — once a little larger in
`TEXT`, once at size in its own colour. That is the tether between the two
bands, so a green hero and a green mark are visibly the *same* dose rather than
two things that happen to be green, and it is the only ring on the panel.
"""
from __future__ import annotations

from typing import NamedTuple

from . import numerals, shapes
from .canvas import Canvas, Rgb565
from .health import Dose, Health
from .shapes import Shape

__all__ = ["STRIP_H", "STRIP_Y", "MAX_MARKS", "draw", "key"]


#: The most marks drawn at once; beyond it the band shows a window (see
#: `_window`). Eight is a judgement and not a derivation, so it is worth the
#: line: at eight the pitch is 37 px against a 21 px mark, which is the last
#: count where the row still reads as separate objects a person can take in at a
#: glance rather than as a dotted line they would have to count. Nine trays is
#: also more than this machine has, so a day past eight is already a day of
#: split doses that nobody reads from a doorway.
MAX_MARKS = 8

#: How many outlined squares stand in for a day with no doses in it at all.
#:
#: A blank band would read as a broken panel — the surface, the rule and the
#: hero above it all still there, and a hole where the day goes. Three marks at
#: the three-dose spacing show the band's grammar without claiming a count, in
#: the one ink that means "no claim". Whether this machine has no prescription
#: or has simply finished for the day is answered by the bar's TRAY chip, which
#: is where that fact lives; saying it twice in two vocabularies is how the two
#: come to disagree.
_EMPTY_MARKS = 3

#: Every time in the band is sized against this one string rather than against
#: its own dose, because a row where `11:00` is drawn larger than `08:00` reads
#: as a fault rather than as a proportional face. It is also the widest string
#: the face can be asked for: every digit advances 0.72 of its height except
#: `1`, which advances 0.52.
_SPECIMEN = "00:00"

#: `(shape, mark colour, ink for the printed time)` per dose state.
#:
#: Three channels, and only one of them is hue. Bright ink on the time means
#: this dose needs somebody or is the next one; dim means settled or distant.
#: The pair this table cannot separate on lightness alone is `missed` (L 0.2266)
#: against `upcoming` (L 0.2499) — 1.10x, which is nothing in greyscale — so
#: there the triangle against the square is the whole separation. That is
#: acceptable and it is written down: the two differ in hue in a way deuteranopes
#: keep, and a missed dose is simultaneously the hero.
#:
#: `waiting` and `taken` are both circles, and deliberately: both mean the
#: machine did its job. What separates them is green against blue, and the
#: divider standing to the right of one and the left of the other.
_MARK: dict[str, tuple[Shape, str, str]] = {
    "taken": (Shape.SAFE, "MARK_TAKEN", "TEXT_DIM"),
    "waiting": (Shape.SAFE, "MARK_DUE", "TEXT"),
    "missed": (Shape.CAUTION, "MARK_MISSED", "TEXT"),
    "upcoming": (Shape.PENDING, "MARK_PENDING", "TEXT_DIM"),
}

#: The fifth state, and the fallback for anything unrecognised. The empty ink
#: name is what stops a time being printed under it: see the module docstring
#: for why a dose we know nothing about must not be given a legible time it
#: might be read as having been taken at.
_UNKNOWN: tuple[Shape, str, str] = (Shape.PENDING, "TEXT_MUTE", "")


class _Band(NamedTuple):
    """Every number this band is laid out from, derived from one surface.

    The panel is 320x240 and will be for the life of this board, but nothing
    here is written as 320 or 240: a layout that carries its own arithmetic can
    be checked against the design, and one made of literals can only be checked
    against a photograph. The values for the panel as fitted are in `_band`.
    """

    y: int            # first row of the band
    height: int
    pad: int          # the universal margin; the columns live inside it
    inner: int        # width the columns share
    rule: int         # the thinnest mark the band makes: divider and chevrons
    mark_r: int
    mark_cy: int      # centre row for a mark with a time under it
    alone_cy: int     # centre row for a mark with no time under it
    time_y: int       # cap row of the printed times
    time_max: int
    time_min: int
    chev_left: int    # x of the "there is more this way" chevrons
    chev_right: int


def _band(width: int, height: int) -> _Band:
    """The band's geometry on a `width` x `height` surface.

    On the panel as fitted (320x240) this is: band y 184..239, columns from
    x 12 to x 307, marks r=10 centred on y 200 with their times' caps at y 214
    (20 px tall, bottom row 233), and marks alone centred on y 212.

    The two rows are what set the mark's radius, not the other way round. The
    band gives up `pad // 2` at the top and bottom and `pad // 3` between the
    rows, and what is left splits evenly into a mark row and a time row — so a
    time is never taller than the mark it belongs to, and the mark is never
    small enough to need one.

    Recomputed per frame rather than cached: a dozen integer divisions against
    the 9 ms this band costs to reach the panel is not a saving worth a cache
    that could go stale against the surface it was computed for.
    """
    pad = height // 20                       # 12
    band_h = height * 7 // 30                # 56
    band_y = height - band_h                 # 184
    inset = pad // 2                         # 6, above the marks and below the times
    gap = pad // 3                           # 4, between the two rows
    rule = pad // 4                          # 3
    clear = pad // 6                         # 2, chevron to column box
    time_max = (band_h - 2 * inset - gap) // 2   # 20
    mark_r = time_max // 2                   # 10
    mark_cy = band_y + inset + mark_r        # 200
    inner = width - 2 * pad                  # 296
    return _Band(
        y=band_y,
        height=band_h,
        pad=pad,
        inner=inner,
        rule=rule,
        mark_r=mark_r,
        mark_cy=mark_cy,
        alone_cy=band_y + band_h // 2,       # 212
        time_y=mark_cy + mark_r + gap,       # 214
        time_max=time_max,
        # A time smaller than this is 2.5 mm on the glass — under the 1.5 m
        # reading distance this band is declared at, and the point at which the
        # marks are better off with the whole band to themselves.
        time_min=time_max - inset,           # 14
        chev_left=pad - clear - rule,        # 7
        chev_right=pad + inner + clear,      # 310
    )


#: The band on the panel this device has, for the modules that need to know
#: where it starts without holding a canvas — `indicators` pushes exactly these
#: rows down the bus when only the day has changed. Taken from the surface
#: class's own defaults rather than restated, so there is one place that knows
#: how big the panel is.
_DESIGN = _band(Rgb565.DEFAULT_WIDTH, Rgb565.DEFAULT_HEIGHT)

STRIP_H = _DESIGN.height
STRIP_Y = _DESIGN.y


def _mark_for(state: object) -> tuple[Shape, str, str]:
    """Shape, colour and time-ink for a dose state. Never fails to answer.

    Anything not in the table — a state some later commit invents, a `None`, a
    value that arrived over the wire — is `unknown`, which draws an outline and
    prints nothing. That direction is the safe one and the other is not: the
    default has to be "we are making no claim about this dose", because the
    alternative default is a confident mark that says a dose was taken.
    """
    if isinstance(state, str):
        return _MARK.get(state, _UNKNOWN)
    return _UNKNOWN


def _passed(doses: tuple[Dose, ...]) -> int:
    """How many of `doses` are behind us — anything not still to come.

    Counted from the states rather than from the clock on purpose. The clock is
    already the reason the divider may not be drawn at all; deriving the
    position from it as well would let a device with a trusted clock and a stale
    ledger draw a divider that disagrees with the marks either side of it.
    """
    return sum(1 for dose in doses if dose.state != "upcoming")


def _window(day: tuple[Dose, ...]) -> tuple[tuple[Dose, ...], bool, bool]:
    """`(the doses to draw, more before, more after)`.

    Days longer than `MAX_MARKS` are windowed rather than crushed, because the
    alternative is marks that shrink — and the marks are the meaning. The window
    is centred on the divider, which is to say on now: half of it is what has
    already happened today and half is what has not, which is the split somebody
    standing in front of the machine is asking about. It slides to the ends
    rather than running past them, so the first and last doses of a long day are
    each reachable by simply being early or late.
    """
    if len(day) <= MAX_MARKS:
        return day, False, False
    start = min(max(_passed(day) - MAX_MARKS // 2, 0), len(day) - MAX_MARKS)
    return day[start:start + MAX_MARKS], start > 0, start + MAX_MARKS < len(day)


def _time_size(band: _Band, columns: int) -> int:
    """The size for every printed time, or 0 when they do not fit.

    One size for the whole row, computed from the widest time the face can draw
    rather than from the times actually on the day — otherwise a day of `11:00`s
    would print larger than a day of `08:00`s and the band would look like it
    had been laid out twice.

    Returning 0 rather than a size nobody can read is the rule this band is
    built on. `numerals.fit` hands back its floor when even that overflows, so
    the answer is checked rather than trusted: a silently clipped time is a
    plausible-looking screen with a digit sliced off it, which is the class of
    fault nobody reports.
    """
    room = columns - band.pad // 2
    size = numerals.fit(_SPECIMEN, room, band.time_max, band.time_min)
    return size if numerals.text_width(_SPECIMEN, size) <= room else 0


def _focal_index(doses: tuple[Dose, ...], focal: object) -> int:
    """Which drawn mark gets the keyline, or -1 for none.

    The hero names its dose either by handing over the `Dose` itself or by the
    `"08:00"` it has printed across the panel, because those are the two things
    a screen has: `idle` and `due` hold the whole dose, `missed` is given only
    the time the event carried.

    A focal the window left out, or one this band cannot match, simply gets no
    ring. A ring on the wrong mark would say the hero is talking about a dose it
    is not, and an unringed mark says nothing at all — of the two failures only
    one is a lie.
    """
    if focal is None:
        return -1
    for index, dose in enumerate(doses):
        if dose is focal or dose == focal or dose.at == focal:
            return index
    return -1


def _mark(canvas: Canvas, cx: int, cy: int, radius: int, shape: Shape,
          solid: bool, value: int) -> None:
    """One dose mark. Solid when we know what happened to it, outlined when not.

    Thickness 2 on the outline, because one pixel beside a solid neighbour of
    the same size reads as an absence of ink rather than as a shape — and this
    is the one mark whose whole job is to be noticed and not believed.
    """
    if solid:
        shapes.fill(canvas, cx, cy, radius, shape, value)
    else:
        shapes.draw(canvas, cx, cy, radius, shape, value, thickness=2)


def _divider(canvas: Canvas, band: _Band, theme: dict[str, int],
             doses: tuple[Dose, ...], columns: int) -> None:
    """Three pixels of white on the boundary between done and not done.

    Clamped to the ends of the column box rather than allowed to sit outside it:
    at the start of the day it is a left-hand rule and at the end of it a
    right-hand one, which are both readable statements, where a divider half off
    the panel is a rendering fault.
    """
    edge = band.pad + _passed(doses) * columns - 1
    dx = min(max(edge, band.pad), band.pad + band.inner - band.rule)
    canvas.rect(dx, band.y + band.rule, band.rule,
                band.height - 2 * band.rule, theme["TEXT"])


def _chevron(canvas: Canvas, band: _Band, theme: dict[str, int], x: int,
             cy: int) -> None:
    """Three pixels in the margin: there is more of the day this way.

    Wordless because every alternative is a word or a glyph nobody would learn
    for the two days a year a schedule runs past eight doses, and mute because
    it is furniture: what it points at is not news, it is context.

    Set against the marks' own centre row rather than against a fixed one, so it
    lines up with the row it is talking about whether or not the times are drawn.
    """
    canvas.rect(x, cy - band.mark_r, band.rule, 2 * band.mark_r + 1,
                theme["TEXT_MUTE"])


def _time(canvas: Canvas, band: _Band, left: int, columns: int, size: int,
          at: object, value: int) -> None:
    """One printed time, centred under its mark — if it fits under its mark.

    A time wider than its column is dropped rather than clipped or shrunk. It is
    the same rule the whole row already follows one level up, applied to the one
    dose whose `at` is not the `HH:MM` this band was measured for: the times are
    the reference and the marks are the meaning, so the reference is what gives
    way. Shrinking this one instead would print one dose's time smaller than its
    neighbours', which reads as emphasis on the wrong dose.
    """
    text = str(at)
    room = columns - band.pad // 2
    if not text or numerals.text_width(text, size) > room:
        return
    numerals.draw_centred(canvas, left, band.time_y, columns, size, text, value)


def _empty(canvas: Canvas, band: _Band, theme: dict[str, int]) -> None:
    """A day with nothing in it. See `_EMPTY_MARKS` for why it is not blank."""
    columns = band.inner // _EMPTY_MARKS
    for index in range(_EMPTY_MARKS):
        cx = band.pad + index * columns + columns // 2
        _mark(canvas, cx, band.alone_cy, band.mark_r, Shape.PENDING, False,
              theme["TEXT_MUTE"])


def draw(canvas: Canvas, health: Health, theme: dict[str, int],
         focal: object = None) -> None:
    """Paint the schedule band — every row from `STRIP_Y` to the bottom.

    `focal` names the dose the hero band is showing, as a `Dose` or as the
    `"08:00"` string it printed; that mark gets the keyline and nothing else on
    the panel gets a ring. `None` — every screen whose hero is not about one
    particular dose — is an ordinary frame.

    Total, like everything that puts ink on this panel: a `Health` with no day,
    a day of a hundred doses, a dose whose state is a word this file has never
    heard of and a time that is not a time all land on a frame. This is called
    from the scheduler's own thread and a dispenser that stops dispensing over a
    malformed string would be a far worse fault than an ugly band.

    Drawing order is the plane, then the divider, then the marks and their
    times, then the chevrons. The divider goes down before the marks so that if
    some future geometry ever puts the two in the same pixels the mark wins:
    the mark is the meaning and the divider is the reference.
    """
    band = _band(canvas.width, canvas.height)
    canvas.rect(0, band.y, canvas.width, band.height, theme["STRIP_BG"])
    canvas.rect(0, band.y, canvas.width, 1, theme["RULE"])

    doses, before, after = _window(tuple(health.day))
    if not doses:
        _empty(canvas, band, theme)
        return

    columns = band.inner // len(doses)
    size = _time_size(band, columns)
    # With no times to sit above, the marks take the whole band and centre in
    # it. A row of marks pinned to the top of an otherwise empty band looks like
    # the times failed to draw rather than like a decision.
    cy = band.mark_cy if size else band.alone_cy
    keyline = _focal_index(doses, focal)

    if health.now and health.clock_source != "untrusted":
        _divider(canvas, band, theme, doses, columns)

    for index, dose in enumerate(doses):
        left = band.pad + index * columns
        cx = left + columns // 2
        mark = _mark_for(dose.state)
        shape, colour, ink = mark
        # Identity, not a fifth state name: `_mark_for` hands back this exact
        # tuple for everything it does not recognise, so there is one place that
        # decides what "we are making no claim" is and no second list to drift.
        solid = mark is not _UNKNOWN
        if index == keyline:
            _mark(canvas, cx, cy, band.mark_r + band.rule, shape, solid,
                  theme["TEXT"])
        _mark(canvas, cx, cy, band.mark_r, shape, solid, theme[colour])
        if size and ink:
            _time(canvas, band, left, columns, size, dose.at, theme[ink])

    if before:
        _chevron(canvas, band, theme, band.chev_left, cy)
    if after:
        _chevron(canvas, band, theme, band.chev_right, cy)


def key(health: Health) -> tuple:
    """What this band draws, as a value the repaint check can compare.

    Only the facts that reach the glass. `Dose.tray` is not in here because this
    band never prints a tray number, and `Dose.minutes` is not because the band
    orders by position and prints `at` — including either would repaint 36 kB of
    schedule band for a change nobody could see.

    `now` is in here as a *bool* and not as the string. The divider's position
    comes from the dose states, so the clock only decides whether it is drawn at
    all; keying on `"12:34"` would push this band down the bus sixty times an
    hour to draw exactly the same pixels.

    `focal` is deliberately absent: it belongs to the hero's plan, and the plan
    is compared separately. A band redrawn on its own is a band whose screen did
    not change, so its keyline cannot have moved either.
    """
    return (tuple((dose.at, dose.state) for dose in health.day),
            bool(health.now) and health.clock_source != "untrusted")
