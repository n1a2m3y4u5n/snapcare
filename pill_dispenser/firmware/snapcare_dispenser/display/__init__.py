"""The screen, whichever one is plugged in.

What this replaced, and why
---------------------------
Until now the device's only output was a twelve-pixel LED ring and a piezo. That
was a deliberate design — the founding constraint of this project is that the
person cannot be assumed to read, so the channel to them was a colour and a
sound — and it held up until the release model arrived.

Once the machine stopped dropping pills at the scheduled minute and started
*asking* first, the ring had to carry a sentence it does not have the vocabulary
for: not "something is happening" but "**tray 3**, your **08:00** dose, press the
button". Green told somebody a dose was due and could not tell them which one,
so a person with three medications had to go and look at the app to find out
what the machine wanted — on a build whose entire point is that they might not
have a phone.

A screen says it in one frame. That is the whole reason for this package.

What it must not become
-----------------------
A text display. The constraint has not changed: the picture and the colour are
still the message, and the only things rendered as characters are a tray number,
a time, and — on the setup screen alone — the network name somebody is about to
type into a phone. `screens.py` holds that line and `font.py` has no lower case
in it, on purpose.

Two panels, both first-class
----------------------------
`ssd1306` is a 128x64 monochrome I2C OLED on GPIO 2/3, and it is the one on the
bench. `ili9341` is a 2.8-inch 320x240 SPI panel with colour, and it is what the
five-colour vocabulary was designed for.

Neither is a reduced version of the other. Whichever one is fitted has to carry
the whole message, which is why severity is a **shape** — circle, triangle,
octagon — as well as a colour: the shape says the same thing on one ink as it
does on 65,536, and it goes on saying it to the roughly one man in twelve who
cannot use the colour at all. `screens.py` branches on `canvas.colour` and
`canvas.width` for layout, and on nothing whatever for meaning.

Why `auto` looks for the OLED first
-----------------------------------
Because it is the only order in which looking for a panel means anything.

**The ILI9341 is write-only.** Four-line SPI has no MISO, so the panel never
answers and nothing is ever read back from it — `ili9341.py` says so itself,
under "What this driver cannot tell you". Opening `/dev/spidev0.0`, claiming DC
and RESET and writing the entire initialisation sequence succeeds exactly as
well with nothing on the end of the ribbon as it does with a working screen.

So the old order — LCD first, OLED as the fallback — could never reach its
second entry on any board with SPI enabled. A bench with only the OLED fitted
opened a phantom LCD, took GPIO 25 and 18 for it, reported a healthy 320x240
panel, and never went near the I2C bus. Everything downstream, the self-test
included, then went on to test a screen that was not there.

**The SSD1306 has to acknowledge its address** — 0x3C, or 0x3D where the
module's strap resistor has been moved — before a single byte goes anywhere. A
panel that is absent, unpowered, or wired SD-to-SCL acknowledges nothing and the
constructor raises. That is a real answer to a real question, and it is the only
one of the two panels that can give one.

Hence the order: ask the panel that can answer, and fall through to the one that
cannot only when nothing did. This is not a preference for the lesser screen —
there is no lesser screen here — and it is not free either. It costs one `open`
of `/dev/i2c-1` and two writes at every start on an LCD-only build, and it means
the LCD is reached by elimination, which is an assumption rather than a
discovery. Both are cheap against a device that tests the wrong panel.

**A build with both panels fitted must name one**, with `SNAPCARE_DISPLAY=ili9341`
or `=ssd1306` in the systemd unit. `auto` will take the OLED, and no amount of
probing can do better, because a panel that cannot answer cannot be found by
looking. That is a line of configuration, not a bug to be fixed in this file.
"""
from __future__ import annotations

import fcntl
import logging
import os

from .. import config
from .canvas import Mono1, Rgb565, Tone

log = logging.getLogger(__name__)

__all__ = ["Mono1", "Rgb565", "Tone", "make_display", "NoDisplay",
           "probe_i2c", "AUTO_ORDER", "WRITE_ONLY"]

#: The backends `auto` walks, in the order it walks them. The OLED is first
#: because its probe is evidence and the LCD's is not — see the module
#: docstring, which is where that decision is argued.
AUTO_ORDER = ("ssd1306", "ili9341")

#: Backends whose presence cannot be established at all. A successful open of
#: one of these proves that the kernel has the device node and nothing else.
#: Named here rather than spelled out at each call site so that the self-test
#: can report the distinction instead of hard-coding a driver's name.
WRITE_ONLY = ("ili9341",)

#: What `probe_i2c` puts on the wire: control byte 0x00, meaning "the rest of
#: this transfer is commands", then 0xE3, the SSD1306's NOP. Both are named in
#: `ssd1306.py`; they are repeated as literals here because the probe has to be
#: safe against a panel that is already open and painting, and a NOP is the one
#: command that touches no register and no pixel. All this listens for is
#: whether the address was acknowledged.
_NOP_PROBE = bytes((0x00, 0xE3))


class NoDisplay:
    """A device with no panel fitted. Not a failure — a valid build.

    Answers every call and draws nothing. `FittedIndicator` still chirps, the
    app still shows the dose, and the button on the machine still releases it;
    what is lost is the person in the room being told *which* tray. The status
    page says so rather than pretending, which is the rule the ring's absence
    followed too.
    """

    backend = "none"
    width = 0
    height = 0

    def new_canvas(self):
        # A canvas nobody will look at, so the screen functions can run
        # unchanged rather than every caller growing an `if display` branch.
        return Mono1(128, 64)

    def show(self, canvas) -> None:  # noqa: ARG002
        pass

    def close(self) -> None:
        pass


def probe_i2c(bus: int | None = None, address: int | None = None) -> int | None:
    """The address an OLED acknowledged on the I2C bus, or None if none did.

    This is the only honest presence test either panel supports, and it exists
    as a function of its own — separate from opening the panel — so that the
    self-test can ask the question *after* a display has come up. A machine
    running the write-only LCD with nothing answering on I2C has no evidence at
    all that a screen exists, and that sentence can only be written by something
    that probed the other bus.

    Safe to call against a panel that is already open and painting: a NOP
    changes no register and no pixel, and 0x3C and 0x3D are reserved for display
    controllers, so nothing else this device could carry — a DS3231 at 0x68, an
    EEPROM at 0x50 — is listening on either.

    Never raises. A missing bus, a permission problem and an empty bus are all
    "nothing answered", because from here they have the same consequence.
    """
    from .ssd1306 import ALT_ADDRESS, DEFAULT_ADDRESS, I2C_SLAVE  # noqa: PLC0415

    device = f"/dev/i2c-{config.DISPLAY_I2C_BUS if bus is None else bus}"
    first = config.DISPLAY_I2C_ADDRESS if address is None else address
    # Both straps, in the configured order. Which one a module answers on is a
    # solder blob on the back of the board that nobody has had a reason to look
    # at, and reporting "no panel" over a resistor would send somebody hunting a
    # fault that is not there.
    candidates = [first] + [other for other in (DEFAULT_ADDRESS, ALT_ADDRESS)
                            if other != first]

    try:
        handle = os.open(device, os.O_RDWR)
    except OSError as exc:
        log.debug("no I2C probe: %s (%s)", device, exc)
        return None

    try:
        for candidate in candidates:
            try:
                fcntl.ioctl(handle, I2C_SLAVE, candidate)
                os.write(handle, _NOP_PROBE)
            except OSError:
                continue
            return candidate
        return None
    finally:
        os.close(handle)


def make_display(backend: str | None = None):
    """Open whichever panel this machine has, detectable one first.

    `auto` tries the SSD1306 and then the ILI9341. That order is the whole point
    of this function and the module docstring argues it in full: the OLED
    acknowledges its address or it does not, while the LCD is write-only and
    comes up perfectly with nothing attached — so LCD-first could never reach
    its fallback, and a board with only the OLED fitted ended up driving a
    phantom screen. A build with both panels fitted has to name one with
    `SNAPCARE_DISPLAY`, because nothing here can find a panel that cannot answer.

    A named backend is not walked: somebody who asked for one wants to be told
    why it is not there, not handed the other.

    Never raises. A screen is not load-bearing — the dispenser dispenses without
    it — so a panel that will not come up is a WARNING and a `NoDisplay`, not a
    device that fails to start. The warning is at WARNING and not INFO because
    this is most of the machine's user interface and it spent a release being
    skipped in silence.
    """
    want = (backend or config.DISPLAY_BACKEND or "auto").strip().lower()

    if want == "none":
        log.info("no display fitted (SNAPCARE_DISPLAY=none)")
        return NoDisplay()

    automatic = want == "auto"
    tried: list[str] = []
    for name in (AUTO_ORDER if automatic else (want,)):
        try:
            panel = _open(name)
        except Exception as exc:  # noqa: BLE001 - try the next panel
            tried.append(f"{name}: {exc}")
            continue
        if automatic:
            _explain_auto(name, tried)
        return panel

    log.warning(
        "NO DISPLAY (%s) — the buzzer will still sound for a dose, but nothing "
        "in the room will say which tray it is for",
        "; ".join(tried) or f"unknown display backend {want!r}",
    )
    return NoDisplay()


def _explain_auto(name: str, tried: list[str]) -> None:
    """Say which way the automatic choice was made, and how solid it is.

    Both branches are INFO and both are worth a line in the journal, because the
    two panels fail in opposite directions and the log is what somebody reads
    when the screen is dark. The OLED case names the override, since taking the
    OLED on a board that also has an LCD is the one regression this ordering
    can cause. The LCD case says out loud that nothing was actually verified,
    which is the sentence the old order never got to print.
    """
    if name not in WRITE_ONLY:
        log.info(
            "auto: the %s answered on I2C, so that is the panel. If this board "
            "also has an LCD fitted, set SNAPCARE_DISPLAY=ili9341 — a write-only "
            "panel cannot be found by looking, so auto cannot prefer it", name)
        return
    log.info(
        "auto: nothing answered on the I2C bus (%s), so this fell through to "
        "the %s — which has no MISO and cannot be probed at all. The panel is "
        "assumed, not detected: if the screen stays dark, that assumption is "
        "the first thing to doubt", "; ".join(tried) or "not tried", name)


def _open(name: str):
    """Import and construct one backend. Imported here so that a card missing
    one panel's module — or an agent mid-edit — cannot break the package."""
    if name == "ili9341":
        from .ili9341 import Ili9341  # noqa: PLC0415

        return Ili9341(
            device=config.DISPLAY_SPI_DEVICE,
            dc=config.DISPLAY_DC_GPIO,
            reset=config.DISPLAY_RESET_GPIO,
            rotation=config.DISPLAY_ROTATION,
            speed_hz=config.DISPLAY_SPI_HZ,
        )
    if name == "ssd1306":
        from .ssd1306 import Ssd1306  # noqa: PLC0415

        return Ssd1306(
            bus=config.DISPLAY_I2C_BUS,
            address=config.DISPLAY_I2C_ADDRESS,
            width=config.DISPLAY_OLED_WIDTH,
            height=config.DISPLAY_OLED_HEIGHT,
        )
    raise ValueError(f"unknown display backend {name!r}")
