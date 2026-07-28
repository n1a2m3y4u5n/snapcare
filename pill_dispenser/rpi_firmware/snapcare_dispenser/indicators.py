"""How the device talks to the person standing in front of it.

The project's founding constraint is that the person cannot be assumed to read.
So the channel to them is a colour and a sound, never text — that is why the
Arduino build had an LED ring and a piezo and no display facing the user.

Which of those parts this Pi build actually gets is a hardware decision that
has not been made yet, so this module is the seam. Everything above it calls
these five methods; what they do depends on which class is installed. Adding a
NeoPixel ring later is one new class and one line in the daemon, and nothing
that decides when a dose is due has to be touched to do it.

`LogIndicator` is the default and is not a placeholder — a device with no ring
and no buzzer still works, it just relies on the phone for notification. It is
the right default precisely because it is honest: nothing here pretends a light
is blinking when no light is fitted.
"""
from __future__ import annotations

import logging

log = logging.getLogger(__name__)

#: The colour vocabulary, carried over unchanged from the Arduino firmware so
#: that a person who has used one device understands the other.
GREEN = "green"    # a dose is in the cup; take it and press the button
BLUE = "blue"      # recorded as taken
AMBER = "amber"    # the dose went untaken, or its window closed
VIOLET = "violet"  # a new schedule was accepted


class Indicator:
    """No-op base. Every method must be safe to call from any thread."""

    #: What the status page reports as fitted, so the web UI can stop drawing a
    #: ring for a device that does not have one.
    fitted: tuple[str, ...] = ()

    def dose_ready(self, tray: int) -> None: ...
    def dose_taken(self, tray: int) -> None: ...
    def dose_missed(self, tray: int) -> None: ...
    def schedule_accepted(self) -> None: ...
    def clear(self) -> None: ...
    def close(self) -> None: ...


class LogIndicator(Indicator):
    """Writes what a fitted ring and buzzer would have done.

    This is what runs on a bare board, and what the tests assert against.
    """

    fitted = ()

    def dose_ready(self, tray: int) -> None:
        log.info("indicator: %s + chime — tray %d is ready", GREEN, tray)

    def dose_taken(self, tray: int) -> None:
        log.info("indicator: %s — tray %d recorded as taken", BLUE, tray)

    def dose_missed(self, tray: int) -> None:
        log.info("indicator: %s — tray %d was missed", AMBER, tray)

    def schedule_accepted(self) -> None:
        log.info("indicator: %s — new schedule accepted", VIOLET)

    def clear(self) -> None:
        log.debug("indicator: off")
