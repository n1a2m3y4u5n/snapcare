"""The checkbox, which is now the whole dose vocabulary.

Why a checkbox
--------------
Every dose this machine has an opinion about is drawn as one of these, at three
sizes: 14 px in the calendar, and the whole middle of the panel when a dose is
ringing. That is a deliberate reduction from what came before — a circle, a
triangle, an octagon and a square, in four colours, with a printed time under
each — and the argument for it is that the old vocabulary had to be *learnt*.
Nothing in a kitchen tells you a triangle means "missed".

A checkbox does not have to be learnt. A box with a tick in it is done and a box
with nothing in it is not, and that is understood by people who cannot read the
time under it, in every country this device might end up in, without anybody
explaining it. It is also the one picture that means the same thing at 14 px on
a calendar row and at 96 px under somebody's finger, which is what lets the
alarm frame and the calendar be the same idea at two sizes rather than two
pictures somebody has to connect.

The three states, and the fourth
--------------------------------
    taken      a green tick        the pill went in
    missed     a red cross         it did not, and the window has shut
    pending    an empty grey box   it has not come round yet

The fourth is `unknown`: a dose in the past that the ledger says nothing about,
because `read_events` legitimately comes back empty after one bad byte on the
card. It draws as an empty box like `pending`, but in the mute ink, and that
choice is the same one this codebase makes everywhere else — **it must never
render as taken.** An empty box is not a claim that the dose was missed; it is
the absence of a tick, which is exactly what the machine knows. A green tick on
no evidence is the worst error this firmware recognises.

Colour is not the only channel here either, and for once that came free: the
tick and the cross are different *shapes*, and a person who cannot use the
red-green difference reads them as easily as anybody else. That was not true of
the four solid marks this replaced, where two of the four states differed in hue
alone at 21 px.

How it is drawn
---------------
Strokes with a round pen, the way `numerals.py` draws a digit and for the same
reason: a tick scaled up from a bitmap is a tick with stair-steps, and this is
the one picture on the panel that is drawn at 14 px and at 96 px from the same
source. The pen is sized from the box, so the 96 px box is not a magnified 14 px
box — it is the same drawing computed at the size it is shown.
"""
from __future__ import annotations

__all__ = ["TAKEN", "MISSED", "PENDING", "UNKNOWN", "STATES", "FOR_DOSE",
           "draw", "ink_for"]

#: What a box can say. `pending` and `unknown` look nearly the same on purpose
#: and are separate values because the *reason* the box is empty is different,
#: and one of the two must never become a tick by accident.
TAKEN = "taken"
MISSED = "missed"
PENDING = "pending"
UNKNOWN = "unknown"

STATES: tuple[str, ...] = (TAKEN, MISSED, PENDING, UNKNOWN)

#: `Dose.state` — five values, from `health.py` — to the four a box can draw.
#:
#: `waiting` maps to `pending` rather than to a state of its own, and that is
#: the whole of what the calendar says about a dose that is ringing right now.
#: It is not the calendar's job to shout: the alarm frame is over the top of it,
#: filling the panel with a box the size of a hand, and a second treatment down
#: in a 14 px row would be a fact stated twice in two vocabularies.
FOR_DOSE: dict[str, str] = {
    "taken": TAKEN,
    "missed": MISSED,
    "waiting": PENDING,
    "upcoming": PENDING,
    "unknown": UNKNOWN,
}

#: The ink each state's mark is drawn in, as palette names. The box's own
#: outline and its infill are separate — see `draw`.
_MARK_INK: dict[str, str] = {
    TAKEN: "OK",
    MISSED: "FAULT",
    PENDING: "TEXT_MUTE",
    UNKNOWN: "TEXT_MUTE",
}

#: The outline. A checked box keeps a grey frame rather than taking the mark's
#: colour: the frame is the *box*, which is the same object whatever happened to
#: the dose, and a green frame around a green tick is one shape in one colour
#: that reads as a blob at 14 px.
_FRAME_INK: dict[str, str] = {
    TAKEN: "TEXT_DIM",
    MISSED: "TEXT_DIM",
    PENDING: "TEXT_DIM",
    UNKNOWN: "TEXT_MUTE",
}

#: The grey an empty box is filled with, so that "nothing here yet" is a
#: deliberate object rather than a hole in the screen. On the calendar's black
#: this is 1.62:1 against the surface — furniture, not a message, which is
#: exactly what an unticked box is.
_INFILL = "RULE"

#: Stroke weight, as a fraction of the box's side. The same reasoning as
#: `numerals._WEIGHT`: below about a tenth the tick goes spindly across a room,
#: and above a fifth the cross closes up into a square.
_WEIGHT = 0.14

#: Where the tick's three points sit in a unit box, and the cross's four. Both
#: are inset from the frame rather than touching it — a mark that runs into its
#: own box is a smudge at 14 px.
_TICK = ((0.22, 0.52), (0.42, 0.72), (0.78, 0.28))
_CROSS = (((0.26, 0.26), (0.74, 0.74)), ((0.74, 0.26), (0.26, 0.74)))


def ink_for(state: str) -> str:
    """The palette name a state's mark is drawn in. For tests and for the alarm."""
    return _MARK_INK.get(state, _MARK_INK[UNKNOWN])


def _pen(size: int) -> int:
    return max(1, round(size * _WEIGHT))


def _line(canvas, x0: int, y0: int, x1: int, y1: int, width: int, value: int) -> None:
    """A thick line, stamped as squares along the path.

    Squares rather than the discs `numerals.py` uses. A tick is two straight
    strokes meeting at a sharp corner, where a round pen rounds off the very
    point that makes it read as a tick; and at 14 px a disc pen is three pixels
    across, where the difference between round and square terminals is not
    visible at all and the square is half the arithmetic.
    """
    steps = max(abs(x1 - x0), abs(y1 - y0), 1)
    half = width // 2
    for i in range(steps + 1):
        canvas.rect(x0 + (x1 - x0) * i // steps - half,
                    y0 + (y1 - y0) * i // steps - half,
                    width, width, value)


def draw(canvas, x: int, y: int, size: int, state: str, theme: dict) -> None:
    """One box, `size` square, top-left at `(x, y)`.

    Total: a state this module has never heard of draws as `unknown`, which is
    an empty box. A screen that raised over a dose state would be a dispenser
    that stopped dispensing over a spelling.
    """
    if state not in _MARK_INK:
        state = UNKNOWN

    frame = max(1, size // 10)
    canvas.rect(x, y, size, size, theme[_FRAME_INK[state]])
    inner = size - 2 * frame
    if inner > 0:
        # An empty box is grey inside and a marked one is the surface it stands
        # on, so the tick and the cross are drawn against the darkest thing
        # available rather than against a grey that halves their contrast.
        canvas.rect(x + frame, y + frame, inner, inner,
                    theme[_INFILL] if state in (PENDING, UNKNOWN) else theme["INK"])

    if state not in (TAKEN, MISSED):
        return

    value = theme[_MARK_INK[state]]
    pen = _pen(size)
    if state == TAKEN:
        points = [(x + round(ux * size), y + round(uy * size)) for ux, uy in _TICK]
        for start, end in zip(points, points[1:]):
            _line(canvas, start[0], start[1], end[0], end[1], pen, value)
        return

    for (ax, ay), (bx, by) in _CROSS:
        _line(canvas, x + round(ax * size), y + round(ay * size),
              x + round(bx * size), y + round(by * size), pen, value)


def draw_tick(canvas, x: int, y: int, size: int, value: int, frac: int,
              steps: int) -> None:
    """The tick, part-drawn — `frac` of `steps` of the way along its path.

    This is the release animation and it is the one moving thing on the panel
    that is not a warning. A tick that simply appears is indistinguishable from
    a repaint; a tick that is *drawn*, in the direction a person would draw it,
    reads as the machine answering the press — which is the entire job of the
    two seconds between somebody touching the glass and a pill landing in the
    cup.

    The path is the same `_TICK` the finished box uses, so the animation cannot
    drift from the thing it ends on.
    """
    steps = max(1, steps)
    frac = max(0, min(steps, frac))
    pen = _pen(size)
    points = [(x + round(ux * size), y + round(uy * size)) for ux, uy in _TICK]

    # The two strokes are not the same length, so the sweep is over their
    # combined length rather than one stroke each: a tick whose short leg took
    # half the time reads as a hesitation.
    lengths = [max(abs(b[0] - a[0]), abs(b[1] - a[1]))
               for a, b in zip(points, points[1:])]
    total = sum(lengths) or 1
    drawn = total * frac // steps

    for (ax, ay), (bx, by), length in zip(points, points[1:], lengths):
        if drawn <= 0:
            return
        if drawn >= length:
            _line(canvas, ax, ay, bx, by, pen, value)
            drawn -= length
            continue
        _line(canvas, ax, ay,
              ax + (bx - ax) * drawn // length, ay + (by - ay) * drawn // length,
              pen, value)
        return
