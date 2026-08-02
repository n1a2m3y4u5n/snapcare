"""The screen — one panel, and the honest amount that can be said about it.

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
still the message, and the entire word inventory of the device is a tray number,
a time, an IPv4 address, an SSID and a passphrase. `screens.py` holds that line
and `font.py` has no lower case in it, on purpose.

One panel, and why the factory cannot verify it
-----------------------------------------------
The 320x240 ILI9341 on SPI0 is the only panel. The 128x64 monochrome OLED that
used to be the other half of this module is gone, and with it went the only
presence test either panel ever supported — an I2C address either acknowledges
or it does not, and that was a real answer to a real question.

Nothing here can ask the LCD the same question. **The ILI9341 is write-only.**
Four-line SPI has no MISO, so the panel never answers and nothing is ever read
back from it. Opening `/dev/spidev0.0`, claiming DC and RESET and writing the
entire initialisation sequence succeeds exactly as well with nothing on the end
of the ribbon as it does with a working screen.

So `make_display` does not detect a panel; it *assumes* one, and says so at INFO
once per start. That line is the whole diagnostic value this file has left: when
somebody is standing in front of a dark screen, the journal has to be the thing
that tells them the firmware never knew whether a screen was there. The cost of
losing the probe is exactly that, and it is paid in the log rather than hidden.
"""
from __future__ import annotations

import logging

from .. import config
from .canvas import Rgb565, Tone

log = logging.getLogger(__name__)

__all__ = ["Rgb565", "Tone", "make_display", "NoDisplay"]

#: The panel this firmware draws for, whether or not one is fitted. Every screen
#: is laid out against these dimensions — see `NoDisplay.new_canvas`.
PANEL_WIDTH = 320
PANEL_HEIGHT = 240


class NoDisplay:
    """A device with no panel fitted. Not a failure — a valid build.

    Answers every call and draws nothing. `FittedIndicator` still chirps, the
    app still shows the dose, and the button on the machine still releases it;
    what is lost is the person in the room being told *which* tray. The status
    page says so rather than pretending, which is the rule the ring's absence
    followed too.

    It hands out a full-size canvas rather than nothing, so that a screen drawn
    on a machine with no panel lays out exactly as it would on the fitted one.
    That is what lets `--selftest` and the tests exercise the real layout on a
    board with no screen, and it is why the geometry is a constant here rather
    than a property of whichever driver came up.
    """

    backend = "none"
    width = PANEL_WIDTH
    height = PANEL_HEIGHT

    def new_canvas(self) -> Rgb565:
        # A canvas nobody will look at, so the screen functions can run
        # unchanged rather than every caller growing an `if display` branch.
        return Rgb565(PANEL_WIDTH, PANEL_HEIGHT)

    def show(self, canvas) -> bool:  # noqa: ARG002
        # True, not None: a caller that counts failed pushes must not count a
        # build that has no panel as a panel that is failing.
        return True

    def show_rect(self, canvas, x, y, w, h) -> bool:  # noqa: ARG002
        # The band repaint path, present for the same reason: nothing above
        # should have to ask whether the display it is holding supports it, and
        # an AttributeError here would land on the scheduler tick.
        return True

    def close(self) -> None:
        pass


def make_display(backend: str | None = None):
    """Open the panel, or hand back something that answers as though there is one.

    `ili9341` and `auto` are the same instruction and that is deliberate: there
    is one panel and it cannot be probed, so there is nothing for `auto` to
    choose between and no evidence for it to choose on. It opens the LCD and
    logs, once, that the panel is **assumed and not detected** — the module
    docstring argues why that sentence is worth a line in the journal on every
    start.

    A named backend is not walked and no other name is guessed at: somebody who
    asked for one wants to be told why it is not there. `SNAPCARE_DISPLAY` left
    at `ssd1306` on a unit upgraded from the two-panel firmware therefore lands
    in the journal by name, rather than silently opening the LCD as though the
    setting had been read.

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

    name = "ili9341" if want == "auto" else want
    try:
        panel = _open(name)
    except Exception as exc:  # noqa: BLE001 - a screen is never fatal
        log.warning(
            "NO DISPLAY (%s) — the buzzer will still sound for a dose, but "
            "nothing in the room will say which tray it is for",
            f"{name}: {exc}",
        )
        return NoDisplay()

    log.info(
        "screen: the %s is assumed, not detected — it has no MISO, so nothing "
        "is ever read back from it and it initialises exactly as well with "
        "nothing on the end of the ribbon. If the screen stays dark, that "
        "assumption is the first thing to doubt", name)
    return panel


def _open(name: str):
    """Import and construct one backend. Imported here so that a card missing
    the panel's module — or an agent mid-edit — cannot break the package."""
    if name == "ili9341":
        from .ili9341 import Ili9341  # noqa: PLC0415

        return Ili9341(
            device=config.DISPLAY_SPI_DEVICE,
            dc=config.DISPLAY_DC_GPIO,
            reset=config.DISPLAY_RESET_GPIO,
            rotation=config.DISPLAY_ROTATION,
            speed_hz=config.DISPLAY_SPI_HZ,
        )
    raise ValueError(f"unknown display backend {name!r}")
