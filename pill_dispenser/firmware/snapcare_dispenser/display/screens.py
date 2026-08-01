"""One frame per state. This is the interface, and the rest is plumbing.

What this file is for
---------------------
The dispenser has five things to say about a dose, inherited from the LED ring
it replaced, and a screen is only allowed to replace a ring if it keeps saying
them the same way:

    green   a dose is due — press the button, or release it in the app
    blue    released — the pills are in the cup
    amber   the dose went untaken, or its window closed
    violet  a new schedule was accepted
    cyan    put me on a WiFi network

It also has three things to say about *itself* — is it alive, is it alright, is
it reachable — which the ring could never say at all and which somebody walking
over to the machine is usually there to ask. `idle`, `status` and `wifi` answer
those, and between them they are what is on the panel for twenty-three hours of
every day.

The person these screens are drawn for cannot be assumed to read. So the colour
carries the state, a shape carries the severity, a picture carries the subject,
and the only text anywhere is a tray number, a clock, an SSID and an IP address.

The temptation this file exists to resist is turning that into a text display.
There is now a 320x240 panel with room for a paragraph, and a paragraph would be
easier to write than `glyphs.PRESS`. It would also be invisible to the one
person the whole project is built around. Nothing here renders a sentence.

Where the shape goes, and why it is the frame
---------------------------------------------
`shapes.py` gives every state a circle, a triangle or an octagon. On the OLED
that shape is the *only* thing separating "fine" from "fetch somebody" from
"nothing is coming out"; on the LCD it is redundant with the colour, and being
redundant is the entire point — it is what keeps the machine legible to the one
man in twelve who cannot use the colour.

There were three places to put it: around the picture, beside it, or as a badge
in a corner. It goes **around the picture**, and the picture shrinks to fit
inside it. Three reasons, in order of weight:

  A road sign is one object, not two. Everybody in front of this machine has
  spent their life reading circles, triangles and octagons with a pictogram
  inside them, and none of them has ever seen a stop sign with a small stop sign
  in the corner. Severity and subject are one fact and the eye should collect
  them in one saccade.

  A badge is the first thing to disappear. From the far side of a room the
  panel is a silhouette, and at that distance a corner badge sized to not crowd
  anything is a smudge, while a frame around the picture is the outline of the
  whole screen. Severity is exactly the thing that must survive being far away.

  It costs the pictogram and that is the right way for the trade to cut. A hand
  inside a circle is smaller than a hand alone. But if the pictogram is legible
  and the severity is not, somebody reads "press the button" off a machine that
  has stopped dispensing — and the octagon means the button will not do
  anything.

Two screens break the rule, and both breakages are arguments for it.

  `network` puts the triangle *beside* the arcs rather than around them,
  standing in the empty column the centred glyph leaves. That screen exists so
  somebody can copy an SSID into a phone, the name owns the full width, and a
  frame would have taken a third of it. The shape here is talking to whoever
  walks past — "this is not finished" — not to the person typing.

  When a sign is too small to hold its pictogram at scale 1, the pictogram steps
  *outside* and stands next to it rather than the sign shrinking to accommodate
  it. That is what happens on the 128x32 strip, where a triangle big enough to
  read is a triangle with no room inside it. The sign never gives up size; the
  picture moves.

`blocked` is the one screen where the shape gets the whole panel. There is
nothing else worth saying on it.

Sizing, and why nothing is a constant
-------------------------------------
The same code lays out 72x40, 128x32, 128x64 and 320x240, so every dimension is
derived from `canvas.width` and `canvas.height`. Glyphs are 16x16 scaled by
whole numbers; text is 5x7 scaled by whole numbers; the layout picks the largest
scale that fits and centres what is left over. A hardcoded pixel here is a
screen that is correct on the OLED on the bench and wrong on the LCD.

Two things branch, and only these two:

  `canvas.width` and `canvas.height` decide how much room there is, which is
  arithmetic.

  `canvas.colour` decides how much of the width the *picture* gets. On the
  ILI9341 the background is already green or amber, so the sign is a caption for
  a message the panel has delivered; on the SSD1306 there is one ink and the
  sign **is** the message, so it gets an extra eighth of the width.

Nothing branches on which panel is fitted, and nothing may: the drivers are
interchangeable and a screen that knows which one it is on will be wrong the
first time somebody swaps a panel.

What 72x40 does not get
-----------------------
A 72x40 OLED has 2,880 pixels and a 16x16 glyph is a tenth of them, so a screen
that tries to show everything there shows nothing. What is dropped is written at
each screen, but the rule behind every one of those decisions is the same: the
shape stays, the number stays, the *reassurance* goes. A healthy subsystem is
the first thing off the panel, because a row of ticks tells nobody anything they
could not have assumed.

Failure
-------
These functions are total. Any `tray`, `when`, `ssid` or `health` — including
`None`, an empty string, an int, or a value the app should never have sent —
lands on a frame rather than an exception, because these are called from the
scheduler's own thread and a dispenser that stops dispensing because an SSID had
an emoji in it is a worse bug than an ugly screen. Where something genuinely
does not fit, the picture wins and the text is dropped: the picture is what the
person reads.
"""
from __future__ import annotations

from typing import NamedTuple

from . import font, glyphs, shapes
from .canvas import Canvas, Paint, Tone
from .health import Health, shape_for
from .shapes import Shape

__all__ = ["due", "released", "missed", "schedule", "network", "idle",
           "status", "wifi", "blocked"]


class _Box(NamedTuple):
    """A rectangle to lay something out inside. Absolute canvas coordinates."""

    x: int
    y: int
    w: int
    h: int


#: Which of three shapes outranks which. Used in exactly one place — see
#: `_worst` — and it is worth naming rather than inlining, because getting the
#: order wrong is a screen that shows a circle on a machine that will not open a
#: tray.
_SEVERITY = {Shape.SAFE: 0, Shape.CAUTION: 1, Shape.AVOID: 2}


def _worst(*candidates: Shape) -> Shape:
    """The most severe of several shapes.

    **No screen may show a shape gentler than the machine's own.** The `wifi`
    screen has a local opinion — the radio is associated, so a circle — and the
    machine may still be refusing to dispense for a reason that has nothing to
    do with the radio. Showing the local opinion there would put a circle in
    front of somebody standing at a device that will not give them their
    medication, which is the one lie this vocabulary must never tell.
    """
    return max(candidates, key=_SEVERITY.__getitem__)


# ── measurement ─────────────────────────────────────────────────────────────

def _margin(canvas: Canvas) -> int:
    """Border kept clear on all four sides.

    A sixteenth of the short side, which is 4 px on the 128x64 OLED and 15 px on
    the LCD. It is not only taste: both panels are mounted behind a bezel in the
    printed case, and a glyph that runs to the edge of the framebuffer is a
    glyph with a slice missing once it is screwed down.
    """
    return max(1, min(canvas.width, canvas.height) // 16)


def _gap(canvas: Canvas) -> int:
    """Space between two things that are not the same thing."""
    return max(1, min(canvas.width, canvas.height) // 24)


def _inner(canvas: Canvas) -> _Box:
    margin = _margin(canvas)
    return _Box(margin, margin, canvas.width - 2 * margin, canvas.height - 2 * margin)


def _fit(width: int, height: int, unit_w: int, unit_h: int) -> int:
    """Largest whole-number scale at which `unit_w` x `unit_h` fits.

    Returns 0 when it does not fit even once, which every caller treats as
    "draw nothing" rather than "draw it anyway and let it spill". Clipping is
    silent on both surfaces — `Canvas.pixel` discards out-of-range writes — so a
    layout that overflows produces a plausible-looking screen with a corner
    sliced off, and that is exactly the class of bug nobody reports.
    """
    if unit_w <= 0 or unit_h <= 0:
        return 0
    return max(0, min(width // unit_w, height // unit_h))


# ── the sign: a shape with a picture inside it ──────────────────────────────

def _sign_plan(canvas: Canvas, height: int, avail_w: int, shape: Shape,
               art: tuple[int, ...] | None) -> tuple[int, int, int]:
    """`(side, inside scale, outside scale)` — the arithmetic a sign is laid out by.

    Split out from `_sign` because two callers need the width *before* anything
    is drawn, to centre the sign on a screen that is not built in columns. Doing
    the sums twice in two places is how a sign ends up half a pixel off centre
    on one panel and nobody can say why.
    """
    side = min(height, avail_w)
    radius = (side - 1) // 2
    # Under seven pixels across there is no shape left to tell apart — a circle,
    # a triangle and an octagon are the same smudge — so nothing is drawn at all.
    # A blank corner is honest; a smudge that could be any of the three is not.
    if radius < 3:
        return 0, 0, 0
    if art is None:
        return side, 0, 0

    # `fill_hint` is the shape's own answer to "how much of my bounding box can
    # something live in", and it is deliberately not shaded down by the outline
    # thickness here. Doing that costs a whole scale step at several panel sizes
    # — a 32 px hand becomes a 16 px hand on the 128x64 OLED — and buys a one
    # pixel gap nobody can see. The glyphs are drawn with light corners so the
    # small overlap lands on empty rows.
    room = shapes.fill_hint(shape) * 2 * radius // 100
    inside = _fit(room, room, glyphs.SPAN, glyphs.ROWS)
    if inside:
        return side, inside, 0
    # It will not go in. The sign keeps its size and the picture steps outside —
    # see the module docstring. On a panel with no room beside it either, the
    # picture is simply gone and the shape stands alone, which still says the
    # only thing that must survive.
    return side, 0, _fit(avail_w - side - _gap(canvas), height,
                         glyphs.SPAN, glyphs.ROWS)


def _sign_width(canvas: Canvas, height: int, avail_w: int, shape: Shape,
                art: tuple[int, ...] | None) -> int:
    """What `_sign` will take, without drawing it. For centring a sign on a
    screen that has no data column to push it against."""
    side, _inside, outside = _sign_plan(canvas, height, avail_w, shape, art)
    if not side:
        return 0
    return side + (_gap(canvas) + glyphs.SPAN * outside if outside else 0)


def _sign(canvas: Canvas, x: int, y: int, height: int, avail_w: int,
          shape: Shape, art: tuple[int, ...] | None, paint: Paint,
          struck: bool = False) -> int:
    """Draw the road sign at `(x, y)`, `height` tall. Returns the width it took.

    The sign is always square and always as large as the shorter of the height
    it was given and the width it was allowed. It never shrinks to accommodate
    what is drawn inside it, which is the whole discipline here: given the
    choice between a smaller triangle with a cross in it and a full-size
    triangle with the cross beside it, the second is the one somebody can read
    from a doorway.
    """
    side, inside, outside = _sign_plan(canvas, height, avail_w, shape, art)
    if not side:
        return 0

    radius = (side - 1) // 2
    # One-pixel outlines on the OLED, two or three on the LCD. A thick outline on
    # a 128x64 panel eats the space the tray number needs; a thin one at r=90 on
    # the LCD is a hairline that vanishes across a room.
    thickness = max(1, radius // 24)
    cx, cy = x + side // 2, y + height // 2
    shapes.draw(canvas, cx, cy, radius, shape, paint.fg, thickness)

    if inside:
        # A triangle's usable area sits below its centre, and `shapes.draw` has
        # already nudged the triangle itself down by an eighth of its radius.
        # Without matching that here the pictogram floats up into the apex and
        # its top corners cross the sloping sides.
        drop = radius // 5 if shape is Shape.CAUTION else 0
        _stamp(canvas, cx - glyphs.SPAN * inside // 2,
               cy + drop - glyphs.ROWS * inside // 2, art, paint, inside, struck)
        return side
    if outside:
        _stamp(canvas, x + side + _gap(canvas),
               y + (height - glyphs.ROWS * outside) // 2, art, paint,
               outside, struck)
        return side + _gap(canvas) + glyphs.SPAN * outside
    return side


def _stamp(canvas: Canvas, x: int, y: int, art: tuple[int, ...], paint: Paint,
           scale: int, struck: bool = False) -> None:
    """One glyph, optionally negated by a bar drawn across it.

    The bar is two blits and not one. Drawing it in the ink alone lands it on
    pixels that are already lit wherever the glyph is solid — over `CLOUD` or
    `BATTERY` it disappears entirely, and the screen then shows a clean picture
    meaning the opposite of what it says. `SLASH_MASK` cuts a gutter in the
    background colour first, so the bar reads on any glyph and on either
    polarity, including the inverted `due` frame where the background is lit.
    """
    canvas.blit(x, y, art, glyphs.SPAN, paint.fg, scale)
    if struck:
        canvas.blit(x, y, glyphs.SLASH_MASK, glyphs.SPAN, paint.bg, scale)
        canvas.blit(x, y, glyphs.SLASH, glyphs.SPAN, paint.fg, scale)


def _sign_column(canvas: Canvas, eighths: int, shape: Shape,
                 art: tuple[int, ...] | None, paint: Paint) -> tuple[_Box, int]:
    """Sign on the left, everything else on the right. `(data box, sign width)`.

    `eighths` is the sign's share of the width on a colour panel; a monochrome
    panel gives it one more eighth, for the reason in the module docstring. What
    the sign does not use goes to the numbers rather than sitting empty — on a
    128x32 strip that slack is half the panel.
    """
    inner = _inner(canvas)
    gap = _gap(canvas)
    share = eighths if canvas.colour else eighths + 1
    avail = max(0, inner.w * share // 8 - gap)
    used = _sign(canvas, inner.x, inner.y, inner.h, avail, shape, art, paint)
    return (_Box(inner.x + used + gap, inner.y, inner.w - used - gap, inner.h),
            used)


# ── the things that put ink down ────────────────────────────────────────────

def _frame(canvas: Canvas, tone: Tone) -> Paint:
    """Clear the canvas to the tone's background and hand back its ink.

    On the LCD this is the colour of the state. On the OLED it is usually black
    — except for DUE, where `Mono1` asks for an inverted frame, and the whole
    panel lights up with the sign and the tray number cut out of it. That is the
    only way one bit can be shouted, and a dose being due is the one thing worth
    shouting about.
    """
    paint = canvas.tone(tone)
    canvas.fill(paint.bg)
    return paint


def _glyph(canvas: Canvas, box: _Box, art: tuple[int, ...], value: int,
           scale: int = 0) -> int:
    """Centre a glyph in `box` as large as whole-number scaling allows."""
    scale = scale or _fit(box.w, box.h, glyphs.SPAN, glyphs.ROWS)
    if scale < 1:
        return 0
    width, height = glyphs.SPAN * scale, glyphs.ROWS * scale
    canvas.blit(box.x + (box.w - width) // 2, box.y + (box.h - height) // 2,
                art, glyphs.SPAN, value, scale)
    return scale


def _line(canvas: Canvas, box: _Box, y: int, text: str, value: int,
          scale: int) -> None:
    """One line of text, centred across `box`, at an absolute `y`."""
    font.draw(canvas, box.x + (box.w - font.text_width(text, scale)) // 2, y,
              text, value, scale)


# ── turning whatever the caller had into something drawable ─────────────────

def _tray_text(tray: object) -> str:
    """A tray number, at most two characters.

    Two, not more: the firmware tops out at eight trays and the number has to be
    the largest thing on the screen. Anything unexpected becomes `?`, which is
    in the font and is honest — better a question mark than a screen that says
    with total confidence that tray `None` is due.
    """
    if isinstance(tray, int) and not isinstance(tray, bool) and 0 <= tray <= 99:
        return str(tray)
    # Everything else is `?`, including an int outside the range and a string
    # that happens to look like a number.
    #
    # Truncating instead — which is what `str(tray)[:2]` did — turns tray 123
    # into a confident, unmissable "12" and tray -1 into "-1". The point of this
    # function is that a screen nobody can read must not be *wrong*, and a
    # plausible wrong number is worse than a question mark: somebody takes the
    # pills out of hopper 12.
    return "?"


def _clock_text(when: object) -> str:
    """A time of day as `HH:MM`, from any of the shapes this project uses.

    `sc1` carries times as `'0800'` on the wire and as minutes-since-midnight in
    the scheduler, the web API hands back `'08:00'`, and a caller with nothing to
    say passes `None`. All four arrive here and none of them may raise.
    """
    if when is None:
        return ""
    if isinstance(when, int) and not isinstance(when, bool):
        return f"{(when // 60) % 24:02d}:{when % 60:02d}"
    text = str(when).strip()
    if len(text) == 4 and text.isdigit():
        return f"{text[:2]}:{text[2:]}"
    return text[:5].upper()


def _name_text(value: object) -> str:
    """An SSID or an IP address, cleaned up. Empty when there is nothing to say.

    Capped at twenty-one characters, which is the longest run the 5x7 font will
    put across the LCD at a size worth reading. Longer than that and the choice
    is between a smear and a truncation; a truncation at least keeps the front
    of the string, and whoever set a thirty-character SSID can read the rest off
    the router.
    """
    return "" if value is None else str(value).strip().upper()[:21]


def _wrap(text: str, width: int) -> tuple[list[str], int]:
    """Break a name or an address into at most two lines, and pick a scale.

    Broken at its own separator where it has one, so `SNAPCARE-V5XH` becomes
    `SNAPCARE-` and `V5XH` and `192.168.1.42` becomes `192.168.` and `1.42`,
    rather than being sliced mid-token. Somebody copying either of those into a
    phone has to be able to see that the hyphen or the dot is there.
    """
    if not text:
        return [], 1
    per_line = max(1, (width + 1) // font.ADVANCE)
    if len(text) <= per_line:
        return [text], max(1, width // font.text_width(text, 1))

    # As close to the middle as a separator allows, and where two breaks are
    # equally central the longer first line wins — `192.168.` over `192.` puts
    # more of the address where somebody's eye starts.
    best: tuple[tuple[int, int], str, str] | None = None
    for index, character in enumerate(text):
        if character not in "-_ .":
            continue
        head, tail = text[:index + 1], text[index + 1:]
        if not tail or len(head) > per_line or len(tail) > per_line:
            continue
        rank = (abs(2 * len(head) - len(text)), -len(head))
        if best is None or rank < best[0]:
            best = (rank, head, tail)
    if best is not None:
        return [best[1], best[2]], 1

    half = (len(text) + 1) // 2
    return [text[:half][:per_line], text[half:][:per_line]], 1


def _text_block(text: str, width: int, max_h: int) -> tuple[list[str], int, int, int]:
    """`(lines, scale, leading, height)` for a name laid out `width` wide."""
    lines, scale = _wrap(text, width)
    if not lines:
        return [], 0, 0, 0
    # Capped, because a short name would otherwise be scaled until it filled the
    # panel on its own and left no room for the picture beside it.
    scale = max(1, min(scale, max_h // (len(lines) * font.HEIGHT)))
    lead = max(1, scale) if len(lines) > 1 else 0
    return (lines, scale, lead,
            len(lines) * font.HEIGHT * scale + (len(lines) - 1) * lead)


def _draw_text_block(canvas: Canvas, box: _Box, y: int, lines: list[str],
                     scale: int, lead: int, value: int) -> None:
    for line in lines:
        _line(canvas, box, y, line, value, scale)
        y += font.HEIGHT * scale + lead


def _dose(canvas: Canvas, box: _Box, tray: object, when: object, value: int,
          cap_h: int = 0) -> None:
    """The tray number, as big as the box allows, with its time underneath.

    One invariant decides this layout: **the tray number is never narrower than
    the time under it.** Sizing each to its own box is arithmetically correct
    and visually backwards, because `08:00` at scale 1 is 29 px wide against 5
    for a single digit — fit them independently and the biggest thing on a
    screen whose whole job is to say which drawer to open turns out to be the
    clock. So the time starts as large as a third of the height allows and is
    given up a step at a time until the number outweighs it.

    It is given up down to scale 1 and no further. A panel too cramped to
    satisfy the invariant — the 128x32 strip is one — keeps a small time next to
    a small number rather than a large number and nothing, because both facts
    badly presented beat one fact well presented on a screen somebody is
    standing right in front of. The time only disappears when it will not fit at
    all.

    `cap_h` caps the number's height in pixels, for the screens where the sign
    is the message and the number is the footnote.
    """
    number = _tray_text(tray)
    time_text = _clock_text(when)
    number_w = font.text_width(number, 1)
    time_w = font.text_width(time_text, 1)
    gap = _gap(canvas)

    time_scale = _fit(box.w, box.h // 3, time_w, font.HEIGHT)
    while True:
        lead = gap if time_scale else 0
        number_scale = _fit(box.w, box.h - font.HEIGHT * time_scale - lead,
                            number_w, font.HEIGHT)
        if cap_h:
            number_scale = min(number_scale, cap_h // font.HEIGHT)
        if time_scale <= 1 or number_scale * number_w >= time_scale * time_w:
            break
        time_scale -= 1

    number_h = font.HEIGHT * number_scale
    time_h = font.HEIGHT * time_scale
    top = box.y + (box.h - number_h - lead - time_h) // 2
    if number_scale:
        _line(canvas, box, top, number, value, number_scale)
    if time_scale:
        _line(canvas, box, top + number_h + lead, time_text, value, time_scale)


# ── reading a Health without ever trusting it ───────────────────────────────

#: The canonical problem slugs, and the spellings that mean each of them. Health
#: is built by another module and read here, and matching loosely means a caller
#: that says `untrusted_clock` where the contract says `clock` gets the right
#: picture instead of a silent fallback to the prohibition sign.
_PROBLEMS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("clock", ("clock", "time", "rtc")),
    ("gpio", ("gpio", "pigpio", "lgpio", "chip")),
    ("wifi", ("wifi", "network", "wlan")),
    ("relay", ("relay", "cloud", "server")),
    ("cell", ("cell", "battery", "coin")),
    ("trays", ("tray", "hopper")),
)

#: What picture stands for each problem, and whether it is struck through. The
#: empty slug — nothing wrong — is a plain clock, because the resting question a
#: machine has to answer is "are you awake and do you know what time it is";
#: `clock` is the same picture with a bar across it, which is the difference
#: between a device that is keeping time and one that is guessing.
#:
#: `gpio` is the prohibition sign rather than a struck-through anything: there
#: is no picture of "the chip this board talks to its motors through" that
#: anybody would recognise, and inventing one would be worse than admitting the
#: machine has simply stopped.
_STANDING: dict[str, tuple[tuple[int, ...], bool]] = {
    "": (glyphs.CLOCK, False),
    "clock": (glyphs.CLOCK, True),
    "gpio": (glyphs.BARRED, False),
    "wifi": (glyphs.WIFI, True),
    "relay": (glyphs.CLOUD, True),
    "cell": (glyphs.BATTERY, True),
    "trays": (glyphs.PILL, True),
}

#: The four WiFi states, as a picture. `hotspot` is struck through rather than
#: shown as a healthy link, which is the judgement call in this table: a machine
#: sitting on its own setup network is *not on a network*, and the honest thing
#: for the status row to say is that the link is missing. It costs the row the
#: ability to distinguish "on my own hotspot" from "off the air entirely" — the
#: `wifi` screen is where those two separate, because one of them has an SSID
#: under it and the other has nothing.
_WIFI_ART: dict[str, tuple[tuple[int, ...], bool]] = {
    "online": (glyphs.WIFI, False),
    "joining": (glyphs.WIFI_LOW, False),
    "hotspot": (glyphs.WIFI, True),
    "offline": (glyphs.WIFI, True),
}

#: And as a shape. Only `online` is a circle: `joining` and `hotspot` both mean
#: somebody still has something to do, which is what `shapes.FOR_TONE` already
#: says about `Tone.NETWORK`, and this table is deliberately consistent with it
#: rather than inventing a second opinion about the same fact.
_WIFI_SHAPE: dict[str, Shape] = {
    "online": Shape.SAFE,
    "joining": Shape.CAUTION,
    "hotspot": Shape.CAUTION,
    "offline": Shape.CAUTION,
}


def _problem(health: Health) -> str:
    slug = str(getattr(health, "problem", "") or "").strip().lower()
    if not slug:
        return ""
    for canonical, needles in _PROBLEMS:
        if any(needle in slug for needle in needles):
            return canonical
    return slug


def _wifi_state(health: Health) -> str:
    """One of the four states, or `''` when the field says something else.

    An unrecognised value is treated as offline everywhere below rather than as
    online. That is the direction the error has to point: claiming a link that
    is not there sends somebody looking for the dispenser at an address nothing
    answers on, and they blame their router.
    """
    state = str(getattr(health, "wifi", "") or "").strip().lower()
    return state if state in _WIFI_ART else ""


def _shape_of(health: Health) -> Shape:
    """The machine's own shape, from the contract in `health.py`.

    Wrapped because this is called on the scheduler's thread, from a screen, on
    a `Health` that a selftest or a stub may have built by hand with a field
    missing. `shape_for` is not the risk; the snapshot handed to it is. A
    dispenser that stops dispensing because a status screen could not decide
    what shape to draw would be the worst bug in this file.
    """
    try:
        return shape_for(health)
    except Exception:  # noqa: BLE001 - a screen may not reach the tick
        return Shape.CAUTION


def _standing(health: Health) -> tuple[tuple[int, ...], bool]:
    """The picture for whatever is standing. Unknown slugs get the barred sign,
    which claims nothing beyond "stopped" and is therefore never wrong."""
    return _STANDING.get(_problem(health), (glyphs.BARRED, False))


def _next_dose_text(health: Health) -> str:
    tray = getattr(health, "next_tray", None)
    when = _clock_text(getattr(health, "next_at", ""))
    if tray is None or not when:
        return ""
    return f"{_tray_text(tray)} {when}"


def _footer_plan(canvas: Canvas, inner: _Box, text: str) -> tuple[int, int, int]:
    """`(height, pill scale, text scale)` for the next-dose line, or zeroes.

    A third of the panel at most, and it gives up its pill before it gives up
    its numbers: on a 128x32 strip there is no room for a 16 px glyph without
    pushing the clock off the panel, and the tray and the time are the facts.
    """
    if not text:
        return 0, 0, 0
    gap = _gap(canvas)
    width = font.text_width(text, 1)
    pill = _fit(inner.w - gap, inner.h // 3, glyphs.SPAN + width, glyphs.ROWS)
    text_scale = pill or _fit(inner.w, inner.h // 3, width, font.HEIGHT)
    return (glyphs.ROWS * pill if pill else font.HEIGHT * text_scale,
            pill, text_scale)


def _draw_footer(canvas: Canvas, inner: _Box, text: str, plan: tuple[int, int, int],
                 paint: Paint) -> None:
    height, pill, text_scale = plan
    if not height:
        return
    gap = _gap(canvas)
    y = inner.y + inner.h - height
    span = font.text_width(text, text_scale)
    span += glyphs.SPAN * pill + gap if pill else 0
    x = inner.x + (inner.w - span) // 2
    if pill:
        canvas.blit(x, y, glyphs.PILL, glyphs.SPAN, paint.fg, pill)
        x += glyphs.SPAN * pill + gap
    font.draw(canvas, x, y + (height - font.HEIGHT * text_scale) // 2,
              text, paint.fg, text_scale)


# ── the dose states ─────────────────────────────────────────────────────────

def due(canvas: Canvas, tray: object, when: object) -> None:
    """A dose is due. Green, a circle, and on the OLED the whole panel is lit.

    This is the screen that has to be identifiable from the other side of a
    room, before anything on it can be resolved: a lit rectangle with a dark
    circle at the left and one enormous digit in the middle. Every other screen
    in this file is dark-on-light on the OLED and has either no digit or a
    smaller one, so the silhouette alone is the signal.

    The shape is a circle and that is `shapes.FOR_TONE`'s judgement, not this
    file's: a dose waiting for you is the machine doing its job, and spending
    the caution level on the most ordinary event in the device's life would
    teach somebody to ignore triangles.

    The picture is a finger coming down onto a button, not a pill. "There are
    pills" is not an instruction; "press this" is, and the button it draws is
    the one physically on the front of the machine, ten centimetres from the
    panel. The app's release button does the same job for whoever is not in the
    room, and needs no picture here.
    """
    paint = _frame(canvas, Tone.DUE)
    data, _used = _sign_column(canvas, 3, shapes.FOR_TONE[Tone.DUE],
                               glyphs.PRESS, paint)
    _dose(canvas, data, tray, when, paint.fg)


def released(canvas: Canvas, tray: object) -> None:
    """The pills are in the cup. Blue, and a circle.

    Here the picture is the message and the number is the footnote, which is why
    the cup gets an extra eighth of the width on the panels wide enough to
    notice. The person does not need to be told to do anything — the doing is
    already done — they need to be told where to look, and that is a cup.

    No time. The dose is on the table now; the minute it was scheduled for is of
    no use to anyone standing in front of it, and a time on this screen is one
    more thing to mistake for the due screen.
    """
    paint = _frame(canvas, Tone.RELEASED)
    data, used = _sign_column(canvas, 4, shapes.FOR_TONE[Tone.RELEASED],
                              glyphs.CUP, paint)
    # Capped to the sign's own size, so the footnote cannot end up taller than
    # the thing it is a footnote to — which is what happens if the number is
    # allowed to fill a column with no time line to share it with.
    _dose(canvas, data, tray, None, paint.fg, cap_h=used)


def missed(canvas: Canvas, tray: object, when: object) -> None:
    """The dose went untaken, or its window closed. Amber, and a triangle.

    Deliberately the same skeleton as `due` — sign left, tray number and time
    right, in the same places — so that the eye lands on the same spot and finds
    the same two facts. What changed is the colour, the shape and the picture,
    and on the OLED the change from a lit panel with a circle on it to a dark one
    with a triangle is about as loud as one bit gets.

    A triangle large enough to read has less than half the usable area of a
    circle the same size, so below about 128x64 the cross will not go inside it.
    On the 128x32 strip it steps out and stands beside the triangle, which is the
    general rule in `_sign`; at 72x40 there is no room beside it either and the
    cross is simply gone. That is the honest loss at that size, and it is the
    right one — amber and a triangle beside a tray number is still unambiguous,
    and a triangle shrunk until a cross fits in it is not a triangle.

    The time is the one it was due at, not the time now. This screen is a record
    of something that did not happen, and the useful question it answers for
    whoever walks in later is "which one did I miss".
    """
    paint = _frame(canvas, Tone.MISSED)
    data, _used = _sign_column(canvas, 3, shapes.FOR_TONE[Tone.MISSED],
                               glyphs.CROSS, paint)
    _dose(canvas, data, tray, when, paint.fg)


def schedule(canvas: Canvas, tray_count: object) -> None:
    """A new schedule was accepted. Violet, and a circle.

    The tick is for the person: something arrived and the machine took it. The
    count is for whoever is holding the phone that sent it, and it is the one
    number that tells them the schedule they meant is the schedule that landed —
    a QR that half-decoded is a QR that programs half the trays, and this is
    where that shows up.

    The small pill above the count exists so the number is read as "this many
    drawers of pills" rather than as a tray number. Without it, a violet screen
    with a large `3` on it is one glance away from the green screen with a large
    `3` on it. On a panel too short for both, the pill goes and the count stays;
    the tick has already carried the meaning.
    """
    paint = _frame(canvas, Tone.SCHEDULE)
    data, _used = _sign_column(canvas, 4, shapes.FOR_TONE[Tone.SCHEDULE],
                               glyphs.TICK, paint)

    gap = _gap(canvas)
    pill_scale = _fit(data.w, data.h // 3, glyphs.SPAN, glyphs.ROWS)
    head = glyphs.ROWS * pill_scale + gap if pill_scale else 0
    if pill_scale:
        _glyph(canvas, _Box(data.x, data.y, data.w, head - gap),
               glyphs.PILL, paint.fg, pill_scale)
    _dose(canvas, _Box(data.x, data.y + head, data.w, data.h - head),
          tray_count, None, paint.fg)


def network(canvas: Canvas, ssid: object) -> None:
    """Waiting to be put on a WiFi network. Cyan, and a triangle to one side.

    The one screen where somebody genuinely has to read, so it is the one screen
    laid out for reading: the SSID gets the full width and the largest whole
    scale that keeps it on one line, and the arcs take whatever height is left
    over. Stacked rather than side by side for exactly that reason — a picture in
    a left-hand column would cost the name a third of its width, and the name is
    about to be typed into a phone by somebody who cannot afford to guess a
    character.

    So this is the one screen where the shape is not a frame. It stands in the
    empty column the centred arcs leave on the left, at whatever size that column
    allows. It is talking to somebody who is walking past and is not the person
    typing: *this machine is not finished yet.* Framing the arcs instead would
    have shrunk them to a sixteenth of the panel to buy a shape that nobody in
    the middle of typing a password is looking at anyway.

    A name too long for one line is broken at its own separator where it has one,
    so `SNAPCARE-V5XH` becomes `SNAPCARE-` and `V5XH` rather than being sliced
    mid-token. A name too long even for two lines is truncated, which loses
    information and is still better than an unreadable smear.
    """
    paint = _frame(canvas, Tone.NETWORK)
    inner = _inner(canvas)
    gap = _gap(canvas)

    # `?` rather than nothing when the caller has no name: a setup screen with a
    # blank where the network should be is a person hunting through a phone's
    # WiFi list for something that is not there.
    lines, scale, lead, text_h = _text_block(_name_text(ssid) or "?",
                                             inner.w, inner.h // 3)
    glyph_scale = _fit(inner.w, inner.h - text_h, glyphs.SPAN, glyphs.ROWS)
    glyph_h = glyphs.ROWS * glyph_scale
    space = max(0, min(gap, inner.h - glyph_h - text_h))

    # Never above the margin, even on a panel too short for two lines of name:
    # the top of an SSID is worth more than its bottom to somebody typing it.
    top = max(inner.y, inner.y + (inner.h - glyph_h - space - text_h) // 2)
    if glyph_scale:
        _glyph(canvas, _Box(inner.x, top, inner.w, glyph_h), glyphs.WIFI,
               paint.fg, glyph_scale)
        flank = (inner.w - glyphs.SPAN * glyph_scale) // 2 - gap
        _sign(canvas, inner.x, top, glyph_h, min(flank, glyph_h),
              shapes.FOR_TONE[Tone.NETWORK], None, paint)
    _draw_text_block(canvas, inner, top + glyph_h + space, lines, scale, lead,
                     paint.fg)


def blocked(canvas: Canvas, reason_kind: object) -> None:
    """The device will not dispense. Amber, and an octagon across the panel.

    This is the only screen where the shape gets everything, and it should be:
    there is nothing else worth saying. No pills are coming out and no tray will
    open until somebody fixes something, so a tray number would be a lie and a
    time would be an irrelevance. An octagon as wide as the panel with one
    picture in the middle of it is the whole message.

    Two audiences, one frame. For the person in the room the octagon is the
    message: fetch somebody. For whoever they fetch, the picture inside it says
    which refusal this is — a clock nothing can vouch for, or a machine that
    cannot reach its GPIO.

    `reason_kind` is a slug and it is deliberately not rendered. Printing
    `UNTRUSTED-CLOCK` across a panel would be the first sentence in this
    firmware and it would be read by nobody who needed it. Slugs this does not
    recognise get the prohibition sign, which claims nothing beyond "stopped".

    The picture inside is *not* struck through the way the status screen strikes
    it. The octagon has already negated everything on the screen, and a bar
    across the clock as well reads as two refusals rather than one.

    Amber is reused from `missed` rather than invented, because the five-colour
    vocabulary is the thing the person already knows and a sixth colour would
    have to be taught. The shape is what separates them now, which is exactly
    what the shape is for.
    """
    paint = _frame(canvas, Tone.MISSED)
    inner = _inner(canvas)
    side = min(inner.w, inner.h)
    _sign(canvas, inner.x + (inner.w - side) // 2, inner.y, inner.h, side,
          Shape.AVOID, _cause(reason_kind), paint)


def _cause(reason_kind: object) -> tuple[int, ...]:
    """Which picture explains a refusal. Substring matched, so that
    `clock`, `untrusted_clock` and `clock-untrusted` all land in the same place —
    the caller of a status screen should not have to know the exact spelling to
    get the right icon, and getting it wrong here is silent.
    """
    slug = str(reason_kind).strip().lower() if reason_kind is not None else ""
    if "clock" in slug or "time" in slug or "rtc" in slug:
        return glyphs.CLOCK
    return glyphs.BARRED


# ── the machine's own states ────────────────────────────────────────────────

def idle(canvas: Canvas, health: Health) -> None:
    """Nothing is happening. What goes here is a real decision, so:

    The obvious answer is a blank panel — it saves power and it is the only
    thing that cannot burn into an OLED. It is the wrong answer. A dark panel is
    indistinguishable from a dead device, and this project has already decided
    once that that trade is unacceptable: the cyan "put me on a network" light
    exists precisely because a dispenser sitting silently on its own hotspot
    looked identical to one that was switched off. Making the resting state
    invisible would reintroduce that, permanently, for the other twenty-three
    hours of the day.

    So the resting screen answers the three questions somebody has when they
    walk past and nothing is flashing: **is it alive, is it alright, and when is
    the next one.**

    The sign answers the second, and it is why this screen now takes a `Health`
    instead of three loose strings. Everything this machine can be wrong about
    is silent — an untrusted clock, a dead backup cell, a relay it has not
    reached in a week — and every one of them is a state in which the device
    looks perfectly healthy and quietly gives somebody the wrong medication at
    the wrong time. A circle on this screen twenty-three hours a day is what
    makes a triangle worth noticing on the twenty-fourth.

    The clock answers the first, and it answers it better than a heartbeat dot
    would, because a wrong clock is the single most dangerous state this device
    can be in — every dose it will ever give is scheduled against it. A time on
    the wall that disagrees with the time on the panel is a fault anybody can
    spot without knowing anything about the device. That is also why the current
    time is the large element and the next dose is not: making the next dose
    large would give the resting screen the same silhouette as the due screen,
    and those two must never be confused.

    The footer — a pill, a tray and a time — is for whoever is reading. It says
    nothing to somebody who is not, which is correct: there is nothing for them
    to do. When there is no next dose it is simply absent. An empty schedule is
    not worth a sentence, and there is no sentence to write.

    At 72x40 everything stays and nothing is large. That is the honest answer
    there: a 68-pixel-wide drawable area holds a five-character clock at one
    scale and no other, so shrinking the sign to grow the clock would buy
    nothing at all.
    """
    paint = _frame(canvas, Tone.IDLE)
    inner = _inner(canvas)
    gap = _gap(canvas)

    footer_text = _next_dose_text(health)
    plan = _footer_plan(canvas, inner, footer_text)
    body_h = inner.h - (plan[0] + gap if plan[0] else 0)

    art, struck = _standing(health)
    used = _sign(canvas, inner.x, inner.y, body_h, inner.w * 2 // 5,
                 _shape_of(health), art, paint, struck)
    data = _Box(inner.x + used + gap, inner.y, inner.w - used - gap, body_h)

    now = _clock_text(getattr(health, "now", ""))
    scale = _fit(data.w, data.h, font.text_width(now, 1), font.HEIGHT) if now else 0
    if scale:
        _line(canvas, data, data.y + (data.h - font.HEIGHT * scale) // 2,
              now, paint.fg, scale)

    _draw_footer(canvas, inner, footer_text, plan, paint)


def status(canvas: Canvas, health: Health) -> None:
    """The whole machine, on one frame. What somebody walks over to look at.

    `idle` says *something* is standing. This says *what*, without a word of
    text: a row of the machine's three silent subsystems — the radio, the clock,
    the relay — each of them a picture with a bar through it when it is not
    working. A struck-through clock is the only way anybody has found to say
    "nothing has vouched for the time" on a panel with one ink, and it is a
    thing this device genuinely needs to be able to say, because a dispenser
    running on a clock it invented at boot will hand out a Friday compartment on
    a Tuesday and look perfectly healthy doing it.

    The big sign is not redundant with that row. The row says which subsystem;
    the sign says whether any of it stops the machine dispensing. Those are
    different questions and people ask them in that order — "is it broken" then
    "what is broken" — so the sign is on the left where the eye lands first.

    A healthy machine puts a tick in the sign rather than the clock face `idle`
    uses. The clock would be the third rendering of the clock on one frame —
    inside the sign, in the row, and struck or not — and three copies of one
    subject is how somebody ends up reading the wrong one. The tick is not in
    the row and cannot be confused with anything in it.

    Faults sort to the front of the row and the reassurance falls off the end.
    On a 72x40 panel there is room for two pictures beside the sign and on a
    128x32 strip there is room for three, so which two or three survive has to
    be decided by something: it is decided by which ones are complaining. A row
    of healthy pictures is the least informative thing that could occupy that
    space, and it is the first thing dropped.

    No current time here, deliberately. `idle` has the clock and this screen has
    the clock *glyph*, and two different renderings of the same subject on one
    frame is how somebody ends up reading the wrong one.
    """
    paint = _frame(canvas, Tone.IDLE)
    inner = _inner(canvas)
    gap = _gap(canvas)

    footer_text = _next_dose_text(health)
    plan = _footer_plan(canvas, inner, footer_text)
    body_h = inner.h - (plan[0] + gap if plan[0] else 0)

    art, struck = ((glyphs.TICK, False) if not _problem(health)
                   else _standing(health))
    used = _sign(canvas, inner.x, inner.y, body_h, inner.w * 2 // 5,
                 _shape_of(health), art, paint, struck)
    row = _Box(inner.x + used + gap, inner.y, inner.w - used - gap, body_h)

    cells = _subsystems(health)
    scale = _fit(row.w, row.h, glyphs.SPAN, glyphs.ROWS)
    # Shrink until the whole row fits rather than showing two large pictures out
    # of four — the value of this row is the comparison, and half a comparison
    # is worse than none.
    while scale > 1 and (row.w + gap) // (glyphs.SPAN * scale + gap) < len(cells):
        scale -= 1
    if scale:
        step = glyphs.SPAN * scale + gap
        shown = cells[:max(0, (row.w + gap) // step)]
        if shown:
            x = row.x + (row.w - (len(shown) * step - gap)) // 2
            y = row.y + (row.h - glyphs.ROWS * scale) // 2
            for cell_art, cell_struck in shown:
                _stamp(canvas, x, y, cell_art, paint, scale, cell_struck)
                x += step

    _draw_footer(canvas, inner, footer_text, plan, paint)


def _subsystems(health: Health) -> list[tuple[tuple[int, ...], bool]]:
    """The row on the status screen: the radio, the clock, the relay, in that
    order, with whatever else is standing appended and everything struck sorted
    to the front."""
    problem = _problem(health)
    cells = [
        _WIFI_ART.get(_wifi_state(health), (glyphs.WIFI, True)),
        (glyphs.CLOCK, problem == "clock"),
        (glyphs.CLOUD, problem == "relay"),
    ]
    if problem and problem not in ("clock", "relay", "wifi"):
        cells.append(_STANDING.get(problem, (glyphs.BARRED, False)))
    # Stable, so the three keep their order among themselves. Sorting on "not
    # struck" puts the complaints first and lets the reassurance fall off the
    # end of a narrow panel.
    return sorted(cells, key=lambda cell: not cell[1])


def wifi(canvas: Canvas, health: Health) -> None:
    """Where the machine is on the network, and how to reach it.

    The address is the reason this screen exists. Chrome on Android does no
    mDNS, so `pilldispenser.local` fails for something like half of everybody
    who tries it, and the four numbers on this panel are then the only way into
    the device's own web page. That makes this the second screen in the file
    that somebody genuinely has to read, and it is laid out for reading: the
    address gets the full width on a panel tall enough to stack, and a column
    two fifths of the way across on a strip that is not.

    The sign is the state and the picture inside it is the same state again in
    the other channel — full arcs for a joined network, one bar while it is
    trying, arcs with a bar through them when there is nothing. On the OLED that
    picture is all there is; on the LCD the cyan says it a third time. Somebody
    who cannot see the difference between the pictures can still see the
    difference between a circle and a triangle, which is the whole argument for
    `shapes.py` in one screen.

    A machine sitting on its own setup hotspot has no address, so this screen
    shows the SSID instead — the same string `network` is showing, for the same
    reason, to somebody who has arrived at this screen by pressing through the
    menu rather than by plugging the machine in for the first time.

    At 72x40 the address does not fit on one line — a full IPv4 address is 89
    pixels of 5x7 font and the drawable width is 68 — so it is broken at a dot,
    and the second line costs the sign enough height that the arcs no longer fit
    inside it and end up beside it instead. The address wins that trade every
    time: half an IP address is worth nothing at all, and this is the screen
    somebody is looking at precisely because they are trying to type it.
    """
    state = _wifi_state(health)
    # Cyan still means "the network wants something from you", so a joined
    # machine is not cyan. Reusing the tone for the healthy case would spend the
    # one colour this product has for "come and do something" on a screen where
    # there is nothing to do.
    paint = _frame(canvas, Tone.IDLE if state == "online" else Tone.NETWORK)
    inner = _inner(canvas)
    gap = _gap(canvas)

    art, struck = _WIFI_ART.get(state, (glyphs.WIFI, True))
    shape = _worst(_WIFI_SHAPE.get(state, Shape.CAUTION), _shape_of(health))
    text = _reachable_text(health)

    # Stack when the panel is tall enough for a picture above a line of text;
    # otherwise columns. The 128x32 strip is the whole reason for the branch —
    # stacked, its sign comes out twenty pixels across and holds nothing.
    if inner.h * 5 >= inner.w * 2:
        lines, scale, lead, text_h = _text_block(text, inner.w, inner.h // 3)
        sign_h = inner.h - (text_h + gap if text_h else 0)
        width = _sign_width(canvas, sign_h, inner.w, shape, art)
        _sign(canvas, inner.x + (inner.w - width) // 2, inner.y, sign_h,
              inner.w, shape, art, paint, struck)
        _draw_text_block(canvas, inner, inner.y + sign_h + gap, lines, scale,
                         lead, paint.fg)
        return

    used = _sign(canvas, inner.x, inner.y, inner.h, inner.w * 2 // 5,
                 shape, art, paint, struck)
    box = _Box(inner.x + used + gap, inner.y, inner.w - used - gap, inner.h)
    lines, scale, lead, text_h = _text_block(text, box.w, box.h)
    _draw_text_block(canvas, box, box.y + (box.h - text_h) // 2, lines, scale,
                     lead, paint.fg)


def _reachable_text(health: Health) -> str:
    """The address, or the setup network's name, or nothing.

    Nothing is a real answer and is left blank rather than filled with a `?`.
    An offline machine has no address, saying so with a punctuation mark would
    invite somebody to try typing it, and the struck-through arcs above have
    already said everything there is to say.
    """
    address = _name_text(getattr(health, "address", ""))
    if address:
        return address
    if _wifi_state(health) == "hotspot":
        return _name_text(getattr(health, "ssid", ""))
    return ""
