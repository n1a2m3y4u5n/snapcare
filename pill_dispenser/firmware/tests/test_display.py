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

import collections
import dataclasses
import os
import struct

import pytest

from snapcare_dispenser.display import NoDisplay, make_display, screens
from snapcare_dispenser.display.health import Health
from snapcare_dispenser.display.canvas import Rgb565, Tone
from snapcare_dispenser.display import font, glyphs, theme


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
#: On a network, and nobody has sent it a prescription yet. The payload is the
#: **long** form on purpose — a relay URL is what a configured device prints and
#: it is 46 characters, which is what decides the module count and therefore
#: whether the code is scannable at all. A fixture carrying the short
#: `SNAPCARE-PAIR:` form would pass a sizing this one catches.
PAIRING = dataclasses.replace(
    WELL, prescribed=False, claim="DDBQE-KEJ78",
    pair_payload="https://snapcare-relay.fly.dev/pair#DDBQEKEJ78")


def render_all(canvas):
    """Every state, as the buffer each one produces."""
    when = "08:00"
    return {
        "due": _frame(canvas, screens.due, WAITING),
        "released": _frame(canvas, screens.released, WELL, 3),
        "missed": _frame(canvas, screens.missed, WELL, 3, when),
        "schedule": _frame(canvas, screens.schedule, WELL, 2),
        "network": _frame(canvas, screens.network, SETUP),
        "pair": _frame(canvas, screens.pair, PAIRING),
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
    assert len(frames) == 9


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


def test_the_pairing_code_is_drawn_large_enough_to_scan():
    """The one number on this frame that decides whether it works at all.

    `MIN_MODULE` is 3 px and its docstring says it exists to be tripped over: a
    code at exactly the floor reads on a bench under a lamp and not in a dim
    hallway at arm's length. The pairing frame **was** at the floor — it started
    out splitting the panel evenly like `network` does, and a relay URL is a
    41-module code, so half of 320 gave 3 px a module exactly.

    Asserted as a strict inequality rather than `>= MIN_MODULE`, because
    `qr_art` clamps to the floor and would therefore satisfy any test written
    against it. What is being asserted is that the layout **never has to be
    clamped** — that the frame gives the code more room than the minimum,
    with the longest payload the device can print.
    """
    from snapcare_dispenser.display import qr_art

    matrix = qr_art.matrix_for(PAIRING.pair_payload)
    assert matrix is not None, "segno is needed for this one"
    modules = len(matrix)
    # Reproduces the sizing in `screens.pair`.
    height_allows = (240 - 2 * screens.PAD) // modules
    width_allows = (320 * 2 // 3) // modules
    assert min(height_allows, width_allows) > qr_art.MIN_MODULE, (
        f"a {modules}-module code lands on the unscannable floor: "
        f"height allows {height_allows}, width allows {width_allows}")


def test_the_pairing_frame_survives_a_card_with_no_qr_encoder(monkeypatch):
    """`segno` is an optional apt package, and the frame that needs it is the one
    somebody is standing in front of with a phone. No encoder must degrade to
    the characters, not to a traceback on the scheduler's thread."""
    from snapcare_dispenser.display import qr_art

    monkeypatch.setattr(qr_art, "matrix_for", lambda _payload: None)
    canvas = Rgb565(320, 240)
    screens.pair(canvas, PAIRING)          # must not raise
    assert len(canvas.buffer()) == 320 * 240 * 2


def test_a_nonsense_tray_number_is_a_question_mark_not_a_wrong_number():
    """`?` is in the font and is honest. A truncated `123` renders as a
    confident, unmissable `12`, and somebody opens hopper 12."""
    assert screens._tray_text(3) == "3"          # noqa: SLF001
    for bad in (123, -1, None, True, "x", 3.0):
        assert screens._tray_text(bad) == "?", bad  # noqa: SLF001


def test_every_digit_stands_on_one_line_and_reaches_one_top():
    """The digits are a row before they are characters, and this is measured.

    They were drawn one at a time, each looking right on its own, and shipped
    spanning 98 to 116 rows of a 100 px box with tops 10 rows apart and feet 10
    rows apart. On `08:30` the 8 and the 3 stood over the 0 and hung below it;
    on `12:45` the 4 and the 5 fell short at both ends. Nobody reads a clock one
    digit at a time, so that reads as a fault in the panel rather than as a
    typeface.

    Measured on the rendering rather than on `_STROKES`, because the pen is half
    the metric: a round terminal puts ink a pen radius past the point it was
    told to stop at, so a table that agrees with itself can still draw a row
    that does not.

    The 2 px that is left is the overshoot the round digits are *supposed* to
    have — a circle stopping level with a flat stroke looks smaller than it is —
    and it is asserted as a ceiling rather than removed.
    """
    from snapcare_dispenser.display import numerals

    size, margin = 100, 10
    tops, feet = {}, {}
    for char in "0123456789":
        canvas = Rgb565(120, 140)
        canvas.fill(0)
        numerals.draw_char(canvas, margin, margin, size, char, 0xFFFF)
        pixels = canvas.buffer()
        lit = [row for row in range(140)
               if any(pixels[2 * (row * 120 + col)] or pixels[2 * (row * 120 + col) + 1]
                      for col in range(120))]
        tops[char], feet[char] = min(lit), max(lit)

    assert max(tops.values()) - min(tops.values()) <= 2, \
        f"the digits do not share a cap line: {tops}"
    assert max(feet.values()) - min(feet.values()) <= 2, \
        f"the digits do not share a baseline: {feet}"
    heights = {char: feet[char] - tops[char] for char in tops}
    assert max(heights.values()) - min(heights.values()) <= 4, \
        f"the digits are not one height: {heights}"


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


def test_the_lcd_turns_display_inversion_on():
    """The command that decides whether green means safe or means magenta.

    This module's glass inverts. With no `INVON` in the table the panel was left
    in whatever state it powers up in, and on the bench every primary came back
    as its exact complement — red as cyan, green as magenta, blue as yellow.
    That is not a cosmetic fault on this device: the verdict colours are most of
    what it says, and amber-for-missed arriving as blue is the colour this
    firmware uses for *the dose is in the cup*.

    Asserted against the command table rather than a rendering, for the same
    reason the BGR test is: there is no MISO line, so nothing can read the panel
    back. A screen that is inverted, mirrored or unplugged reports identically —
    the write succeeds in all three. The table is the only place the intent
    exists, so the table is where it is pinned.
    """
    from snapcare_dispenser.display.ili9341 import _INIT, _INVOFF, _INVON

    sent = [cmd for cmd, _params, _wait in _INIT]
    assert _INVON in sent, "the panel is left in its power-up inversion state"
    assert _INVOFF not in sent, "INVOFF would put the fault back"


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


def test_the_panel_uses_the_short_pairing_payload():
    """The panel and the printed label want different codes, and this is why.

    A label is scanned by whatever is to hand, so it prints a URL. The panel is
    photographed with the SnapCare app, which reads both forms — so the URL buys
    nothing there and costs modules, on 2.8 inches of glass at arm's length:

        https://…/pair#DDBQE-KEJ78   41 modules → 5 px a module
        SNAPCARE-PAIR:DDBQE-KEJ78    33 modules → 6 px a module

    Five was the size the bench measurements put right on the edge.
    """
    from snapcare_dispenser.display.health import _pair_fields

    claim, payload = _pair_fields({"relayUrl": "https://snapcare-relay.fly.dev"})
    # Never the *relay's* pairing page: that is a debugging hand-off, and the
    # phone that scans this should land in SnapCare.
    assert "snapcare-relay" not in payload, "the panel points at the relay's page"
    assert claim and claim in payload

    from snapcare_dispenser.display import qr_art
    matrix = qr_art.matrix_for(payload)
    if matrix is not None:                       # needs segno
        modules = len(matrix)
        # Five, not six, and the difference is a decision rather than a slip.
        #
        # The bare `SNAPCARE-PAIR:` form is 33 modules and would give six. The
        # app URL is 37 and gives five — bought with the module that a **phone's
        # own camera** needs to be able to open the code at all. That path is by
        # far the strongest of the three: tens of frames a second and a focus
        # loop, against our decoder's one still photograph.
        #
        # It is not a trade against nothing. The app also scans live now
        # (`lib/hardware/useQrWatch.ts`), which is what actually made a 2.8-inch
        # panel readable; five pixels a module is comfortable when something is
        # looking five times a second and only needs to be right once.
        assert (240 - 2 * screens.PAD) // modules >= 5, \
            f"{modules} modules leaves less than 5 px a module"


def test_the_full_panel_frames_never_get_a_bar_painted_over_them():
    """`network` and `pair` have no status bar, and nothing may draw one on them.

    `indicators` repaints the bar on its own when only its contents changed — a
    minute, a chip going amber — which is right for every frame that has one. On
    these two it painted a strip of status across the top of a QR code somebody
    was holding a phone up to, and left the code showing underneath: a screen
    that reads as half stuck.

    The pairing frame is the one that finds this, because it stands until a
    prescription arrives and is therefore the frame most likely to be up when
    something in the bar changes.
    """
    assert screens.FULL_PANEL == {"network", "pair"}
    from snapcare_dispenser import indicators
    import inspect

    source = inspect.getsource(indicators)
    assert "screens.FULL_PANEL" in source, \
        "the partial-repaint path stopped asking whether the frame has a bar"


# ── the pulse ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("canvas", PANELS, ids=lambda c: f"{c.width}x{c.height}")
def test_the_due_frame_has_a_second_half_to_beat_against(canvas):
    """A still panel reads as a display, and a display is not asking for a press.

    There is no button to draw — the whole glass is the target by design — so
    the only affordance a target that size can carry is motion, and motion needs
    two frames. This is the second one.
    """
    still = _frame(canvas, screens.due, WAITING)
    lit = bytes(_beat(canvas))
    assert lit != still, "the beat frame is identical, so nothing would move"


def _beat(canvas):
    screens.due(canvas, WAITING, beat=True)
    return canvas.buffer()


@pytest.mark.parametrize("canvas", PANELS, ids=lambda c: f"{c.width}x{c.height}")
def test_the_pulse_swaps_the_pair_rather_than_dimming_it(canvas):
    """The same two colours the other way round, so contrast survives the beat.

    Black on this green measures 10.79:1 and the swap is the same pair, so both
    halves of the pulse are legible. A beat drawn by fading or by a third colour
    would spend the contrast this frame was built around — and it is the one
    frame the product cannot afford to make harder to read.
    """
    screens.due(canvas, WAITING)
    still = collections.Counter(_pixels(canvas))
    screens.due(canvas, WAITING, beat=True)
    lit = collections.Counter(_pixels(canvas))

    # 히어로 영역에서 두 색이 자리를 맞바꾼다. 정확한 화소 수까지 같을 필요는 없다
    # (도형과 숫자가 차지하는 면적이 그대로라 대략 뒤집힌다). 확인할 것은 새로운
    # 색이 끼어들지 않았다는 것 — 즉 흐리게 만들거나 제3의 색을 쓰지 않았다는 것이다.
    assert set(lit) <= set(still), "the beat introduced a colour that is not the pair"
    assert lit != still, "nothing swapped"


def _pixels(canvas):
    """The frame as pixel values rather than bytes.

    A 16-bit panel's buffer counted byte by byte answers a question nobody
    asked: every colour becomes two numbers in 0..255 and two different colours
    can share both of them.
    """
    raw = bytes(canvas.buffer())
    if isinstance(canvas, Rgb565):
        return struct.unpack(f">{len(raw) // 2}H", raw)
    return raw


# ── 배출 확인 화면 ──────────────────────────────────────────────────────────

@pytest.mark.parametrize("canvas", PANELS, ids=lambda c: f"{c.width}x{c.height}")
def test_the_released_frame_says_when_not_which_tray(canvas, monkeypatch):
    """트레이 번호는 이 기계가 답할 수 없는 질문에 답하고 있었다.

    "어느 컵인가" 가 전부인 것은 칸마다 배출구가 있는 기계의 이야기다. 이 빌드는
    트레이가 위아래로 쌓여 있고 약이 전부 한 곳으로 떨어지므로, 배출 뒤에 뜨는
    큰 숫자는 앞에 선 사람이 하지도 않은 질문에 답하면서 헷갈리게만 했다.

    같이 지켜지는 것이 하나 더 있다. 이 파일의 규칙은 "어느 상태에서든 화면에서
    가장 큰 것은 시계" 이고, `released` 가 마지막 예외였다.
    """
    drawn = []
    monkeypatch.setattr(screens, "_hero_time",
                        lambda c, text, ink, **kw: drawn.append(("time", text)))
    monkeypatch.setattr(screens, "_big_number",
                        lambda c, text, ink: drawn.append(("number", text)))

    screens.released(canvas, dataclasses.replace(WELL, now="09:14"), 3)

    assert ("time", "09:14") in drawn
    assert not any(kind == "number" for kind, _ in drawn), \
        "the tray number is back, and this machine has one cup"


# ── 새 일정이 왔을 때 ───────────────────────────────────────────────────────

def _pillar_inks(canvas) -> list[int]:
    """The colour of each of the eight pillars, read off the rendered frame.

    Sampled from the pixels rather than from a spy on the drawing helper: the
    thing this screen has to get right is *which* pillar is green, and a spy on
    a call that takes a set would pass just as happily with the stack drawn
    upside down.
    """
    pixels = _pixels(canvas)
    middle = screens.HERO_RX + screens.HERO_RW // 2
    inks = []
    for index in range(screens._PILLARS):        # noqa: SLF001
        row = (screens.HERO_Y + screens.PAD + screens._PILLAR_PAD  # noqa: SLF001
               + index * (screens._PILLAR_H + screens._PILLAR_GAP)  # noqa: SLF001
               + screens._PILLAR_H // 2)         # noqa: SLF001
        inks.append(pixels[row * canvas.width + middle])
    return inks


@pytest.mark.parametrize("canvas", PANELS, ids=lambda c: f"{c.width}x{c.height}")
def test_the_schedule_frame_shows_which_trays_as_a_stack(canvas):
    """개수가 아니라 **어느 칸**이고, 이제 숫자가 아니라 그림이다.

    이 화면은 일정을 보낸 사람에게 하는 답이고, 두 칸짜리 기계에서 "몇 칸" 은 1
    아니면 2 라 알려주는 것이 거의 없다. 숫자 하나로는 모호하기까지 했다 — `2` 가
    두 칸인지 2번 칸인지 화면만 봐서는 못 갈랐다.

    번호 목록도 읽어야 한다는 문제가 남아 있었다. 지금은 기계 모양 그대로 여덟 칸을
    위에서 아래로 쌓아 놓고, 이번 일정이 쓰는 칸만 초록으로 칠한다. **초록이 어디
    있느냐**가 답이므로 세어 볼 것도, 읽을 것도 없다.

    픽셀에서 읽는다. 위아래가 뒤집힌 스택은 호출을 엿보는 테스트로는 절대 안 잡힌다.
    """
    palette = theme.pack(canvas)

    screens.schedule(canvas, WELL, (2,))
    assert _pillar_inks(canvas) == [palette["FAULT"], palette["OK"]] + \
        [palette["FAULT"]] * 6, "2번 칸 하나짜리 일정이 다른 칸을 켰다"

    screens.schedule(canvas, WELL, (1, 2))
    assert _pillar_inks(canvas) == [palette["OK"]] * 2 + [palette["FAULT"]] * 6

    # 여덟 번째 칸은 스택의 맨 아래다. 오프바이원이면 여기서 걸린다.
    screens.schedule(canvas, WELL, (8,))
    assert _pillar_inks(canvas) == [palette["FAULT"]] * 7 + [palette["OK"]]


@pytest.mark.parametrize("canvas", PANELS, ids=lambda c: f"{c.width}x{c.height}")
def test_an_unknown_plan_is_eight_grey_trays_and_not_eight_broken_ones(canvas):
    """예전에는 호출부가 아무것도 안 넘기면 **기계의 칸 수**가 떴다.

    두 호출부가 실제로 그랬고, 그래서 일정을 설명해야 할 자리에 `8` 이 자신 있게
    떠 있었다. 모르면 모른다고 해야 한다 — 그런데 그림에서 "모른다" 를 빨강으로
    칠하면 이번에는 여덟 칸이 전부 빠졌다는 훨씬 센 주장이 된다. 회색이다.
    """
    assert screens._tray_set(None) is None       # noqa: SLF001
    assert screens._tray_set(()) is None         # noqa: SLF001
    assert screens._tray_set("nonsense") is None  # noqa: SLF001
    # 이 기계에 없는 칸은 8번으로 끌어다 붙이지 않고 버린다.
    assert screens._tray_set((9, 0, -1)) is None  # noqa: SLF001
    assert screens._tray_set((1, 99)) == frozenset({1})  # noqa: SLF001

    palette = theme.pack(canvas)
    screens.schedule(canvas, WELL, None)
    assert _pillar_inks(canvas) == [palette["TEXT_MUTE"]] * 8
    assert palette["FAULT"] not in _pillar_inks(canvas)


# ── the bar's date ──────────────────────────────────────────────────────────

def test_the_bar_carries_a_date():
    """The panel knew the minute and not the day.

    That is fine for the minute you are standing in front of it and wrong for
    every other question this machine gets asked — "did it give the Tuesday
    dose", "how long has it been sitting like that", "is it even running today".
    The strip underneath draws a whole day of doses and, without this, that day
    was *some* day.
    """
    from snapcare_dispenser.display import bar

    assert bar._date(Health(known=True, today="26-08-04", clock_source="ntp")) == "26-08-04"


def test_the_date_does_not_outlive_the_clock_that_made_it():
    """A machine that will not vouch for the time cannot name the day either.

    `--:--` beside a confident `04-08` would be the panel disclaiming the easy
    half of a fact and asserting the hard half of the same one.
    """
    from snapcare_dispenser.display import bar

    blind = Health(known=True, now="14:32", today="26-08-04", clock_source="untrusted")
    assert bar._clock(blind) == ("--:--", True)
    assert bar._date(blind) == "", "the date survived a clock nobody vouches for"
    assert bar._date(Health()) == ""
    # 옛 `DD-MM` 은 이제 날짜가 아니다. 다섯 자를 여덟 자 자리에 그리면 그것은
    # 연도가 빠진 날짜가 아니라 **다른 날짜**로 읽힌다.
    assert bar._date(Health(known=True, today="04-08", clock_source="ntp")) == ""


def test_the_date_is_blank_rather_than_dashes():
    """Five dashes read as a rule, not as a date.

    The clock gets away with `--:--` because the colon survives and it still
    reads as a clock with nothing in it. `-----` reads as a rendering fault, and
    the clock's own dashes two centimetres away are already saying the whole of
    what there is to say.
    """
    from snapcare_dispenser.display import bar

    assert "-" not in bar._date(Health(known=True))


def test_the_coin_cell_borrows_the_clock_chip_rather_than_keeping_its_own():
    """Six chips, and the sixth slot became the date.

    The coin cell is not a subsystem — it is the battery of the chip the CLOCK
    slot already names, read out of the same `rtc.read_status()`. Two pictures
    over one subsystem is the redundancy this row spends its docstring arguing
    against, and it was the only slot that could be given up without losing a
    subsystem.

    Worst of the two wins, in severity order: a stopped clock shuts the tray
    today, a flat cell shuts it after the next power cut.
    """
    from snapcare_dispenser.display import bar

    assert "CELL" not in bar.SLOTS
    assert bar.PROBLEM_SLOT["cell"] == "CLOCK"

    def chip(**kw):
        return dict(zip(bar.SLOTS, bar._read(Health(known=True, **kw))))["CLOCK"][1]

    assert chip(clock_source="ntp", cell="ok") == bar.OK
    assert chip(clock_source="ntp", cell="flat") == bar.ATTENTION, \
        "a good clock with a flat cell lost its warning"
    assert chip(clock_source="untrusted", cell="ok") == bar.FAULT
    assert chip(clock_source="untrusted", cell="flat") == bar.FAULT


def test_the_date_and_the_clock_clear_the_last_chip():
    """The check that makes the bar's empty right-hand end a proof.

    Both strings are a fixed length by construction (`_clock` five, `_date`
    eight), so this is arithmetic rather than a hope — and it runs at import,
    which is why widening the row back fails with a traceback naming the line
    rather than with a date drawn across the SD-card chip on the 30th.
    """
    from snapcare_dispenser.display import bar, numerals

    used = (numerals.text_width("00:00", bar.CLOCK_H) + bar.DATE_GAP
            + numerals.text_width("00-00-00", bar.DATE_H))
    free = bar.W - bar.BAR_PAD - (bar.SLOT_X(len(bar.SLOTS) - 1) + bar.SLOT_W)
    assert used <= free, f"the right-hand end needs {used} px and has {free}"


def test_the_when_block_keeps_clear_of_the_rule():
    """A numeral's ink runs past its own box, so the rows at each end are ink.

    Stacking the clock over the date was tried and this is the test that would
    have caught it: 20 + 1 + 11 fits 34 rows on paper and puts the clock against
    the band's top edge and the date's feet through the rule. Rendered, it reads
    as a rendering fault rather than as a design.

    Three rows of clearance rather than one. One is what the arithmetic allows;
    three is what survives a pen radius at both ends plus a font that is not this
    one.
    """
    from snapcare_dispenser.display import bar

    assert bar.CLOCK_Y >= 3, "the clock is against the band's top edge"
    assert bar.DATE_Y + bar.DATE_H <= bar.FACE_H - 3, "the date reaches the rule"
    assert bar.CLOCK_Y + bar.CLOCK_H <= bar.FACE_H - 3
    assert bar.CLOCK_H > bar.DATE_H, "the minute must be the bigger of the two"
    # 밑선을 맞춘다. 가운데를 맞추면 둘이 한 줄에 앉은 것으로 안 읽힌다.
    assert bar.DATE_Y + bar.DATE_H == bar.CLOCK_Y + bar.CLOCK_H


# ── 하루가 끝난 얼굴 ────────────────────────────────────────────────────────

def _idle_of(day, **over):
    base = dict(known=True, dispensing=True, wifi="online", relay="connected",
                clock_source="ntp", cell="ok", power="ok", storage="ok",
                trays_loaded=3, prescribed=True, now="22:40", today="26-08-04")
    base.update(over)
    return Health(day=day, **base)


def _dose(at, minutes, state):
    from snapcare_dispenser.display.health import Dose
    return Dose(tray=1, minutes=minutes, at=at, state=state)


@pytest.mark.parametrize("canvas", PANELS, ids=lambda c: f"{c.width}x{c.height}")
def test_a_finished_day_does_not_look_like_a_waiting_one(canvas):
    """오늘 것을 다 먹은 화면과 아직 남은 화면이 달라야 한다.

    이 프레임이 하루 중 가장 오래 서 있다 — 복용은 서너 번이고 나머지 스무 시간은
    이것이 떠 있다. 그 스무 시간 동안 부엌에 서 있던 그림이 회색 네모였고, 그것은
    등급이 아니라는 것을 말하려고 등급의 모양을 빌려 쓴 것이라 보는 사람에게는
    "무언가 대기 중" 으로 읽혔다.
    """
    done = (_dose("07:00", 420, "taken"), _dose("12:00", 720, "taken"))
    waiting = (_dose("07:00", 420, "taken"), _dose("23:00", 1380, "upcoming"))

    assert _frame(canvas, screens.idle, _idle_of(done)) \
        != _frame(canvas, screens.idle, _idle_of(waiting))


@pytest.mark.parametrize("canvas", PANELS, ids=lambda c: f"{c.width}x{c.height}")
def test_the_machine_does_not_smile_at_a_missed_day(canvas):
    """이 기계가 할 수 있는 가장 나쁜 거짓말이다.

    "다음이 없다" 로는 웃을 근거가 안 된다 — 오늘 것을 다 걸러도 다음은 없다. 약을
    안 먹었는데 화면이 잘했다고 말하면 그 사람은 자기가 먹었다고 믿게 된다.

    `unknown` 도 웃지 않는다. 장부에 없는 지난 복용은 "안 먹었다" 가 아니라 "모른다"
    이고, 모르는 것 위에 웃는 얼굴을 얹는 것은 확신 없는 자리에 확신을 그리는 일이다.
    """
    done = (_dose("07:00", 420, "taken"), _dose("12:00", 720, "taken"))
    smiling = _frame(canvas, screens.idle, _idle_of(done))

    for spoilt in ("missed", "unknown"):
        day = (_dose("07:00", 420, "taken"), _dose("12:00", 720, spoilt))
        assert _frame(canvas, screens.idle, _idle_of(day)) != smiling, spoilt


@pytest.mark.parametrize("canvas", PANELS, ids=lambda c: f"{c.width}x{c.height}")
def test_an_empty_day_is_not_a_finished_day(canvas):
    """처방이 없는 기계와 오늘 것을 끝낸 기계는 다르다.

    둘이 같은 얼굴을 하면 그 얼굴이 아무것도 말하지 않는 것이 된다 — 공장 초기화
    직후의 기계가 하루를 잘 마친 것처럼 보인다.
    """
    done = (_dose("07:00", 420, "taken"),)
    assert _frame(canvas, screens.idle, _idle_of(())) \
        != _frame(canvas, screens.idle, _idle_of(done))


def test_the_smile_stays_inside_its_column():
    """왼쪽 칸 밖으로 새면 시각을 덮는다. 시각은 이 프레임에서 가장 큰 요소다."""
    from snapcare_dispenser.display import screens as scr

    canvas = Rgb565(320, 240)
    canvas.fill(0)
    scr._hero_smile(canvas, 0xFFFF, 0x0000)

    raw = bytes(canvas.buffer())
    for y in range(scr.HERO_Y, scr.HERO_Y + scr.HERO_H):
        for x in range(scr.SPLIT, 320):
            i = 2 * (y * 320 + x)
            assert raw[i] == 0 and raw[i + 1] == 0, f"얼굴이 {x},{y} 까지 샜다"


@pytest.mark.parametrize("canvas", PANELS, ids=lambda c: f"{c.width}x{c.height}")
def test_the_box_being_off_is_not_the_person_missing_a_dose(canvas):
    """거른 복용에 두 가지가 있고, 얼굴은 그 둘을 갈라야 한다.

    불이 켜지고 소리가 났는데 아무도 안 눌렀으면 그것은 사람이 거른 것이다.
    그 한 시간 내내 기계가 꺼져 있었거나 시계를 못 믿어서 아예 안 내밀었으면 —
    `window-closed` — 사람은 거를 기회조차 없었다.

    뒤쪽을 사람의 실패로 세면 **상자를 하루 꺼 뒀다는 이유로** 웃는 얼굴이 사라지고,
    그 다음부터 이 얼굴은 사람이 한 일과 무관해진다.

    띠는 여전히 둘 다 삼각형으로 그린다. 어느 쪽이든 약이 안 나갔고 누군가는 알아야
    한다 — 얼굴이 답하는 물음과 띠가 답하는 물음이 다를 뿐이다.
    """
    from snapcare_dispenser.display.health import Dose

    taken = Dose(tray=1, minutes=420, at="07:00", state="taken")
    unoffered = Dose(tray=2, minutes=720, at="12:00", state="missed", offered=False)
    ignored = Dose(tray=2, minutes=720, at="12:00", state="missed", offered=True)

    # 얼굴의 물음만 잰다. 프레임 전체를 견주면 띠가 그리는 조각 수까지 섞여서,
    # 얼굴이 맞아도 실패한다 — 재려는 것과 다른 것을 재는 시험이 된다.
    assert screens._day_is_done(_idle_of((taken, unoffered))), \
        "기계가 안 내민 복용 때문에 웃음이 사라졌다"
    assert not screens._day_is_done(_idle_of((taken, ignored))), \
        "사람이 거른 복용인데도 웃고 있다"

    # 그리고 그 둘은 화면에서 실제로 달라야 한다 — 하루의 모양이 같으므로
    # 갈리는 것은 얼굴뿐이다.
    assert _frame(canvas, screens.idle, _idle_of((taken, unoffered))) \
        != _frame(canvas, screens.idle, _idle_of((taken, ignored)))


def test_a_day_the_box_slept_through_does_not_smile():
    """하나도 안 내민 날은 "다 먹은 날" 이 아니라 "아무 일도 없던 날" 이다.

    가져간 것이 하나는 있어야 한다. 안 그러면 상자를 꺼 둔 하루가 하루를 잘 마친
    것처럼 보인다.
    """
    from snapcare_dispenser.display import screens as scr
    from snapcare_dispenser.display.health import Dose

    slept = (Dose(tray=1, minutes=420, at="07:00", state="missed", offered=False),
             Dose(tray=2, minutes=720, at="12:00", state="missed", offered=False))
    assert not scr._day_is_done(_idle_of(slept))
    assert scr._day_is_done(_idle_of((Dose(tray=1, minutes=420, at="07:00", state="taken"),)))
