"""The screen: the drawing, the panel, and what actually reaches the wire.

None of this needs a panel. The driver reaches the kernel through `os.open`,
`os.write` and `fcntl.ioctl` and nothing else, so a recording stand-in for those
three is a complete substitute for the hardware — and a much better one for the
things that matter here, because the failures are not "it does not light up",
they are "it lights up and says the wrong thing".

There used to be two panels and two such failures. The first — a page-packed
buffer written in the wrong order, a legible picture rotated or interleaved —
left with the OLED, along with the `Mono1` surface that had a wire format to get
wrong at all.

The second is still here and now carries more than it ever did: the BGR bit in
`MADCTL` swaps red and blue, and therefore swaps *missed* for *released*, so the
machine says the pills are in the cup an hour after the window closed. On the
mono panel the picture was a second channel and would have caught it. The
picture is now a solid shape that is the same silhouette in both of those
states, so colour is the whole of what tells them apart, and one bit in one
register is the whole of the colour.

It is asserted below against the bytes, not against a rendering.
"""
from __future__ import annotations

import dataclasses
import os
import struct

import pytest

from snapcare_dispenser.display import NoDisplay, make_display, screens
from snapcare_dispenser.display.health import Health
from snapcare_dispenser.display.canvas import Rgb565, Tone
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
    canvas = Rgb565(320, 240)
    canvas.pixel(-5, -5, 1)
    canvas.pixel(999, 999, 1)
    canvas.rect(-20, -20, 400, 400, 1)          # must clip, not raise
    canvas.blit(316, 236, (0xFF,) * 7, 5, 1, scale=4)
    assert len(canvas.buffer()) == 320 * 240 * 2


# ── the screens ─────────────────────────────────────────────────────────────

#: One panel, and every screen is laid out against it. The list survives the
#: OLED because the parametrisation is what makes a new surface — a bench rig, a
#: second size — cost one line here rather than a rewrite of every test below.
PANELS = [Rgb565(320, 240)]


WELL = Health(dispensing=True, problem="", wifi="online", ssid="SNAPCARE-V5XH",
              address="192.168.1.42", next_tray=3, next_at="20:00",
              now="12:34", waiting=0)
UNWELL = Health(dispensing=False, problem="clock", wifi="offline",
                ssid="SNAPCARE-V5XH", address="", next_tray=3, next_at="20:00",
                now="12:34", waiting=0)
#: A dose waiting on a press. `due` takes no scalars any more — the tray and the
#: time it draws both come off the snapshot — so this is what the state *is*.
WAITING = dataclasses.replace(WELL, waiting=1, waiting_tray=3,
                              waiting_at="08:00", waiting_frac=6)
#: On its own setup network, with the pair a person has to be given to join it.
#: The passphrase is shaped like a real one (`provisioning._ALPHABET`, twelve
#: characters) rather than a word, because that is what the screen will be
#: handed and its length is what the wrapping has to survive.
SETUP = dataclasses.replace(WELL, wifi="hotspot", address="",
                            passphrase="k7mfq3ptx9wd")


def render_all(canvas):
    """Every state, as the buffer each one produces."""
    when = "08:00"
    return {
        "due": _frame(canvas, screens.due, WAITING),
        "released": _frame(canvas, screens.released, WELL, 3),
        "missed": _frame(canvas, screens.missed, WELL, 3, when),
        "schedule": _frame(canvas, screens.schedule, WELL, 2),
        "network": _frame(canvas, screens.network, SETUP),
        "idle": _frame(canvas, screens.idle, WELL),
        "blocked": _frame(canvas, screens.blocked, UNWELL),
        "boot": _frame(canvas, screens.boot, Health()),
    }


def _frame(canvas, fn, *args):
    fn(canvas, *args)
    return bytes(canvas.buffer())


@pytest.mark.parametrize("canvas", PANELS, ids=lambda c: f"{c.width}x{c.height}")
def test_every_state_renders_on_every_panel(canvas):
    frames = render_all(canvas)
    assert len(frames) == 8


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

def test_the_factory_constructor_arguments_match_the_driver():
    """The panel is opened by keyword, and a name that does not match is a
    `TypeError` at startup — a panel that is fitted, wired and never opened,
    reported only as 'no display'.

    This mattered when there were two drivers to keep in step and it matters
    more now that there is one, because there is no longer a second backend for
    `auto` to fall through to: `make_display` catches everything `_open` can
    raise, so a renamed keyword does not surface as a stack trace. It comes out
    as a single WARNING and a `NoDisplay`, which is indistinguishable from a
    ribbon nobody plugged in.
    """
    import inspect
    import re

    from snapcare_dispenser.display import _open  # noqa: PLC0415
    from snapcare_dispenser.display.ili9341 import Ili9341

    source = inspect.getsource(_open)
    used = set(re.findall(r"(\w+)=config\.", source))
    accepted = set(inspect.signature(Ili9341.__init__).parameters)
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
