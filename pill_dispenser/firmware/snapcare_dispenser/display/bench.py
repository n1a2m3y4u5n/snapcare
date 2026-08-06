"""`--display-test`: find out why the glass is dark.

Why this exists as its own command
----------------------------------
The ILI9341 is **write-only**. There is no MISO wire, so nothing is ever read
back: the driver opens `/dev/spidev0.0`, claims two GPIOs, writes an entire
initialisation sequence and every frame after it, and all of that succeeds
exactly as well with nothing on the end of the ribbon as it does with a working
panel. `/api/status` can therefore say the screen is fitted and healthy about a
device whose screen has never lit, and it is not lying — from the firmware's
side there is nothing to see.

So a dark panel cannot be diagnosed by asking the firmware. It has to be
diagnosed by a person looking at the glass while the firmware drives it
deliberately, one stage at a time, saying what it is about to do before it does
it. That is all this is: a sequence of full-screen floods slow enough to watch,
with the questions to ask at each step printed alongside.

The order is chosen so that the first thing that fails localises the fault:

    1  is the backlight on at all      power, and the LED pin
    2  does a flood of red appear      SPI, DC, RESET, and the init sequence
    3  are red/green/blue the right    the BGR bit and the wiring of MADCTL
       colours in that order
    4  does a half-screen rectangle    the window arithmetic and `show_rect`
       land where it says
    5  does a real frame draw          everything above, plus the layout

A person who sees nothing at step 1 has a power or backlight problem and no
amount of SPI is going to help. Somebody who sees step 1 and not step 2 has a
bus problem. Somebody who sees red where green should be has BGR inverted,
which matters more here than it sounds: it swaps blue and amber, which is
`released` and `missed` — the machine saying the pills are in the cup an hour
after the window shut.

Powering the module
-------------------
This is worth stating because it is the most common way one of these boards is
dark with perfectly good software. The 2.8-inch modules come in two families and
they look identical:

  * a 3.3 V board: VCC goes to the Pi's 3V3, and the logic pins are wired
    straight to the controller;
  * a 5 V board: VCC goes to 5 V, an on-board regulator makes the 3.3 V the
    controller actually wants, and the logic pins go through a level shifter.

A 5 V board driven from the Pi's 3.3 V logic is the awkward case. If its shifter
is a 74HCT245 it is fine — those switch at about 2 V. If it is a plain 74HC245
running off 5 V it needs about 3.5 V to read a logic high, and the Pi's 3.3 V is
below that: every line reads as low, the panel is never addressed, and it stays
black while the backlight glows. The symptom is exactly "the display does not
turn on", and no software change can reach it.

Nothing here can tell those apart electrically — there is no MISO to ask — so
what it does instead is say so, and give the person the two experiments that
settle it: power the board at 3.3 V instead, and halve the SPI clock.
"""
from __future__ import annotations

import logging
import time
from dataclasses import replace

from .. import config
from .canvas import Rgb565
from .health import Health

log = logging.getLogger(__name__)

#: Long enough to look up from the terminal and at the panel, short enough that
#: the whole run is under a minute.
_HOLD_S = 2.5


def _say(text: str = "") -> None:
    print(text, flush=True)


def _ask(question: str, interactive: bool) -> bool | None:
    """Ask the operator what they can see. `None` when nobody is watching."""
    if not interactive:
        return None
    try:
        answer = input(f"    {question} [y/N] ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        return None
    return answer.startswith("y")


def run(interactive: bool = True, speed_hz: int | None = None,
        rotation: int | None = None, backlight: int | None = None) -> int:
    """Drive the panel through the stages above. Returns a shell exit code."""
    from . import _open  # noqa: PLC0415 - the factory, without the logging

    hz = speed_hz or config.DISPLAY_SPI_HZ
    _say()
    _say("── the panel, one stage at a time ─────────────────────────────────")
    _say()
    _say(f"  SPI device   {config.DISPLAY_SPI_DEVICE}")
    _say(f"  clock        {hz / 1e6:.1f} MHz")
    _say(f"  DC / RESET   GPIO {config.DISPLAY_DC_GPIO} / {config.DISPLAY_RESET_GPIO}")
    _say(f"  rotation     {rotation if rotation is not None else config.DISPLAY_ROTATION}")
    pin = backlight if backlight is not None else config.DISPLAY_BACKLIGHT_GPIO
    _say(f"  backlight    {'GPIO %d' % pin if pin is not None else 'not switchable (LED tied to 3V3)'}")
    _say()

    import os  # noqa: PLC0415

    if not os.path.exists(config.DISPLAY_SPI_DEVICE):
        _say(f"  {config.DISPLAY_SPI_DEVICE} does not exist, so nothing can be")
        _say("  driven at all. SPI is off. Add `dtparam=spi=on` to")
        _say("  /boot/firmware/config.txt and reboot; service/install.sh does")
        _say("  this for you.")
        return 1

    from .ili9341 import Ili9341  # noqa: PLC0415

    try:
        panel = Ili9341(
            device=config.DISPLAY_SPI_DEVICE,
            dc=config.DISPLAY_DC_GPIO,
            reset=config.DISPLAY_RESET_GPIO,
            rotation=config.DISPLAY_ROTATION if rotation is None else rotation,
            speed_hz=hz,
            backlight=pin,
        )
    except Exception as exc:  # noqa: BLE001 - this command's whole job
        _say(f"  the panel would not open: {exc}")
        _say()
        _say("  That is a bus or a GPIO problem rather than a screen problem —")
        _say("  the panel itself is never consulted. Check that nothing else")
        _say("  holds GPIO %d or %d, and that the SPI device is readable."
             % (config.DISPLAY_DC_GPIO, config.DISPLAY_RESET_GPIO))
        return 1

    seen: dict[str, bool | None] = {}
    try:
        _say("  1. backlight")
        _say("     The panel is initialised and blanked. It should be lit and")
        _say("     black — a dark grey glow, not the black of a screen that is")
        _say("     off. Hold it at an angle to a lamp if you are unsure.")
        time.sleep(_HOLD_S)
        seen["backlight"] = _ask("Is the panel lit?", interactive)

        _say()
        _say("  2. the bus, and 3. the colour order")
        _say("     Three floods: RED, then GREEN, then BLUE, in that order.")
        for name, rgb in (("RED", (255, 0, 0)), ("GREEN", (0, 255, 0)),
                          ("BLUE", (0, 0, 255))):
            _say(f"     {name}")
            panel.clear(Rgb565.rgb(*rgb))
            time.sleep(_HOLD_S)
        seen["flood"] = _ask("Did the panel flood with a solid colour at all?",
                             interactive)
        seen["order"] = _ask("Were they red, then green, then blue, in that order?",
                             interactive)

        _say()
        _say("  4. the window arithmetic")
        _say("     A white bar across the top third only. If the whole panel")
        _say("     goes white, or the bar is in the wrong place, CASET/PASET")
        _say("     are being addressed against the wrong rotation.")
        canvas = panel.new_canvas()
        canvas.fill(0x0000)
        canvas.rect(0, 0, canvas.width, canvas.height // 3, 0xFFFF)
        panel.show(canvas)
        time.sleep(_HOLD_S)
        seen["window"] = _ask("Is the white bar across the top third only?",
                              interactive)

        _say()
        _say("  5. a real frame")
        _say("     The resting screen, drawn exactly as the running firmware")
        _say("     draws it: status bar, a dose, the day along the bottom.")
        from . import screens  # noqa: PLC0415

        canvas = panel.new_canvas()
        screens.idle(canvas, _demo_health())
        panel.show(canvas)
        time.sleep(_HOLD_S * 2)
        seen["frame"] = _ask("Does that look like a finished screen?", interactive)

        _say()
        _say(f"  a full frame is {panel.frame_bytes} bytes, {panel.frame_ms:.0f} ms "
             f"on the wire")
        if panel.error:
            _say(f"  the panel refused a write at some point: {panel.error}")
    finally:
        try:
            panel.close()
        except Exception:  # noqa: BLE001 - shutting down must not raise
            pass

    return _verdict(seen, hz, interactive)


def _demo_health() -> Health:
    """A machine mid-morning, with all three checkbox states on the panel.

    A tick, a cross and an empty box, and a yesterday that is not empty — this
    is the frame somebody is being asked "is the picture right", so every mark
    the calendar can draw has to be on it. A bench fixture showing three
    identical empty boxes proves the panel lights up and nothing else.
    """
    from .health import DAY_NAMES, Day, Dose  # noqa: PLC0415

    day = (Dose(tray=1, minutes=480, at="08:00", state="taken"),
           Dose(tray=3, minutes=780, at="13:00", state="missed"),
           Dose(tray=1, minutes=1200, at="20:00", state="upcoming"))
    yesterday = tuple(replace(dose, state="taken") for dose in day)
    # The real headings, not stand-ins. `YESTERDAY` is the longest thing this
    # band ever draws and the only one that has to be tightened to fit, so a
    # bench frame without it would pass the exact case somebody is here to check.
    labels = tuple(DAY_NAMES[offset] for offset in (-1, 0, 1))
    return Health(
        dispensing=True, known=True, wifi="online", clock_source="ntp",
        address="192.168.1.42", now="09:41", today="26-08-05", trays_loaded=2,
        power="ok", cell="ok", storage="ok", relay="connected",
        day=day,
        days=(Day(label=labels[0], date="26-08-04", today=False, doses=yesterday),
              Day(label=labels[1], date="26-08-05", today=True, doses=day),
              Day(label=labels[2], date="26-08-06", today=False,
                  doses=tuple(replace(dose, state="upcoming") for dose in day))),
    )


def _verdict(seen: dict[str, bool | None], hz: int, interactive: bool) -> int:
    """Turn what the person saw into the next thing to try."""
    _say()
    _say("── what that means ───────────────────────────────────────────────")
    _say()

    if not interactive or all(value is None for value in seen.values()):
        _say("  Nobody was watching, so nothing is concluded. Every write the")
        _say("  driver made was accepted, which on a write-only panel proves")
        _say("  only that the kernel has the device node. Run this without")
        _say("  --auto-only, with the panel in front of you.")
        return 0

    if seen.get("backlight") is False:
        _say("  The backlight is not on, and nothing else here can matter until")
        _say("  it is. In order of likelihood:")
        _say()
        _say("    * LED is not connected, or is on a GPIO the firmware does not")
        _say("      know about. If you wired it to a GPIO, tell the firmware:")
        _say("        SNAPCARE_DISPLAY_BACKLIGHT=<bcm pin>")
        _say("      Until it is set, that pin is never driven and sits low.")
        _say("    * VCC is not delivering. Measure it at the module, not at the")
        _say("      header — a dupont lead that looks seated often is not.")
        return 1

    if seen.get("flood") is False:
        _say("  The backlight is on and nothing reaches the glass. The panel is")
        _say("  not being addressed at all, and since it is write-only the")
        _say("  firmware cannot tell that from a working screen. In order:")
        _say()
        _say("    * DC and RESET. These are the two that are not the bus and")
        _say("      the two most often one row off on the header:")
        _say(f"        DC    GPIO {config.DISPLAY_DC_GPIO}  (pin 22)")
        _say(f"        RESET GPIO {config.DISPLAY_RESET_GPIO}  (pin 12)")
        _say("      DC stuck at one level is a panel that either ignores")
        _say("      everything or paints its own init sequence as pixels.")
        _say("    * Logic levels, if VCC is 5 V. A 5 V module with a plain")
        _say("      74HC245 shifter needs about 3.5 V to read a high, and the")
        _say("      Pi puts out 3.3 V — so every line reads low and the panel")
        _say("      is never addressed, while the backlight glows happily.")
        _say("      Try powering the module from 3V3 instead. If it is a 3.3 V")
        _say("      board it will simply work; if it is a 5 V board with a")
        _say("      regulator it will go dark, and that tells you which it is.")
        _say(f"    * The clock. Try --display-hz {hz // 4} — a marginal bus")
        _say("      fails at the top of the frame first and can look dead.")
        return 1

    if seen.get("order") is False:
        _say("  The bus works and the colours are wrong, which is the BGR bit.")
        _say("  This is not cosmetic here: it swaps red and blue, which turns")
        _say("  amber into blue — so `missed` renders as `released`, and the")
        _say("  machine says the pills are in the cup an hour after the window")
        _say("  closed. Flip _BGR in display/ili9341.py's _ROTATIONS table.")
        return 1

    if seen.get("window") is False:
        _say("  Floods work and a rectangle does not, so the window arithmetic")
        _say("  is wrong for this panel: CASET/PASET take *inclusive* ends, and")
        _say("  a rotation whose MADCTL does not match the width and height in")
        _say("  _ROTATIONS puts every partial update in the wrong place.")
        return 1

    if seen.get("frame") is False:
        _say("  The panel is fine and the picture is wrong, which is a layout")
        _say("  problem rather than a driver one. Nothing above this line needs")
        _say("  touching.")
        return 1

    _say("  The panel works, end to end.")
    return 0
