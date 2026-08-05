"""Three days, side by side — everything on the panel that is not the bar.

What this replaced
------------------
`strip.py` drew one row of marks along the bottom: today, in the machine's own
severity vocabulary, with a hero band above it showing the next dose as a large
clock. Two bands, two grammars, and between them they could answer exactly one
question — "what is happening now".

The question people actually ask a pill box is *"did I take last night's"*. That
one had no answer here at all. The whole day above the current minute was
already drawn, but yesterday existed only in the phone app, which is precisely
the object the person this device is for does not have in their hand.

So the panel below the bar is now a calendar: yesterday, today, tomorrow, each
with its doses as checkboxes. It answers "did I take it", "is one coming" and
"what did I miss" from a doorway, in one picture, with no state to be in and
nothing that appears and disappears.

Why three days and not seven
----------------------------
Width. A dose row is a 14 px box and a time in a 5x7 face at double size, which
is 85 px of the 320 this panel has; three columns of that fit with the margins
this case needs and four do not. Three is also the honest span of what a person
standing at the machine can act on — yesterday is the one they might have
missed, tomorrow is the one they might be about to travel away from — and a week
of columns 45 px wide would be a picture of a schedule rather than a thing to
read.

Today is in the middle and never moves. The same argument the status bar makes
about its six slots applies with more force here: a column that changes position
cannot be learnt, and this is the element somebody glances at from three metres
without stopping.

The eight-row cap, and what happens past it
-------------------------------------------
Eight rows fit. A day with more doses than that has to lose some, and *which*
ones it loses is a decision this file makes explicitly rather than by truncating
whichever end is convenient:

  * the default window is the **last** eight, because the doses nearest the end
    of the day are the ones still to come, and a person looking at the panel in
    the evening is looking for what is left rather than for what happened at
    breakfast;
  * unless the first dose that is **not taken** falls above that window, in
    which case the window scrolls up by the smallest amount that puts it on the
    screen. That dose is the one somebody has to act on — it is the missed
    breakfast, or the one that is ringing right now — and a calendar that hides
    it while showing five settled ticks below it is worse than useless.

Hidden rows are said, never silent. Three dots above or below the column mean
there are doses on the other side of them; a panel that quietly showed eight of
eleven would be a panel claiming the day is shorter than it is.
"""
from __future__ import annotations

import math

from . import PANEL_HEIGHT, PANEL_WIDTH, bar, checkbox, font
from .canvas import Canvas
from .health import Health

__all__ = ["CAL_Y", "CAL_H", "MAX_ROWS", "COLUMNS", "draw", "key", "rows",
           "window"]

W = PANEL_WIDTH
H = PANEL_HEIGHT

#: The calendar owns everything under the bar. There is no third band any more:
#: the hero was a second rendering of one dose, and the one frame that genuinely
#: needs the panel to itself — a dose ringing — takes it, over the top of this.
CAL_Y = bar.BAR_H                               # 36
CAL_H = H - CAL_Y                               # 204

#: Three columns: yesterday, today, tomorrow. Matches `health.CALENDAR_REACH`,
#: and a mismatch is caught at import below rather than by a column drawn off
#: the right-hand edge.
COLUMNS = 3

#: Side inset and the gutter between columns. The gutter is narrower than the
#: inset on purpose — the columns are one object with divisions in it, not three
#: objects side by side, and equal spacing everywhere reads as the second.
PAD = 6
GUTTER = 4
COL_W = (W - 2 * PAD - (COLUMNS - 1) * GUTTER) // COLUMNS   # 100

#: The date line at the top of each column, and the box drawn behind today's.
#: 5x7 at double size: 14 rows, which is the smallest a date can be and still be
#: read at arm's length, and `AUG 05` at that scale is 72 px of the column's 100.
DATE_SCALE = 2
DATE_H = font.HEIGHT * DATE_SCALE               # 14
#: The highlight's own box, with the date centred in it.
HEAD_H = DATE_H + 8                             # 22
HEAD_Y = CAL_Y + 3
#: How round the corners are. Four pixels on a 22 px box is the smallest radius
#: that reads as deliberate rather than as a rendering fault, and the largest
#: that does not turn a 84x22 box into a lozenge.
HEAD_R = 4

#: The band that says "there are more doses above/below this column". Six rows,
#: which is three 2 px dots with a row of air — enough to be seen and not enough
#: to be mistaken for a dose.
MORE_H = 6
DOT = 2

ROWS_Y = HEAD_Y + HEAD_H + MORE_H               # 67
#: The most dose rows a column can show. Eight, and the module docstring argues
#: which eight.
MAX_ROWS = 8
ROW_H = (CAL_H - (ROWS_Y - CAL_Y) - MORE_H) // MAX_ROWS     # 21

#: Inside a row: the box, then the time.
BOX = 14
BOX_X = 6
TIME_X = BOX_X + BOX + 5                        # 25
TIME_SCALE = 2

if font.text_width("00:00", TIME_SCALE) + TIME_X > COL_W:
    raise ValueError("the calendar's time does not fit its column")
if ROW_H < BOX:
    raise ValueError("the calendar's rows are shorter than a checkbox")


def COL_X(index: int) -> int:  # noqa: N802 - a geometry constant that takes an index
    """The left edge of column `index`, 0 being yesterday."""
    return PAD + index * (COL_W + GUTTER)


#: Which state wins when two trays are due at one minute and they disagree.
#:
#: Worst-first, and the order is the whole of the honesty here. A row that
#: stands for two doses may only claim a tick when **both** of them were taken;
#: any other combination has to draw as the worse one, because a person reading
#: a tick has been told the eight o'clock medicines are done.
#:
#: `unknown` sits above `taken` for the same reason it does everywhere else in
#: this firmware: one dose settled and one the ledger lost is not a settled
#: morning.
_WORST_FIRST: tuple[str, ...] = ("missed", "waiting", "upcoming", "unknown", "taken")


def rows(doses: tuple) -> tuple:
    """One entry per **time**, not per tray. What the column actually draws.

    Two trays due at eight o'clock are one line on this panel. The person in
    front of it is being told when to take their medicines, and "08:00" twice
    over is not two facts — every hopper drops into the same cup, so at eight
    o'clock they go to the machine once and take what comes out. The tray
    numbers that made those two rows different are not on this panel at all any
    more, so without this the calendar prints the same time twice with no way to
    tell why, which reads as a fault.

    A merged row takes the *worst* state of the doses under it — see
    `_WORST_FIRST`. One tray taken and one missed is a missed row, and that is
    the direction the error has to fall: a tick standing for a dose that never
    went in is the one claim this codebase will not make.

    Returns objects with `at` and `state` and nothing else, because that is all
    a row is. They are not `Dose`s: a `Dose` has a tray, and the whole point of
    this function is that a row no longer has one.
    """
    merged: dict[str, str] = {}
    order: list[str] = []
    for dose in doses:
        at = str(getattr(dose, "at", ""))
        state = str(getattr(dose, "state", ""))
        if at not in merged:
            merged[at] = state
            order.append(at)
            continue
        merged[at] = min(
            (merged[at], state),
            key=lambda value: _WORST_FIRST.index(value)
            if value in _WORST_FIRST else len(_WORST_FIRST))
    return tuple(_Row(at, merged[at]) for at in order)


class _Row:
    """One drawn line: a time and the state of everything scheduled at it."""

    __slots__ = ("at", "state")

    def __init__(self, at: str, state: str):
        self.at = at
        self.state = state

    def __eq__(self, other):
        return (isinstance(other, _Row) and self.at == other.at
                and self.state == other.state)

    def __repr__(self):
        return f"_Row({self.at!r}, {self.state!r})"


def window(doses: tuple, limit: int = MAX_ROWS) -> tuple[int, int]:
    """`(start, hidden_below)` — which slice of a day's doses to draw.

    Separated from the drawing and returned as plain numbers because it is the
    one piece of judgement in this file, and a rule that lives inside a paint
    loop is a rule nobody can test at eleven doses without a panel.

    The rule, in order:

      1. everything fits — draw it all;
      2. otherwise take the **last** `limit`, which is where the rest of the day
         is;
      3. unless the first not-taken dose is above that, in which case start
         there instead — the smallest scroll that puts it on the screen.

    "Not taken" rather than "waiting": a missed dose is as much a thing somebody
    has to see as one that is ringing, and a window that scrolled only for the
    ringing one would hide this morning's cross behind this evening's ticks.
    """
    total = len(doses)
    if total <= limit:
        return 0, 0

    start = total - limit
    for index, dose in enumerate(doses):
        if getattr(dose, "state", "") != "taken":
            if index < start:
                start = index
            break
    return start, total - start - limit


def _rounded(canvas: Canvas, x: int, y: int, w: int, h: int, radius: int,
             value: int) -> None:
    """A filled rectangle with its corners taken off.

    Drawn as rows rather than as a rectangle plus four arcs: at this radius the
    corner is four rows, and computing an inset per row is both less code and
    exactly right, where four quarter-circle stamps leave the seam visible at
    the top of a 22 px box.
    """
    radius = max(0, min(radius, w // 2, h // 2))
    for row in range(h):
        # How far this row is into the corner, 0 once past it.
        depth = max(radius - row, radius - (h - 1 - row), 0)
        # The chord of a circle of `radius` at `depth` from its centre line.
        inset = radius - math.isqrt(max(0, radius * radius - depth * depth))
        canvas.rect(x + inset, y + row, w - 2 * inset, 1, value)


def _dots(canvas: Canvas, left: int, y: int, value: int) -> None:
    """Three dots, centred in a column — "there are more of these"."""
    span = 3 * DOT + 2 * DOT
    start = left + (COL_W - span) // 2
    for index in range(3):
        canvas.rect(start + index * 2 * DOT, y + (MORE_H - DOT) // 2,
                    DOT, DOT, value)


def _column(canvas: Canvas, theme: dict, index: int, day) -> None:
    """One day: its date, its highlight if it is today, and its doses."""
    left = COL_X(index)
    today = bool(getattr(day, "today", False))

    label = str(getattr(day, "label", ""))[:8]
    text_w = font.text_width(label, DATE_SCALE)
    if today:
        box_w = min(COL_W, text_w + 12)
        _rounded(canvas, left + (COL_W - box_w) // 2, HEAD_Y, box_w, HEAD_H,
                 HEAD_R, theme["TODAY"])
        # Black on the pastel red is 9.76:1. The light ink on it would be
        # 1.79:1 — the two are near enough the same lightness that the date
        # would vanish into its own highlight.
        ink = theme["BLACK"]
    else:
        ink = theme["TEXT_DIM"]
    font.draw(canvas, left + (COL_W - text_w) // 2, HEAD_Y + (HEAD_H - DATE_H) // 2,
              label, ink, DATE_SCALE)

    doses = rows(tuple(getattr(day, "doses", ()) or ()))
    start, below = window(doses)
    if start:
        _dots(canvas, left, HEAD_Y + HEAD_H, theme["TEXT_MUTE"])
    if below:
        _dots(canvas, left, ROWS_Y + MAX_ROWS * ROW_H, theme["TEXT_MUTE"])

    for row, dose in enumerate(doses[start:start + MAX_ROWS]):
        y = ROWS_Y + row * ROW_H
        state = checkbox.FOR_DOSE.get(str(getattr(dose, "state", "")),
                                      checkbox.UNKNOWN)
        checkbox.draw(canvas, left + BOX_X, y + (ROW_H - BOX) // 2, BOX,
                      state, theme)
        # A taken dose's time is dim and everything else's is bright. The tick
        # has already said it is settled, so a second bright number would make
        # a finished morning compete with the dose that is actually owed.
        font.draw(canvas, left + TIME_X, y + (ROW_H - font.HEIGHT * TIME_SCALE) // 2,
                  str(getattr(dose, "at", ""))[:5],
                  theme["TEXT_DIM"] if state == checkbox.TAKEN else theme["TEXT"],
                  TIME_SCALE)


def draw(canvas: Canvas, health: Health, theme: dict, *,
         highlight: str = "") -> None:
    """Paint the calendar, y `CAL_Y`..239. Total: any `Health` lands on a frame.

    `highlight` is a palette name or empty — `NEW_PLAN` for the ten seconds
    after a schedule arrives, `MISSED` for the dwell after a dose expires. It is
    a frame around the whole calendar rather than anything inside it, because
    what changed is either the *plan* (possibly on all three days at once) or a
    row that is already drawn as a red cross, and marking it twice would be the
    panel saying one thing in two vocabularies. It replaced a pair of screens
    that covered the calendar entirely to announce that the calendar had
    changed, which is the wrong way round: the answer to "a new schedule
    arrived" is to show the new schedule.
    """
    canvas.rect(0, CAL_Y, canvas.width, CAL_H, theme["INK"])

    days = tuple(getattr(health, "days", ()) or ())
    for index in range(COLUMNS):
        if index:
            # A hairline between columns, in the same grey the bar's rule uses.
            # Without it three columns of black read as one field with things
            # floating in it.
            canvas.rect(COL_X(index) - GUTTER // 2 - 1, CAL_Y + 2,
                        1, CAL_H - 4, theme["RULE"])
        _column(canvas, theme, index,
                days[index] if index < len(days) else _EMPTY)

    if highlight:
        # Two rows rather than one. A single row against `INK` is 1.09:1 on this
        # panel — the same measurement that made the bar's rule two pixels — and
        # a highlight nobody can see is a highlight that is not there.
        value = theme[highlight]
        canvas.rect(0, CAL_Y, canvas.width, CAL_H, value, fill=False)
        canvas.rect(1, CAL_Y + 1, canvas.width - 2, CAL_H - 2, value, fill=False)


class _Empty:
    """A column for a machine that has not said what day it is.

    Not a blank region: the columns keep their geometry and simply have nothing
    in them, so a device that has just booted looks like a calendar waiting for
    a reading rather than like a panel with a hole in it.
    """

    label = ""
    today = False
    doses: tuple = ()


_EMPTY = _Empty()


def key(health: Health) -> tuple:
    """Everything this band renders, for the dirty-region compare.

    The **merged rows**, which is precisely what is on the glass — not the doses
    behind them. `tray` rides inside a `Dose` and is not drawn anywhere on this
    panel any more, so comparing the doses whole would repaint the calendar
    every time a schedule was reloaded onto different hoppers at identical
    times; and comparing them unmerged would repaint it when one of two doses
    sharing a minute changed state without changing the row.
    """
    return tuple(
        (str(getattr(day, "label", "")), bool(getattr(day, "today", False)),
         tuple((row.at, row.state)
               for row in rows(tuple(getattr(day, "doses", ()) or ()))))
        for day in getattr(health, "days", ()) or ())
