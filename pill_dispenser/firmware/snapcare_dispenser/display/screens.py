"""One frame per state. This is the interface, and the rest is plumbing.

The frame is two bands
----------------------
Every screen in this file draws the whole panel, and it draws it in the same
two pieces:

    bar       y  0..35    what the machine is        `bar.py`
    calendar  y 36..239   three days of doses        `calendar.py`

There used to be three. A `hero` band sat between them showing the one dose that
mattered as a large clock, and a `strip` along the bottom showed today as a row
of coloured shapes — which meant the same dose was drawn twice, in two
vocabularies, and neither of them could say anything about yesterday.

The calendar answers all of it in one picture, so this file's job has shrunk to
two things: hand the calendar the snapshot, and get out of the way. The one
frame that genuinely needs the panel to itself is a dose ringing — see `due`,
which puts a checkbox the size of a hand over the calendar, because that is the
one moment the machine is asking for something rather than reporting.

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

from . import (PANEL_HEIGHT, PANEL_WIDTH, bar, calendar, checkbox, font,
               qr_art, shapes, theme as theme_mod)
from .canvas import Canvas, Tone
from .health import Health
from .shapes import Shape

__all__ = ["due", "released", "missed", "network", "blocked", "idle", "boot"]

W = PANEL_WIDTH
H = PANEL_HEIGHT

#: The universal margin. A twentieth of the short side — the panel sits behind a
#: bezel in the printed case and ink that runs to the framebuffer's edge is ink
#: with a slice missing once it is screwed down.
PAD = H // 20                                   # 12

#: Everything under the bar. The calendar owns it on every frame but the alarm,
#: and `calendar.py` is where its own subdivisions live — these two are here
#: because the frames that are *not* the calendar (`blocked`, `boot`) still have
#: to know where the region starts and how tall it is.
HERO_Y = bar.BAR_H                              # 36
HERO_H = H - bar.BAR_H                          # 204

#: The secondary line under the time: an address, or a date. Two rows of the
#: 5x7 face, which is an arm's-length element and is honest about it.
SEC_H = 2 * font.HEIGHT                         # 14


# ── turning whatever the caller had into something drawable ─────────────────
#
# These four are unchanged from the frames this file replaced. They were the
# part that was already right: every one of them exists because a screen that
# nobody can read must never be *wrong*, and each has a specific wrong answer it
# was written to refuse.

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


def _frame(canvas: Canvas, health: Health, theme: dict) -> None:
    """The status bar. Every screen but `network` and `pair` starts here."""
    bar.draw(canvas, health, theme)


def _calendar_frame(canvas: Canvas, health: Health, theme: dict,
                    highlight: str = "") -> None:
    """The bar and the calendar — the panel in its ordinary state.

    Three of the frames below are this and nothing else, differing only in
    whether a coloured frame is drawn round the calendar for a few seconds.
    That is the whole point of the redesign: **the resting screen is the
    answer**, so an event does not replace it with a picture of itself, it
    marks it and lets somebody look at the thing that changed.
    """
    _frame(canvas, health, theme)
    calendar.draw(canvas, health, theme, highlight=highlight)


# ── the dose states ─────────────────────────────────────────────────────────

#: The alarm's checkbox, and the room round it. Sized down from the band rather
#: than up from a guess: the box is what is left after the margin, the dose's
#: own time under it and the window bar under that.
ALARM_TIME_H = font.HEIGHT * 3                  # 21
ALARM_BAR_H = 6
ALARM_GAP = 8
ALARM_BOX = (HERO_H - 2 * PAD - ALARM_TIME_H - ALARM_BAR_H - 2 * ALARM_GAP)
ALARM_BLOCK = ALARM_BOX + ALARM_TIME_H + ALARM_BAR_H + 2 * ALARM_GAP
ALARM_X = (W - ALARM_BOX) // 2
ALARM_Y = HERO_Y + (HERO_H - ALARM_BLOCK) // 2

#: How many frames the tick is drawn over when somebody presses the glass, and
#: the last one — a complete tick — is what stays on the panel until the next
#: repaint. Six is enough that a person sees a stroke rather than a state
#: change, and few enough that the whole animation is under a third of a second
#: of SPI on a bus where one frame is 38 ms.
CHECK_STEPS = 6


def due(canvas: Canvas, health: Health, *, theme: dict | None = None,
        beat: bool = False, check: int = 0) -> None:
    """A dose is waiting on a press: one checkbox, the size of a hand.

    This is the only frame that covers the calendar, and it is the only moment
    the machine is *asking* rather than reporting. What it asks for is a press,
    and the picture is the thing to press — a box waiting to be ticked, at 137
    px, in the middle of the glass, over the whole of which is the touch target
    (see `touch.py`).

    **It blinks, and that is the affordance.** A still panel reads as a display:
    somebody who has been told the machine will tell them when to take a pill
    sees a picture with a time on it, which is a machine reporting, and
    reporting is not asking. `beat` is flipped by the chirp thread on the same
    rhythm as the buzzer, and it does not swap colours or flash the panel — it
    lifts the box out of the surface and lets it settle back. Brighter and
    darker, so the movement is on the object somebody is being asked to touch
    and nowhere else.

    `check` is the answer. Nought is the empty box; `CHECK_STEPS` is a finished
    green tick, and the frames between are the tick being *drawn*, in the
    direction a hand would draw it. It runs while the servo is already turning,
    so the picture of the dose being taken and the pill arriving in the cup are
    one event rather than an animation followed by a wait.

    Nothing else is on this frame but the time the dose was due for and how much
    of its window is left. There is no tray number, here or anywhere else on
    this panel: every hopper drops into the same cup, so which one it came from
    is a fact about the inside of the machine and never a thing the person in
    front of it has to know.
    """
    theme = _palette(canvas, theme)
    _frame(canvas, health, theme)
    canvas.rect(0, HERO_Y, W, HERO_H, theme["INK"])

    # Brighter and darker, not two colours. The box is one object and the beat
    # is it catching the light; a colour swap would be a second state somebody
    # has to work out is the same box.
    lift = theme["TEXT"] if beat else canvas.mix(theme["TEXT"], theme["INK"], 45)
    canvas.rect(ALARM_X, ALARM_Y, ALARM_BOX, ALARM_BOX, lift)
    frame_w = max(2, ALARM_BOX // 22)
    canvas.rect(ALARM_X + frame_w, ALARM_Y + frame_w,
                ALARM_BOX - 2 * frame_w, ALARM_BOX - 2 * frame_w,
                theme["RULE"] if beat else canvas.mix(theme["RULE"], theme["INK"], 40))

    if check > 0:
        checkbox.draw_tick(canvas, ALARM_X, ALARM_Y, ALARM_BOX, theme["OK"],
                           check, CHECK_STEPS)

    when = _clock_text(_field(health, "waiting_at"))
    _small_centred(canvas, 0, ALARM_Y + ALARM_BOX + ALARM_GAP, W,
                   when or "--:--", theme["TEXT"], 3)
    _window_bar(canvas, health, theme,
                ALARM_Y + ALARM_BOX + ALARM_GAP + ALARM_TIME_H + ALARM_GAP)


def _window_bar(canvas: Canvas, health: Health, theme: dict, y: int) -> None:
    """How much of the release window is left, as a bar rather than a number.

    The offer is not open-ended — an untapped dose is recorded missed when the
    hour runs out — and until this existed the only place that hour appeared was
    in the log afterwards.

    Quantised to tenths on purpose. A bar driven by the real remainder would
    change on every tick and force a repaint four times a minute for a
    difference nobody can see; ten steps in an hour is a bar that visibly moves
    and costs ten frames.
    """
    frac = _field(health, "waiting_frac", 0)
    if not isinstance(frac, int) or not 0 < frac <= 10:
        return
    width = ALARM_BOX
    left = (W - width) // 2
    canvas.rect(left, y, width, ALARM_BAR_H, theme["RULE"])
    # Not green. On this frame green means one thing — the box has been ticked,
    # the dose is taken — and a green bar draining away beneath an untouched box
    # would be the same colour saying "done" and "not done yet" on one screen.
    canvas.rect(left, y, width * frac // 10, ALARM_BAR_H, theme["TEXT_DIM"])


def released(canvas: Canvas, health: Health, *, theme: dict | None = None) -> None:
    """The pills are in the cup.

    **No frame of its own any more, and this one is only reached by the
    commissioning colour walk.** The release is already answered twice over: the
    tick is drawn under the finger that asked for it, and the calendar row for
    that dose is ticked a second later by the ordinary repaint. A screen
    announcing the release on top of that is the machine reporting something the
    person has just watched happen, and it delays the calendar they want back —
    reported from the bench in those words: "차라리 빨리 메인 화면으로
    돌아가주는 게 더 중요할 듯."
    """
    theme = _palette(canvas, theme)
    _calendar_frame(canvas, health, theme)


def missed(canvas: Canvas, health: Health, *, theme: dict | None = None) -> None:
    """A dose went untaken, or its window closed.

    The calendar, with an amber frame round it for the dwell. The dose itself is
    already a red cross in its own row, on the day it belongs to — which is a
    better answer than the full-screen amber panel this replaced, because it
    says *which* dose without a caption and leaves the rest of the day visible
    beside it.

    The frame is what makes it an event rather than a state. Somebody walking
    past a panel that has silently grown a cross has no reason to look; a border
    that was not there a minute ago is what turns the head, and then the thing
    they turn towards is the calendar rather than a picture of a triangle.

    Red, and the *same* red as the cross inside it — not the amber this state
    used to flood the panel with. Two borders now exist and they have to be told
    apart at a glance from across a room: amber means the plan changed, red
    means a dose did not happen. Tying the border to the mark it is pointing at
    makes that one fact in one colour instead of two things to learn, and it was
    a real risk — the amber `MISSED` field colour and the `NEW_PLAN` orange are
    within a shade of each other on this panel.
    """
    theme = _palette(canvas, theme)
    _calendar_frame(canvas, health, theme, highlight="FAULT")


# ── the machine's own states ────────────────────────────────────────────────

def idle(canvas: Canvas, health: Health, highlight: bool = False, *,
         theme: dict | None = None) -> None:
    """The resting frame, which is now the whole interface.

    Three days of checkboxes and the status bar. It answers, without anybody
    touching anything: is it alive, is it all right, did I take last night's, is
    one coming, and what did I miss. The frame it replaced answered the middle
    three not at all — it drew the next dose as a large clock and today as a row
    of coloured shapes, and yesterday existed only in the phone app, which is
    the one object the person this device is for does not have in their hand.

    `highlight` is the ten seconds after a schedule arrives. It is `True` for a
    plan that has just landed and it draws an amber border round the calendar —
    see `calendar.draw`. A violet screen used to take the whole panel to
    announce that the schedule had changed, which is the wrong way round: the
    answer to "a new schedule arrived" is to show the new schedule.
    """
    theme = _palette(canvas, theme)
    _calendar_frame(canvas, health, theme,
                    highlight="NEW_PLAN" if highlight else "")


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
    truth: six dim icons and `--:--`. Nothing here is conditional on "are we
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

#: The frames that show the calendar under the bar, and therefore the frames
#: whose bottom 204 rows `indicators` may repaint on their own when a dose
#: settles.
#:
#: `due` is deliberately absent and it is the whole reason this set exists. The
#: alarm covers those rows with a checkbox the size of a hand, so a partial
#: calendar repaint under it would wipe out the one frame this device exists
#: for — silently, in the middle of the ten minutes somebody is meant to be
#: looking at it — because a dose in another column happened to change state.
CALENDAR = frozenset({"idle", "released", "missed"})


#: `Tone` is re-exported because `indicators.py` still speaks in tones when it
#: decides who owns the screen, and importing it from here keeps that module
#: from reaching into `canvas` for one enum.
_ = Tone
