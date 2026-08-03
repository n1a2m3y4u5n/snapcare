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

It also means the touch panel never has to be calibrated, and a calibration is
the part of a touch screen that goes wrong quietly: it puts the press somewhere
other than where the finger was, and everything still looks like it works. With
no regions there is nowhere for that error to land.

Why the kernel driver rather than talking to the controller
-----------------------------------------------------------
The touch controller is a second chip that shares nothing with the panel but
the connector. The LCD is on SPI; the controller is on I2C, on the four pins
the module marks `CTP_`. It is one of a small family — FT6206/FT6236 at 0x38,
GT911 at 0x5d or 0x14 — and Raspberry Pi OS has a driver for each of them.

Speaking to one directly means a register map per part, a contact protocol per
part and the interrupt handling under both. The kernel does all of it behind
one device-tree line and hands back an ordinary input device, so reading a
24-byte struct out of `/dev/input/event*` is both less code and the more robust
of the two. It is the same reason this firmware uses the kernel's SPI and I2C
nodes rather than a vendor library.

    dtoverlay=edt-ft5406                      # FT6206 / FT6236 at 0x38
    dtoverlay=goodix,interrupt=4,reset=12     # GT911 at 0x5d or 0x14

Which line is the right one depends on what answers on the bus, and the bus
cannot be asked until the panel is wired — which is several stages after the
installer runs. So the installer does not guess: `--touch-setup` probes the
three addresses, writes the matching line, and on a second run says whether a
driver actually bound.

The one input device that must never be picked
-----------------------------------------------
A resistive panel would be read through `ads7846`, and a `config.txt` written
for one still carries `dtoverlay=ads7846`. That line is not inert on a board
that has no such chip. Nothing on an SPI chip select has to acknowledge, so the
driver can bind against an empty bus and publish "ADS7846 Touchscreen": an
input device that opens, reads, and reports a press exactly never.

Picking it would give a machine that says a touch panel is fitted and then
never releases a dose. So those names are refused outright rather than ranked
below the real panel — a phantom that is merely second choice still wins every
time the real one is missing, which is precisely when somebody is looking.

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

__all__ = ["TouchRelease", "find_touch_device", "probe_bus", "setup"]

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

#: Substrings that mark a device as the touch panel. The first few are what the
#: capacitive drivers call themselves — `edt_ft5x06` names the device after the
#: part it identified, so an FT6236 can arrive as anything from "generic ft5x06"
#: to a model number — and the last two are the generic fallback for a driver
#: nobody here has seen.
_TOUCH_NAMES = ("ft5x06", "ft5406", "ft5426", "ft6206", "ft6236",
                "goodix", "ns2009", "touchscreen", "touch panel")

#: ...and substrings that mark one as the resistive controller this build does
#: not have. Checked first and skipped, never ranked: see the module docstring.
#: An input device with one of these names means a stale `dtoverlay=ads7846`
#: line, so finding one is worth saying out loud.
_NOT_TOUCH = ("ads7846", "xpt2046", "tsc2046")


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

    found = None
    for node in nodes:
        name = _device_name(node)
        if any(needle in name for needle in _NOT_TOUCH):
            # Said every time rather than once, and at warning level: this is a
            # machine one config.txt line away from reporting a touch panel it
            # cannot read, and the line names itself in the message.
            log.warning(
                "ignoring %s (%s) — that is a driver for a resistive panel this "
                "build does not have. Remove `dtoverlay=ads7846` from "
                "/boot/firmware/config.txt and reboot.", node, name)
            continue
        if found is None and any(needle in name for needle in _TOUCH_NAMES):
            found = node
    return found


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
        #: Ignore a second press inside this window. A finger that rolls or
        #: rests light enough to sit on the contact threshold drops and remakes
        #: the contact, and the controller reports each remake as a new press —
        #: each of which would be another tray sweep. So this is not cosmetic
        #: debouncing, it is what stops one touch becoming two doses.
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
                "on it will not release one. The controller needs a device-tree "
                "line naming it: run `sudo snapcare-dispenser --touch-setup`, "
                "which reads the I2C bus and writes the right one.")
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


# ── giving the controller a driver ──────────────────────────────────────────
#
# Everything below runs once, from `--touch-setup`, on a machine with the panel
# already wired. None of it is on the path the daemon takes.

#: The ioctl that points the next read or write at one chip on the bus.
_I2C_SLAVE = 0x0703

#: What can answer, and what it is. Only these addresses are probed: 0x68 on
#: the same bus is a DS3231, and a build that fits one must not have its clock
#: read as a touch panel.
_CONTROLLERS = {
    0x38: "FT6206 / FT6236",
    0x14: "GT911",
    0x48: "NS2009",
    0x5D: "GT911",
}


def _overlay_lines(addr: int) -> tuple[str, ...]:
    """The `config.txt` lines that give the chip at `addr` a driver.

    Empty when Raspberry Pi OS has no stock overlay for the part, which is a
    real answer and not a failure — it is the difference between "wire it
    again" and "this needs a driver nobody ships".

    Nothing optional is passed. Every extra parameter is another chance for the
    whole line to be rejected and leave the panel dead, and the ones on offer
    are all about coordinates: screen size, axis inversion, axis swap. This
    firmware reads no coordinates at all — only that the glass was touched — so
    every one of them would be decoration bought at the price of a risk.
    """
    if addr == 0x38:
        # `edt-ft5406` hardwires its interrupt to GPIO 4, which is where
        # CTP_INT goes and is why that pin is not a free choice. It has no
        # parameter for a reset line, so CTP_RST is released here instead — by
        # the bootloader, before the driver probes. Left floating it is a chip
        # that comes out of reset on some boots and not others, which presents
        # as a panel that works intermittently for no visible reason.
        if config.TOUCH_INT_GPIO != 4:
            return ()
        return ("dtoverlay=edt-ft5406",
                f"gpio={config.TOUCH_RESET_GPIO}=op,dh")
    if addr in (0x14, 0x5D):
        # This one takes both pins, so the driver owns the reset and there is
        # nothing for the bootloader to hold.
        return (f"dtoverlay=goodix,interrupt={config.TOUCH_INT_GPIO}"
                f",reset={config.TOUCH_RESET_GPIO}",)
    return ()


def probe_bus(bus: str | None = None) -> list[int]:
    """Every touch-controller address that answers on the I2C bus.

    A real presence test, and the only one this screen has. An I2C address
    either acknowledges or it does not, while the LCD half is write-only and
    initialises exactly as well with nothing on the end of the ribbon.

    Returns an empty list both for "the bus is there and nothing answered" and
    for "there is no bus" — `setup` tells those two apart before calling, since
    they need opposite fixes.
    """
    import fcntl  # noqa: PLC0415 - Linux only, and only on this path

    try:
        fd = os.open(bus or config.TOUCH_I2C_BUS, os.O_RDWR)
    except OSError:
        return []
    found = []
    try:
        for addr in sorted(_CONTROLLERS):
            try:
                fcntl.ioctl(fd, _I2C_SLAVE, addr)
                os.read(fd, 1)
            except OSError:
                continue
            found.append(addr)
    finally:
        os.close(fd)
    return found


def _input_devices() -> list[tuple[Path, str]]:
    """Every input node the kernel is publishing, with its name."""
    try:
        nodes = sorted(_INPUT_DIR.glob("event*"))
    except OSError:
        return []
    return [(node, _device_name(node)) for node in nodes]


def _boot_config() -> Path:
    """Where this image keeps `config.txt`."""
    new = Path("/boot/firmware/config.txt")
    return new if new.exists() else Path("/boot/config.txt")


def _strip_resistive(lines: list[str]) -> tuple[list[str], int]:
    """Drop any `dtoverlay=ads7846` line, and the comment that introduced it.

    Removing a line somebody else may have put there by hand is worth being
    careful about, so this matches the whole directive rather than a substring,
    and it takes the preceding comment only when that comment is one this
    project wrote.
    """
    kept: list[str] = []
    dropped = 0
    for line in lines:
        if line.strip().startswith("dtoverlay=ads7846"):
            dropped += 1
            while kept and kept[-1].strip().startswith("# SnapCare"):
                kept.pop()
            while kept and not kept[-1].strip():
                kept.pop()
            continue
        kept.append(line)
    return kept, dropped


def setup(config_txt: str | None = None) -> int:
    """Find the touch controller, write its driver line, and say what happened.

    Split out from the installer because the installer cannot do it: it runs at
    Stage 0 and the panel is not wired until Stage 3, so at install time there
    is nothing on the bus to find. Re-running this is the check as well as the
    fix — the second run is the one that can say whether a driver bound.
    """
    path = Path(config_txt) if config_txt else _boot_config()

    node = find_touch_device()
    if node is not None:
        print(f"A touch panel is already live: {node} "
              f"({_device_name(node) or 'unnamed'})")
        print("Nothing to do. A tap on the glass releases a waiting dose.")
        return 0

    bus = config.TOUCH_I2C_BUS
    if not Path(bus).exists():
        print(f"{bus} does not exist, so the bus cannot be asked what is on it.")
        print("  I2C is off, or it was turned on and the Pi has not rebooted "
              "since.")
        print("  Check for `dtparam=i2c_arm=on` in "
              f"{path}, then reboot and run this again.")
        return 1

    # Opened once on its own, because `probe_bus` cannot tell the caller apart
    # from the chips: it answers "nothing acknowledged" for a bus it was never
    # allowed to open, and "check your wiring" is the wrong thing to tell
    # somebody who only forgot the sudo.
    try:
        os.close(os.open(bus, os.O_RDWR))
    except PermissionError:
        print(f"Not allowed to open {bus}.")
        print("  Run this with sudo.")
        return 1
    except OSError as exc:
        print(f"Could not open {bus}: {exc}")
        return 1

    found = probe_bus(bus)
    if not found:
        print(f"Nothing answered on {bus}.")
        print("  The controller is not powered or not wired. Check VCC, GND, "
              f"CTP_SDA (GPIO {config.TOUCH_SDA_GPIO}) and CTP_SCL "
              f"(GPIO {config.TOUCH_SCL_GPIO}) — and that CTP_SDA and CTP_SCL "
              "are not swapped, which looks exactly like this.")
        return 1

    addr = found[0]
    print(f"Found {_CONTROLLERS[addr]} at 0x{addr:02x} on {bus}.")
    if len(found) > 1:
        others = ", ".join(f"0x{a:02x}" for a in found[1:])
        print(f"  (also answering: {others} — using the first)")

    lines = _overlay_lines(addr)
    if not lines:
        print(f"  Raspberry Pi OS ships no overlay for the {_CONTROLLERS[addr]}.")
        print("  The chip is there and the wiring is right; what is missing is "
              "a driver.")
        print("  The screen still shows every dose. Fit the Stage 4 button, or "
              "release from the app.")
        return 1

    try:
        existing = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        print(f"Could not read {path}: {exc}")
        return 1

    kept, dropped = _strip_resistive(existing)
    if dropped:
        print(f"  Removing {dropped} `dtoverlay=ads7846` line(s) — that driver "
              "is for a resistive panel this build does not have, and it can "
              "publish an input device for a chip that is not there.")

    already = {line.strip() for line in kept}
    to_add = [line for line in lines if line not in already]
    if not to_add and not dropped:
        print(f"  {path} already has the right lines.")
        others = [(node, name) for node, name in _input_devices() if name]
        if not others:
            print("  No input device has appeared, so the Pi has not rebooted "
                  "since they were added — or the driver did not bind.")
            return 1
        # The overlay loaded and something is publishing events, but nothing
        # here recognised the name. That is a supported outcome with a
        # one-line fix, and it is invisible without printing the names.
        print("  A driver did bind, and none of what it published looks like a "
              "touch panel to this firmware:")
        for node, name in others:
            print(f"    {node}  {name}")
        print("  If one of those is the screen, name it and restart:")
        print("      sudo systemctl edit snapcare-dispenser")
        print("      # add: Environment=SNAPCARE_TOUCH_DEVICE=/dev/input/eventN")
        return 1

    if to_add:
        kept.append("")
        kept.append("# SnapCare: the screen's touch controller, which is the "
                    "take-dose button")
        kept.extend(to_add)

    try:
        # The original is kept, once. A config.txt that will not boot is a card
        # reader and another machine to fix, and this file is edited by a
        # program on a device with no keyboard attached to it.
        backup = path.with_suffix(".txt.snapcare-bak")
        backup.write_text("\n".join(existing) + "\n", encoding="utf-8")
        path.write_text("\n".join(kept) + "\n", encoding="utf-8")
    except OSError as exc:
        print(f"Could not write {path}: {exc}")
        print("  Run this with sudo.")
        return 1

    for line in to_add:
        print(f"  added: {line}")
    print(f"  the previous file is at {backup}")
    print()
    print("The kernel reads that file at boot and nowhere else:")
    print("    sudo reboot")
    print("Then run this again — it will say whether the driver bound.")
    return 0
