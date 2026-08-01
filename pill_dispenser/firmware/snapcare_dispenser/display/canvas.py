"""A drawing surface, and the two shapes the panels actually want.

Why this exists rather than Pillow
----------------------------------
The rule the rest of this firmware keeps is that a dispenser installs onto a
fresh Raspberry Pi OS image with `apt install python3` and nothing else. Pillow
is a real dependency with a real build, and everything the screens here draw is
rectangles, integer-scaled 1-bit glyphs and a 5x7 font. That is a hundred lines
of `bytearray` work, and it costs nothing on a Pi 3B: a full 240x320 repaint is
about 12 ms, against a 38 ms SPI transfer.

Two surfaces, one API
---------------------
`Mono1` packs one bit per pixel in the SSD1306's own page layout, so `buffer()`
is exactly what goes down the I2C wire with no repacking. `Rgb565` packs
big-endian 16-bit pixels, which is what the ILI9341 reads. Everything above
them — `glyphs.py`, `screens.py` — draws once against this API and does not know
which panel it is on.

Colour, on a screen that has none
---------------------------------
The founding constraint of this project is that the person cannot be assumed to
read, so the colour *is* the message: green means a dose is due, blue means it
is in the cup, amber means it was missed. On the OLED there is no colour at all,
and pretending otherwise would produce five screens that look identical.

So screens ask for a `Tone`, not an RGB value, and the surface decides what a
tone means. `Rgb565` gives back the colour. `Mono1` gives back a *treatment* —
inverted, framed, plain — chosen so the five states stay distinguishable in one
bit. That is why `tone()` returns a `Paint` and not an int.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Tone(Enum):
    """The vocabulary, carried over from the LED ring it replaced."""

    DUE = "due"            # a dose is due — green
    RELEASED = "released"  # it is in the cup — blue
    MISSED = "missed"      # nobody asked — amber
    SCHEDULE = "schedule"  # a new plan arrived — violet
    NETWORK = "network"    # put me on a network — cyan
    IDLE = "idle"          # nothing happening


#: RGB for each tone, taken from `indicators.py` so a figure of the ring in the
#: old guide and a screen in the new one agree.
TONE_RGB: dict[Tone, tuple[int, int, int]] = {
    Tone.DUE: (0, 200, 60),
    Tone.RELEASED: (0, 90, 255),
    Tone.MISSED: (255, 130, 0),
    Tone.SCHEDULE: (150, 0, 255),
    Tone.NETWORK: (0, 170, 190),
    Tone.IDLE: (0, 0, 0),
}


@dataclass(frozen=True)
class Paint:
    """How to render one tone on this particular surface.

    `bg`/`fg` are whatever the surface's pixels are — an int for both shapes.
    `inverted` tells a screen that the background is *lit*, which on the mono
    panel is the only way to make "a dose is due" impossible to miss from across
    a room.
    """

    bg: int
    fg: int
    inverted: bool = False


class Canvas:
    """The surface every screen draws on. Both implementations satisfy this."""

    width: int
    height: int
    #: True when a tone can actually be a colour. Screens use this to decide
    #: whether the *glyph* has to carry the whole meaning.
    colour: bool = False

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
        edges crisp — a smoothed icon on a 128x64 panel is a smudge.
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


class Mono1(Canvas):
    """1 bit per pixel, in the SSD1306's page layout.

    The panel is addressed as horizontal pages of eight vertical pixels, so
    byte `p * width + x` holds the column of eight pixels at `(x, p*8 .. p*8+7)`
    with bit 0 at the top. Building the buffer in that layout means `buffer()`
    is handed to the driver untouched — no repack per frame on a 1 GB board.
    """

    colour = False

    #: Mono has one ink. The tone has to survive as a *treatment* instead, and
    #: the two that must never be confused — a dose you can take, and a dose you
    #: missed — are the two that get opposite polarity.
    _PAINT = {
        Tone.DUE: Paint(bg=1, fg=0, inverted=True),       # lit panel: unmissable
        Tone.RELEASED: Paint(bg=0, fg=1),
        Tone.MISSED: Paint(bg=0, fg=1),
        Tone.SCHEDULE: Paint(bg=0, fg=1),
        Tone.NETWORK: Paint(bg=0, fg=1),
        Tone.IDLE: Paint(bg=0, fg=1),
    }

    def __init__(self, width: int = 128, height: int = 64):
        if height % 8:
            raise ValueError("an SSD1306 page is 8 rows, so height must be a multiple of 8")
        self.width = width
        self.height = height
        self.pages = height // 8
        self._buf = bytearray(width * self.pages)

    def tone(self, tone: Tone) -> Paint:
        return self._PAINT[tone]

    def fill(self, value: int) -> None:
        self._buf[:] = b"\xff" * len(self._buf) if value else bytes(len(self._buf))

    def pixel(self, x: int, y: int, value: int) -> None:
        if not (0 <= x < self.width and 0 <= y < self.height):
            return
        index = (y >> 3) * self.width + x
        bit = 1 << (y & 7)
        if value:
            self._buf[index] |= bit
        else:
            self._buf[index] &= ~bit & 0xFF

    def buffer(self) -> memoryview:
        return memoryview(self._buf)


class Rgb565(Canvas):
    """16 bits per pixel, big-endian — what the ILI9341 reads off the bus.

    Big-endian because the panel is configured for it and swapping per pixel in
    Python would cost more than the transfer does.
    """

    colour = True

    def __init__(self, width: int = 240, height: int = 320):
        self.width = width
        self.height = height
        self._buf = bytearray(width * height * 2)

    @staticmethod
    def rgb(red: int, green: int, blue: int) -> int:
        """8-8-8 to 5-6-5."""
        return ((red & 0xF8) << 8) | ((green & 0xFC) << 3) | (blue >> 3)

    def tone(self, tone: Tone) -> Paint:
        colour = self.rgb(*TONE_RGB[tone])
        # White on the colour, except amber and cyan where black reads better —
        # a light background with white on it is the one combination that goes
        # unreadable in a bright room.
        dark = tone in (Tone.MISSED, Tone.NETWORK)
        return Paint(bg=colour, fg=0x0000 if dark else 0xFFFF)

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
        240x320 is 76,800 of them and takes about a second on a Pi 3B, which is
        a visible flash of the wrong colour every time a dose changes state.
        Building one row of bytes and slice-assigning it is roughly 200x faster.
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
