"""The screen as the button. One tap anywhere means "give me my dose".

Why the glass and not a switch
------------------------------
This build has no physical button fitted, and the panel is the obvious thing to
press: it is the part of the machine a person is already looking at when they
are told a dose is waiting, and it is ten centimetres of target rather than a
six-millimetre one. For hands that shake — which is a large share of the people
this device exists for — that difference is the whole difference.

**Anywhere on the glass counts, and nothing on the panel is a control.** There
are no on-screen buttons, no regions and no calibration, and that is a decision
rather than a shortcut. A target somebody has to find and hit is a target that
can be missed, and it would put the one action this machine performs behind
knowing where to aim. So the touch is not read as a coordinate at all: only
"the glass was touched" reaches this module, and that is the entire vocabulary.

It also means the touch panel never has to be calibrated, which is the part of
a resistive screen that goes wrong quietly — a mis-set calibration puts the
press somewhere other than where the finger was, and with no regions there is
nowhere else for it to be.

Why the kernel driver rather than talking to the controller
-----------------------------------------------------------
These 2.8-inch modules carry an XPT2046 on the same SPI bus as the display, on
the second chip select. Reading it directly means full-duplex SPI — the control
byte and the twelve bits of answer have to happen inside one assertion of CS,
which `os.write` and `os.read` cannot express because each of them drops CS at
the end — so it needs `SPI_IOC_MESSAGE` and a packed `spi_ioc_transfer`, a
struct whose layout has changed across kernel versions.

Raspberry Pi OS already ships a driver for exactly this part (`ads7846`, which
the XPT2046 is a clone of), and it does the sampling, the debouncing and the
pressure threshold in kernel space. Turning it on is one line in `config.txt`
and the result is an ordinary input device. Reading a 24-byte struct out of
`/dev/input/event*` is both less code than the SPI path and the more robust of
the two, and it is the same reason this firmware uses the kernel's SPI and I2C
nodes rather than a vendor library.

    dtoverlay=ads7846,cs=1,penirq=4,speed=50000,xohms=150

`service/install.sh` writes that line. `cs=1` is the second chip select, which
is free because the display owns the first; `penirq` is whichever GPIO the
module's T_IRQ is on.

What a press does, and what it does not
---------------------------------------
Exactly what the button did: `Dispenser.release()`. Not "dispense" — if no dose
is owed, a tap does nothing at all, and that is the common case for an idle
machine sitting on a table where somebody will inevitably rest a hand on it.
The screen is not a way to ask for pills; it is a way to accept the ones the
machine has already offered.

A tap also wakes the panel out of its night palette, the same way the button
did, because somebody touching the machine at three in the morning is somebody
standing there reading it.

Never raises into its caller, and never blocks
-----------------------------------------------
The reader runs on its own thread and every failure inside it stops there. A
touch panel that is unplugged mid-run, a device node that disappears, a kernel
that never had the overlay — all of them are a machine with no touch input,
which is a supported build, and none of them may reach the scheduler.
"""
from __future__ import annotations

import logging
import os
import struct
import threading
import time
from pathlib import Path
from typing import Callable

from . import config

log = logging.getLogger(__name__)

__all__ = ["TouchRelease", "find_touch_device"]

#: `struct input_event` as the kernel writes it: a timeval, then type, code and
#: value. The timeval is two longs, so this is 24 bytes on a 64-bit kernel and
#: 16 on a 32-bit one — and Raspberry Pi OS ships both, on the same hardware.
#: `struct.calcsize` is asked rather than assumed for exactly that reason.
_EVENT_FORMAT = "llHHi"
_EVENT_SIZE = struct.calcsize(_EVENT_FORMAT)

#: The two events worth reading, out of everything a touchscreen emits.
_EV_KEY = 0x01
_BTN_TOUCH = 0x14A

#: Where the kernel publishes input devices, and where it names them.
_INPUT_DIR = Path("/dev/input")
_SYS_INPUT = Path("/sys/class/input")

#: Substrings that mark a device as the touch panel. `ads7846` is the driver
#: Raspberry Pi OS binds to the XPT2046; the others cover modules whose overlay
#: names them differently.
_TOUCH_NAMES = ("ads7846", "xpt2046", "touchscreen", "tsc2046")


def _device_name(node: Path) -> str:
    try:
        return (_SYS_INPUT / node.name / "device" / "name").read_text(
            encoding="utf-8", errors="replace").strip().lower()
    except OSError:
        return ""


def find_touch_device(explicit: str | None = None) -> Path | None:
    """The touch panel's event node, or None if there is not one.

    An explicit path is taken at its word — somebody who has named a device
    wants to be told it is not there, not handed a different one.
    """
    if explicit:
        node = Path(explicit)
        return node if node.exists() else None

    try:
        nodes = sorted(_INPUT_DIR.glob("event*"))
    except OSError:
        return None

    for node in nodes:
        name = _device_name(node)
        if any(needle in name for needle in _TOUCH_NAMES):
            return node
    return None


class TouchRelease:
    """Calls `on_touch` once per press. Never raises into its caller.

    Deliberately the same shape as `TakeDoseButton`: the daemon holds one or the
    other (or both), closes it the same way, and `--selftest` counts presses off
    it the same way. The two are alternative *inputs to one action*, not two
    features.
    """

    def __init__(self, on_touch: Callable[[], None],
                 device: str | None = None,
                 settle_s: float | None = None):
        self._on_touch = on_touch
        #: Ignore a second press inside this window. A resistive panel under a
        #: finger that rolls slightly reports several presses, and each one here
        #: would be another tray sweep — so this is not cosmetic debouncing, it
        #: is what stops one touch becoming two doses.
        self.settle_s = (config.TOUCH_SETTLE_S if settle_s is None else settle_s)
        self.device = find_touch_device(device or config.TOUCH_DEVICE)
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._last = 0.0
        #: Every press this object has seen, for `--selftest` and the status
        #: page — a panel that fires twice per tap and one that never fires look
        #: identical from anywhere else.
        self.presses = 0
        self.fitted = False

        if self.device is None:
            log.info(
                "no touch panel found — the screen will show a dose but a tap "
                "on it will not release one. If the panel has an XPT2046, add "
                "`dtoverlay=ads7846,cs=1,penirq=%d` to /boot/firmware/config.txt "
                "and reboot.", config.TOUCH_PENIRQ_GPIO)
            return

        try:
            self._fd = os.open(str(self.device), os.O_RDONLY | os.O_NONBLOCK)
        except OSError as exc:
            log.warning("touch panel %s could not be opened (%s) — a tap will "
                        "not release a dose", self.device, exc)
            return

        self.fitted = True
        self._thread = threading.Thread(target=self._read_loop, name="touch",
                                        daemon=True)
        self._thread.start()
        log.info("touch: %s (%s) — a tap anywhere releases a waiting dose",
                 self.device, _device_name(self.device) or "unnamed")

    def _read_loop(self) -> None:
        """Block on the device until a finger lands, then fire once.

        `select` rather than a poll with a sleep, so an idle machine costs
        nothing at all and a press is acted on within a millisecond rather than
        within whatever the poll interval happened to be. The dose is the whole
        point of the device; the person should not be able to notice a delay
        between touching it and the tray moving.
        """
        import select  # noqa: PLC0415 - only needed when a panel is fitted

        buffer = b""
        while not self._stop.is_set():
            try:
                ready, _, _ = select.select([self._fd], [], [], 0.5)
                if not ready:
                    continue
                chunk = os.read(self._fd, _EVENT_SIZE * 16)
            except (OSError, ValueError):
                # The node vanished — a module unplugged, or the driver
                # unbound. A machine with no touch panel is a supported build,
                # so this is a warning and the end of the thread, never an
                # exception anybody upstream has to handle.
                log.warning("the touch panel stopped answering — a tap will no "
                            "longer release a dose")
                self.fitted = False
                return
            if not chunk:
                continue

            buffer += chunk
            while len(buffer) >= _EVENT_SIZE:
                frame, buffer = buffer[:_EVENT_SIZE], buffer[_EVENT_SIZE:]
                try:
                    _sec, _usec, kind, code, value = struct.unpack(
                        _EVENT_FORMAT, frame)
                except struct.error:
                    buffer = b""
                    break
                # Only the finger going *down*. The release edge is ignored, so
                # a long press is one dose rather than one on the way in and
                # another on the way out.
                if kind == _EV_KEY and code == _BTN_TOUCH and value == 1:
                    self._fire()

    def _fire(self) -> None:
        now = time.monotonic()
        if now - self._last < self.settle_s:
            return
        self._last = now
        self.presses += 1
        try:
            self._on_touch()
        except Exception:  # noqa: BLE001
            # The handler already catches its own failures; this is the last
            # net. A touch that throws must not kill the reader thread, or the
            # first error makes the screen permanently inert.
            log.exception("the touch handler failed; the panel stays live")

    def close(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2)
        try:
            os.close(self._fd)
        except (OSError, AttributeError):
            pass
