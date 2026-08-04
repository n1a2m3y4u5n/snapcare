"""The two facts about the board itself that the status bar is allowed to show.

Why this is a module and not four lines in `health.py`
-----------------------------------------------------
`health.py` assembles a reading of the *machine* out of components that already
exist and already know their own answers — the dispenser, the scheduler, the
radio, the relay, the clock chip. Nothing owns the two facts here. They are a
path in sysfs and a syscall, and if they lived in `health.py` that module would
be the only one in the firmware that knew a kernel path by heart. Keeping them
apart means the snapshot holds no paths, and it means a test can point either
function at a fixture tree instead of at `/sys`, which is the only way any of
this is testable on a laptop at all.

The trap this module exists to avoid
------------------------------------
Every guide, and every model asked about Raspberry Pi under-voltage, answers
`/sys/devices/platform/soc/soc:firmware/get_throttled`. **That file is gone on
the target OS.** It shipped in rpi-6.1.y and rpi-6.6.y (Bookworm) and was taken
out by commit `a5d3fbb804bf`, `Revert "firmware: raspberrypi: Add backward
compatible get_throttled"`, which is in rpi-6.12.y. Raspberry Pi OS Trixie
standardises on 6.12 LTS, so on this project's stated target that path raises
`FileNotFoundError` on a 3B, a 4 and a 5 alike. A power chip written against it
would be permanently empty on every device this firmware ships to, and empty in
a way nobody would notice until somebody's servo browned out mid-sweep.

What survives is `drivers/hwmon/raspberrypi-hwmon.c`: a device named `rpi_volt`
with a single attribute, `in0_lcrit_alarm`, mode 0444 so no privilege is needed.
Its semantics are better than the reverted file's, not worse. A delayed work
item polls the firmware every two seconds asking it to *clear* the sticky bits
as it reads them, and the attribute returns bit 16 of that cached word. So the
file means "under-voltage in the last ~2 s", and it clears itself two to four
seconds after the supply recovers.

That self-clearing is exactly what a status bar wants and it is worth being
explicit about the alternative: a latch since boot would put a fault chip on a
panel in somebody's living room for a brownout at three in the morning that has
been over for six hours, with no way to clear it and nothing to act on. The
cost of the reading we chose instead is that a brownout nobody was looking at
goes unseen by the panel — which is acceptable, because the kernel logs
`Undervoltage detected!` on every transition, so the journal keeps the history
for the support conversation at no cost to this firmware.

The device number is not stable — `CONFIG_THERMAL_HWMON` registers an hwmon for
the SoC's thermal zone too, so `rpi_volt` may be `hwmon0` or `hwmon1` — which is
why the path is found by scanning names rather than hard-coded.

What everything here costs
--------------------------
These are read behind `health.snapshot`, on the scheduler tick, four times a
minute, so the numbers are the whole design constraint:

    scanning /sys/class/hwmon/hwmon*/name    ~87 µs, once in the life of the
                                             process, negative result included
    reading in0_lcrit_alarm                  ~10 µs; a cached kernel integer,
                                             no mailbox transaction, no I2C
    os.statvfs on the state directory        ~0.9 µs, and it does not touch the
                                             card — it reads mount metadata
    /sys/class/thermal/thermal_zone0/temp    ~8.9 µs
    /proc/uptime                             ~10 µs

The scan's negative result is cached *permanently* and that is the point of
caching it: on a laptop, in a container, and on any board whose firmware does
not answer `GET_THROTTLED` there is no `rpi_volt` at all, and a status bar that
re-globbed `/sys/class/hwmon` four times a minute forever to be told the same
"no" would be paying 87 µs a tick for the rest of the device's uptime.

Nothing here raises and nothing here blocks
-------------------------------------------
Every function is total. A missing file, a directory that has gone away, a
short read, a value that will not parse: all of them are the honest empty —
`""` or `None`, never a guess and never an exception. This runs on the loop
that also has to hit a scheduled minute and time servo pulses, and a sensor
read is not permitted to be the reason a tray does not open.

Everything below is Linux sysfs and Linux syscalls. This firmware has no other
target, and a portable spelling of any of it would be a fiction with no test.

Two of these must never become `Health` fields
----------------------------------------------
`soc_celsius` and `uptime_s` are here for `/api/status` and `--selftest`, and
they are deliberately raw numbers rather than buckets, because those two
surfaces are read by somebody who wants the number. They must not reach the
panel. `Health` rides inside the display plan and is compared for equality to
decide whether to repaint; one field that changes every tick turns "nine ticks
out of ten the panel is left alone" into a 38 ms SPI transfer four times a
minute, forever. A temperature is additionally alarming and unactionable — a Pi
3B in a closed enclosure driving an SPI panel idles at 55–65 °C, which is
entirely normal and reads as an emergency.
"""
from __future__ import annotations

import glob
import logging
import os
import threading
import time

from . import config

log = logging.getLogger(__name__)

#: What the Raspberry Pi hwmon driver calls itself. Matched exactly: the file
#: has one line and a trailing newline, and a `startswith` here would also
#: match a future `rpi_volt_something` that meant something else.
_VOLT_NAME = b"rpi_volt"

#: The driver's only attribute. `HWMON_CHANNEL_INFO(in, HWMON_I_LCRIT_ALARM)`,
#: which is `in0_lcrit_alarm` and nothing else — there is no voltage to read,
#: only the alarm bit.
_ALARM_ATTRIBUTE = "in0_lcrit_alarm"

#: Scanned once. The device number moves between boards and kernels because the
#: thermal zone registers an hwmon of its own, so the name is the only stable
#: way in.
_HWMON_NAMES = "/sys/class/hwmon/hwmon*/name"

#: The kernel refreshes the alarm from a delayed work item every two seconds, so
#: a cache shorter than that cannot hide a transition the file would have shown.
#: It is not there to save the 10 µs read; it is there so that a snapshot taken
#: by the status page and one taken by the tick in the same second agree, which
#: is a property worth having for nothing.
_VOLTAGE_CACHE_S = 2.0

#: A minute, against a fifteen-second tick. The answer changes at most once in
#: the life of a card — a filesystem does not go read-only twice — and this
#: firmware's whole storage story is "be gentle with the SD card", so touching
#: the filesystem layer four times a minute to be told the same thing is exactly
#: the habit that story is against.
_STORAGE_CACHE_S = 60.0

#: Free space below this is `"low"`. Five per cent is chosen to match ext4's
#: root reserve: that reserve is precisely the margin you want to be warned
#: *before* eating, because once it is gone the writes that fail are
#: `scheduler.json` and the event log.
_LOW_FRACTION = 0.05

_lock = threading.Lock()

#: `(pattern scanned, alarm path or "")`. Keyed by the pattern so that a test
#: pointing this at a fixture tree is not answered from the scan of the real
#: `/sys`. `None` means nothing has been scanned yet; `("...", "")` is the
#: permanent negative described in the module docstring.
_alarm: tuple[str, str] | None = None

#: `(path, read at, value)` for the two cached readings.
_voltage: tuple[str, float, str] | None = None
_storage: tuple[str, float, str] | None = None


def undervoltage(pattern: str = _HWMON_NAMES, now=time.monotonic) -> str:
    """`"ok"` | `"low"` | `""` — has the supply sagged in the last two seconds?

    `""` is "this board has nothing to say", and it is what a laptop, a
    container and any board whose firmware does not answer `GET_THROTTLED`
    return. It must render as an absent chip and never as a green tick: the
    difference between "the supply is fine" and "there is no way to ask" is the
    whole reason this returns three values instead of a bool.

    `"low"` is worth a fault rather than a caution even though it clears itself.
    Under-voltage is silent — there is no noise, no message and nothing on the
    panel that would otherwise change — and it corrupts the card, browns out a
    servo in the middle of a sweep, and is fixed by swapping a phone charger for
    the supply that came with the board. Silent, damaging and trivially
    actionable is the definition of a thing worth interrupting somebody for.

    Costs one open/read/close of a cached kernel integer, ~10 µs, behind a 2 s
    cache; plus one directory scan, ~87 µs, on the first call of the process.
    """
    global _voltage

    with _lock:
        path = _alarm_path(pattern)
        if not path:
            return ""

        cached = _voltage
        if (cached is not None and cached[0] == path
                and 0 <= now() - cached[1] < _VOLTAGE_CACHE_S):
            return cached[2]

        value = _read_alarm(path)
        _voltage = (path, now(), value)
        return value


def storage(path=None, now=time.monotonic) -> str:
    """`"ok"` | `"low"` | `"readonly"` | `""` — can this device still write down what it did?

    Not a cosmetic warning, which is why it earns one of the bar's six slots.
    `Dispenser._save_state` writes `scheduler.json` through an fsync-and-replace;
    on a full or read-only card that raises, the daemon's tick catches it and the
    machine carries on dispensing — with no record reaching the card. After the
    next power cut `_restore` reads stale state, this morning's dose looks
    un-dispensed inside its grace window, and it fires again. A double dose is
    the failure the whole store module was written to prevent, arriving through a
    different door, and nothing else in the firmware notices.

    `readonly` outranks `low` because ext4's default `errors=remount-ro` is
    exactly how a dying SD card presents: the mount flips read-only with plenty
    of free space still reported, so a check that looked at space first would
    call a failing card healthy.

    One thing this cannot see, stated rather than hidden: a card that has failed
    such that every I/O returns EIO while the mount flags stay clean reads as
    perfectly well here. Nothing in the standard library catches that cheaply,
    and the alternative — a periodic write probe — would itself wear the card.

    `path` defaults to `config.STATE_DIR`, resolved at call time rather than at
    import, so a test that redirects the state directory is not answered from
    wherever this module happened to be imported. Costs one `statvfs`, ~0.9 µs,
    behind a 60 s cache. `StateDirectory=` in the unit bind-mounts that
    directory, and `statvfs` follows through to the backing filesystem, so the
    reading is the real card and not the bind mount.
    """
    global _storage

    target = str(config.STATE_DIR if path is None else path)

    with _lock:
        cached = _storage
        if (cached is not None and cached[0] == target
                and 0 <= now() - cached[1] < _STORAGE_CACHE_S):
            return cached[2]

        value = _read_storage(target)
        _storage = (target, now(), value)
        return value


def soc_celsius(path: str = "/sys/class/thermal/thermal_zone0/temp") -> int | None:
    """Whole degrees Celsius, or `None`. For `/api/status` and `--selftest` only.

    **Not a `Health` field and not a bar chip**, for the two reasons in the
    module docstring: it changes most ticks, and the number frightens people who
    have no action to take about it.

    A Pi has exactly one thermal zone, so `thermal_zone0` is the SoC's there. A
    laptop has several and zone 0 is whichever the kernel registered first, so
    the caller is the gate — `gpiochip.on_raspberry_pi()` — and this function
    deliberately does not read `thermal_zone0/type` to work it out for itself,
    because a driver rename in a future kernel would then silently turn the
    reading off on a real device.
    """
    try:
        with open(path, "rb") as handle:
            # Millidegrees with a trailing newline: `48312\n`.
            return int(handle.read(16).strip()) // 1000
    except (OSError, ValueError):
        return None


def uptime_s(path: str = "/proc/uptime") -> int | None:
    """Whole seconds since boot, or `None`. For `/api/status` and `--selftest` only.

    The same rule as `soc_celsius`: it changes by construction on every tick, so
    it is the textbook field that must never reach a snapshot the panel compares
    for equality. It is here because "how long has this been up" is the first
    question of every support conversation about a device that keeps restarting.
    """
    try:
        with open(path, "rb") as handle:
            # `12345.67 98765.43` — seconds up, then idle seconds summed across
            # cores. Float, so `int(str)` would refuse it.
            return int(float(handle.read(64).split()[0]))
    except (OSError, ValueError, IndexError):
        return None


def _alarm_path(pattern: str) -> str:
    """The `in0_lcrit_alarm` path, scanned once and remembered either way.

    Called with `_lock` held. Two callers arriving together therefore scan once
    between them rather than twice, which is free to arrange here and is the
    only reason the lock wraps the read as well as the resolution.
    """
    global _alarm

    if _alarm is not None and _alarm[0] == pattern:
        return _alarm[1]

    found = _find_alarm(pattern)
    _alarm = (pattern, found)
    if found:
        # Once per process, and worth the line: it records which hwmon number
        # this boot handed us, which is the first thing to check if the power
        # chip ever disagrees with `vcgencmd`.
        log.info("under-voltage flag found at %s", found)
    else:
        # DEBUG, not WARNING. On every development machine this is the normal
        # answer, and on a Pi the thing that names it is `--selftest`, which
        # forks `vcgencmd` once with somebody watching.
        log.debug("no rpi_volt hwmon device — the power chip will stay empty")
    return found


def _find_alarm(pattern: str) -> str:
    """Scan hwmon names for `rpi_volt`. `""` if it is not there."""
    for name_path in sorted(glob.glob(pattern)):
        try:
            with open(name_path, "rb") as handle:
                if handle.read(16).strip() != _VOLT_NAME:
                    continue
        except OSError:
            # A device that unbound between the glob and the open. Not our
            # device either way, and one that will not be there next boot.
            continue
        alarm = os.path.join(os.path.dirname(name_path), _ALARM_ATTRIBUTE)
        if os.path.exists(alarm):
            return alarm
    return ""


def _read_alarm(path: str) -> str:
    """`"ok"` | `"low"` | `""` from the alarm attribute's one byte."""
    try:
        with open(path, "rb") as handle:
            raw = handle.read(8).strip()
    except OSError:
        # The driver unbound, or the tree went away under us. Unknown rather
        # than well: a chip that vanished has not told us the supply is fine.
        return ""
    if not raw:
        return ""
    # Anything that is not a plain zero is the alarm. The driver writes `0` or
    # `1`, and treating an unexpected value as "low" is the safe direction —
    # over-reporting sends somebody to look at a supply, under-reporting lets a
    # card corrupt itself quietly.
    return "ok" if raw == b"0" else "low"


def _read_storage(path: str) -> str:
    """`"ok"` | `"low"` | `"readonly"` | `""` from one `statvfs`."""
    try:
        st = os.statvfs(path)
    except OSError:
        # The state directory does not exist yet, or is not reachable. Both are
        # real states early in a first boot and neither is a claim about a card.
        return ""
    if st.f_flag & os.ST_RDONLY:
        return "readonly"
    if not st.f_blocks:
        # A pseudo-filesystem with no blocks to count. No fraction to compute
        # and no honest answer to give.
        return ""
    # `f_bavail`, not `f_bfree`: the difference between them is the root
    # reserve, and this firmware runs as root, so counting the reserve as free
    # would mean warning only once it was already being eaten.
    return "low" if st.f_bavail < st.f_blocks * _LOW_FRACTION else "ok"


def _reset_for_tests() -> None:
    """Forget the resolved path and both cached readings.

    Every cache here is permanent or minute-scale by design, so without this a
    test that pointed `undervoltage` at a fixture tree would be answered from
    the previous test's fixture for the rest of the session.
    """
    global _alarm, _voltage, _storage

    with _lock:
        _alarm = None
        _voltage = None
        _storage = None
