"""Whether the real-time clock can be believed, whichever chip is fitted.

Two chips, two different answers to one question
------------------------------------------------
This module is the interface the rest of the firmware uses — `read_status()`,
`vouch()` — and it hides a real asymmetry behind it.

**The DS3231** answers the trust question in hardware. Its oscillator-stop flag
latches whenever the oscillator has stopped and stays latched until software
clears it, so "did this chip lose time at some point?" is a bit you can read.
The time reaches the system clock through the kernel's `i2c-rtc` overlay,
before userspace starts.

**The DS1302** cannot. It has no oscillator-fail detector at all: its
clock-halt bit is a control with an explicitly undefined power-on state, so a
clear CH means only "running right now" — which is equally true of a chip that
was unpowered for a month and resumed counting from garbage. There is also no
kernel driver for it on a Pi, so there is no `/dev/rtc0`, `hwclock` does
nothing, and this firmware is the only thing that can read the chip. The
evidence is reconstructed instead, from a token in the chip's battery-backed
RAM. `ds1302.py` explains it; read that before trusting a DS1302 build.

Both fail towards the tray staying shut, which is the safe direction.

Why this module is not just "is there an RTC"
---------------------------------------------
Fitting a battery-backed clock removes the Pi's worst regression, but only if
the firmware asks the right question. "Is a chip present" is the wrong one. A
dead coin cell does not make a clock chip disappear — it makes it answer,
promptly and confidently, with a time that is nonsense. That is precisely the
failure this whole design refuses to act on.

For the DS3231 the right question is one bit: the **oscillator stop flag**
(OSF, bit 7 of the status register at 0x0F), latched by the hardware whenever
the oscillator has stopped since it was last cleared. Clear means the clock has
run continuously; set means there is a chip, it will happily report a time, and
that time is invented.

For the DS1302 there is no such bit, and the equivalent evidence is a token in
the chip's battery-backed RAM. See `ds1302.py`.

How the time gets into the system clock
---------------------------------------
It depends on the chip, and this is the other place the two differ.

**DS3231:** the kernel does it, via the `i2c-rtc` device-tree overlay, before
userspace starts — earlier than any Python could, and a path other people have
maintained for a decade. `service/install.sh` sets it up and disables
`fake-hwclock`, which otherwise restores a stale time over a good one.

**DS1302:** nothing does it. There is no kernel driver, so no `/dev/rtc0` and
no `hwclock`, and this firmware reads the chip and sets the clock itself at
startup. That is strictly worse — it happens after systemd has already
timestamped its own boot — and it is the cost of the part. It also means
`fake-hwclock` is not competing with anything on a DS1302 build, so leaving it
installed is harmless and gives early boot a plausible starting point.

This module's job is therefore the trust question, the write-back when somebody
sets the clock, and enough introspection for the status page to say something
useful when the answer is no.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from pathlib import Path

from datetime import datetime

from . import config

log = logging.getLogger(__name__)

#: Status register, and the oscillator stop flag within it.
_STATUS_REGISTER = 0x0F
_OSF_BIT = 0b1000_0000


@dataclass(frozen=True)
class RtcState:
    present: bool
    #: True only when the chip has kept time continuously. None when we could
    #: not tell — which is not the same as False and must not be reported as
    #: though the chip had failed.
    running: bool | None
    detail: str
    #: Which chip answered: `ds1302`, `ds3231`, or `''` when nothing did.
    kind: str = ""
    #: What the chip itself reads, when it can be read directly. The DS3231's
    #: time arrives through the kernel and is not repeated here; the DS1302 has
    #: no kernel path at all, so this is the only place it appears.
    reads: datetime | None = None
    #: Anything true of the hardware that is worth saying but is not a failure
    #: — a trickle charger left enabled over a non-rechargeable cell, say.
    warnings: tuple[str, ...] = ()

    @property
    def trustworthy(self) -> bool:
        return self.present and self.running is True

    def to_json(self) -> dict:
        return {"present": self.present, "running": self.running,
                "trustworthy": self.trustworthy, "detail": self.detail,
                "kind": self.kind,
                "reads": self.reads.isoformat(timespec="seconds") if self.reads else None,
                "warnings": list(self.warnings)}


def kernel_rtc_present(path: str | Path = "/dev/rtc0") -> bool:
    """Has the kernel bound an RTC driver?

    Present means the overlay loaded and the chip answered at boot, which is
    also what makes `hwclock` and the automatic restore work.
    """
    return Path(path).exists()


#: The answer changes at most once per boot, and it is consulted on every
#: scheduler tick and every status request. Opening the I2C bus that often would
#: be a lot of syscalls to learn the same thing.
_CACHE_S = 30.0
_cache: tuple[float, RtcState] | None = None


def invalidate() -> None:
    """Forget the cached answer — after setting the clock, or in a test."""
    global _cache
    _cache = None


def read_status(bus: int | None = None, address: int | None = None,
                now=time.monotonic) -> RtcState:
    """Ask the chip whether its oscillator has ever stopped.

    Every failure path returns `running=None` rather than False. The difference
    matters: False is "this chip lost time and is lying to you", None is "we
    could not tell", and only the first is a statement about the hardware.
    """
    global _cache
    if _cache is not None and now() - _cache[0] < _CACHE_S:
        return _cache[1]

    state = _read_status_uncached(bus, address)
    _cache = (now(), state)
    return state


def _read_status_uncached(bus: int | None, address: int | None) -> RtcState:
    """Ask whichever chip is configured, or work out which one is there."""
    kind = (config.RTC_KIND or "auto").lower()

    if kind == "none":
        return RtcState(present=False, running=None,
                        detail="this build is configured with no RTC")
    if kind == "ds1302":
        return _read_ds1302()
    if kind == "ds3231":
        return _read_ds3231(bus, address)

    # auto: the DS1302 first, because it is what the assembly guide builds and
    # because probing it is three GPIO writes against a chip that either echoes
    # a byte back through its RAM or does not exist.
    found = _read_ds1302()
    if found.present:
        return found
    other = _read_ds3231(bus, address)
    if other.present:
        return other
    # Neither. Report the DS1302's reason, since that is the fitted design.
    return found


def _read_ds1302() -> RtcState:
    from . import ds1302  # noqa: PLC0415 - only imported on a build that has one

    reading = ds1302.probe()
    warnings = []
    if reading.trickle:
        # The holder on a cheap module is wired straight to the cell, and those
        # modules usually ship with a primary CR2032 in it.
        warnings.append("the DS1302's trickle charger is enabled — if the cell "
                        "in the holder is an ordinary CR2032 it is being charged")
    if reading.halted and reading.present:
        warnings.append("the DS1302's oscillator is halted")

    return RtcState(present=reading.present, running=reading.vouched,
                    detail=reading.detail, kind="ds1302" if reading.present else "",
                    reads=reading.when, warnings=tuple(warnings))


def _read_ds3231(bus: int | None, address: int | None) -> RtcState:
    if not kernel_rtc_present():
        return RtcState(present=False, running=None,
                        detail="no /dev/rtc0 — the i2c-rtc overlay is not loaded")

    bus = config.RTC_I2C_BUS if bus is None else bus
    address = config.RTC_I2C_ADDRESS if address is None else address

    try:
        from smbus2 import SMBus
    except ImportError:
        # The kernel has the chip and is keeping time from it; we simply cannot
        # read the flag ourselves. Say so rather than guessing in either
        # direction — `Clock` treats this as not-vouched-for and falls back to
        # NTP or the phone, which is the safe way to be uncertain.
        return RtcState(present=True, running=None, kind="ds3231",
                        detail="smbus2 is not installed, so the oscillator flag "
                               "could not be checked (apt install python3-smbus2)")

    try:
        with SMBus(bus) as smbus:
            status = smbus.read_byte_data(address, _STATUS_REGISTER)
    except (OSError, PermissionError) as exc:
        return RtcState(present=True, running=None, kind="ds3231",
                        detail=f"could not read the DS3231 status register: {exc}")

    if status & _OSF_BIT:
        return RtcState(
            present=True, running=False, kind="ds3231",
            detail="the DS3231 oscillator has stopped since it was last set — "
                   "its battery is flat or was never fitted, so its time is wrong",
        )
    return RtcState(present=True, running=True, kind="ds3231",
                    detail="the DS3231 has kept time continuously")


def clear_oscillator_flag(bus: int | None = None, address: int | None = None) -> bool:
    """Clear OSF, to be called only just after the time has been set correctly.

    This is the acknowledgement half of the flag: until something clears it, the
    chip keeps reporting that it lost time — correctly, because nobody has told
    it the right time since. Clearing it without setting the clock first would
    be a lie that persists in hardware across every future boot.
    """
    bus = config.RTC_I2C_BUS if bus is None else bus
    address = config.RTC_I2C_ADDRESS if address is None else address
    try:
        from smbus2 import SMBus
        with SMBus(bus) as smbus:
            status = smbus.read_byte_data(address, _STATUS_REGISTER)
            smbus.write_byte_data(address, _STATUS_REGISTER, status & ~_OSF_BIT)
    except (ImportError, OSError, PermissionError) as exc:
        log.info("could not clear the DS3231 oscillator flag (%s)", exc)
        return False
    log.info("DS3231 oscillator flag cleared; the RTC is now vouching for itself")
    return True


# ── writing the time back, and vouching for it ──────────────────────────────

def vouch(when: datetime) -> bool:
    """Record a freshly-corrected time in the chip, so it survives a power cut.

    Called only just after the system clock has been set correctly. Without it
    the correction lives in RAM alone: the next power cut restores whatever the
    chip has been holding, and the device goes back to refusing to dispense.

    **The acknowledgement has to come last, in both directions.** On a DS3231
    that means writing the time before clearing OSF; on a DS1302 it means
    writing the registers before the RAM token. Doing either the other way
    round leaves the hardware asserting, across every future boot, that a time
    nobody corrected is trustworthy — which is a lie that outlives the session
    that told it.
    """
    kind = (config.RTC_KIND or "auto").lower()
    if kind == "none":
        return False

    written = False
    if kind in ("ds1302", "auto"):
        written = _vouch_ds1302(when)
    if not written and kind in ("ds3231", "auto"):
        written = _vouch_ds3231()

    invalidate()
    return written


def _vouch_ds1302(when: datetime) -> bool:
    from . import ds1302  # noqa: PLC0415

    try:
        chip = ds1302.Ds1302()
    except Exception as exc:  # noqa: BLE001
        log.info("could not open the DS1302 to set it (%s)", exc)
        return False

    try:
        if not chip.present():
            return False
        # `set_time` writes the registers and only then the token, which is
        # what makes a half-finished write leave the chip untrusted rather than
        # vouched-for and wrong.
        chip.set_time(when)
        log.info("DS1302 set to %s and vouched for in its battery-backed RAM",
                 when.isoformat(timespec="seconds"))
        return True
    except Exception as exc:  # noqa: BLE001
        log.info("could not set the DS1302 (%s)", exc)
        return False
    finally:
        try:
            chip.close()
        except Exception:  # noqa: BLE001
            pass


def _vouch_ds3231() -> bool:
    """`hwclock --systohc`, then clear OSF. Needs the kernel driver bound."""
    import subprocess  # noqa: PLC0415

    if not kernel_rtc_present():
        return False
    try:
        result = subprocess.run(["hwclock", "--systohc"], capture_output=True,
                                text=True, timeout=15, check=False)
    except (OSError, subprocess.SubprocessError) as exc:
        log.info("could not write the time to the DS3231 (%s)", exc)
        return False
    if result.returncode != 0:
        log.info("could not write the time to the DS3231 (%s)",
                 result.stderr.strip() or f"exit {result.returncode}")
        return False
    log.info("system time written to the DS3231")
    clear_oscillator_flag()
    return True


def read_time() -> datetime | None:
    """What the chip itself reads, for a build with no kernel RTC.

    Only the DS1302 answers this. On a DS3231 build the kernel has already
    applied the chip's time to the system clock before this process started, so
    asking again here would be a second, worse copy of a job already done.
    """
    if (config.RTC_KIND or "auto").lower() not in ("ds1302", "auto"):
        return None
    state = read_status()
    return state.reads if state.trustworthy else None
