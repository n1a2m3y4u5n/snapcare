"""One frame per state. This is the interface, and the rest is plumbing.

The frame is three bands
-----------------------
Every screen in this file draws the whole panel, and it draws it in the same
three pieces:

    bar     y   0..35    what the machine is        `bar.py`
    hero    y  36..183   the one thing that matters  here
    strip   y 184..239   the whole day              `strip.py`

Only the hero belongs to this file. That split is the design: the bar and the
strip are *permanent* and say the same kind of thing on every frame, so a person
learns where to look once, and the hero is the only part that changes shape. A
frame is then read in one saccade — the hero says what is happening, and the two
bands are there when you want them and ignorable when you do not.

What replaced the pictograms, and why
-------------------------------------
The old frames drew a picture inside a shape: a hand pressing a button inside a
circle, a cup, a cross inside a triangle. Rendered on the actual panel they did
not work. A 16x16 glyph scaled to fit inside a triangle's usable area is a
smudge at any distance worth designing for, and the two that mattered most —
a hand and a cup — were routinely read as a face and a skull.

So the picture is gone and the shape is **solid**. A filled circle at r=29 is
2629 lit pixels against a triangle's 1127; that mass difference survives being
across a room and survives being unable to see colour at all, which a 2 px
outline never did. What the pictogram was carrying — *which* subsystem, *which*
dose — is now carried by the numbers beside it, which are legible because
`numerals.py` draws them rather than scaling a 5x7 bitmap eight times.

The hero's large numerals are always a time
-------------------------------------------
In every resting state, the biggest thing on the panel is a clock. That is the
invariant this file is built on and it is also the empty-state answer: there is
no frame where the largest element is not a time, so there is never a moment
where the panel looks like it has nothing to say.

The wall clock lives in the **bar** and the dose lives in the **hero**. They are
told apart by position, permanently, which is why the resting hero shows the
next dose's time rather than the current time — the old firmware made the
current time the large element, which was right when there was nowhere else to
put it and is wrong now that there is.

One screen leads with a number instead of a time, and it is deliberate:
`schedule` shows the tray count, because that is the one fact that tells
whoever sent the plan that the plan that landed is the plan they meant.

There used to be a second. `released` led with the tray, on the reasoning that
"which cup" is the entire message once the pills are out — true of a machine
with an outlet per hopper, and this one has stacked trays that all fall to one
place. The number was answering a question nobody in front of it had, so it is
gone and the rule above has no exception left.

Text
----
Still almost none, and the rule has not moved: the person in front of this
machine cannot be assumed to read. The whole device's word inventory is
`SNAPCARE`, `PASSWORD`, an SSID, a passphrase, an IPv4 address and a `DD-MM` —
and every one of those is a thing somebody is about to type or dial, never a
sentence explaining the machine to them. `tests/test_display.py` enforces it by
spying on `font.draw`, and that test is meant to stay exactly as it is.

Failure
-------
These functions are total. Any `health`, any tray, any time — including `None`,
an empty string, a 40-character SSID and values the app should never have sent —
lands on a frame rather than an exception. They are called from the scheduler's
own thread, and a dispenser that stops dispensing because an SSID had an emoji
in it is a far worse bug than an ugly screen.
"""
from __future__ import annotations

from . import (PANEL_HEIGHT, PANEL_WIDTH, bar, font, numerals, qr_art, shapes,
               strip, theme as theme_mod)
from .canvas import Canvas, Tone
from .health import Health
from .shapes import Shape

__all__ = ["due", "released", "missed", "schedule", "network", "blocked",
           "idle", "boot"]

W = PANEL_WIDTH
H = PANEL_HEIGHT

#: The universal margin. A twentieth of the short side — the panel sits behind a
#: bezel in the printed case and ink that runs to the framebuffer's edge is ink
#: with a slice missing once it is screwed down.
PAD = H // 20                                   # 12

HERO_Y = bar.BAR_H                              # 36
HERO_H = strip.STRIP_Y - bar.BAR_H              # 148

#: Where the hero's left column (severity, tray) ends and its right column
#: (the time) begins. Three tenths: enough for a 59 px shape with air, and it
#: leaves the time the two thirds it needs to be read from a doorway.
SPLIT = W * 3 // 10                             # 96

#: The severity shape's radius. Sized from the band with the margin intact.
#:
#: The quarter is a leftover: a tray digit of the same height used to stack
#: under the shape, so the two of them plus a gap had to fit. The digit is gone
#: (this machine has one cup) and the shape is centred alone now, but the radius
#: it was given is the one that reads well at arm's length, so the arithmetic
#: stays rather than being retuned for its own sake.
HERO_R = (HERO_H - 2 * PAD - PAD // 2) // 4     # 29

HERO_RX = SPLIT                                 # 96
HERO_RW = W - PAD - SPLIT                       # 212

#: The secondary line under the time: an address, or a date. Two rows of the
#: 5x7 face, which is an arm's-length element and is honest about it.
SEC_H = 2 * font.HEIGHT                         # 14


# ── turning whatever the caller had into something drawable ─────────────────
#
# These four are unchanged from the frames this file replaced. They were the
# part that was already right: every one of them exists because a screen that
# nobody can read must never be *wrong*, and each has a specific wrong answer it
# was written to refuse.

def _tray_text(tray: object) -> str:
    """A tray number, at most two characters.

    Anything unexpected is `?`, which is in both faces and is honest.
    Truncating instead — which is what `str(tray)[:2]` did — turns tray 123 into
    a confident, unmissable `12`, and somebody opens hopper 12.
    """
    if isinstance(tray, int) and not isinstance(tray, bool) and 0 <= tray <= 99:
        return str(tray)
    return "?"


def _clock_text(when: object) -> str:
    """A time of day as `HH:MM`, from any of the shapes this project uses.

    `sc1` carries times as `'0800'` on the wire and as minutes-since-midnight in
    the scheduler, the web API hands back `'08:00'`, and a caller with nothing
    to say passes `None`. All four arrive here and none of them may raise.
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
    """An SSID or an address, cleaned up. Empty when there is nothing to say."""
    return "" if value is None else str(value).strip().upper()[:21]


def _field(health: object, name: str, default=""):
    """One field off the snapshot, tolerating its absence.

    Not defensiveness for its own sake: these run on the scheduler's thread, and
    a `Health` that gains or loses a field in a refactor has to produce a
    slightly wrong screen rather than a device that stops dispensing.
    """
    try:
        value = getattr(health, name, default)
    except Exception:  # noqa: BLE001 - a foreign object with a __getattr__
        return default
    return default if value is None and default != "" else value



def _palette(canvas: Canvas, theme: dict | None) -> dict:
    """The palette to draw with.

    Every screen takes `theme` as a keyword and every screen can be called
    without it. `indicators` passes the packed palette it already holds — which
    is how the night substitution reaches the glass — and a test, a selftest or
    a bench script that just wants to see a frame gets the day palette without
    having to know that `theme` exists.
    """
    return theme_mod.pack(canvas) if theme is None else theme


# ── the hero ────────────────────────────────────────────────────────────────

def _flood(canvas: Canvas, theme: dict, colour: str) -> None:
    """Fill the hero band, and only the hero band.

    The bar and the strip keep their own dark surfaces on every alert frame.
    Flooding the whole panel would be louder, and it would cost the two things
    the person needs *while* the panel is shouting: which subsystem is at fault,
    and what else is owed today.
    """
    canvas.rect(0, HERO_Y, W, HERO_H, theme[colour])


def _hero_shape(canvas: Canvas, shape: Shape, value: int) -> None:
    """The solid severity shape in the left column, centred on the band.

    A tray number used to stack under it, and the shape was lifted to make room.
    Both are gone: **this machine has one cup.** Every hopper drops into the
    same place, so "which tray" is a fact about the inside of the machine and
    not about anything the person in front of it has to do. Reported from the
    bench as exactly that — 왼쪽에 트레이 번호 뜨는 거 지우자.

    It is still on the app, where the person loading the hoppers needs it, and
    still in the log. What it is not is the biggest thing on a frame somebody
    reads at arm's length while a buzzer is going.
    """
    top = HERO_Y + (HERO_H - (2 * HERO_R + 1)) // 2
    shapes.fill(canvas, SPLIT // 2, top + HERO_R, HERO_R, shape, value)


def _hero_time(canvas: Canvas, text: str, value: int, *,
               secondary: str = "", secondary_value: int | None = None) -> None:
    """The right column: a time as large as it will go, and an optional line.

    The size is fitted rather than fixed. A hardcoded height is a clock that is
    correct for `08:00` and clipped for a caller that hands over something
    longer — and clipping is silent on this surface, so the bug ships as a
    plausible-looking screen with a digit sliced off.
    """
    if not text:
        return
    size = numerals.fit(text, HERO_RW, HERO_H // 2, floor=24)
    block = size + (PAD // 2 + SEC_H if secondary else 0)
    top = HERO_Y + (HERO_H - block) // 2
    numerals.draw_centred(canvas, HERO_RX, top, HERO_RW, size, text, value)
    if secondary:
        _small_centred(canvas, HERO_RX, top + size + PAD // 2, HERO_RW,
                       secondary,
                       value if secondary_value is None else secondary_value, 2)


def _small_centred(canvas: Canvas, x: int, y: int, width: int, text: str,
                   value: int, scale: int) -> None:
    font.draw(canvas, x + (width - font.text_width(text, scale)) // 2, y,
              text, value, scale)


def _wrapped(canvas: Canvas, x: int, y: int, width: int, text: str, value: int,
             scale: int, lines: int = 2) -> int:
    """Lay `text` into `width`, breaking at its own separators. Returns the y
    it ended at.

    Sized to the column rather than to a character count, because the column's
    width depends on how many modules this device's QR happens to need — and a
    string laid out against an assumed width is a string sliced off at the
    bezel. Broken at a hyphen or a dot where there is one, so somebody copying
    `SNAPCARE-V5XH` into a phone can see that the hyphen is there.
    """
    per_line = max(1, (width + scale) // (font.ADVANCE * scale))
    remaining = text
    for index in range(lines):
        if not remaining:
            break
        if len(remaining) <= per_line:
            head, remaining = remaining, ""
        else:
            cut = max((remaining.rfind(sep, 1, per_line + 1)
                       for sep in "-_. "), default=-1)
            cut = cut + 1 if cut > 0 else per_line
            head, remaining = remaining[:cut], remaining[cut:]
        _small_centred(canvas, x, y + index * (font.HEIGHT * scale + scale),
                       width, head, value, scale)
    return y + lines * (font.HEIGHT * scale + scale)


def _fit_scale(text: str, width: int, ceiling: int, lines: int = 1) -> int:
    """The largest whole scale at which `text` fits `width` over `lines` rows.

    Wrapping is part of the fit, not something done afterwards. Sizing the
    string as though it had to be one line and then wrapping it anyway is how
    `SNAPCARE-V5XH` ended up at scale 1 in a column with room for two
    comfortable rows at scale 2 — legible on a bench under a lamp, and not at
    all at arm's length in a hallway, which is where this screen is read.
    """
    # A string with no separator in it has no token a break could hide, so the
    # clean-break preference below simply does not apply to it — a passphrase
    # is twelve characters of noise and breaking it at character seven costs
    # nothing. Without this the rule fired on the one scale small enough to put
    # it on a single line, and a passphrase somebody has to read off the glass
    # came out three times smaller than it needed to be.
    separable = any(sep in text for sep in "-_. ")

    fits = clean = 0
    for scale in range(max(1, ceiling), 0, -1):
        per_line = max(1, (width + scale) // (font.ADVANCE * scale))
        if len(text) > per_line * lines:
            continue
        fits = fits or scale
        if separable and not clean and (len(text) <= per_line
                                        or _breaks_cleanly(text, per_line, lines)):
            clean = scale

    # A clean break beats a larger character, but only when there is one to
    # have. A passphrase is twelve characters with no separator in it and can
    # never break cleanly, so it takes the largest size that fits and breaks
    # wherever it must — which is right: there is no token there to hide.
    return clean or fits or 1


def _breaks_cleanly(text: str, per_line: int, lines: int) -> bool:
    """Whether `text` wraps into `lines` rows breaking only at separators."""
    remaining = text
    for _ in range(lines):
        if not remaining:
            return True
        if len(remaining) <= per_line:
            return True
        cut = max((remaining.rfind(sep, 1, per_line + 1) for sep in "-_. "),
                  default=-1)
        if cut <= 0:
            return False
        remaining = remaining[cut + 1:]
    return not remaining


def _big_number(canvas: Canvas, text: str, value: int) -> None:
    """One number given the whole right column — `released` and `schedule`.

    These two are the frames where a *count* is the message rather than a time,
    so the number gets the height a clock would have had and there is no clock
    on the frame to be confused with it.
    """
    size = numerals.fit(text, HERO_RW, HERO_H - 2 * PAD, floor=40)
    numerals.draw_centred(canvas, HERO_RX, HERO_Y + (HERO_H - size) // 2,
                          HERO_RW, size, text, value)


def _frame(canvas: Canvas, health: Health, theme: dict, *,
           focal: object = None) -> None:
    """The two permanent bands. Every screen but `network` starts here."""
    bar.draw(canvas, health, theme)
    strip.draw(canvas, health, theme, focal=focal)


# ── the dose states ─────────────────────────────────────────────────────────

def due(canvas: Canvas, health: Health, *, theme: dict | None = None,
        beat: bool = False) -> None:
    """A dose is waiting on a press. Green, a solid circle, black ink.

    `beat` swaps the hero's two colours: the green becomes the ink and the black
    becomes the ground. Painted alternately with the ordinary frame it is a
    pulse, and the pulse is the answer to the one thing this screen could not
    say — **that it wants to be pressed.**

    A still panel reads as a display. Somebody who has been told the machine
    will tell them when to take a pill sees a green picture with a time on it,
    which is a machine reporting, and reporting is not asking. There is no
    button to draw: the whole glass is the target by design (see `touch.py`),
    and the one affordance a target that large can carry is *motion*, which
    needs no reading and survives being across a room.

    Not a new pictogram. A hand pressing a button was tried on this panel and
    read as a face — that is why the pictograms are gone at all — and a pulse
    costs no glyph, no legibility and no contrast: the same pair swapped is the
    same 10.79:1 either way round.

    Only the hero flips. The bar and the strip hold still, so the flashing part
    is exactly the part being asked about and the status a person may need
    *while* it flashes stays readable.

    The ink is black and that is a measurement, not a preference: white on the
    green this screen used to use is 2.25:1, which is below even the large-text
    floor, on the single most important frame the product has. Black on the
    green it uses now is 10.79:1.

    The shape is a circle — `shapes.FOR_TONE`'s judgement, not this file's. A
    dose waiting for you is the machine doing its job, and spending the caution
    level on the most ordinary event in the device's life would teach somebody
    to ignore triangles three times a day forever.

    Nothing is passed in. Everything on this frame comes off `health`, which is
    what fixes a real bug: the old screen took a loose tray and time, and
    releasing one of two waiting doses painted a green panel naming the tray of
    a dose twelve hours away.
    """
    theme = _palette(canvas, theme)
    ground, mark = ("BLACK", "DUE") if beat else ("DUE", "BLACK")
    _flood(canvas, theme, ground)
    ink = theme[mark]
    _hero_shape(canvas, Shape.SAFE, ink)

    when = _clock_text(_field(health, "waiting_at"))
    _hero_time(canvas, when or "--:--", ink)
    _window_bar(canvas, health, theme, ink)

    # Two doses owed reads as a stacked silhouette rather than a count. A digit
    # here would be the third number on the frame and the one nobody needs: the
    # instruction is the same either way, and the strip already shows both.
    waiting = _field(health, "waiting", 0)
    if isinstance(waiting, int) and waiting >= 2:
        top = HERO_Y + (HERO_H - (2 * HERO_R + 1)) // 2
        shapes.fill(canvas, SPLIT // 2 - HERO_R // 4, top + HERO_R - HERO_R // 4,
                    HERO_R, Shape.SAFE,
                    canvas.mix(theme[ground], theme[mark], 45))
        shapes.fill(canvas, SPLIT // 2, top + HERO_R, HERO_R, Shape.SAFE, ink)

    _frame(canvas, health, theme, focal=when)


def _window_bar(canvas: Canvas, health: Health, theme: dict, ink: int) -> None:
    """How much of the release window is left, as a bar rather than a number.

    This is the first time the deadline has ever reached the panel. It matters
    because the offer is not open-ended — an untapped dose is recorded missed
    when the hour runs out — and until now the only place that hour existed was
    in the log afterwards.

    Quantised to tenths on purpose. A bar driven by the real remainder would
    change on every tick and force a 38 ms repaint four times a minute for a
    difference nobody can see; ten steps in an hour is a bar that visibly moves
    and costs ten frames.
    """
    frac = _field(health, "waiting_frac", 0)
    if not isinstance(frac, int) or not 0 < frac <= 10:
        return
    top = HERO_Y + HERO_H - PAD - SEC_H // 2
    used = HERO_RW * (10 - frac) // 10
    canvas.rect(HERO_RX, top, HERO_RW, SEC_H // 2, ink)
    canvas.rect(HERO_RX + used + 1, top + 1, HERO_RW - used - 2, SEC_H // 2 - 2,
                theme["DUE"])


def released(canvas: Canvas, health: Health, tray: object = None, *,
             theme: dict | None = None) -> None:
    """The pills are in the cup. Blue, a solid circle, and the time it happened.

    **No longer shown during a release.** `presence` gives that transition no
    screen of its own: the servo turns and the pills fall in front of the
    person, so a frame announcing it is the machine reporting something they
    have just watched happen, and it delays the resting screen they actually
    want back. Reported from the bench in those words — "어차피 모터가 돌아가니까
    확인음 정도만 해주면 되고, 차라리 빨리 메인 화면으로 돌아가주는 게 더 중요할
    듯. 약간 혼란스러움."

    What survives is the colour, in two places that matter more: the strip's
    mark for that dose turns blue in the resting frame, which is the memory
    somebody consults tomorrow, and `--selftest` paints this frame full-screen
    so a person can confirm the panel renders blue at all. That last one is not
    cosmetic — the BGR bit in `MADCTL` swaps red and blue, and therefore swaps
    *missed* for *released*, and a whole-panel colour is the only way to see it.

    It also used to lead with the **tray number**, on the reasoning that "which
    cup" is the entire message once the pills are out. That reasoning belongs to
    a machine with an outlet per hopper. This one has stacked trays that all
    fall to one place, so the number answered a question nobody had.

    So the frame keeps its colour and loses its number, and the file's own rule
    comes back with it: in every state the largest thing on the panel is a
    clock. This was the last exception to it.

    The time is **now**, not the next dose. Now is a record of the thing that
    just happened, which is what this frame is; the next dose on a blue screen
    invites "is another one ready?", and the resting frame that follows in a few
    seconds already answers that properly, with the pending shape that means it.

    No tick glyph, and none is wanted: the strip in this same frame has already
    turned that dose's mark blue, which is a better acknowledgement than a
    symbol because it is the memory the person will consult tomorrow appearing
    at the moment it becomes true.

    `tray` is still taken. It is what `presence` keys the frame on, so that a
    second release repaints rather than being mistaken for the first, and it
    stays in the signature for that even though nothing draws it.
    """
    theme = _palette(canvas, theme)
    _flood(canvas, theme, "RELEASED")
    ink = theme["TEXT"]
    _hero_shape(canvas, Shape.SAFE, ink)
    _hero_time(canvas, _clock_text(_field(health, "now")) or "--:--", ink)
    _frame(canvas, health, theme)


def missed(canvas: Canvas, health: Health, tray: object = None,
           when: object = None, *, theme: dict | None = None) -> None:
    """A dose went untaken, or its window closed. Amber, a solid triangle.

    Deliberately the same skeleton as `due` — shape left, tray under it, time
    right — so the eye lands in the same places and finds the same two facts.
    What changed is the colour, the shape and the lightness: the two are 2.16x
    apart in luminance now, where the frames this replaced were 1.12x apart and
    therefore all but identical to somebody who cannot use the red-green
    difference.

    The time is the one it was *due* at, not the time now. This frame is a
    record of something that did not happen, and the useful question it answers
    for whoever walks in later is "which one did I miss".
    """
    theme = _palette(canvas, theme)
    _flood(canvas, theme, "MISSED")
    ink = theme["BLACK"]
    _hero_shape(canvas, Shape.CAUTION, ink)
    _hero_time(canvas, _clock_text(when) or "--:--", ink)
    _frame(canvas, health, theme, focal=_clock_text(when))


def schedule(canvas: Canvas, health: Health, count: object = None, *,
             theme: dict | None = None) -> None:
    """A new plan was accepted. Violet, a solid circle, and the tray count.

    The count is for whoever is holding the phone that sent it: it is the one
    number that says the schedule they meant is the schedule that landed, and a
    QR that half-decoded is a QR that programs half the trays.

    The stronger acknowledgement is underneath, in the strip, which has already
    been rebuilt from the new plan — every mark a pending square at its new
    time. Showing the plan beats counting it, and the count is still there.
    """
    theme = _palette(canvas, theme)
    _flood(canvas, theme, "SCHEDULE")
    ink = theme["BLACK"]
    _hero_shape(canvas, Shape.SAFE, ink)
    _big_number(canvas, _tray_text(count), ink)
    _frame(canvas, health, theme)


# ── the machine's own states ────────────────────────────────────────────────

def idle(canvas: Canvas, health: Health, *, theme: dict | None = None) -> None:
    """Nothing is happening, which is still worth a frame.

    A blank panel would save power and is the only thing that cannot age a
    screen, and it is the wrong answer: a dark panel is indistinguishable from a
    dead device, and this project has already decided once that that trade is
    unacceptable. So the resting frame answers the three questions somebody has
    when they walk past and nothing is flashing — is it alive, is it all right,
    and when is the next one — and it answers all three without them touching
    anything.

    The hero shows the **next dose**, not the current time. The bar has the wall
    clock; putting a second clock in the hero would be two renderings of one
    fact, and the dose is the thing the machine knows that the wall does not.

    The secondary line is the device's address whenever it has one, and it is
    permanent. That is a fix rather than a decoration: Chrome on Android does no
    mDNS, so those four numbers are the only way into the device's own page for
    about half of everybody who tries — and the frame that used to show them was
    part of a rotation that dropped it exactly when there was an address to
    show.
    """
    theme = _palette(canvas, theme)
    canvas.rect(0, HERO_Y, W, HERO_H, theme["INK"])
    address = _name_text(_field(health, "address"))

    upcoming = _next_upcoming(health)
    if upcoming is not None:
        _hero_shape(canvas, Shape.PENDING, theme["MARK_PENDING"])
        _hero_time(canvas, _clock_text(upcoming.at), theme["TEXT"],
                   secondary=address, secondary_value=theme["TEXT_DIM"])
        _frame(canvas, health, theme, focal=upcoming.at)
        return

    # Nothing left today. The shape loses its tray and re-centres, and the hero
    # falls back to the wall clock — the panel still has a large time on it, and
    # the strip underneath says whether the day is done or was never planned.
    loaded = _field(health, "trays_loaded", 0)
    if loaded:
        _hero_shape(canvas, Shape.PENDING, theme["TEXT_MUTE"])
    else:
        # No prescription at all: an outline, because solid means "we know" and
        # this machine has nothing to know yet.
        stack = 2 * HERO_R + 1
        top = HERO_Y + (HERO_H - stack) // 2
        shapes.draw(canvas, SPLIT // 2, top + HERO_R, HERO_R, Shape.PENDING,
                    theme["TEXT_MUTE"], 2)
    _hero_time(canvas, _clock_text(_field(health, "now")) or "--:--",
               theme["TEXT"], secondary=address,
               secondary_value=theme["TEXT_DIM"])
    _frame(canvas, health, theme)


def _next_upcoming(health: Health):
    """The next dose still to come today, off `health.day`.

    Read from the day rather than from `next_tray`/`next_at` so that the hero
    and the strip cannot disagree about which dose is next — they are drawn from
    one list, in one frame, and a panel that contradicts itself is worse than
    one that says less.
    """
    try:
        for dose in health.day:
            if dose.state == "upcoming":
                return dose
    except Exception:  # noqa: BLE001 - a hand-built Health in a test or selftest
        return None
    return None


def blocked(canvas: Canvas, health: Health, *, theme: dict | None = None) -> None:
    """The machine will not open a tray. Red, and one octagon across the hero.

    Red rather than the amber `missed` uses, and that is the one colour this
    redesign adds. Amber used to mean both "a dose was missed" and "the machine
    is stopped" — the two states the severity grammar exists to separate — and
    the only thing telling them apart was a 2 px outline nobody can resolve
    across a room. Red for stopped is the road-sign convention and it separates
    the pair by hue *and* by lightness, with the triangle-against-octagon
    silhouette as the third channel.

    The bar stays, in full, and that is the point of making this a band takeover
    rather than a screen takeover: the fix for every one of these faults is at
    the other end of a browser, so a blocked machine must still be able to tell
    somebody its address and whether it is on the network. The bar's forced-
    fault chip names the subsystem, so the hero needs no caption and gets none.
    """
    theme = _palette(canvas, theme)
    _flood(canvas, theme, "BLOCKED")
    ink = theme["TEXT"]
    radius = (HERO_H - 2 * PAD - SEC_H - PAD // 2) // 2
    stack = (2 * radius + 1) + PAD // 2 + SEC_H
    top = HERO_Y + (HERO_H - stack) // 2
    shapes.fill(canvas, W // 2, top + radius, radius, Shape.AVOID, ink)

    route = _name_text(_field(health, "address")) or _name_text(_field(health, "ssid"))
    if route:
        _small_centred(canvas, 0, top + 2 * radius + 1 + PAD // 2, W, route, ink, 2)
    _frame(canvas, health, theme)


def boot(canvas: Canvas, health: Health, *, theme: dict | None = None) -> None:
    """The machine has just come up, and says so before it knows anything.

    The three things that follow this in the daemon — the web server, the radio,
    the cloud link — take tens of seconds between them, and a person who has
    just plugged the device in and is looking at a black panel concludes it is
    dead and pulls the plug back out. This is the frame that stops that, and it
    is also what a hard-restarted machine owes whoever is standing there: a
    device that starts deliberately rather than one that flickers.

    The bar is drawn normally and every field on it is empty, which is the
    truth: seven dim icons and `--:--`. Nothing here is conditional on "are we
    booting", so there is no second rendering of the machine's state to keep in
    step with the first.
    """
    theme = _palette(canvas, theme)
    canvas.rect(0, HERO_Y, W, HERO_H, theme["INK"])
    _small_centred(canvas, 0, HERO_Y + HERO_H // 2 - 40, W, "SNAPCARE",
                   theme["TEXT"], 4)

    # Three squares that fill in as the machine gets its bearings. Wordless, and
    # the only progress indication a device with no reader can give.
    side, pitch = 20, 34
    left = (W - (3 * pitch - (pitch - side))) // 2
    stages = (bool(_field(health, "known", False)),
              bool(_field(health, "now")),
              str(_field(health, "wifi")) not in ("", "offline"))
    for index, done in enumerate(stages):
        canvas.rect(left + index * pitch, HERO_Y + HERO_H // 2 + 12, side, side,
                    theme["OK"] if done else theme["RULE"])
    _frame(canvas, health, theme)


def network(canvas: Canvas, health: Health, *, theme: dict | None = None) -> None:
    """Put me on a WiFi network. The one frame that takes the whole panel.

    Everything else here keeps the bar, and this does not, for one reason: a QR
    that does not scan is a device that cannot be set up, and the 36 rows the
    bar would take are the difference between a comfortable module size and a
    marginal one. At this moment the radio's state is not a status item anyway —
    it is the entire screen.

    The passphrase is on the panel, which it never used to be. Without it the
    frame names a network the person cannot join, which is a setup screen that
    politely wastes their time. It protects a hotspot that only exists during
    setup and is derived from the board's serial, so it is not a secret worth
    trading a failed installation for.

    A **failed join** turns the field red and puts the word `PASSWORD` on it.
    That is the one place in this firmware where a word earns its cost: today a
    wrong password and a device nobody has ever configured look identical in the
    room, and the corrective action is specific and unguessable. Cyan there
    would be the machine saying "nobody has set me up yet" to somebody who just
    did.
    """
    theme = _palette(canvas, theme)
    failed = str(_field(health, "wifi")).strip().lower() == "failed"
    tone = "BLOCKED" if failed else "NETWORK"
    ink = theme["TEXT"] if failed else theme["BLACK"]
    canvas.rect(0, 0, W, H, theme[tone])

    ssid = _name_text(_field(health, "ssid")) or "?"
    passphrase = str(_field(health, "passphrase") or "").strip().upper()[:21]

    matrix = qr_art.wifi_matrix(_field(health, "ssid"), _field(health, "passphrase"))
    if matrix is None:
        # No encoder on this card — `segno` is an optional apt package. The
        # names alone still get somebody onto the network; they just have to
        # type them.
        _small_centred(canvas, 0, H // 2 - 44, W, ssid, ink, 3)
        canvas.rect(PAD * 4, H // 2 - 8, W - PAD * 8, 2, ink)
        if passphrase:
            _small_centred(canvas, 0, H // 2 + 12, W, passphrase, ink, 3)
        return

    modules = len(matrix)
    # The QR gets the height it can have, but never so much width that the
    # names beside it stop fitting: a code nobody can read the password for is
    # as useless as one that will not scan.
    scale = max(qr_art.MIN_MODULE,
                min((H - 2 * PAD) // modules, (W // 2) // modules))
    size = modules * scale
    qr_art.paint(canvas, PAD, (H - size) // 2, matrix, scale,
                 theme["BLACK"], theme["WHITE"])

    left = PAD + size + PAD
    width = W - left - PAD
    name_scale = _fit_scale(ssid, width, 3, lines=2)
    y = _wrapped(canvas, left, PAD + 8, width, ssid, ink, name_scale)
    canvas.rect(left + width // 6, y + 4, width - width // 3, 2, ink)
    if passphrase:
        pass_scale = _fit_scale(passphrase, width, 3, lines=2)
        y = _wrapped(canvas, left, y + 14, width, passphrase, ink, pass_scale)
    if failed:
        # Sized to the column it has, not to a scale chosen on the bench. This
        # is the one word on the frame that has to be read, and a clipped
        # `PASSWORI` would be worse than no word at all.
        word_scale = _fit_scale("PASSWORD", width, 3)
        _small_centred(canvas, left, H - PAD - font.HEIGHT * word_scale, width,
                       "PASSWORD", ink, word_scale)


def pair(canvas: Canvas, health: Health, *, theme: dict | None = None) -> None:
    """Photograph me with the app. The second frame that takes the whole panel.

    Why this frame exists
    ---------------------
    Pairing used to mean reading ten characters off a sticker and **typing**
    them into a settings screen. This firmware is attached to an app whose whole
    premise is that its user cannot read, and that flow asked them to transcribe
    a string with no meaning, from a label, into a field they had to find first.

    So the device offers the code the way the app already takes everything else:
    as something to photograph. The app's main camera decodes it and pairs
    itself (`lib/dispenser/qrIntent.ts`), which turns the hardest step of setup
    into the same gesture as every other step.

    Cyan, like `network`
    --------------------
    The same colour on purpose. Both frames mean *setup is not finished and
    somebody in the room has to do something*, and they are consecutive stages
    of one job — the network first, then the phone. A separate colour would
    teach a second vocabulary for the same request.

    Why the QR gets two thirds and not half
    ---------------------------------------
    `network` splits the panel evenly, because there the code and the words
    beside it are alternatives of equal standing — somebody who cannot scan can
    type the SSID and passphrase and get exactly as far.

    Here they are not equal. With a relay configured the payload is a URL, and
    measured on this panel that is a **41-module** code: at half the width it
    lands on `MIN_MODULE` exactly — the floor that module docstring says exists
    to be tripped over, and the size that reads on a bench under a lamp and not
    in a dim hallway at arm's length. At two thirds it is 5 px a module.

    The words are what pays for it. `SCAN WITH THE APP` is a sentence this
    device's user cannot read, and anybody who *can* read it can also recognise
    a QR code on a medical device without being told. The characters stay,
    because those are unguessable and are the whole fallback path: somebody can
    read them to a person on the phone, and a helper with a keyboard can type
    them. So the code text keeps its column and the instruction goes.

    With no encoder on the card (`segno` is optional) the characters are all
    there is, and they get the whole panel rather than a third of it.
    """
    theme = _palette(canvas, theme)
    canvas.rect(0, 0, W, H, theme["NETWORK"])
    ink = theme["BLACK"]

    code = str(_field(health, "claim", "")).strip().upper()
    matrix = qr_art.matrix_for(_field(health, "pair_payload", ""))

    if matrix is None:
        # No encoder, or no code to draw. The characters are the whole frame —
        # they are what somebody types, and they have the width to be legible.
        _small_centred(canvas, 0, H // 2 - 40, W, "SCAN ME WITH THE APP", ink, 2)
        if code:
            scale = _fit_scale(code, W - 2 * PAD, 4)
            _small_centred(canvas, 0, H // 2, W, code, ink, scale)
        return

    modules = len(matrix)
    scale = max(qr_art.MIN_MODULE,
                min((H - 2 * PAD) // modules, (W * 2 // 3) // modules))
    size = modules * scale
    qr_art.paint(canvas, PAD, (H - size) // 2, matrix, scale,
                 theme["BLACK"], theme["WHITE"])

    left = PAD + size + PAD
    width = W - left - PAD
    if not code or width < font.ADVANCE * 4:
        # The QR grew into the column. That is the right trade — a code that
        # scans is the point of the frame — and the characters are still on the
        # printed label, which is where somebody reading them aloud will look.
        return

    # Broken at the hyphen by `_wrapped`, so `DDBQE-` / `KEJ78` rather than a
    # cut in the middle of a group. Vertically centred against the QR, because
    # a short column pinned to the top reads as something that failed to draw.
    code_scale = _fit_scale(code, width, 3, lines=2)
    block = 2 * (font.HEIGHT * code_scale + code_scale)
    _wrapped(canvas, left, (H - block) // 2, width, code, ink, code_scale)


#: The frames that take the whole panel, with no status bar and no schedule band.
#:
#: `indicators` repaints the bar and the strip **on their own** when only their
#: contents changed — a clock minute, a chip going amber — because a full repaint
#: is 38 ms of SPI and those happen every minute. That is right for every frame
#: that has a bar. On these two it draws a bar onto a frame that does not have
#: one, over the top of a QR code somebody is standing there trying to scan.
#:
#: Seen on the bench: the pairing frame stands until a prescription arrives,
#: which can be minutes, so it is the frame most likely to be up when a chip
#: changes — and a bar appeared across the top of it while the code stayed
#: underneath, which reads as a screen that is half stuck.
FULL_PANEL = frozenset({"network", "pair"})


#: `Tone` is re-exported because `indicators.py` still speaks in tones when it
#: decides who owns the screen, and importing it from here keeps that module
#: from reaching into `canvas` for one enum.
_ = Tone
