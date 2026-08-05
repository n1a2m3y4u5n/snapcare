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


def _dose(at, minutes, state, **over):
    from snapcare_dispenser.display.health import Dose
    return Dose(tray=over.pop("tray", 1), minutes=minutes, at=at, state=state,
                **over)


def _days(yesterday=(), today=(), tomorrow=()):
    """Three columns, the way `health.snapshot` builds them."""
    from snapcare_dispenser.display.health import Day
    return (Day(label="AUG 04", date="26-08-04", today=False, doses=yesterday),
            Day(label="AUG 05", date="26-08-05", today=True, doses=today),
            Day(label="AUG 06", date="26-08-06", today=False, doses=tomorrow))


#: A day with one of each state on it, so a frame drawn from this fixture
#: exercises every checkbox the calendar can draw.
_TODAY = (_dose("08:00", 480, "taken"), _dose("13:00", 780, "missed"),
          _dose("20:00", 1200, "upcoming"))

WELL = Health(dispensing=True, problem="", wifi="online", ssid="SNAPCARE-V5XH",
              address="192.168.1.42", next_tray=3, next_at="20:00",
              now="12:34", waiting=0, day=_TODAY,
              days=_days(today=_TODAY,
                         yesterday=(_dose("08:00", 480, "taken"),),
                         tomorrow=(_dose("08:00", 480, "upcoming"),)))
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
    return {
        "due": _frame(canvas, screens.due, WAITING),
        "released": _frame(canvas, screens.released, WELL),
        "missed": _frame(canvas, screens.missed, WELL),
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


# ── 달력: 사흘, 그리고 체크박스 ─────────────────────────────────────────────

def _below_the_bar(canvas):
    """The pixels the calendar or the alarm owns — everything under the bar.

    Every green on this panel is not a tick: the status bar draws its healthy
    icons in the same `OK` green, and a test that swept the whole frame for it
    would pass on a machine whose WiFi chip is green and whose calendar is
    empty. Which is the wrong question asked confidently.
    """
    from snapcare_dispenser.display import bar

    return _pixels(canvas)[bar.BAR_H * canvas.width:]


def test_the_window_keeps_the_end_of_the_day():
    """여덟 줄이 넘는 하루에서 **무엇을 버리는가**는 판단이고, 여기 적어 둔다.

    기본은 뒤쪽 여덟이다. 저녁에 패널을 보는 사람이 찾는 것은 남은 복용이지 아침에
    끝난 것이 아니다.
    """
    from snapcare_dispenser.display import calendar

    day = tuple(_dose(f"{h:02d}:00", h * 60, "taken") for h in range(6, 18))
    assert len(day) == 12
    start, below = calendar.window(day)
    assert (start, below) == (4, 0), "하루의 끝이 아니라 앞을 잡았다"

    # 여덟 이하는 그대로 다 그린다.
    short = day[:8]
    assert calendar.window(short) == (0, 0)
    assert calendar.window(day[:3]) == (0, 0)


def test_the_window_scrolls_up_to_the_first_dose_that_is_not_taken():
    """안 먹은 첫 복용이 창 위로 밀려나면 **최소한만** 위로 감는다.

    그 복용이 사람이 실제로 해야 할 일이다 — 거른 아침이거나, 지금 울리고 있는 것.
    그것을 가린 채 정리된 체크 다섯 개를 보여주는 달력은 없느니만 못하다.

    "안 먹은" 이지 "울리는" 이 아니다. 거른 복용도 봐야 하는 것은 마찬가지고, 울리는
    것만 따라가는 창은 오늘 아침의 가위표를 저녁의 체크 뒤에 숨긴다.
    """
    from snapcare_dispenser.display import calendar

    # 열둘 중 둘째가 안 먹은 것. 뒤쪽 여덟(인덱스 4부터)이면 가려진다.
    day = [_dose(f"{h:02d}:00", h * 60, "taken") for h in range(6, 18)]
    day[1] = _dose("07:00", 420, "missed")
    start, below = calendar.window(tuple(day))
    assert start == 1, "안 먹은 첫 복용이 화면 밖에 남았다"
    assert below == 3, "가려진 줄이 있는데 없다고 셌다"

    # 최소한만 감는다 — 안 먹은 것이 뒤쪽 여덟 안에 이미 있으면 창은 안 움직인다.
    day = [_dose(f"{h:02d}:00", h * 60, "taken") for h in range(6, 18)]
    day[9] = _dose("15:00", 900, "upcoming")
    assert calendar.window(tuple(day))[0] == 4, "필요 없는데 위로 감았다"

    # 다 먹은 하루는 감을 이유가 없다.
    done = tuple(_dose(f"{h:02d}:00", h * 60, "taken") for h in range(6, 18))
    assert calendar.window(done)[0] == 4


@pytest.mark.parametrize("canvas", PANELS, ids=lambda c: f"{c.width}x{c.height}")
def test_today_is_the_middle_column_and_the_only_one_highlighted(canvas):
    """가운데 칸이 오늘이고, 오늘만 파스텔 상자를 쓴다.

    자리로 정하지 않고 `Day.today` 로 정한다. 자리로 정하면 창을 바꾸는 날 강조가
    엉뚱한 칸에 붙고, 그것은 화면을 보는 사람이 하루를 잘못 읽는다는 뜻이다.
    """
    from snapcare_dispenser.display import calendar

    screens.idle(canvas, WELL, theme=theme.pack(canvas))
    pixels = _pixels(canvas)
    pastel = theme.pack(canvas)["TODAY"]

    def head_row(column):
        y = calendar.HEAD_Y + calendar.HEAD_H // 2
        left, right = calendar.COL_X(column), calendar.COL_X(column) + calendar.COL_W
        return [pixels[y * canvas.width + x] for x in range(left, right)]

    assert pastel in head_row(1), "오늘 칸에 강조가 없다"
    assert pastel not in head_row(0), "어제 칸이 오늘로 그려졌다"
    assert pastel not in head_row(2), "내일 칸이 오늘로 그려졌다"


@pytest.mark.parametrize("canvas", PANELS, ids=lambda c: f"{c.width}x{c.height}")
def test_the_three_dose_states_are_three_different_pictures(canvas):
    """먹음/거름/아직은 서로 달라야 한다. 색만이 아니라 **모양**이 다르다.

    체크와 가위표는 형태가 다르므로 적록색약인 사람도 그대로 읽는다. 이것이 네 개의
    꽉 찬 도형을 이 그림으로 바꾼 이유의 절반이다.
    """
    from snapcare_dispenser.display import checkbox

    palette = theme.pack(canvas)
    drawn = {}
    for state in (checkbox.TAKEN, checkbox.MISSED, checkbox.PENDING,
                  checkbox.UNKNOWN):
        canvas.fill(0)
        checkbox.draw(canvas, 10, 10, 40, state, palette)
        drawn[state] = bytes(canvas.buffer())

    assert len({drawn[checkbox.TAKEN], drawn[checkbox.MISSED],
                drawn[checkbox.PENDING]}) == 3, "두 상태가 같은 그림이다"
    # 모른다는 것은 안 먹었다가 아니고, 무엇보다 **먹었다가 아니다.**
    assert drawn[checkbox.UNKNOWN] != drawn[checkbox.TAKEN]
    assert palette["OK"] not in _pixels(canvas), "모르는 복용에 초록 체크가 그려졌다"


@pytest.mark.parametrize("canvas", PANELS, ids=lambda c: f"{c.width}x{c.height}")
def test_a_dose_the_ledger_lost_never_draws_a_tick(canvas):
    """장부가 비어도 초록 체크는 절대 안 그린다.

    `read_events` 는 UTF-8 한 바이트만 깨져도 영영 빈 리스트를 돌려준다. 그 하루를
    체크로 그리면 이 기계는 증거 없이 "다 드셨습니다" 라고 말하는 것이고, 그것이 이
    저장소가 아는 가장 나쁜 오류다.
    """
    palette = theme.pack(canvas)
    lost = tuple(_dose(f"{h:02d}:00", h * 60, "unknown") for h in (8, 13, 20))
    screens.idle(canvas, _idle_of(lost), theme=palette)
    # 달력 안만 본다. 상태 막대의 아이콘도 같은 초록이고, 그쪽은 이 시험이 묻는
    # 것이 아니다 — 재려는 것과 다른 것을 재면 통과해도 아무 뜻이 없다.
    assert palette["OK"] not in _below_the_bar(canvas), \
        "장부가 없는 하루에 초록 체크가 나타났다"


@pytest.mark.parametrize("canvas", PANELS, ids=lambda c: f"{c.width}x{c.height}")
def test_hidden_doses_are_said_rather_than_dropped(canvas):
    """열두 개짜리 하루를 여덟 개짜리로 그려 놓고 가만히 있으면 안 된다.

    조용히 자른 달력은 "그 하루는 여덟 번이었다" 고 말하는 달력이다.
    """
    from snapcare_dispenser.display import calendar

    palette = theme.pack(canvas)
    day = tuple(_dose(f"{h:02d}:00", h * 60, "taken") for h in range(6, 18))

    canvas.fill(0)
    screens.idle(canvas, _idle_of(day), theme=palette)
    dotted = _pixels(canvas)

    canvas.fill(0)
    screens.idle(canvas, _idle_of(day[:8]), theme=palette)
    plain = _pixels(canvas)

    row = calendar.HEAD_Y + calendar.HEAD_H + calendar.MORE_H // 2
    left = calendar.COL_X(1)
    span = range(row * canvas.width + left, row * canvas.width + left + calendar.COL_W)
    assert any(dotted[i] == palette["TEXT_MUTE"] for i in span), \
        "가려진 복용이 있는데 아무 말이 없다"
    assert not any(plain[i] == palette["TEXT_MUTE"] for i in span), \
        "가릴 것이 없는데 점을 찍었다"


def test_the_calendar_never_repaints_over_a_tray_number():
    """트레이 번호는 이 패널에서 완전히 사라졌고, 다시 새는 길을 막는다.

    번호가 화면에 없다는 것만으로는 모자라다 — `calendar.key` 가 트레이를 비교하면,
    같은 시각의 같은 계획을 다른 칸에 다시 실은 것만으로 204 줄을 다시 그린다.
    """
    from snapcare_dispenser.display import calendar

    one = _idle_of((_dose("08:00", 480, "taken", tray=1),))
    other = _idle_of((_dose("08:00", 480, "taken", tray=7),))
    assert calendar.key(one) == calendar.key(other), \
        "달력이 아직 트레이 번호를 보고 있다"


@pytest.mark.parametrize("canvas", PANELS, ids=lambda c: f"{c.width}x{c.height}")
def test_the_alarm_is_one_checkbox_that_blinks(canvas):
    """알람은 한가운데 커다란 체크박스 하나이고, 밝기가 오르내린다.

    색을 뒤집는 것이 아니라 **같은 물체가 빛을 받는 것**이어야 한다. 색이 바뀌면
    사람은 그것이 같은 상자인지부터 판단해야 하고, 그 판단이 필요한 순간에 이
    화면은 이미 실패한 것이다.
    """
    palette = theme.pack(canvas)

    canvas.fill(0)
    screens.due(canvas, WAITING, theme=palette, beat=False)
    dark = _pixels(canvas)
    canvas.fill(0)
    screens.due(canvas, WAITING, theme=palette, beat=True)
    lit = _pixels(canvas)

    assert dark != lit, "박동이 아무것도 안 바꿨다"
    # 밝기만 다르고 **그림은 같아야 한다.** 실루엣이 달라지면 그것은 같은 상자가
    # 빛을 받는 것이 아니라 두 개의 다른 그림이고, 사람은 매 박자마다 무엇을 보고
    # 있는지부터 다시 판단해야 한다.
    ink = palette["INK"]
    assert [i for i, px in enumerate(dark) if px != ink] \
        == [i for i, px in enumerate(lit) if px != ink], "박동이 그림을 바꿨다"

    # 달력은 덮인다. 이 순간 기계는 보고하는 것이 아니라 **부탁하는 중**이다.
    from snapcare_dispenser.display import calendar
    assert "due" not in screens.CALENDAR
    row = (calendar.ROWS_Y + calendar.ROW_H // 2) * canvas.width + calendar.COL_X(0)
    assert lit[row] == palette["INK"], "알람 아래로 달력이 비쳤다"


@pytest.mark.parametrize("canvas", PANELS, ids=lambda c: f"{c.width}x{c.height}")
def test_the_tick_is_drawn_rather_than_appearing(canvas):
    """누르면 체크가 **그려진다.** 그냥 나타나면 다시 그린 것과 구별이 안 된다.

    이 애니메이션이 메우는 틈은 2초짜리고, 잘 도는 기계가 사람에게 무시한 것처럼
    보이는 시간이 정확히 그 2초다.
    """
    palette = theme.pack(canvas)
    green = palette["OK"]

    counts = []
    for frame in range(0, screens.CHECK_STEPS + 1):
        canvas.fill(0)
        screens.due(canvas, WAITING, theme=palette, beat=True, check=frame)
        counts.append(sum(1 for px in _below_the_bar(canvas) if px == green))

    assert counts[0] == 0, "누르기도 전에 체크가 있다"
    assert counts == sorted(counts), "체크가 그려지다가 줄었다"
    assert counts[-1] > counts[len(counts) // 2] > 0, "한 번에 다 나타났다"


@pytest.mark.parametrize("canvas", PANELS, ids=lambda c: f"{c.width}x{c.height}")
def test_a_new_plan_marks_the_calendar_instead_of_covering_it(canvas):
    """보라색 화면은 없어졌다. 바뀐 달력을 보여주고, 10초 동안 테두리를 두른다.

    "새 일정이 왔다" 의 답은 새 일정을 보여주는 것이다. 그것을 가린 채 왔다고
    말하는 화면은 순서가 거꾸로다.
    """
    palette = theme.pack(canvas)
    assert not hasattr(screens, "schedule"), "보라색 화면이 아직 남아 있다"

    canvas.fill(0)
    screens.idle(canvas, WELL, False, theme=palette)
    plain = _pixels(canvas)
    canvas.fill(0)
    screens.idle(canvas, WELL, True, theme=palette)
    marked = _pixels(canvas)

    assert plain != marked
    assert palette["NEW_PLAN"] in marked
    assert palette["NEW_PLAN"] not in plain

    # 테두리만 다르다: 안쪽 달력은 두 프레임에서 똑같아야 한다.
    from snapcare_dispenser.display import calendar
    row = calendar.ROWS_Y + calendar.ROW_H // 2
    inside = slice(row * canvas.width + 4, row * canvas.width + canvas.width - 4)
    assert plain[inside] == marked[inside], "테두리가 달력 안까지 바꿨다"


def test_the_snapshot_reads_three_days_and_yesterday_from_the_ledger(
        dispenser, clock):
    """어제 칸은 지어내는 것이 아니라 **장부에서** 온다.

    오늘 장부는 자정에 비워지므로, 어제를 그리려면 이벤트 로그를 다시 읽어야 한다 —
    `Dispenser.outcomes_on` 이 그 일을 하고, 부팅 때 쓰는 것과 같은 함수다. 두 벌로
    나뉘면 패널이 보여주는 하루와 재시작이 복원하는 하루가 갈린다.

    로그가 닿지 않는 날은 빈 칸이 아니라 "모른다" 다. 그 둘을 같게 그리면 기계가
    기억하지 못하는 것과 그날 약이 없었던 것이 한 그림이 된다.
    """
    from snapcare_dispenser import sc1
    from snapcare_dispenser.display import health as health_mod

    dispenser.set_schedule(sc1.decode_any_schedule("SC1*W*1:0800.2000-127-000"))
    snap = health_mod.snapshot(dispenser)

    assert len(snap.days) == 3, "달력은 사흘이다"
    yesterday, today, tomorrow = snap.days
    assert (yesterday.today, today.today, tomorrow.today) == (False, True, False)
    assert today.doses is snap.day, "오늘 칸과 health.day 가 다른 목록이다"

    # 날짜는 그릴 수 있는 모양으로 온다 — 5x7 얼굴에는 소문자가 없다.
    assert today.label.startswith(health_mod.MONTHS[clock.now().month - 1])
    assert today.label.split()[1] == f"{clock.now().day:02d}"

    # 어제 것은 장부에 아무것도 없으므로 "모른다" 이지 "안 먹었다" 가 아니다.
    assert {dose.state for dose in yesterday.doses} == {"unknown"}
    # 내일 것은 전부 앞으로 올 것이다. 일어나지 않은 일에 대한 기록은 없다.
    assert {dose.state for dose in tomorrow.doses} == {"upcoming"}


def test_the_new_plan_border_expires_on_its_own():
    """10초는 정책이 시계로 재고, 무언가가 지워 주기를 기다리지 않는다.

    지워 주는 쪽에 맡기면 안 온 이벤트 하나가 패널에 테두리를 영원히 남긴다.
    """
    from snapcare_dispenser.display.presence import PLAN_HIGHLIGHT_S, Presence

    clock = [1000.0]
    policy = Presence(monotonic=lambda: clock[0])
    health = _idle_of((_dose("08:00", 480, "upcoming"),))

    policy.tick(health)
    policy.event("schedule")
    plan = policy.tick(health)
    assert plan is not None and plan.screen == "idle"
    assert plan.args[1] is True, "새 일정이 달력을 표시하지 않았다"

    clock[0] += PLAN_HIGHLIGHT_S - 0.5
    assert policy.tick(health) is None, "10초 안에 테두리가 사라졌다"

    clock[0] += 1.0
    plan = policy.tick(health)
    assert plan is not None and plan.args[1] is False, "테두리가 10초를 넘겼다"


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


def _idle_of(day, **over):
    base = dict(known=True, dispensing=True, wifi="online", relay="connected",
                clock_source="ntp", cell="ok", power="ok", storage="ok",
                trays_loaded=3, prescribed=True, now="22:40", today="26-08-04")
    base.update(over)
    return Health(day=day, days=_days(today=day), **base)


