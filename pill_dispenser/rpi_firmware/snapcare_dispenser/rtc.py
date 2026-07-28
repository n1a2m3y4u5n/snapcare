"""The DS3231, and the one register that says whether to believe it.

Why this module is not just "is there an RTC"
---------------------------------------------
Fitting a battery-backed clock removes the Pi's worst regression, but only if
the firmware asks the right question. "Is a DS3231 present" is the wrong one. A
dead coin cell does not make the chip disappear from the I2C bus — it makes the
chip answer, promptly and confidently, with a time that is nonsense. That is
precisely the failure this whole design refuses to act on.

The right question is answered by one bit. The DS3231 has an **oscillator stop
flag** (OSF, bit 7 of the status register at 0x0F) which the hardware latches
whenever the oscillator has stopped since it was last cleared — which is exactly
"this chip lost both its supply and its battery at some point, and everything it
has told you since is invented". It stays latched until software clears it, so
it survives being read.

So: OSF clear means the clock has run continuously and can be trusted. OSF set
means there is a chip, it will happily report a time, and that time is garbage.

How the time actually gets into the system clock
------------------------------------------------
Not by this module. The kernel does it, via the `i2c-rtc` device-tree overlay,
before userspace starts:

    /boot/firmware/config.txt:  dtoverlay=i2c-rtc,ds3231

That is much better than reading the registers here and calling `settimeofday`.
It happens earlier — before systemd timestamps anything, before filesystems are
checked — and it is the path that has been maintained and tested by other people
for a decade. `service/install.sh` sets it up, and disables `fake-hwclock`,
which otherwise fights it by restoring a stale time over a good one.

This module's whole job is therefore the trust question, plus enough
introspection for the status page to say something useful when the answer is no.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from pathlib import Path

from . import config

log = logging.getLogger(__name__)

#: Status register, and the oscillator stop flag within it.
_STATUS_REGISTER = 0x0F
_OSF_BIT = 0b1000_0000


@dataclass(frozen=True)
class RtcState:
    present: bool
    #: True only when the oscillator has run continuously. None when we could
    #: not read the flag — which is not the same as False and must not be
    #: reported as though the chip had failed.
    running: bool | None
    detail: str

    @property
    def trustworthy(self) -> bool:
        return self.present and self.running is True

    def to_json(self) -> dict:
        return {"present": self.present, "running": self.running,
                "trustworthy": self.trustworthy, "detail": self.detail}


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
        return RtcState(present=True, running=None,
                        detail="smbus2 is not installed, so the oscillator flag "
                               "could not be checked (apt install python3-smbus2)")

    try:
        with SMBus(bus) as smbus:
            status = smbus.read_byte_data(address, _STATUS_REGISTER)
    except (OSError, PermissionError) as exc:
        return RtcState(present=True, running=None,
                        detail=f"could not read the DS3231 status register: {exc}")

    if status & _OSF_BIT:
        return RtcState(
            present=True, running=False,
            detail="the DS3231 oscillator has stopped since it was last set — "
                   "its battery is flat or was never fitted, so its time is wrong",
        )
    return RtcState(present=True, running=True,
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
