"""The SSD1306 OLED, driven as a file, with no I2C library at all.

Why this file exists
--------------------
The LED ring is gone and a screen has taken its place. The screen that matters
is the 2.8 inch ILI9341 on SPI; this little I2C OLED is the one that is
actually on the bench today, and it stays in the tree afterwards as the backup
panel — a dispenser whose LCD ribbon has come adrift is still a dispenser that
can say *which tray, and when*, on a 128x64 panel that costs a pound.

Every published way to talk to one of these wants a package. `luma.oled` wants
Pillow; `adafruit-circuitpython-ssd1306` wants Blinka; even `smbus2` is a
`pip install` that PEP 668 refuses on Trixie and that Debian does not ship
under that name. The rule this firmware keeps is that a card comes up with
`apt install python3` and nothing else, so all three are out — and the same
same reasoning that keeps every driver in this package on plain syscalls
applies here, only more easily,
because the kernel already does the hard part.

`/dev/i2c-1` is a character device. `ioctl(fd, I2C_SLAVE, addr)` tells the
driver which chip the next `write()` is aimed at, and after that a frame is one
`os.write`. `os`, `fcntl`, `errno` — standard library, no root, no daemon.

What actually goes wrong with these panels
------------------------------------------
Three things, in order of how often they waste an evening.

**The charge pump.** The panel needs about 7.5 V to light and makes it itself
from 3.3 V, but only when told to (`0x8D 0x14`). Leave that command out and
everything else works perfectly — the chip acknowledges, the RAM fills, the
scan runs — and the glass stays black. It is the single most common cause of
"my OLED does nothing", and it is why that pair is not folded silently into the
init list below but called out by name.

**The geometry.** "0.8 inch" is not a resolution. Modules sold at roughly that
size are 128x64 (0.96"), 128x32 (0.91") or 72x40 (0.42"), and the three need
different multiplex ratios, different COM pin wiring and — for the 72x40 — a
column offset, because its 72 visible segments sit in the *middle* of the
chip's 128-column RAM. Drive a 72x40 as a 128x64 and most of the picture is
written to columns that are not connected to anything.

How to tell which one is in your hand, without a datasheet: fill the whole
buffer and look at the glass.

    the lit area covers the glass, edge to edge      the profile is right
    the picture is double height with blank rows
      between, its lower half missing                it is a 128x32
    a narrow band of picture, indented from the
      left, most of the glass dark                   it is a 72x40

Failing that, measure the lit rectangle: 128x64 is about 22 x 11 mm, 128x32 is
the same width and half the height — an obvious letterbox strip — and 72x40 is
a stamp, about 10 x 5.5 mm on a PCB you could lose in a pocket. The silkscreen
on the back usually prints the resolution too, in 3 pt type.

**The bus speed.** The Pi's I2C defaults to 100 kHz. A 128x64 frame is 1025
bytes and every byte costs nine bits with its ACK, so a full repaint is about
92 ms — slow enough to watch it happen, and the SSD1306 has no tearing signal
to hide behind. `dtparam=i2c_arm_baudrate=400000` in `/boot/firmware/config.txt`
takes that to roughly 23 ms, which is under the threshold where anybody notices.
It costs nothing except margin on a long or badly routed lead; if the panel
starts dropping frames on a 30 cm flying lead, that is the line to put back.

What this panel cannot do, and what that means upstairs
-------------------------------------------------------
It has no colour, and colour is this project's entire channel to a person who
cannot be assumed to read. That problem is solved above this file: `Mono1.tone`
turns a tone into a *treatment* — a due dose lights the whole panel and draws
in black on it, so it is unmistakable across a room even though it is not
green. Nothing here knows about tones. This file's whole job is to put 1024
bytes where the glass can see them, and to be honest when it cannot.
"""
from __future__ import annotations

import errno
import fcntl
import logging
import os
import threading
from dataclasses import dataclass

from .canvas import Mono1

log = logging.getLogger(__name__)

#: `I2C_SLAVE` and `I2C_SLAVE_FORCE` from `<linux/i2c-dev.h>`. Written out as
#: literals for the same reason the SPI driver writes out its own: the
#: numbers come from C macros, and an ioctl number that is wrong by one is not
#: an error, it is a different request quietly succeeding.
#:
#: `_FORCE` is here to be named and refused. It binds an address the kernel has
#: already claimed for a driver, which on a build with the DS3231 overlay means
#: 0x68 — an OLED is never at 0x68, so if `I2C_SLAVE` ever returns EBUSY for
#: 0x3C/0x3D something else is genuinely holding the address and forcing it
#: would have two drivers writing to one chip.
I2C_SLAVE = 0x0703
I2C_SLAVE_FORCE = 0x0706

#: Bus 1 is GPIO 2 (SDA, header pin 3) and GPIO 3 (SCL, pin 5) — the pins the
#: panel's SD and CL are soldered to, and the same bus a DS3231 build uses.
DEFAULT_BUS = 1
DEVICE = "/dev/i2c-1"

#: The only two addresses an SSD1306 module can be at. Which one you get is a
#: 0 Ω resistor or a solder blob on the back of the board next to "0.96 IIC";
#: nothing in software changes it.
DEFAULT_ADDRESS = 0x3C
ALT_ADDRESS = 0x3D

# ── the command set, named ──────────────────────────────────────────────────
# Every value the init sequence uses, spelled out. A bare 0xDA 0x12 in a list
# is unreviewable; `_SET_COM_PINS, _COM_ALTERNATIVE` can be checked against the
# datasheet by somebody who does not have the datasheet open.

_SET_CONTRAST = 0x81
_ENTIRE_ON_RESUME = 0xA4      # follow RAM, rather than forcing every pixel lit
_NORMAL_DISPLAY = 0xA6
_INVERT_DISPLAY = 0xA7
_DISPLAY_OFF = 0xAE           # also the sleep command: scan and pump both stop
_DISPLAY_ON = 0xAF
_SET_MEMORY_MODE = 0x20
_MEMORY_HORIZONTAL = 0x00     # the pointer wraps column then page — see show()
_SET_COLUMN_ADDRESS = 0x21
_SET_PAGE_ADDRESS = 0x22
_SET_START_LINE = 0x40        # 0x40 | line; line 0
_SET_SEGMENT_REMAP = 0xA1     # column 127 first — the modules are wired this way
_SET_SEGMENT_NORMAL = 0xA0
_SET_MULTIPLEX = 0xA8
_SET_COM_SCAN_DEC = 0xC8      # last row first; with 0xA1 this is "right way up"
_SET_COM_SCAN_INC = 0xC0
_SET_DISPLAY_OFFSET = 0xD3
_SET_COM_PINS = 0xDA
_COM_SEQUENTIAL = 0x02        # 32-row panels: COM0..COM31 in order
_COM_ALTERNATIVE = 0x12       # 40- and 64-row panels: odd/even interleaved
_SET_PRECHARGE = 0xD9
_SET_VCOM_DESELECT = 0xDB
_SET_CLOCK_DIVIDE = 0xD5
_SET_CHARGE_PUMP = 0x8D
_CHARGE_PUMP_ON = 0x14        # without this the panel is dark forever
_SET_IREF = 0xAD
_IREF_INTERNAL = 0x30
_NOP = 0xE3

#: The first byte of every transfer. Co=0, D/C#=0 means "everything after this
#: is a command"; D/C#=1 means "everything after this is display RAM". Two
#: control bytes, so a frame needs exactly one byte of overhead.
_CONTROL_COMMAND = 0x00
_CONTROL_DATA = 0x40

#: `i2cdev_write` in the kernel clamps `count` to 8192 and returns the clamped
#: figure — it does **not** fail. See show() for why that matters.
MAX_TRANSFER = 8192


@dataclass(frozen=True)
class Panel:
    """What the chip has to be told about a particular piece of glass."""

    mux: int
    com_pins: int
    #: Where the visible segments start in the chip's 128-column RAM.
    column_offset: int
    #: Where the visible rows start, in pages of eight. Zero on every panel
    #: below — see `_profile` for the one case where it is not.
    page_offset: int
    #: Some small panels drive their current reference from inside the chip and
    #: are dim or dead without being told to.
    internal_iref: bool = False


#: The three shapes sold as "small OLED". The multiplex ratio is always
#: `rows - 1`; the COM pin configuration follows from how many rows there are;
#: and the column offset is the panel's width centred in 128 columns, which is
#: how the 72x40 lands on 28 and a 64x48 would land on 32.
PANELS: dict[tuple[int, int], Panel] = {
    (128, 64): Panel(mux=0x3F, com_pins=_COM_ALTERNATIVE,
                     column_offset=0, page_offset=0),
    (128, 32): Panel(mux=0x1F, com_pins=_COM_SEQUENTIAL,
                     column_offset=0, page_offset=0),
    (72, 40): Panel(mux=0x27, com_pins=_COM_ALTERNATIVE,
                    column_offset=28, page_offset=0, internal_iref=True),
}


def _profile(width: int, height: int) -> Panel:
    """The register values for this glass, guessing only when it has to.

    A shape that is not in the table is not refused, because refusing means a
    dark dispenser and the derivation below is right for every SSD1306 panel
    the author has met — it is exactly how the three known entries were
    produced. It is logged as a guess so that a panel which comes up shifted
    has something to blame.

    The page offset stays zero throughout, and it is worth saying why rather
    than leaving a field that is always zero looking like an oversight: cutting
    the multiplex ratio to the number of rows the glass has already anchors
    COM0 at the top, so nothing needs shifting vertically. It is the *columns*
    that bite, because segment 0 stays at the left edge of a 128-column RAM
    whatever the mux ratio says. The field exists so that a panel which does
    come up vertically shifted — an SH1106 in an SSD1306 costume is the usual
    culprit — can be corrected from the constructor without a patch.
    """
    known = PANELS.get((width, height))
    if known is not None:
        return known

    guess = Panel(
        mux=(height - 1) & 0x3F,
        com_pins=_COM_ALTERNATIVE if height > 32 else _COM_SEQUENTIAL,
        column_offset=max(0, (128 - width) // 2),
        page_offset=0,
        internal_iref=width < 128,
    )
    log.warning(
        "no tested profile for a %dx%d SSD1306 — guessing multiplex 0x%02X, "
        "COM pins 0x%02X and a column offset of %d. If the image is shifted "
        "sideways, that offset is the number to change",
        width, height, guess.mux, guess.com_pins, guess.column_offset)
    return guess


class Ssd1306:
    """One OLED, as a file descriptor and a preallocated frame.

    The constructor raises `OSError` when there is no panel, deliberately and
    like `SpiRing` does: `make_display` is the thing that knows a screen is not
    load-bearing, and it turns this into a warning and a `NoDisplay`. What that
    puts in the log is this exception's message, which is why the message is a
    sentence about wiring and `config.txt` rather than an errno.
    """

    #: What the status page calls this.
    backend = "ssd1306"

    def __init__(self, bus: int = DEFAULT_BUS,
                 address: int | None = DEFAULT_ADDRESS,
                 width: int = 128, height: int = 64, *,
                 device: str | None = None, contrast: int = 0x7F,
                 probe: bool = True, flip: bool = False,
                 column_offset: int | None = None,
                 page_offset: int | None = None):
        if height % 8:
            raise ValueError("an SSD1306 page is 8 rows, so height must be a "
                             f"multiple of 8, not {height}")

        # `bus` rather than a path, because that is what `config.py` holds and
        # what a person counts off the header; `device` stays as an override
        # for a card that has ended up with the panel on i2c-0 or i2c-3.
        self.device = f"/dev/i2c-{bus}" if device is None else device
        self._width = width
        self._height = height
        self._pages = height // 8

        panel = _profile(width, height)
        self._column_offset = (panel.column_offset if column_offset is None
                               else column_offset)
        self._page_offset = (panel.page_offset if page_offset is None
                             else page_offset)

        #: The frame, built once. `show()` copies the canvas in behind the
        #: control byte rather than concatenating, so a repaint allocates
        #: nothing — this runs off the scheduler tick on a 1 GB board.
        # One transfer buffer, reused per frame so a repaint is not a
        # kilobyte of allocation on a 1 GB board — and therefore a lock, because
        # two threads filling one buffer means the second one's frame is what
        # both writes put on the glass.
        self._lock = threading.RLock()
        self._payload = bytearray(1 + width * self._pages)
        self._payload[0] = _CONTROL_DATA

        #: Counted so a panel that starts failing says so once and then shuts
        #: up. A screen that logs a line per tick fills a card in a week.
        self.faults = 0

        try:
            self._fd = os.open(self.device, os.O_RDWR)
        except OSError as exc:
            # Re-raised with the hint in the text rather than logged here.
            # `make_display` prints this message, and "[Errno 2] No such file
            # or directory" tells a person holding a soldering iron nothing.
            raise OSError(exc.errno, i2c_hint(self.device, exc)) from exc

        try:
            self.address = self._select(address, probe)
            self._init(panel, contrast=contrast, flip=flip)
        except OSError:
            os.close(self._fd)
            self._fd = -1
            raise

        log.info("OLED: %dx%d SSD1306 at 0x%02X on %s (GPIO 2/3, header pins "
                 "3 and 5)", width, height, self.address, self.device)

    # ── properties the screens above ask for ────────────────────────────────

    @property
    def width(self) -> int:
        return self._width

    @property
    def height(self) -> int:
        return self._height

    def new_canvas(self) -> Mono1:
        """A surface this panel can take without any repacking at all."""
        return Mono1(self._width, self._height)

    # ── opening ─────────────────────────────────────────────────────────────

    def _select(self, address: int | None, probe: bool) -> int:
        """Bind an address — the configured one first, then the other strap.

        Probing writes a NOP (`0xE3`) and watches for the address to be
        acknowledged. That is safe here in a way it would not be on an
        arbitrary bus: 0x3C and 0x3D are reserved for these display
        controllers, so nothing else this device could have — a DS3231 at 0x68,
        an EEPROM at 0x50 — is listening, and a NOP changes nothing even if
        something were.

        Trying the second strap is not tidiness. Which address a module
        answers on is a solder blob on the back of the board that the person
        who bought it has no reason to have looked at, and `config.py` names
        0x3C because that is what most of them ship as. Refusing to look at
        0x3D would turn a working panel into a dark one over a resistor, so it
        is probed and the config is corrected in the log. `probe=False` is
        there for a test that wants exactly one address touched.
        """
        first = DEFAULT_ADDRESS if address is None else address
        candidates = [first]
        if probe:
            candidates += [other for other in (DEFAULT_ADDRESS, ALT_ADDRESS)
                           if other != first]

        last: OSError | None = None
        for candidate in candidates:
            try:
                fcntl.ioctl(self._fd, I2C_SLAVE, candidate)
                os.write(self._fd, bytes((_CONTROL_COMMAND, _NOP)))
            except OSError as exc:
                last = exc
                if exc.errno == errno.EBUSY:
                    log.warning(
                        "0x%02X on %s is held by a kernel driver — that is not "
                        "an OLED, so something is wired or configured wrong; "
                        "not forcing it", candidate, self.device)
                continue

            if candidate != first:
                log.warning(
                    "the OLED answered at 0x%02X, not the configured 0x%02X — "
                    "this module has the other address strap fitted. Setting "
                    "DISPLAY_I2C_ADDRESS = 0x%02X in config.py saves the probe "
                    "at every boot", candidate, first, candidate)
            return candidate

        tried = ", ".join(f"0x{value:02X}" for value in candidates)
        raise OSError(
            (last.errno if last else errno.ENXIO),
            f"nothing answered at {tried} on {self.device} — check SD to GPIO 2 "
            f"(pin 3), CL to GPIO 3 (pin 5), V to 3V3 (pin 1) and G to ground "
            f"(pin 9), then run `i2cdetect -y 1`. A panel powered from 5 V "
            f"answers nothing and slowly cooks",
        )

    def _init(self, panel: Panel, contrast: int, flip: bool) -> None:
        """The full power-on sequence, in the order the datasheet wants it.

        Sent as one transfer. A control byte of 0x00 means every byte after it
        is a command, so the whole sequence is a single `write()` and there is
        no window in which the chip is half configured.
        """
        commands = [
            _DISPLAY_OFF,

            # 0x80 is reset: divide ratio 1, oscillator at its nominal rate.
            # Raising it flickers, lowering it dims; there is no reason to move
            # it on a panel this small.
            _SET_CLOCK_DIVIDE, 0x80,

            _SET_MULTIPLEX, panel.mux,

            # No vertical shift. See `_profile` for why this is not where a
            # small panel gets corrected.
            _SET_DISPLAY_OFFSET, 0x00,
            _SET_START_LINE | 0x00,

            # The pump, and the reason this file has a docstring. 0x14 is
            # "enable, 7.5 V"; it must be sent before the display is switched
            # on and after this the panel draws about 20 mA lit.
            _SET_CHARGE_PUMP, _CHARGE_PUMP_ON,

            # Horizontal addressing: the RAM pointer runs along a page and then
            # drops to the next one, which is exactly the order `Mono1` packs
            # its bytes in. That is what makes a full frame one transfer
            # instead of one per page.
            _SET_MEMORY_MODE, _MEMORY_HORIZONTAL,
        ]

        # Segment remap and COM scan direction together decide which corner is
        # the origin. Every module of this kind the author has seen is mounted
        # so that 0xA1 with 0xC8 is the right way up; `flip=True` is the
        # 180 degree rotation for a panel fitted upside down in a case, and it
        # is a rotation rather than a mirror because both axes turn at once.
        commands += [
            _SET_SEGMENT_NORMAL if flip else _SET_SEGMENT_REMAP,
            _SET_COM_SCAN_INC if flip else _SET_COM_SCAN_DEC,
            _SET_COM_PINS, panel.com_pins,
        ]

        if panel.internal_iref:
            # The 0.42" modules leave the current-reference resistor off the
            # board and expect the chip to supply its own. Without this they
            # come up so dim that they read as dead in a lit room.
            commands += [_SET_IREF, _IREF_INTERNAL]

        commands += [
            _SET_CONTRAST, max(0, min(255, contrast)),

            # Pre-charge and VCOMH deselect are the two analogue knobs. These
            # are the values for a panel running off its own charge pump;
            # lowering VCOMH brightens the panel and shortens its life.
            _SET_PRECHARGE, 0xF1,
            _SET_VCOM_DESELECT, 0x30,

            _ENTIRE_ON_RESUME,
            _NORMAL_DISPLAY,
        ]

        self._command(*commands)

        # Blank the RAM *before* switching the panel on, not after.
        #
        # GDDRAM is not cleared by a reset and the module has no power switch of
        # its own, so whatever the last run painted is still sitting in it. Turn
        # the panel on first and the previous frame flashes up — and the frame a
        # dispenser is most likely to have died showing is a green "tray 3 is
        # due", for a dose that was settled hours ago. Somebody walks over and
        # presses the button, and nothing happens.
        self._blank()
        self._command(_DISPLAY_ON)

    def _blank(self) -> None:
        """Zero the panel's RAM. Used at startup and at shutdown."""
        first, page = self._column_offset, self._page_offset
        self._command(_SET_COLUMN_ADDRESS, first, first + self._width - 1)
        self._command(_SET_PAGE_ADDRESS, page, page + self._pages - 1)
        os.write(self._fd, bytes((_CONTROL_DATA,)) + bytes(self._width * self._pages))

    # ── the wire ────────────────────────────────────────────────────────────

    def _command(self, *values: int) -> None:
        if self._fd < 0:
            raise OSError(errno.EBADF, "the OLED is closed")
        os.write(self._fd, bytes((_CONTROL_COMMAND, *values)))

    def show(self, canvas) -> bool:
        """Put a canvas on the glass. One transfer, and never raises.

        The address windows are re-sent every frame rather than once at init.
        They are six bytes against a thousand, and a panel that has browned out
        and restarted with its default full-width window would otherwise draw
        the rest of the device's life shifted and wrapping, with nothing in the
        log — the failure this costs six bytes to make impossible.

        On the transfer ceiling: `i2cdev_write` clamps a write to 8192 bytes
        and reports success for the clamped length, so an oversized frame would
        not raise, it would leave the bottom of the picture showing whatever
        was there before. No panel this driver supports comes close — a 128x64
        frame is 1025 bytes — but the check below is what stops that from ever
        being a silent bug. Splitting *is* legal here, unlike the WS2812's
        single-shot frame: in horizontal addressing mode the RAM pointer
        carries on where the previous write left it, so the frame is written in
        pieces rather than refused.
        """
        with self._lock:
            expected = self._width * self._pages
            buffer = canvas.buffer()
            if len(buffer) != expected:
                # A canvas of the wrong shape is a wiring-up mistake upstairs, not
                # a hardware fault, and it shows on the first tick. Logged loudly
                # and dropped, because scribbling a mismatched frame into the
                # panel's RAM produces a picture nobody can interpret.
                self._fault("the OLED was handed a %d-byte canvas but this panel "
                            "takes %d — a %dx%d Mono1", len(buffer), expected,
                            self._width, self._height)
                return False

            self._payload[1:] = buffer
            first = self._column_offset
            page = self._page_offset
            try:
                self._command(_SET_COLUMN_ADDRESS, first, first + self._width - 1)
                self._command(_SET_PAGE_ADDRESS, page, page + self._pages - 1)
                for start in range(0, len(self._payload), MAX_TRANSFER):
                    chunk = self._payload[start:start + MAX_TRANSFER]
                    if start:
                        # Only reachable on a panel far larger than any of these.
                        chunk = bytes((_CONTROL_DATA,)) + chunk
                    os.write(self._fd, chunk)
            except OSError as exc:
                self._fault("the OLED stopped answering on %s (%s) — check the "
                            "four wires; the dispenser carries on without it",
                            self.device, exc)
                return False

            if self.faults:
                log.info("the OLED is answering again after %d failed frames",
                         self.faults)
                self.faults = 0
            return True

    def _fault(self, message: str, *args) -> None:
        """Say it once properly, then stop shouting."""
        self.faults += 1
        if self.faults == 1:
            log.warning(message, *args)
        else:
            log.debug(message, *args)

    # ── the three knobs a screen actually turns ─────────────────────────────

    def contrast(self, value: int) -> None:
        """0..255. On an OLED this is drive current, not gamma.

        Which means it cuts both ways that matter: 0xFF is readable in a
        sunlit kitchen and ages the panel fastest, and 0x01 is still perfectly
        legible in a dark room while drawing a fraction of the current. The
        default sits at 0x7F because the dispenser lives indoors.
        """
        self._guard(lambda: self._command(_SET_CONTRAST, max(0, min(255, int(value)))))

    def invert(self, on: bool) -> None:
        """Swap lit and unlit for the whole panel.

        This is not decoration. It is how `Mono1` makes a due dose unmistakable
        on a screen with no colour — a fully lit panel is visible from across a
        room in a way that an outlined glyph is not.
        """
        self._guard(lambda: self._command(_INVERT_DISPLAY if on else _NORMAL_DISPLAY))

    def sleep(self, on: bool) -> None:
        """Stop the scan and the charge pump, or start them again.

        The 3 am case: a bedside dispenser with nothing due until morning
        should not be a nightlight. Asleep the panel is genuinely dark and
        draws a few microamps, and the RAM survives — waking it shows the same
        picture without a repaint.

        It also buys back panel life. These are monochrome OLEDs with no pixel
        shifting, and an amber "dose missed" screen left up for eight hours is
        eight hours of the same pixels burning in.
        """
        self._guard(lambda: self._command(_DISPLAY_OFF if on else _DISPLAY_ON))

    def _guard(self, action) -> None:
        try:
            action()
        except OSError as exc:
            self._fault("the OLED did not take a command on %s (%s)",
                        self.device, exc)

    def close(self) -> None:
        """Blank the glass and let the descriptor go. Never raises.

        Blanking first matters on a device that is being shut down rather than
        restarted: a panel left showing "dose due" by a process that has exited
        is a screen telling somebody to take medication that nothing is going
        to dispense.
        """
        if self._fd < 0:
            return
        try:
            self._command(_DISPLAY_OFF)
        except OSError:
            pass
        try:
            os.close(self._fd)
        finally:
            self._fd = -1


def i2c_hint(device: str = DEVICE, exc: OSError | None = None) -> str:
    """Why the bus is not there, in something somebody can act on.

    Reporting `FileNotFoundError: /dev/i2c-1` to a person holding a soldering
    iron tells them nothing. It is almost always the same one thing — I2C is
    off in `config.txt` and the board has not been rebooted since — and the
    second most likely thing has a fix just as short.
    """
    if not os.path.exists(device):
        return (f"{device} does not exist — I2C is not enabled. Add "
                f"`dtparam=i2c_arm=on` to /boot/firmware/config.txt, then "
                f"reboot (service/install.sh does this for you)")
    if exc is not None and exc.errno == errno.EACCES:
        return (f"{device} exists but this user may not open it — add the "
                f"service user to the `i2c` group and log in again")
    if exc is not None and exc.errno in (errno.ENXIO, errno.EREMOTEIO):
        return (f"{device} is there but nothing acknowledged at 0x"
                f"{DEFAULT_ADDRESS:02X} or 0x{ALT_ADDRESS:02X} — the panel is "
                f"unpowered or SD and CL are swapped. `i2cdetect -y 1` settles "
                f"it in two seconds")
    detail = f" ({exc})" if exc is not None else ""
    return f"{device} exists but could not be used{detail}"
