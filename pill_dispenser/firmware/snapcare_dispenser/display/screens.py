"""One frame per state. This is the interface, and the rest is plumbing.

What this file is for
---------------------
The dispenser has five things to say, inherited from the LED ring it replaced,
and a screen is only allowed to replace a ring if it keeps saying them the same
way:

    green   a dose is due — press the button, or release it in the app
    blue    released — the pills are in the cup
    amber   the dose went untaken, or its window closed
    violet  a new schedule was accepted
    cyan    waiting to be put on a WiFi network

The person these screens are drawn for cannot be assumed to read. So the colour
carries the state and a picture carries the instruction, and the only text on a
dose screen is a tray number and a time — the two facts a ring could never give
and the reason for changing the hardware at all.

The temptation this file exists to resist is turning that into a text display.
There is now a 240x320 panel with room for a paragraph, and a paragraph would be
easier to write than `glyphs.PRESS`. It would also be invisible to the one
person the whole project is built around. Nothing here renders a sentence.

Sizing, and why nothing is a constant
-------------------------------------
The same code lays out 72x40, 128x32, 128x64 and 240x320, so every dimension is
derived from `canvas.width` and `canvas.height`. Glyphs are 16x16 scaled by
whole numbers; text is 5x7 scaled by whole numbers; the layout picks the largest
scale that fits and centres what is left over. A hardcoded pixel here is a
screen that is correct on the OLED on the bench and wrong on the LCD that
arrives tomorrow.

Two things branch, and only these two:

  `canvas.width` decides how much room there is, which is arithmetic.

  `canvas.colour` decides how much of the width the *picture* gets. On the
  ILI9341 the background is already green or amber, so the glyph is a caption
  for a message the panel has delivered; on the SSD1306 there is one ink and the
  glyph **is** the message, so it gets an extra eighth of the width. That is a
  layout difference, not a meaning difference — the same glyph, the same number,
  the same time, on both.

Nothing branches on which panel is fitted, and nothing may: the drivers are
interchangeable and a screen that knows which one it is on will be wrong the
first time somebody swaps a panel.

Failure
-------
These functions are total. Any `tray`, `when` or `ssid` — including `None`, an
empty string, an int, or a value the app should never have sent — lands on a
frame rather than an exception, because these are called from the scheduler's
own thread and a dispenser that stops dispensing because an SSID had an emoji in
it is a worse bug than an ugly screen. Where something genuinely does not fit,
the picture wins and the text is dropped: the picture is what the person reads.
"""
from __future__ import annotations

from typing import NamedTuple

from . import font, glyphs
from .canvas import Canvas, Paint, Tone

__all__ = ["due", "released", "missed", "schedule", "network", "idle", "blocked"]


class _Box(NamedTuple):
    """A rectangle to lay something out inside. Absolute canvas coordinates."""

    x: int
    y: int
    w: int
    h: int


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


def _columns(canvas: Canvas, eighths: int) -> tuple[_Box, _Box]:
    """Split the drawable area into a picture column and a data column.

    `eighths` is the picture's share of the width on a colour panel; a
    monochrome panel gives it one eighth more, for the reason in the module
    docstring. The column is then trimmed back to the width the glyph actually
    occupies at its chosen scale, so the slack goes to the numbers instead of
    sitting empty — on a 128x32 strip that slack is half the panel.
    """
    inner = _inner(canvas)
    gap = _gap(canvas)
    share = eighths if canvas.colour else eighths + 1
    picture_w = max(0, inner.w * share // 8 - gap)
    scale = _fit(picture_w, inner.h, glyphs.SPAN, glyphs.ROWS)
    picture_w = glyphs.SPAN * scale
    return (_Box(inner.x, inner.y, picture_w, inner.h),
            _Box(inner.x + picture_w + gap, inner.y,
                 inner.w - picture_w - gap, inner.h))


# ── the things that put ink down ────────────────────────────────────────────

def _frame(canvas: Canvas, tone: Tone) -> Paint:
    """Clear the canvas to the tone's background and hand back its ink.

    On the LCD this is the colour of the state. On the OLED it is usually black
    — except for DUE, where `Mono1` asks for an inverted frame, and the whole
    panel lights up with the hand and the tray number cut out of it. That is the
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

    `cap_h` caps the number's height in pixels, for the screens where the
    picture is the message and the number is the footnote.
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


# ── the states ──────────────────────────────────────────────────────────────

def due(canvas: Canvas, tray: object, when: object) -> None:
    """A dose is due. Green, and on the OLED the whole panel is lit.

    This is the screen that has to be identifiable from the other side of a
    room, before anything on it can be resolved: a lit rectangle with a dark
    shape at the left and one enormous digit in the middle. Every other screen
    in this file is dark-on-light on the OLED and has either no digit or a
    smaller one, so the silhouette alone is the signal.

    The glyph is a finger coming down onto a button, not a pill. "There are
    pills" is not an instruction; "press this" is, and the button it draws is
    the one physically on the front of the machine, ten centimetres from the
    panel. The app's release button does the same job for whoever is not in the
    room, and needs no picture here.
    """
    paint = _frame(canvas, Tone.DUE)
    picture, data = _columns(canvas, 3)
    _glyph(canvas, picture, glyphs.PRESS, paint.fg)
    _dose(canvas, data, tray, when, paint.fg)


def released(canvas: Canvas, tray: object) -> None:
    """The pills are in the cup. Blue.

    Here the picture is the message and the number is the footnote, which is why
    the cup gets half the width rather than the third the due screen gives its
    glyph. The person does not need to be told to do anything — the doing is
    already done — they need to be told where to look, and that is a cup.

    No time. The dose is on the table now; the minute it was scheduled for is of
    no use to anyone standing in front of it, and a time on this screen is one
    more thing to mistake for the due screen.
    """
    paint = _frame(canvas, Tone.RELEASED)
    picture, data = _columns(canvas, 4)
    scale = _glyph(canvas, picture, glyphs.CUP, paint.fg)
    # Capped to the cup's own height, so the footnote cannot end up taller than
    # the thing it is a footnote to — which is what happens if the number is
    # allowed to fill a column with no time line to share it with.
    _dose(canvas, data, tray, None, paint.fg, cap_h=glyphs.ROWS * scale)


def missed(canvas: Canvas, tray: object, when: object) -> None:
    """The dose went untaken, or its window closed. Amber.

    Deliberately the same skeleton as `due` — picture left, tray number and time
    right, in the same places — so that the eye lands on the same spot and finds
    the same two facts. What changed is the colour and the glyph, and on the
    OLED the change from a lit panel to a dark one with a cross across it is
    about as loud as one bit gets.

    The time is the one it was due at, not the time now. This screen is a record
    of something that did not happen, and the useful question it answers for
    whoever walks in later is "which one did I miss".
    """
    paint = _frame(canvas, Tone.MISSED)
    picture, data = _columns(canvas, 3)
    _glyph(canvas, picture, glyphs.CROSS, paint.fg)
    _dose(canvas, data, tray, when, paint.fg)


def schedule(canvas: Canvas, tray_count: object) -> None:
    """A new schedule was accepted. Violet.

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
    picture, data = _columns(canvas, 4)
    _glyph(canvas, picture, glyphs.TICK, paint.fg)

    gap = _gap(canvas)
    pill_scale = _fit(data.w, data.h // 3, glyphs.SPAN, glyphs.ROWS)
    head = glyphs.ROWS * pill_scale + gap if pill_scale else 0
    if pill_scale:
        _glyph(canvas, _Box(data.x, data.y, data.w, head - gap),
               glyphs.PILL, paint.fg, pill_scale)
    _dose(canvas, _Box(data.x, data.y + head, data.w, data.h - head),
          tray_count, None, paint.fg)


def network(canvas: Canvas, ssid: object) -> None:
    """Waiting to be put on a WiFi network. Cyan.

    The one screen where somebody genuinely has to read, so it is the one screen
    laid out for reading: the SSID gets the full width and the largest whole
    scale that keeps it on one line, and the arcs take whatever height is left
    over. Stacked rather than side by side for exactly that reason — a glyph in
    a left-hand column would cost the name a third of its width, and the name is
    about to be typed into a phone by somebody who cannot afford to guess a
    character.

    A name too long for one line is broken at its own separator where it has one,
    so `SNAPCARE-V5XH` becomes `SNAPCARE-` and `V5XH` rather than being sliced
    mid-token. A name too long even for two lines is truncated, which loses
    information and is still better than an unreadable smear: whoever set that
    SSID can read the rest off the router.
    """
    paint = _frame(canvas, Tone.NETWORK)
    inner = _inner(canvas)
    gap = _gap(canvas)

    lines, scale = _ssid_lines(ssid, inner.w)
    # `_ssid_lines` only knows how wide the panel is, and a short name — or the
    # `?` a caller with nothing to say gets — would otherwise be scaled until it
    # filled the screen on its own. A third of the height at most: the arcs are
    # what tell somebody who is not reading what this screen is about, and they
    # have to stay the dominant thing on it.
    scale = max(1, min(scale, (inner.h // 3) // (len(lines) * font.HEIGHT)))
    lead = max(1, scale)
    text_h = len(lines) * font.HEIGHT * scale + (len(lines) - 1) * lead

    glyph_scale = _fit(inner.w, inner.h - text_h, glyphs.SPAN, glyphs.ROWS)
    glyph_h = glyphs.ROWS * glyph_scale
    space = max(0, min(gap, inner.h - glyph_h - text_h))

    # Never above the margin, even on a panel too short for two lines of name:
    # the top of an SSID is worth more than its bottom to somebody typing it.
    top = max(inner.y, inner.y + (inner.h - glyph_h - space - text_h) // 2)
    if glyph_scale:
        _glyph(canvas, _Box(inner.x, top, inner.w, glyph_h), glyphs.WIFI,
               paint.fg, glyph_scale)
    y = top + glyph_h + space
    for line in lines:
        _line(canvas, inner, y, line, paint.fg, scale)
        y += font.HEIGHT * scale + lead


def _ssid_lines(ssid: object, width: int) -> tuple[list[str], int]:
    """Break a network name into at most two lines, and pick a scale for them."""
    text = str(ssid).strip().upper() if ssid is not None else ""
    text = text or "?"
    per_line = max(1, (width + 1) // font.ADVANCE)
    if len(text) <= per_line:
        return [text], max(1, width // font.text_width(text, 1))

    # Break as close to the middle as a separator allows, keeping the separator
    # on the first line — somebody copying this into a phone needs to see that
    # the hyphen is there.
    best: tuple[int, str, str] | None = None
    for index, character in enumerate(text):
        if character not in "-_ .":
            continue
        head, tail = text[:index + 1], text[index + 1:]
        if not tail or len(head) > per_line or len(tail) > per_line:
            continue
        offset = abs(2 * len(head) - len(text))
        if best is None or offset < best[0]:
            best = (offset, head, tail)
    if best is not None:
        return [best[1], best[2]], 1

    half = (len(text) + 1) // 2
    return [text[:half][:per_line], text[half:][:per_line]], 1


def idle(canvas: Canvas, now_hhmm: object, next_tray: object,
         next_hhmm: object) -> None:
    """Nothing is happening. What goes here is a real decision, so:

    The obvious answer is a blank panel — it saves power and it is the only
    thing that cannot burn into an OLED. It is the wrong answer. A dark panel is
    indistinguishable from a dead device, and this project has already decided
    once that that trade is unacceptable: the cyan "put me on a network" light
    exists precisely because a dispenser sitting silently on its own hotspot
    looked identical to one that was switched off. Making the resting state
    invisible would reintroduce that, permanently, for the other twenty-three
    hours of the day.

    So the resting screen answers the two questions somebody has when they walk
    past and nothing is flashing: **is it alive, and when is the next one.**

    The clock face and the current time answer the first, and they answer it
    better than a heartbeat dot would, because a wrong clock is the single most
    dangerous state this device can be in — every dose it will ever give is
    scheduled against it. A time on the wall that disagrees with the time on the
    panel is a fault anybody can spot without knowing anything about the device.
    That is also why the current time is the large element and the next dose is
    not: making the next dose large would give the resting screen the same
    silhouette as the due screen, and those two must never be confused.

    The footer — a pill, a tray and a time — is for whoever is reading. It says
    nothing to somebody who is not, which is correct: there is nothing for them
    to do. When there is no next dose it is simply absent. An empty schedule is
    not worth a sentence, and there is no sentence to write.
    """
    paint = _frame(canvas, Tone.IDLE)
    inner = _inner(canvas)
    gap = _gap(canvas)

    footer = ""
    if next_tray is not None and _clock_text(next_hhmm):
        footer = f"{_tray_text(next_tray)} {_clock_text(next_hhmm)}"

    # The footer takes a third of the height at most, and gives up its pill
    # before it gives up its numbers — on a 128x32 strip there is no room for a
    # 16 px glyph without pushing the clock off the panel.
    footer_w = font.text_width(footer, 1) if footer else 0
    pill_scale = _fit(inner.w - gap, inner.h // 3,
                      glyphs.SPAN + footer_w, glyphs.ROWS) if footer else 0
    text_scale = pill_scale or (_fit(inner.w, inner.h // 3, footer_w, font.HEIGHT)
                                if footer else 0)
    footer_h = (glyphs.ROWS * pill_scale if pill_scale
                else font.HEIGHT * text_scale)

    body_h = inner.h - (footer_h + gap if footer_h else 0)
    picture_w = glyphs.SPAN * _fit(inner.w // 3, body_h, glyphs.SPAN, glyphs.ROWS)
    picture = _Box(inner.x, inner.y, picture_w, body_h)
    data = _Box(inner.x + picture_w + gap, inner.y,
                inner.w - picture_w - gap, body_h)

    _glyph(canvas, picture, glyphs.CLOCK, paint.fg)
    now = _clock_text(now_hhmm)
    scale = _fit(data.w, data.h, font.text_width(now, 1), font.HEIGHT) if now else 0
    if scale:
        _line(canvas, data, data.y + (data.h - font.HEIGHT * scale) // 2,
              now, paint.fg, scale)

    if footer_h:
        y = inner.y + inner.h - footer_h
        span = font.text_width(footer, text_scale)
        span += glyphs.SPAN * pill_scale + gap if pill_scale else 0
        x = inner.x + (inner.w - span) // 2
        if pill_scale:
            canvas.blit(x, y, glyphs.PILL, glyphs.SPAN, paint.fg, pill_scale)
            x += glyphs.SPAN * pill_scale + gap
        font.draw(canvas, x, y + (footer_h - font.HEIGHT * text_scale) // 2,
                  footer, paint.fg, text_scale)


def blocked(canvas: Canvas, reason_kind: object) -> None:
    """The device will not dispense. Amber, and a triangle.

    Two audiences, one frame. For the person in the room the whole message is
    the triangle: no pills are coming, fetch somebody. For whoever they fetch,
    the smaller glyph beside it says which of the two refusals this is — a clock
    nobody can vouch for, or a machine that cannot reach its GPIO.

    `reason_kind` is a slug, and it is deliberately not rendered. Printing
    `UNTRUSTED-CLOCK` across a panel would be the first sentence in this
    firmware and it would be read by nobody who needed it; the pairing of a
    warning triangle with a clock face says the same thing to both audiences.
    Slugs this does not recognise get the prohibition sign, which claims nothing
    beyond "stopped" and is therefore never wrong.

    Amber is reused from `missed` rather than invented, because the five-colour
    vocabulary is the thing the person already knows and a sixth colour would
    have to be taught. The shapes are what separate them: a cross that reaches
    all four corners against a triangle sitting on a solid base.
    """
    paint = _frame(canvas, Tone.MISSED)
    picture, data = _columns(canvas, 5)
    scale = _glyph(canvas, picture, glyphs.WARN, paint.fg)
    if scale:
        # Two thirds of the triangle at most. Both glyphs are 16x16 and on a
        # 64-row panel both would otherwise be limited by the same height and
        # come out the same size — two equal pictures side by side, neither of
        # which is the headline. The triangle is the headline, and on a panel
        # too small even for that, the cause goes rather than standing alone
        # claiming to be the warning.
        _glyph(canvas, data, _cause(reason_kind), paint.fg,
               min(_fit(data.w, data.h, glyphs.SPAN, glyphs.ROWS),
                   max(1, scale * 2 // 3)))


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
