"""The drawing surface, and the colour vocabulary the screens ask it for.

Why this exists rather than Pillow
----------------------------------
The rule the rest of this firmware keeps is that a dispenser installs onto a
fresh Raspberry Pi OS image with `apt install python3` and nothing else. Pillow
is a real dependency with a real build, and everything drawn here is
rectangles, stroked numerals, integer-scaled 1-bit glyphs and a 5x7 font — a
hundred lines of `bytearray` work.

It is not free, and the honest figure is worth writing down: a complete resting
frame is about 5 ms on a laptop and is budgeted at 50–100 ms on a Pi 3B, against
38.4 ms to push the same frame down the SPI bus. So Python is the larger half of
a full repaint on the target board. What makes that affordable is that a full
repaint is rare — the panel changes a few times a day — and that the two paths
which are actually hot are slice assignments: `Rgb565.rect` below, and the one
`rect` per scanline that `shapes.fill` is built from.

One surface
-----------
There used to be two. `Mono1` packed one bit per pixel in the SSD1306's page
layout, and `tone()` handed a *treatment* back — inverted, framed, plain —
because five states have to stay apart in one ink. The OLED is not on this
board any more, so the whole apparatus is gone with it: `Mono1`,
`Paint.inverted`, and the `Canvas.colour` flag every screen used to branch on
to decide whether the picture or the colour carried the meaning.

`Canvas` itself stays, and not out of sentiment for the second panel. It is the
seam `shapes.py`, `numerals.py` and the screens draw against, it is what lets a
test count lit pixels with no hardware anywhere, and `rect`/`blit`/`centre` are
written once here rather than once per drawing module. There is one
implementation and no plan for a second.

Colour is still the message
---------------------------
That argument was never about which panel was fitted. The founding constraint
is that the person in front of the machine cannot be assumed to read, so the
colour carries the state: green a dose is waiting, blue it is in the cup, amber
nobody asked, violet a new plan arrived, cyan put me on a network, red the tray
will not open. Screens therefore still ask for a `Tone` and never for an RGB
value — they name a *state*, and this file answers with the pixels.

`tone()` still returns a `Paint` rather than one int, because the ink is not a
free choice either. White on the old green measured 2.25:1, below even the 3:1
large-text floor, on the single most important frame in the product. The ink
that goes on each field was measured, and it belongs beside the field it was
measured against rather than at the point where somebody is drawing a digit.

Colour is not the *only* channel: `shapes.py` carries the same states as solid
silhouettes, for the roughly one man in twelve with deuteranopia and for anybody
reading the panel from a doorway. Neither channel is decoration for the other.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Tone(Enum):
    """The vocabulary, carried over from the LED ring it replaced."""

    DUE = "due"            # a dose is waiting on a press — green
    RELEASED = "released"  # it is in the cup — blue
    MISSED = "missed"      # nobody asked — amber
    SCHEDULE = "schedule"  # a new plan arrived — violet
    NETWORK = "network"    # put me on a network — cyan
    BLOCKED = "blocked"    # the tray will not open — red
    IDLE = "idle"          # nothing is happening


#: The field colour for each state, 8-8-8.
#:
#: Every value here was chosen by measuring, not by eye, and three of the
#: choices are load-bearing enough to be worth the paragraph:
#:
#: **DUE moved from (0, 200, 60).** White on the old green was 2.25:1 — a real
#: contrast failure on the frame the whole device exists to show. Black on this
#: green is 10.79:1, which is why `Rgb565.tone` reads it as a dark-ink field.
#:
#: **DUE and MISSED are now far apart in lightness.** The old pair measured
#: L=0.4163 and L=0.3723, a 1.12x ratio: in greyscale, and therefore to a
#: monochromat, they were the same screen. The new pair is 0.4894 against
#: 0.2266 — 2.16x, a plainly lighter and a plainly darker panel from the
#: doorway before hue is considered at all.
#:
#: **BLOCKED is new.** Amber used to mean both "a dose was missed" and "the
#: machine is stopped", which are the two things a severity grammar exists to
#: separate; the only distinction was a 2 px outline nobody can resolve at
#: three metres. Red for stopped is the road-sign convention and separates the
#: pair by hue and by lightness both.
#:
#: `IDLE` is the charcoal the hero rests on rather than pure black, because on
#: an IPS panel with the backlight tied to 3V3 black leaks grey anyway, and a
#: deliberate charcoal reads as a designed surface rather than an unlit one.
#: `theme.INK` is this same triple under the name of a surface.
TONE_RGB: dict[Tone, tuple[int, int, int]] = {
    Tone.DUE: (0, 214, 96),
    Tone.RELEASED: (0, 92, 214),
    Tone.MISSED: (214, 96, 0),
    Tone.SCHEDULE: (150, 92, 236),
    Tone.NETWORK: (0, 160, 176),
    Tone.BLOCKED: (186, 26, 26),
    Tone.IDLE: (14, 16, 22),
}

#: The two inks a state field can be read in, 8-8-8. `theme.py` re-exports the
#: light one as `TEXT` rather than restating it: the contrast ratios in the
#: palette were computed against *these* triples, so a second copy that drifted
#: would quietly invalidate every one of them. The light ink is not pure white
#: — 238,241,245 on the charcoal is 16.78:1, which is as much separation as
#: anybody can use, and it takes the glare off a 320x148 field of it.
INK_LIGHT: tuple[int, int, int] = (238, 241, 245)
INK_DARK: tuple[int, int, int] = (0, 0, 0)


@dataclass(frozen=True)
class Paint:
    """A field and the ink that was measured against it, as packed pixels.

    The pair travels together because it is a pair: the ink is a consequence of
    the field's luminance, not a preference, and a screen that picks its own
    text colour is a screen that can quietly ship 2.25:1.
    """

    bg: int
    fg: int


class Canvas:
    """The surface every screen draws on."""

    width: int
    height: int

    @staticmethod
    def rgb(red: int, green: int, blue: int) -> int:
        """Pack 8-8-8 into whatever one pixel is on this surface."""
        raise NotImplementedError

    def tone(self, tone: Tone) -> Paint:
        raise NotImplementedError

    def fill(self, value: int) -> None:
        raise NotImplementedError

    def pixel(self, x: int, y: int, value: int) -> None:
        raise NotImplementedError

    def buffer(self) -> memoryview:
        raise NotImplementedError

    # ── shared drawing, written once against `pixel` and `fill` ─────────────

    def rect(self, x: int, y: int, w: int, h: int, value: int,
             fill: bool = True) -> None:
        if fill:
            for row in range(max(0, y), min(self.height, y + h)):
                for col in range(max(0, x), min(self.width, x + w)):
                    self.pixel(col, row, value)
            return
        for col in range(x, x + w):
            self.pixel(col, y, value)
            self.pixel(col, y + h - 1, value)
        for row in range(y, y + h):
            self.pixel(x, row, value)
            self.pixel(x + w - 1, row, value)

    def blit(self, x: int, y: int, rows: tuple[int, ...], span: int,
             value: int, scale: int = 1) -> None:
        """Draw a 1-bit bitmap. `rows` is one int per row, MSB leftmost.

        Integer scaling only, because that is all a glyph needs and it keeps
        edges crisp — a smoothed icon at 16x16 is a smudge. Anything that wants
        to be large is geometry instead: `shapes.py` or `numerals.py`.
        """
        for row_index, bits in enumerate(rows):
            for col in range(span):
                if not (bits >> (span - 1 - col)) & 1:
                    continue
                if scale == 1:
                    self.pixel(x + col, y + row_index, value)
                    continue
                self.rect(x + col * scale, y + row_index * scale,
                          scale, scale, value)

    def centre(self, width: int) -> int:
        """Left edge that centres something `width` wide."""
        return (self.width - width) // 2


class Rgb565(Canvas):
    """16 bits per pixel, big-endian — what the ILI9341 reads off the bus.

    Big-endian because the panel is configured for it and swapping per pixel in
    Python would cost more than the transfer does.
    """

    #: The four fields light enough to want black ink. Black on green is
    #: 10.79:1, on amber 5.53:1, on cyan 6.66:1 and on violet 5.04:1; light ink
    #: on any of them is between 1.7:1 and 3.7:1, well under the 4.5:1 floor.
    #: The set grew from `{MISSED, NETWORK}` when the green was re-measured —
    #: white on the old one was 2.25:1 and had shipped.
    _DARK_INK = frozenset({Tone.DUE, Tone.MISSED, Tone.NETWORK, Tone.SCHEDULE})

    #: The panel as it is actually mounted: a landscape `DISPLAY_ROTATION` turns
    #: the 240x320 portrait glass on its side, and every screen in this package
    #: is laid out against 320x240. Which of the two landscape rotations is set
    #: is only which way up, and nothing here can see the difference.
    #:
    #: These are the defaults rather than the glass's native portrait because
    #: the portrait ones were a trap. `Ili9341.new_canvas` and `NoDisplay` both
    #: pass the size explicitly and were always right; a bare `Rgb565()` —
    #: which is what a test, a bench script or a new screen reaches for — got a
    #: surface the wrong way round, and a layout derived from `canvas.width`
    #: then lands somewhere plausible and wrong rather than raising.
    DEFAULT_WIDTH = 320
    DEFAULT_HEIGHT = 240

    def __init__(self, width: int = DEFAULT_WIDTH, height: int = DEFAULT_HEIGHT):
        self.width = width
        self.height = height
        self._buf = bytearray(width * height * 2)

    @staticmethod
    def rgb(red: int, green: int, blue: int) -> int:
        """8-8-8 to 5-6-5."""
        return ((red & 0xF8) << 8) | ((green & 0xFC) << 3) | (blue >> 3)

    @staticmethod
    def mix(a: int, b: int, pct: int) -> int:
        """`pct` per cent of the way from packed colour `a` to packed colour `b`.

        There is one caller and it earns the eight lines: when two doses are
        waiting, the due screen draws a second circle behind the first in the
        field colour taken 45 % towards black. A silhouette of two discs says
        "more than one" wordlessly, which a numeral cannot do for somebody who
        is not reading — but it only works if the shade behind is neither the
        field (invisible) nor the ink (a second, competing shape).

        Blended in 5-6-5 rather than unpacked to 8-8-8 and repacked, because
        both inputs are already pixels and the two answers differ by at most one
        code step. The floor division biases a falling channel down by under a
        step — 1/31 of the red axis at worst, and never visible — and in
        exchange `pct=0` is exactly `a` and `pct=100` is exactly `b`.

        `pct` is clamped rather than checked: this runs on the scheduler tick,
        where nothing may raise, and a caller computing tenths of a window is
        exactly the sort of caller that hands over 11 across a clock step.
        """
        pct = max(0, min(100, pct))
        red, green, blue = (a >> 11) & 0x1F, (a >> 5) & 0x3F, a & 0x1F
        red += ((((b >> 11) & 0x1F) - red) * pct) // 100
        green += ((((b >> 5) & 0x3F) - green) * pct) // 100
        blue += (((b & 0x1F) - blue) * pct) // 100
        return (red << 11) | (green << 5) | blue

    def tone(self, tone: Tone) -> Paint:
        """The field for a state, and the ink that was measured on it."""
        ink = INK_DARK if tone in self._DARK_INK else INK_LIGHT
        return Paint(bg=self.rgb(*TONE_RGB[tone]), fg=self.rgb(*ink))

    def fill(self, value: int) -> None:
        pair = bytes(((value >> 8) & 0xFF, value & 0xFF))
        self._buf[:] = pair * (self.width * self.height)

    def pixel(self, x: int, y: int, value: int) -> None:
        if not (0 <= x < self.width and 0 <= y < self.height):
            return
        index = (y * self.width + x) * 2
        self._buf[index] = (value >> 8) & 0xFF
        self._buf[index + 1] = value & 0xFF

    def rect(self, x: int, y: int, w: int, h: int, value: int,
             fill: bool = True) -> None:
        """Overridden because a filled rectangle is most of what a screen is.

        The generic version is a Python loop per pixel; a full-screen fill on
        320x240 is 76,800 of them and takes about a second on a Pi 3B, which is
        a visible flash of the wrong colour every time a dose changes state.
        Building one row of bytes and slice-assigning it is roughly 200x faster,
        and it is what makes `shapes.fill` affordable as one `rect` per scanline.
        """
        if not fill:
            super().rect(x, y, w, h, value, fill=False)
            return
        left, right = max(0, x), min(self.width, x + w)
        top, bottom = max(0, y), min(self.height, y + h)
        if left >= right or top >= bottom:
            return
        row = bytes(((value >> 8) & 0xFF, value & 0xFF)) * (right - left)
        for line in range(top, bottom):
            start = (line * self.width + left) * 2
            self._buf[start:start + len(row)] = row

    def buffer(self) -> memoryview:
        return memoryview(self._buf)
