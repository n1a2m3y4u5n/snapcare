"""The ILI9341 panel — 240x320 of colour on four wires, with no library.

Why this file exists
--------------------
The LED ring said *what* was happening in five colours and could never say
which tray or at what time. This panel says all three, and the colour is still
the part that carries the meaning: the person this machine is built for cannot
be assumed to read, so the tray number and the time are a bonus on top of a
green screen, never a replacement for it.

Everything this project says about packages applies here twice over. There is no
`python3-ili9341` in Debian or Raspberry Pi OS, `luma.lcd` is a pip install PEP
668 refuses on Trixie, and Adafruit's driver pulls in `spidev`, `RPi.GPIO`,
`numpy` and Pillow. So this is the same four standard-library calls the ring
used — `os.open`, `fcntl.ioctl`, `os.write`, and lgpio for the two pins that
are not the bus.

The wiring, which the assembly guide has to match
-------------------------------------------------
    SCK    GPIO 11   pin 23    SPI0 clock
    MOSI   GPIO 10   pin 19    SPI0 data out; the panel is write-only here
    CS     GPIO 8    pin 24    CE0 — driven by the kernel, not by this file
    DC     GPIO 25   pin 22    command when low, pixel data when high
    RESET  GPIO 18   pin 12    free only because the ring is gone
    LED    3V3                 backlight, always on unless a build gives it a pin

**The ring cannot come back once this is fitted.** It shared MOSI, and every
byte of a frame going past a WS2812 is a byte it will happily interpret as
pixels. The two are alternatives on this bus, not a panel with a fallback.

Why DC is a wire rather than a bit
----------------------------------
The ILI9341 also has a 3-line serial mode where each transfer carries a ninth
leading bit that means command-or-data. That would save a GPIO and cost the
thing that makes this driver small: with a ninth bit nothing is byte-aligned
any more, so a 153,600-byte frame becomes a bit-shuffle in Python before it
becomes a `write()`. With DC on a pin, a frame is the canvas buffer handed
straight to the kernel with no copy at all.

The transfer ceiling, and why chunking is safe here
---------------------------------------------------
A full frame is 240 x 320 x 2 = 153,600 bytes and spidev's per-transfer buffer
is 4096 by default, so a frame is about 38 writes. The ring refused to split a
frame at all, and the difference is worth being precise about because it is the
one place where copying the ring's rules would be wrong.

On the WS2812 the *gap* is the signal: a pause longer than the reset time
latches the frame, so a split write lights the second half as though it were
the first. The ILI9341 has no such rule. A memory write is a stream into an
address counter that advances per pixel and stops when the window is full; it
has no timeout, nothing decays, and the panel is content to sit mid-window
indefinitely. Between our chunks DC does not move — it is a GPIO held high for
the whole frame — and the only thing that toggles is CS, which spidev raises at
the end of every `write()`. The panel treats that as a pause, not a
termination.

One caveat, and it is the reason `transfer_limit()` forces an even number: the
datasheet does not say what happens to a *half-received pixel* when CS goes
high, and cheap ILI9341V clones are exactly where that kind of thing differs.
Chunk on a pixel boundary and the question never comes up.

The clock, and what it costs
----------------------------
32 MHz. At that rate a full frame is 38.4 ms of bus — call it 26 fps if
anything ever wanted it, against the two frames a minute this device actually
paints — and the Python that fills the canvas costs about a third as much
again.

That number is empirical, not specified, and this is the one place in this file
where that is true. The ILI9341's own AC characteristics give a 100 ns minimum
write cycle, which is 10 MHz; 32 MHz is three times over it and works on every
module anyone has shipped, because the input latch is faster than the datasheet
promises. Raising it further is where it stops being free: past roughly 40 MHz
on dupont jumpers with no ground plane the failure is not an error but the
occasional misread bit, which shows up as coloured speckle or a torn band and
looks exactly like a software bug. The Pi's divider is an even integer off the
core clock, so the rate actually achieved is at or below the request and moves
with the core clock unless `core_freq` is pinned — another reason not to sit at
the edge of what works.

What this driver cannot tell you
--------------------------------
There is no MISO wire, so nothing is ever read back. A panel that is dead, not
plugged in, or plugged in one row off gets exactly the same successful writes
as a working one. The only evidence available is the backlight, which on this
build is wired to 3V3 and is therefore on whether or not the controller is
alive. Startup logs the geometry and the clock so that a wrong-looking screen
can at least be told apart from a wrong-looking configuration; beyond that the
diagnosis is somebody looking at it.

Failure here is not allowed to reach the scheduler. A write that fails logs one
sentence somebody can act on and the paint returns False; doses keep being
offered, released and recorded on a machine with a dark screen.
"""
from __future__ import annotations

import fcntl
import logging
import os
import struct
import threading
import time

from .. import gpiochip
from .canvas import Rgb565

log = logging.getLogger(__name__)

#: The SPI character device. `dtparam=spi=on` in /boot/firmware/config.txt and a
#: reboot; the installer does it.
DEFAULT_DEVICE = "/dev/spidev0.0"

#: Command/data select. Any free GPIO would do — 25 is the one the assembly
#: guide draws, next to the SPI block on the header.
DC_GPIO = 25

#: Panel reset. This pin was the PWM ring's data line, and it is only available
#: because the ring has been removed.
RESET_GPIO = 18

#: See the module docstring. Defensible rather than fastest.
SPI_HZ = 32_000_000

#: `_IOW(SPI_IOC_MAGIC, nr, type)` from `<linux/spi/spidev.h>`, with
#: `SPI_IOC_MAGIC` = 'k' = 0x6b. Written out as literals because the `_IOC`
#: macros are C and there is no stdlib equivalent — and checked against the
#: encoding, because a wrong one does not fail quietly:
#:
#:     (1 << 30) | (size << 16) | (0x6b << 8) | nr
#:
#: The size nibble is the size of the *argument*, not the command number. Both
#: mode and bits-per-word take a `__u8`, so both are 0x0001; only the speed is a
#: `__u32`. Getting that wrong makes the kernel read four bytes where one was
#: passed, and the ioctl fails with EINVAL at open — a panel that never comes
#: up, blamed on the wiring.
_SPI_IOC_WR_MODE = 0x40016B01           # __u8
_SPI_IOC_WR_BITS_PER_WORD = 0x40016B03  # __u8
_SPI_IOC_WR_MAX_SPEED_HZ = 0x40046B04   # __u32

#: Where the kernel publishes spidev's per-transfer buffer size. It is a module
#: parameter, so it can be raised at boot (`spidev.bufsiz=65536`) — which would
#: take a frame from 38 writes to 3 and save a couple of milliseconds of syscall
#: overhead. Nothing here requires it.
BUFSIZ_PATH = "/sys/module/spidev/parameters/bufsiz"

#: spidev's compiled-in default, and what to assume when the file is missing —
#: guessing high would mean writes that fail with EMSGSIZE halfway through a
#: frame, guessing low only costs syscalls.
BUFSIZ_FALLBACK = 4096

#: The panel as the glass is built: portrait, whatever MADCTL is later told.
NATIVE_WIDTH = 240
NATIVE_HEIGHT = 320


# ── the command set, named ──────────────────────────────────────────────────

_SWRESET = 0x01      # software reset
_SLPIN = 0x10        # enter sleep
_SLPOUT = 0x11       # exit sleep
_GAMMASET = 0x26     # select one of the four fixed gamma curves
_DISPOFF = 0x28      # display off (the panel keeps its RAM)
_DISPON = 0x29       # display on
_CASET = 0x2A        # column address set
_PASET = 0x2B        # page address set
_RAMWR = 0x2C        # memory write — everything after this is pixels
_MADCTL = 0x36       # memory access control: rotation, mirroring, BGR order
_PIXFMT = 0x3A       # interface pixel format
_FRMCTR1 = 0xB1      # frame rate control, normal mode
_DISCTRL = 0xB6      # display function control
_PWCTR1 = 0xC0       # power control 1 — VRH
_PWCTR2 = 0xC1       # power control 2 — step-up factor
_VMCTR1 = 0xC5       # VCOM control 1 — VCOMH / VCOML
_VMCTR2 = 0xC7       # VCOM control 2 — VCOM offset
_PWCTRA = 0xCB       # power control A
_PWCTRB = 0xCF       # power control B
_EN3G = 0xF2         # enable 3-gamma control
_GMCTRP1 = 0xE0      # positive gamma correction
_GMCTRN1 = 0xE1      # negative gamma correction
_DTCA = 0xE8         # driver timing control A
_DTCB = 0xEA         # driver timing control B
_PWRSEQ = 0xED       # power on sequence control
_PUMPRATIO = 0xF7    # pump ratio control
_UNDOCUMENTED_EF = 0xEF  # not in any datasheet at all — see below


# ── MADCTL, which is the whole of rotation ──────────────────────────────────

_MY = 0x80   # row address order
_MX = 0x40   # column address order
_MV = 0x20   # row/column exchange — this is the one that makes it landscape
_BGR = 0x08  # panel subpixel order

#: **BGR must be set on these modules**, and getting it wrong is not cosmetic
#: here. Red and blue swap, which turns amber (255,130,0) into (0,130,255) — so
#: "the dose was missed" renders as something a person reads as "the dose is in
#: the cup". Those are the two states this project can least afford to confuse,
#: and the symptom is a screen that looks perfectly plausible.
#:
#: Landscape is the default because the machine sits on a bedside table with
#: somebody standing over it: 320 px of width is a tray number and a time side
#: by side, where portrait forces them onto separate lines.
_ROTATIONS: dict[int, tuple[int, int, int]] = {
    0: (_MX | _BGR, NATIVE_WIDTH, NATIVE_HEIGHT),
    90: (_MV | _BGR, NATIVE_HEIGHT, NATIVE_WIDTH),
    180: (_MY | _BGR, NATIVE_WIDTH, NATIVE_HEIGHT),
    270: (_MX | _MY | _MV | _BGR, NATIVE_HEIGHT, NATIVE_WIDTH),
}


# ── the initialisation sequence ─────────────────────────────────────────────
#
# Read this honestly: roughly half of it is a vendor blob.
#
# The commands in the 0xCB..0xF7 range are in the datasheet's command list, but
# their parameters are documented as reserved or not documented at all, and the
# values below come from Ilitek's own application note by way of every module
# vendor's sample code. Nobody outside Ilitek knows what most of the bits mean.
# They are reproduced because a panel initialised without them is visibly worse
# — dim, or with a colour cast, or unstable at temperature — and they are
# emphatically not something to tune by experiment. Where a value *is* explained
# by the datasheet, the comment says what it does and what changing it costs.
#
# (command, parameters, milliseconds to wait afterwards)

_INIT: tuple[tuple[int, bytes, int], ...] = (
    # Not in any published ILI9341 datasheet. It appears at the head of every
    # vendor sample and of Adafruit's driver; the working theory is that it
    # unlocks the extended command set on some die revisions. Harmless where it
    # is not needed, and skipping it costs nothing on a good panel and a blank
    # one on a bad panel.
    (_UNDOCUMENTED_EF, b"\x03\x80\x02", 0),

    # Power control B / A, driver timing control A / B, power on sequence,
    # pump ratio. Vendor blob, as above.
    (_PWCTRB, b"\x00\xC1\x30", 0),
    (_PWRSEQ, b"\x64\x03\x12\x81", 0),
    (_DTCA, b"\x85\x00\x78", 0),
    (_PWCTRA, b"\x39\x2C\x00\x34\x02", 0),
    (_PUMPRATIO, b"\x20", 0),
    (_DTCB, b"\x00\x00", 0),

    # Documented from here down.

    # VRH — the reference for the positive gamma supply, 4.60 V at 0x23. Lower
    # values wash the picture out; higher ones cost current and can flicker.
    (_PWCTR1, b"\x23", 0),
    # BT: which step-up ratios generate VGH/VGL. 0x10 is the vendor default for
    # a 2.8" module and depends on the panel's own capacitors, not on us.
    (_PWCTR2, b"\x10", 0),
    # VCOMH 4.25 V, VCOML -1.5 V. This pair is per-panel tuning: get it wrong
    # and the display flickers at low brightness or shows a grey wash instead of
    # black, which on a screen whose message is a saturated colour matters.
    (_VMCTR1, b"\x3E\x28", 0),
    (_VMCTR2, b"\x86", 0),

    # 16 bits per pixel on both the bus and inside the panel. 18-bit exists and
    # would cost three bytes per pixel on the wire — 50% more transfer for
    # gradients this device never draws.
    (_PIXFMT, b"\x55", 0),

    # Frame rate: DIVA=0, RTNA=0x18 → about 79 Hz internal refresh. This is
    # unrelated to how often we push a frame; what it buys is that a 20x20
    # partial update is picked up by the panel's own scan within 13 ms, so a
    # blinking element does not visibly tear.
    (_FRMCTR1, b"\x00\x18", 0),

    # Display function control. The third byte is the number of driven lines,
    # (0x27 + 1) * 8 = 320 — the full panel. Reduce it and the bottom of the
    # screen simply is not scanned, which reads as a cropped display rather than
    # as a configuration error.
    (_DISCTRL, b"\x08\x82\x27", 0),

    # Use the explicit gamma tables below rather than the built-in 3-gamma
    # shortcut, then select curve 1, which is the only curve the tables target.
    (_EN3G, b"\x00", 0),
    (_GAMMASET, b"\x01", 0),

    # Fifteen-point gamma correction, positive and negative polarity. Vendor
    # blob again — these are fitted to the panel's transmission curve and there
    # is no way to derive them from anything in the datasheet.
    (_GMCTRP1,
     b"\x0F\x31\x2B\x0C\x0E\x08\x4E\xF1\x37\x07\x10\x03\x0E\x09\x00", 0),
    (_GMCTRN1,
     b"\x00\x0E\x14\x03\x11\x07\x31\xC1\x48\x08\x0F\x0C\x31\x36\x0F", 0),

    # Sleep out. The 120 ms is mandatory and it is a *charge pump* settling
    # time, not a courtesy: send anything before it and the panel comes up with
    # the wrong supply rails. 150 gives Python's timers room to be late in the
    # wrong direction.
    (_SLPOUT, b"", 150),

    # And on. Everything above ran against a display that was off, so nothing
    # of the init is ever visible.
    (_DISPON, b"", 10),
)

#: RESX low. The datasheet's minimum is 10 µs, which `time.sleep` on a loaded Pi
#: cannot produce reliably, so this is milliseconds instead — spent once at
#: startup, where it buys a reset that definitely happened.
_RESET_LOW_MS = 20

#: After RESX rises. The datasheet wants 5 ms before any command and 120 ms
#: before sleep-out; waiting the longer one here means the sequence below never
#: has to think about it again.
_RESET_SETTLE_MS = 150


def transfer_limit(path: str = BUFSIZ_PATH) -> int:
    """The largest `write()` spidev will accept, rounded down to a pixel.

    Even, always. A chunk boundary is a moment when CS goes high, and the
    datasheet is silent on what a half-delivered 16-bit pixel does across one —
    so the boundary is never allowed to land inside one. On the default 4096
    that costs nothing; on a hypothetical odd bufsiz it costs one byte.
    """
    try:
        with open(path) as handle:
            value = int(handle.read().strip())
    except (OSError, ValueError):
        value = BUFSIZ_FALLBACK
    value = max(2, value)
    return value - (value % 2)


def spi_hint(device: str) -> str:
    """Why the device node is not there, in something somebody can act on.

    Almost always one thing — SPI is off in `config.txt` and the board has not
    been rebooted since — and saying so beats reporting `FileNotFoundError` to
    somebody holding a ribbon cable.
    """
    if os.path.exists(device):
        return f"{device} exists but could not be opened"
    return (f"{device} does not exist — SPI is not enabled. Add "
            f"`dtparam=spi=on` to /boot/firmware/config.txt and reboot "
            f"(service/install.sh does this for you)")


class SpiPort:
    """The bus, as a file descriptor. Swapped out in the tests."""

    def __init__(self, device: str = DEFAULT_DEVICE, speed_hz: int = SPI_HZ,
                 limit: int | None = None):
        self.device = device
        self.speed_hz = speed_hz
        self.limit = transfer_limit() if limit is None else limit
        self._fd = os.open(device, os.O_RDWR)
        try:
            # Mode 0 — clock idle low, panel latches on the rising edge. These
            # are spidev's defaults, but the driver keeps them on the device
            # across opens, so a previous user that left it in mode 3 would
            # still be in mode 3 here. Three ioctls once per boot is cheaper
            # than a screen full of noise nobody can explain.
            fcntl.ioctl(self._fd, _SPI_IOC_WR_MODE, struct.pack("B", 0))
            fcntl.ioctl(self._fd, _SPI_IOC_WR_BITS_PER_WORD, struct.pack("B", 8))
            fcntl.ioctl(self._fd, _SPI_IOC_WR_MAX_SPEED_HZ,
                        struct.pack("I", speed_hz))
        except OSError:
            os.close(self._fd)
            self._fd = -1
            raise

    def write(self, payload) -> None:
        if self._fd < 0:
            raise OSError("the SPI device is closed")
        os.write(self._fd, payload)

    def close(self) -> None:
        if self._fd < 0:
            return
        try:
            os.close(self._fd)
        finally:
            self._fd = -1


class Pins:
    """DC, RESET and maybe a backlight. Swapped out in the tests."""

    def claim_output(self, gpio: int, level: int) -> None:
        raise NotImplementedError

    def write(self, gpio: int, level: int) -> None:
        raise NotImplementedError

    def release(self, gpio: int) -> None:
        pass

    def close(self) -> None:
        pass


class LgpioPins(Pins):
    """The real ones, on the handle the rest of the firmware is already using.

    Nothing here ever closes that handle — the servos, the buzzer and the
    take-dose button are on it too, and closing it from the display's shutdown
    path would take the tray motors with it. Only the daemon calls
    `gpiochip.close()`.
    """

    def __init__(self):
        import lgpio  # noqa: PLC0415

        handle = gpiochip.open_chip()
        if handle is None:
            raise OSError(gpiochip.unavailable_reason())
        # Exactly as `gpiochip_open` returned it. The chip number lives in the
        # high bits and lgpio reads it back out; a masked or rebuilt handle
        # fails in ways that do not look like handle problems.
        self._lgpio = lgpio
        self._handle = handle
        self._claimed: set[int] = set()

    def claim_output(self, gpio: int, level: int) -> None:
        # Freeing first, because a line stays claimed for the life of the
        # process: re-opening the panel after a failed start would otherwise be
        # refused by a claim this same process is holding.
        self.release(gpio)
        self._lgpio.gpio_claim_output(self._handle, gpio, level)
        self._claimed.add(gpio)

    def write(self, gpio: int, level: int) -> None:
        self._lgpio.gpio_write(self._handle, gpio, level)

    def release(self, gpio: int) -> None:
        try:
            self._lgpio.gpio_free(self._handle, gpio)
        except Exception:  # noqa: BLE001 - it may not have been claimed
            pass
        self._claimed.discard(gpio)

    def close(self) -> None:
        for gpio in sorted(self._claimed):
            self.release(gpio)


class Ili9341:
    """One panel, on SPI0 CE0 plus two GPIOs.

    Opened by the display factory, which is also the only thing that decides
    this backend is the one to use. The constructor raises with a sentence
    somebody can act on; every painting method after that degrades instead.
    """

    #: What the status page calls this.
    backend = "ili9341"

    def __init__(self, device: str = DEFAULT_DEVICE, dc: int = DC_GPIO,
                 reset: int = RESET_GPIO, backlight: int | None = None,
                 rotation: int = 90, speed_hz: int = SPI_HZ,
                 port: SpiPort | None = None, pins: Pins | None = None):
        if rotation not in _ROTATIONS:
            raise ValueError(
                f"rotation must be one of {sorted(_ROTATIONS)}, not {rotation!r}")

        madctl, self.width, self.height = _ROTATIONS[rotation]
        self.rotation = rotation
        self.device = device
        self.speed_hz = speed_hz
        self._madctl = madctl
        self._dc = dc
        self._reset = reset
        self._backlight = backlight
        #: True once the backlight pin — if there is one — has been driven high.
        #: A build with LED wired to 3V3 has no pin and this stays False while
        #: the screen is perfectly well lit, which is why it is not a health
        #: signal.
        self.lit = False
        #: Set by the first write that fails, and reported on the status page.
        self.error = ""
        self._complained = False
        # One window and one DC line, shared by the scheduler tick and the web
        # server's preview. Without this, two painters interleave and the second
        # one's pixels land inside the first one's window — a frame of confetti
        # rather than an exception.
        self._lock = threading.Lock()
        self._port: SpiPort | None = None
        self._pins: Pins | None = None

        try:
            self._pins = pins if pins is not None else LgpioPins()
            # RESET idles high; DC idles at command. The backlight is claimed
            # *off* deliberately — the panel's RAM holds whatever noise it
            # powered up with, and lighting it before the first frame shows the
            # person a screenful of static.
            self._pins.claim_output(self._reset, 1)
            self._pins.claim_output(self._dc, 0)
            if self._backlight is not None:
                self._pins.claim_output(self._backlight, 0)

            self._port = port if port is not None else SpiPort(device, speed_hz)
            self.limit = self._port.limit

            self._hardware_reset()
            self._configure()
            self.clear()
            self.backlight(True)
        except BaseException:
            self._release()
            raise

        log.info(
            "screen: ILI9341 %dx%d (rotation %d) on %s at %.1f MHz, DC GPIO %d, "
            "RESET GPIO %d — a full frame is %d bytes, %.0f ms, %d writes of %d",
            self.width, self.height, rotation, device, speed_hz / 1e6,
            self._dc, self._reset, self.frame_bytes, self.frame_ms,
            -(-self.frame_bytes // self.limit), self.limit,
        )

    # ── what the screens above this need to know ────────────────────────────

    @property
    def frame_bytes(self) -> int:
        return self.width * self.height * 2

    @property
    def frame_ms(self) -> float:
        """Bus time for a full repaint. Excludes the syscall per chunk."""
        return self.frame_bytes * 8 * 1000.0 / self.speed_hz

    def new_canvas(self) -> Rgb565:
        """A surface the size of this panel, in the format it reads."""
        return Rgb565(self.width, self.height)

    # ── bringing it up ──────────────────────────────────────────────────────

    def _hardware_reset(self) -> None:
        """RESX low, then long enough that the panel is definitely listening."""
        assert self._pins is not None
        self._pins.write(self._reset, 1)
        time.sleep(0.002)
        self._pins.write(self._reset, 0)
        time.sleep(_RESET_LOW_MS / 1000)
        self._pins.write(self._reset, 1)
        time.sleep(_RESET_SETTLE_MS / 1000)

    def _configure(self) -> None:
        """Software reset, the vendor sequence, rotation, then on."""
        # A software reset on top of the hardware one, because a panel whose
        # RESET wire is not actually connected — a real and common assembly
        # mistake — still gets a clean start from this one.
        self._command(_SWRESET)
        time.sleep(0.150)

        for command, params, delay_ms in _INIT:
            self._command(command, params)
            if delay_ms:
                time.sleep(delay_ms / 1000)

        # Last, so that a build changing rotation only has to change this.
        self._command(_MADCTL, bytes((self._madctl,)))

    # ── the bus ─────────────────────────────────────────────────────────────

    def _command(self, command: int, params: bytes = b"") -> None:
        """One command byte with DC low, then its parameters with DC high.

        DC is moved *before* the write, which is what puts it in place before
        spidev drops CS — the panel samples DC on the first clock edge, and a DC
        that changes inside a transfer turns the rest of that byte into pixels.
        """
        assert self._pins is not None and self._port is not None
        self._pins.write(self._dc, 0)
        self._port.write(bytes((command,)))
        if params:
            self._pins.write(self._dc, 1)
            self._port.write(params)

    def _stream(self, payload) -> None:
        """Pixels, in chunks the kernel will accept.

        DC goes high once and stays there for the whole frame. See the module
        docstring for why the CS gaps between chunks are harmless here and were
        fatal on the ring.
        """
        assert self._pins is not None and self._port is not None
        self._pins.write(self._dc, 1)
        limit = self.limit
        view = memoryview(payload)
        for start in range(0, len(view), limit):
            self._port.write(view[start:start + limit])

    def set_window(self, x: int, y: int, w: int, h: int) -> None:
        """Address the rectangle the next pixels land in.

        CASET and PASET take **inclusive** end coordinates, which is the one
        off-by-one in this file that does not look like one: writing `x + w`
        instead of `x + w - 1` leaves a column of the previous frame down the
        right-hand edge, and on a blinking element that column is what a person
        sees as flicker.

        The window is set per paint, so a transfer that is cut short corrupts
        one frame and not the next.
        """
        self._command(_CASET, struct.pack(">HH", x, x + w - 1))
        self._command(_PASET, struct.pack(">HH", y, y + h - 1))
        self._command(_RAMWR)

    # ── painting ────────────────────────────────────────────────────────────

    def show(self, canvas) -> bool:
        """The whole canvas. Returns False if the panel did not take it."""
        if canvas.width != self.width or canvas.height != self.height:
            log.error(
                "screen: refusing a %dx%d canvas on a %dx%d panel — ask the "
                "driver for one with new_canvas() rather than building it by "
                "hand", canvas.width, canvas.height, self.width, self.height)
            return False
        # The buffer is already row-major 16-bit big-endian and exactly the size
        # of the window, so this is handed to the kernel without a copy.
        return self._paint(0, 0, self.width, self.height, canvas.buffer())

    def show_rect(self, canvas, x: int, y: int, w: int, h: int) -> bool:
        """Just one rectangle of it.

        This is what makes a blinking element affordable. Repainting 320x240 to
        move a 20x20 icon is 153,600 bytes and 38 ms of bus; the rectangle is
        800 bytes and a fifth of a millisecond, so a caret can blink twice a
        second without the SPI bus ever being the reason a servo pulse is late.

        The rows have to be gathered because the canvas is a full-width buffer
        and the window is not — a copy, but a copy of the small thing.
        """
        if canvas.width != self.width or canvas.height != self.height:
            log.error("screen: refusing a %dx%d canvas on a %dx%d panel",
                      canvas.width, canvas.height, self.width, self.height)
            return False

        left, top = max(0, x), max(0, y)
        right, bottom = min(self.width, x + w), min(self.height, y + h)
        if left >= right or top >= bottom:
            return True  # clipped away entirely; nothing to send is not failure

        source = canvas.buffer()
        stride = self.width * 2
        span = (right - left) * 2
        payload = bytearray(span * (bottom - top))
        at = 0
        for row in range(top, bottom):
            start = row * stride + left * 2
            payload[at:at + span] = source[start:start + span]
            at += span
        return self._paint(left, top, right - left, bottom - top, payload)

    def clear(self, value: int = 0x0000) -> bool:
        """Flood the panel with one colour, without building a canvas for it."""
        pair = bytes(((value >> 8) & 0xFF, value & 0xFF))
        # Built at the chunk size rather than the frame size: a 153,600-byte
        # temporary to paint black is 150 KB of churn on a 1 GB board every time
        # the screen is blanked.
        chunk = pair * (self.limit // 2)
        if self._port is None:
            return False
        try:
            with self._lock:
                self.set_window(0, 0, self.width, self.height)
                assert self._pins is not None
                self._pins.write(self._dc, 1)
                left = self.frame_bytes
                while left > 0:
                    self._port.write(chunk[:left] if left < len(chunk) else chunk)
                    left -= len(chunk)
        except OSError as exc:
            self._degrade(exc)
            return False
        return True

    def _paint(self, x: int, y: int, w: int, h: int, payload) -> bool:
        if self._port is None:
            return False
        try:
            with self._lock:
                self.set_window(x, y, w, h)
                self._stream(payload)
        except OSError as exc:
            self._degrade(exc)
            return False
        return True

    def _degrade(self, exc: OSError) -> None:
        """One sentence, once, and then get out of the way.

        Deliberately not latched off. The overwhelmingly likely cause is a
        four-wire header that has worked loose, and re-seating it should bring
        the screen back without anybody restarting the daemon — a panel that
        actually lost power needs a restart anyway, because the init sequence
        only runs when this object is built.
        """
        self.error = str(exc)
        if self._complained:
            return
        self._complained = True
        log.error(
            "screen: the panel stopped accepting pixels (%s) — check the SPI "
            "header and the DC/RESET jumpers on pins 22 and 12. Doses will "
            "keep being offered and released with the screen dark.", exc)

    # ── the backlight, and why it is not dimmable ───────────────────────────

    def backlight(self, on: bool) -> bool:
        """On or off, if a pin was given. Returns whether anything happened.

        On/off and not brightness, on purpose. lgpio's PWM is timed from an
        ordinary thread with no realtime priority, and it is the *same* thread
        that times every servo pulse and the buzzer's tone. Dimming the screen
        would put a few thousand extra edges a second through that loop, which
        buys a slightly nicer-looking panel at the cost of a slightly less
        steady tray — and it would flicker visibly whenever the tray moved,
        because the jitter lands on a light source. Not worth it. A build that
        genuinely needs dimming should put the LED pin on a hardware PWM
        channel, not here.
        """
        if self._backlight is None or self._pins is None:
            return False
        try:
            self._pins.write(self._backlight, 1 if on else 0)
        except Exception as exc:  # noqa: BLE001 - never into the tick
            self._degrade(OSError(str(exc)))
            return False
        self.lit = on
        return True

    # ── shutting down ───────────────────────────────────────────────────────

    def close(self) -> None:
        """Blank it, sleep it, let the pins go. Never raises."""
        if self._port is not None:
            try:
                # Order matters for what a person sees: the backlight goes
                # first, so the blanking is invisible. On this build the LED pin
                # is tied to 3V3 and there is nothing to switch, which is why
                # the black fill below is not skippable — it is the only thing
                # that stops a shut-down dispenser showing a stale "dose due"
                # screen all night.
                self.backlight(False)
                self.clear()
                self._command(_DISPOFF)
                self._command(_SLPIN)
            except Exception:  # noqa: BLE001 - shutdown must not raise
                pass
        self._release()

    def _release(self) -> None:
        if self._port is not None:
            try:
                self._port.close()
            except Exception:  # noqa: BLE001
                pass
            self._port = None
        if self._pins is not None:
            try:
                # Idle, not asserted. RESET stays *high* so the sleep the panel
                # was just put into survives; pulsing it low here would be a
                # reset for no reason. This only governs the moment before the
                # free — a released line reverts to an input and this driver
                # stops having an opinion about it, so a build that cares what
                # RESET does with nothing driving it wants a pull-up at the
                # panel end, not a line of Python.
                self._pins.write(self._dc, 0)
                self._pins.write(self._reset, 1)
            except Exception:  # noqa: BLE001
                pass
            try:
                self._pins.close()
            except Exception:  # noqa: BLE001
                pass
            self._pins = None
