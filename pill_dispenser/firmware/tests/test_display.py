"""The screen: the drawing, the two panels, and what actually reaches the wire.

None of this needs a panel. Both drivers reach the kernel through `os.open`,
`os.write` and `fcntl.ioctl` and nothing else, so a recording stand-in for those
three is a complete substitute for the hardware — and a much better one for the
things that matter here, because the failures are not "it does not light up",
they are "it lights up and says the wrong thing".

The two that would cost somebody their medication:

  * a page-packed buffer written in the wrong order — a legible picture, rotated
    or interleaved, that a person reads as *something*;
  * the BGR bit inverted on the LCD, which swaps blue and amber and therefore
    swaps *released* and *missed*.

Both are asserted below against the bytes, not against a rendering.
"""
from __future__ import annotations

import os
import struct
from datetime import datetime

import pytest

from snapcare_dispenser.display import NoDisplay, make_display, screens
from snapcare_dispenser.display.canvas import Mono1, Rgb565, Tone
from snapcare_dispenser.display import font, glyphs


# ── the bus, faked at the syscall boundary ──────────────────────────────────

class FakeKernel:
    """Records every write and ioctl. Installed over the `os` calls directly."""

    def __init__(self, monkeypatch, exists: bool = True):
        self.writes: list[bytes] = []
        self.ioctls: list[tuple[int, object]] = []
        self.closed = False
        monkeypatch.setattr(os, "open", lambda *a, **k: 99)
        monkeypatch.setattr(os, "write", self._write)
        monkeypatch.setattr(os, "close", self._close)
        monkeypatch.setattr(os.path, "exists", lambda _p: exists)
        import fcntl
        monkeypatch.setattr(fcntl, "ioctl", self._ioctl)

    def _write(self, _fd, data):
        self.writes.append(bytes(data))
        return len(data)

    def _ioctl(self, _fd, request, arg=0, *_a, **_k):
        self.ioctls.append((request, arg))
        return 0

    def _close(self, _fd):
        self.closed = True

    @property
    def stream(self) -> bytes:
        return b"".join(self.writes)


# ── the canvas ──────────────────────────────────────────────────────────────

def test_the_mono_buffer_is_in_the_panels_own_page_order():
    """`Mono1.buffer()` is handed to the OLED untouched, so its layout is not an
    internal detail — it is the wire format.

    Byte `page*width + x` holds the eight pixels at `(x, page*8 .. +7)` with bit
    0 at the top. Transposed, the picture is legible and wrong, which is the
    only kind of wrong that matters on a screen somebody reads a tray number off.
    """
    canvas = Mono1(128, 64)
    canvas.pixel(0, 0, 1)
    assert canvas.buffer()[0] == 0x01

    canvas = Mono1(128, 64)
    canvas.pixel(0, 8, 1)
    assert canvas.buffer()[128] == 0x01, "page stride is wrong"

    canvas = Mono1(128, 64)
    canvas.pixel(127, 63, 1)
    assert canvas.buffer()[1023] == 0x80
    assert sum(canvas.buffer()) == 0x80, "one pixel lit one bit and nothing else"


def test_rgb565_packs_big_endian():
    canvas = Rgb565(8, 8)
    green = Rgb565.rgb(0, 200, 60)
    canvas.pixel(0, 0, green)
    assert bytes(canvas.buffer()[:2]) == struct.pack(">H", green)


def test_a_full_screen_fill_is_not_a_python_loop_per_pixel():
    """76,800 pixels through `pixel()` is about a second on a Pi 3B, which is a
    visible flash of the wrong colour on every state change."""
    import time

    canvas = Rgb565(320, 240)
    start = time.perf_counter()
    canvas.rect(0, 0, 320, 240, 0x1234)
    assert time.perf_counter() - start < 0.05
    assert bytes(canvas.buffer()[:4]) == b"\x12\x34\x12\x34"


def test_drawing_outside_the_canvas_is_ignored_rather_than_fatal():
    canvas = Mono1(128, 64)
    canvas.pixel(-5, -5, 1)
    canvas.pixel(999, 999, 1)
    canvas.rect(-20, -20, 400, 400, 1)          # must clip, not raise
    canvas.blit(120, 60, (0xFF,) * 7, 5, 1, scale=4)
    assert len(canvas.buffer()) == 128 * 8


# ── the screens ─────────────────────────────────────────────────────────────

PANELS = [Mono1(128, 64), Mono1(128, 32), Mono1(72, 40), Rgb565(320, 240)]


def render_all(canvas):
    """Every state, as the buffer each one produces."""
    when = "08:00"
    return {
        "due": _frame(canvas, screens.due, 3, when),
        "released": _frame(canvas, screens.released, 3),
        "missed": _frame(canvas, screens.missed, 3, when),
        "schedule": _frame(canvas, screens.schedule, 2),
        "network": _frame(canvas, screens.network, "SNAPCARE-V5XH"),
        "idle": _frame(canvas, screens.idle, "12:00", 3, "20:00"),
        "blocked": _frame(canvas, screens.blocked, "clock"),
    }


def _frame(canvas, fn, *args):
    fn(canvas, *args)
    return bytes(canvas.buffer())


@pytest.mark.parametrize("canvas", PANELS, ids=lambda c: f"{c.width}x{c.height}")
def test_every_state_renders_on_every_panel(canvas):
    frames = render_all(canvas)
    assert len(frames) == 7


@pytest.mark.parametrize("canvas", PANELS[:3], ids=lambda c: f"{c.width}x{c.height}")
def test_no_two_states_look_the_same_in_one_bit(canvas):
    """On the OLED there is no colour, so the *picture* carries the whole
    meaning. Two states that render identically there are a device that cannot
    tell somebody the difference between a dose waiting for them and one they
    have already missed."""
    frames = render_all(canvas)
    assert len(set(frames.values())) == len(frames), \
        f"identical frames on {canvas.width}x{canvas.height}"


def test_due_and_missed_are_opposite_polarity_on_the_oled():
    """The pair that must never be confused, on the panel that has one colour.

    `due` lights the panel and `missed` leaves it dark, which is as far apart as
    one bit gets and is readable from a doorway.
    """
    canvas = Mono1(128, 64)
    screens.due(canvas, 3, "08:00")
    lit_due = sum(bin(b).count("1") for b in canvas.buffer())

    canvas = Mono1(128, 64)
    screens.missed(canvas, 3, "08:00")
    lit_missed = sum(bin(b).count("1") for b in canvas.buffer())

    total = 128 * 64
    assert lit_due > total * 0.5, "the due screen must be a lit panel"
    assert lit_missed < total * 0.5, "the missed screen must be a dark panel"


def test_no_screen_renders_a_sentence():
    """The founding constraint, asserted rather than trusted.

    A tray number, a clock and the setup SSID are the only strings allowed. Any
    other run of characters means somebody has started writing instructions on
    a display for a person who may not read.
    """
    seen: set[str] = set()
    original = font.draw

    def spy(canvas, x, y, text, value, scale=1):
        seen.add(text)
        return original(canvas, x, y, text, value, scale)

    import snapcare_dispenser.display.font as font_module
    font_module.draw = spy
    try:
        for canvas in PANELS:
            render_all(canvas)
    finally:
        font_module.draw = original

    for text in seen:
        stripped = text.replace(":", "").replace("-", "").replace(" ", "")
        assert len(text) <= 16, f"too long to be anything but a sentence: {text!r}"
        assert not (stripped.isalpha() and len(stripped) > 9 and "SNAPCARE" not in text), \
            f"that is a word, not a number or an SSID: {text!r}"


def test_a_nonsense_tray_number_is_a_question_mark_not_a_wrong_number():
    """`?` is in the font and is honest. A truncated `123` renders as a
    confident, unmissable `12`, and somebody opens hopper 12."""
    assert screens._tray_text(3) == "3"          # noqa: SLF001
    for bad in (123, -1, None, True, "x", 3.0):
        assert screens._tray_text(bad) == "?", bad  # noqa: SLF001


def test_every_glyph_fits_its_declared_grid():
    """All the glyphs are one square, so they scale to any panel by a whole
    number. A row wider than the span draws off the side of its own box."""
    for name, rows in glyphs.ALL.items():
        assert len(rows) == glyphs.ROWS, f"{name} is {len(rows)} rows, not {glyphs.ROWS}"
        assert all(row < (1 << glyphs.SPAN) for row in rows), \
            f"{name} has a row wider than its {glyphs.SPAN}-bit span"


# ── the OLED ────────────────────────────────────────────────────────────────

def test_the_oled_init_turns_the_charge_pump_on(monkeypatch):
    """`0x8D 0x14`. Without it the panel is dark for ever, on a module that has
    no other power source — and it is the single most common reason an SSD1306
    'does not work'."""
    from snapcare_dispenser.display.ssd1306 import Ssd1306

    kernel = FakeKernel(monkeypatch)
    panel = Ssd1306(bus=1, address=0x3C, width=128, height=64, probe=False)
    assert b"\x8d\x14" in kernel.stream
    panel.close()


def test_the_oled_blanks_its_ram_before_switching_on(monkeypatch):
    """GDDRAM survives a reset and the module has no power switch, so the last
    frame of the previous run is still in it. Switch on first and a settled
    'tray 3 is due' flashes up; somebody presses the button and nothing
    happens."""
    from snapcare_dispenser.display.ssd1306 import Ssd1306

    kernel = FakeKernel(monkeypatch)
    Ssd1306(bus=1, address=0x3C, width=128, height=64, probe=False)

    blank_at = next(i for i, w in enumerate(kernel.writes)
                    if len(w) == 1025 and set(w[1:]) == {0})
    on_at = next(i for i, w in enumerate(kernel.writes) if w == b"\x00\xaf")
    assert blank_at < on_at


def test_the_oled_writes_the_canvas_buffer_byte_for_byte(monkeypatch):
    """The whole reason `Mono1` builds in page order: no repack per frame."""
    from snapcare_dispenser.display.ssd1306 import Ssd1306

    kernel = FakeKernel(monkeypatch)
    panel = Ssd1306(bus=1, address=0x3C, width=128, height=64, probe=False)
    canvas = panel.new_canvas()
    screens.due(canvas, 3, "08:00")

    kernel.writes.clear()
    assert panel.show(canvas)

    data = [w for w in kernel.writes if len(w) > 64]
    assert len(data) == 1, "a 128x64 frame is one transfer"
    assert data[0][0] == 0x40, "the data control byte"
    assert data[0][1:] == bytes(canvas.buffer())


def test_an_oled_that_dies_mid_run_stops_rather_than_raising(monkeypatch):
    """Nothing here may reach the scheduler tick."""
    from snapcare_dispenser.display.ssd1306 import Ssd1306

    kernel = FakeKernel(monkeypatch)
    panel = Ssd1306(bus=1, address=0x3C, width=128, height=64, probe=False)
    canvas = panel.new_canvas()

    def dies(_fd, _data):
        raise OSError(5, "Input/output error")

    monkeypatch.setattr(os, "write", dies)
    assert panel.show(canvas) is False          # must not raise
    assert panel.show(canvas) is False


# ── the LCD ─────────────────────────────────────────────────────────────────

def test_the_lcd_ioctl_numbers_are_encoded_correctly():
    """A wrong size nibble makes the kernel read four bytes where one was
    passed, the ioctl fails with EINVAL at open, and the panel never comes up —
    which gets blamed on the wiring."""
    from snapcare_dispenser.display import ili9341

    def iow(nr, size):
        return (1 << 30) | (size << 16) | (0x6B << 8) | nr

    assert ili9341._SPI_IOC_WR_MODE == iow(1, 1)            # noqa: SLF001
    assert ili9341._SPI_IOC_WR_BITS_PER_WORD == iow(3, 1)   # noqa: SLF001
    assert ili9341._SPI_IOC_WR_MAX_SPEED_HZ == iow(4, 4)    # noqa: SLF001


def test_the_lcd_sets_bgr_in_every_rotation():
    """The bit that swaps red and blue — and therefore swaps *missed* and
    *released*, so the machine says the pills are in the cup an hour after the
    window closed."""
    from snapcare_dispenser.display.ili9341 import _ROTATIONS

    for rotation, (madctl, _w, _h) in _ROTATIONS.items():
        assert madctl & 0x08, f"BGR clear at rotation {rotation}"


def test_the_lcd_landscape_rotations_swap_the_dimensions():
    from snapcare_dispenser.display.ili9341 import _ROTATIONS

    assert _ROTATIONS[0][1:] == (240, 320)
    assert _ROTATIONS[90][1:] == (320, 240)
    assert _ROTATIONS[180][1:] == (240, 320)
    assert _ROTATIONS[270][1:] == (320, 240)


# ── the factory ─────────────────────────────────────────────────────────────

def test_the_factory_constructor_arguments_match_both_drivers():
    """The two are opened by keyword, and a name that does not match is a
    `TypeError` at startup — a panel that is fitted, wired and never opened,
    reported only as 'no display'."""
    import inspect
    import re

    from snapcare_dispenser.display import _open  # noqa: PLC0415
    from snapcare_dispenser.display.ili9341 import Ili9341
    from snapcare_dispenser.display.ssd1306 import Ssd1306

    source = inspect.getsource(_open)
    used = set(re.findall(r"(\w+)=config\.", source))
    accepted = (set(inspect.signature(Ili9341.__init__).parameters)
                | set(inspect.signature(Ssd1306.__init__).parameters))
    assert used <= accepted, f"the factory passes {used - accepted}"


def test_a_machine_with_no_panel_gets_a_display_that_answers(monkeypatch):
    """A build with no screen is valid. It must not be a crash and it must not
    be a `None` every caller has to branch on."""
    monkeypatch.setattr(os.path, "exists", lambda _p: False)
    monkeypatch.setattr(os, "open", lambda *a, **k: (_ for _ in ()).throw(
        FileNotFoundError(2, "No such file or directory")))

    display = make_display("auto")
    assert isinstance(display, NoDisplay)
    assert display.backend == "none"
    display.show(display.new_canvas())      # must not raise
    display.close()


def test_asking_for_no_display_does_not_probe_anything(monkeypatch):
    def explode(*_a, **_k):
        raise AssertionError("nothing should have been opened")

    monkeypatch.setattr(os, "open", explode)
    assert isinstance(make_display("none"), NoDisplay)
