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

Two panels, and why both
------------------------
`ssd1306` is a small monochrome I2C OLED on GPIO 2/3. It is what is on the bench
and it is the fallback: no colour, so the *glyph* has to carry the state, which
is a useful discipline — a screen that only works in colour is a screen that
fails for a colour-blind carer.

`ili9341` is a 2.8-inch 240x320 SPI panel. It is the real one, and it is what the
five-colour vocabulary was designed for.

Both are driven through `canvas.py`, so `screens.py` is written once and knows
which panel it is on only for layout, never for meaning.
"""
from __future__ import annotations

import logging

from .. import config
from .canvas import Mono1, Rgb565, Tone

log = logging.getLogger(__name__)

__all__ = ["Mono1", "Rgb565", "Tone", "make_display", "NoDisplay"]


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


def make_display(backend: str | None = None):
    """Open whichever panel this machine has, best first.

    ILI9341 before SSD1306 because it is the better instrument and because a
    build that has both fitted wants the colour one — the OLED is the standby.
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

    tried: list[str] = []
    for name in (("ili9341", "ssd1306") if want == "auto" else (want,)):
        try:
            return _open(name)
        except Exception as exc:  # noqa: BLE001 - try the next panel
            tried.append(f"{name}: {exc}")

    log.warning(
        "NO DISPLAY (%s) — the buzzer will still sound for a dose, but nothing "
        "in the room will say which tray it is for",
        "; ".join(tried) or f"unknown display backend {want!r}",
    )
    return NoDisplay()


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
