"""Whether the device knows what time it is, and whether it should believe itself.

A Raspberry Pi has **no real-time clock of its own and no battery**, which was
this build's worst regression from the Arduino board. A coin-cell clock chip is
fitted to fix it — see `rtc.py` — but the rule around it matters more than the
part, because the failure it guards against is not "no time".

A Pi that boots with no network does not report *no* time. Raspberry Pi OS ships
`fake-hwclock`, which writes the time to a file periodically and restores it at
boot, so a Pi that was unplugged on Friday evening comes back up on Tuesday
believing it is Friday evening — confidently, with a plausible clock, and with
the wrong day of the week. A tray acting on that opens the Monday/Wednesday/
Friday compartment on a Tuesday and looks perfectly healthy doing it.

So the same rule the AVR firmware used is kept, and matters more here: the
device dispenses nothing until something vouches for the time. Three things
can, in this order of authority:

  **NTP.** Once the WiFi is up, systemd-timesyncd corrects the clock from the
  network and reports that it has. Continuously corrected, so it beats
  everything, and it needs nobody's attention.

  **The clock chip**, whether or not there is ever a network — but only when it
  vouches for itself. `rtc.py` decides what that means, and it is a different
  question per chip.

  **The phone.** `SC1*C*202607251930*4`, by QR, by API, or by the device's own
  web page. Right once, at the moment somebody held up a code, and the path for
  a dispenser on a network with no internet.

`fake-hwclock`'s guess counts as none of them. It is better than nothing for
file timestamps and worse than nothing for medication.

One asymmetry to know about: on a DS3231 build the kernel has already applied
the chip's time before this process starts, and on a DS1302 build nothing has —
so `adopt_rtc()` exists, and a build that skipped calling it would report a
trusted clock while reading a stale one.

A tray that stays shut is a problem someone notices within hours. A tray that
opens at the wrong times is one that nobody notices at all.
"""
from __future__ import annotations

import logging
import os
import subprocess
import time
from datetime import datetime, timedelta

from . import config, rtc
from .sc1 import ClockSet

log = logging.getLogger(__name__)


class Clock:
    """The firmware's notion of the time, and how much it trusts it.

    Corrections are held as an offset rather than by insisting on setting the
    system clock. Setting it needs CAP_SYS_TIME, and a firmware that refuses to
    work unprivileged is one that ends up being run as root by whoever is
    trying to get a demo going. The system clock is still set when it can be,
    because the logs and the filesystem want it too — but the dispenser does
    not depend on that succeeding.
    """

    def __init__(self, source=datetime.now):
        self._source = source
        self._offset = timedelta(0)
        self._vouched_by: str | None = None
        self._vouched_at: datetime | None = None

    # ── reading it ──────────────────────────────────────────────────────────

    def now(self) -> datetime:
        return self._source() + self._offset

    def day_number(self) -> int:
        """A monotonic day count for the scheduler. Only differences are used."""
        return self.now().date().toordinal()

    def weekday(self) -> int:
        """0 = Monday .. 6 = Sunday, matching the day mask on the wire."""
        return self.now().weekday()

    def minutes(self) -> int:
        now = self.now()
        return now.hour * 60 + now.minute

    # ── trusting it ─────────────────────────────────────────────────────────

    @property
    def trusted(self) -> bool:
        if not config.REQUIRE_TRUSTED_CLOCK:
            return True
        if self.now() < datetime.fromisoformat(config.CLOCK_SANITY_EPOCH):
            # Earlier than this firmware existed, so no correct clock reads it.
            return False
        return self.source != "untrusted"

    @property
    def source(self) -> str:
        """What is vouching for the time, for the status page and the logs.

        Order is by authority. NTP is continuously corrected and beats
        everything. The RTC is next: it is only consulted when its oscillator
        flag says it has run without interruption, and then it is right whether
        or not there is a network. The phone comes last — it was right once, at
        the moment somebody held up a code.
        """
        if ntp_synchronised():
            return "ntp"
        if config.USE_RTC and rtc.read_status().trustworthy:
            return "rtc"
        if self._vouched_by:
            return self._vouched_by
        return "untrusted"

    def status(self) -> dict:
        return {
            "now": self.now().isoformat(timespec="seconds"),
            "trusted": self.trusted,
            "source": self.source,
            "rtc": rtc.read_status().to_json() if config.USE_RTC else None,
            "setAt": self._vouched_at.isoformat(timespec="seconds") if self._vouched_at else None,
        }

    # ── setting it ──────────────────────────────────────────────────────────

    def accept(self, clock_set: ClockSet, source: str = "phone") -> None:
        """Take the time from a `SC1*C*` message and start trusting it.

        The weekday has already been checked against the date by `decode_clock`,
        which is the check that matters: the weekday is what every day mask is
        compared against, so a wrong one shifts the whole week.
        """
        target = clock_set.to_datetime()
        self._offset = target - self._source()
        self._vouched_by = source
        self._vouched_at = target
        log.info("clock set to %s by %s", target.isoformat(timespec="seconds"), source)
        if _try_set_system_clock(target) and config.USE_RTC:
            # Push it into the clock chip too, whichever one is fitted, or the
            # correction lives in RAM alone and the next power cut takes it
            # away — sending the device back to refusing to dispense.
            #
            # `rtc.vouch` is also what records that the chip's time can now be
            # believed, and it does that *last*: on a DS3231 the OSF is cleared
            # after the write, on a DS1302 the RAM token is written after the
            # registers. Either one done first would leave the hardware
            # asserting, across every future boot, that a time nobody corrected
            # is trustworthy.
            rtc.vouch(target)

    def adopt_rtc(self) -> bool:
        """Take the time from the clock chip, for a build the kernel cannot read.

        **A DS3231 build does not need this and a DS1302 build cannot work
        without it.** The difference is where the chip's time enters the
        system: for the DS3231 the kernel applies it through the `i2c-rtc`
        overlay before userspace starts, so by the time this process runs the
        system clock already *is* the chip's. The DS1302 has no kernel driver
        at all, so nothing has read it and the system clock is still whatever
        `fake-hwclock` restored from the last shutdown.

        Which is the trap this method exists to close. `source` reports `rtc`
        as soon as the chip vouches, and `now()` reads the system clock — so
        without this the device would report a trusted clock and act on a stale
        one. That is exactly the Friday-evening failure the module docstring
        opens with, arrived at through the fix for it.

        Returns True if the time was taken from the chip.
        """
        if not config.USE_RTC:
            return False
        # NTP outranks the chip and has already corrected the system clock.
        if ntp_synchronised():
            return False

        when = rtc.read_time()
        if when is None:
            return False

        self._offset = when - self._source()
        self._vouched_at = when
        # Deliberately not setting `_vouched_by`: `source` already answers
        # `rtc` from the chip's own state, and claiming it here would keep
        # saying so after the cell died.
        log.info("clock taken from the RTC: %s", when.isoformat(timespec="seconds"))
        _try_set_system_clock(when)
        return True

    def trust_ntp(self) -> bool:
        """Adopt the system clock because NTP says it is right.

        Clears any phone-supplied offset. NTP is the better authority — it is
        continuously corrected, where the phone's figure was right once, at the
        moment somebody held up a QR code.
        """
        if not ntp_synchronised():
            return False
        if self._offset:
            log.info("NTP has synchronised; dropping the phone-supplied offset")
        self._offset = timedelta(0)
        self._vouched_by = None
        self._vouched_at = None
        return True


#: How long an NTP answer is reused. The status page polls every few seconds
#: and every poll would otherwise be a process spawn; the answer changes at
#: most once per boot, so a few seconds of staleness costs nothing.
_NTP_CACHE_S = 10.0
_ntp_cache: tuple[float, bool] | None = None


def ntp_synchronised(now=time.monotonic) -> bool:
    """Has systemd corrected the clock from the network in this session?

    `timedatectl show -p NTPSynchronized` is the authoritative answer.
    Anything unexpected — no systemd, no timedatectl, a timeout — reads as
    "no", because the whole point of this function is to be the thing that lets
    a tray open, and a broken check must fail towards the tray staying shut.
    """
    global _ntp_cache

    if _ntp_cache is not None and now() - _ntp_cache[0] < _NTP_CACHE_S:
        return _ntp_cache[1]

    try:
        result = subprocess.run(
            ["timedatectl", "show", "-p", "NTPSynchronized", "--value"],
            capture_output=True, text=True, timeout=5, check=False,
        )
        answer = result.returncode == 0 and result.stdout.strip().lower() == "yes"
    except (OSError, subprocess.SubprocessError):
        answer = False

    _ntp_cache = (now(), answer)
    return answer


def _try_set_system_clock(target: datetime) -> bool:
    """Best effort, and only as root. Failure is logged — see `Clock`.

    The euid check is not an optimisation. Unprivileged `timedatectl set-time`
    goes to polkit, which on a desktop pops an authentication dialog and on a
    headless device blocks until it times out — so the "harmless" attempt would
    stall the request that set the clock, which is a request somebody is
    standing in front of the machine waiting on.
    """
    if os.geteuid() != 0:
        log.info("not root; keeping the corrected time as an internal offset")
        return False

    stamp = target.strftime("%Y-%m-%d %H:%M:%S")
    try:
        result = subprocess.run(
            ["timedatectl", "set-time", stamp],
            capture_output=True, text=True, timeout=10, check=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        log.info("could not set the system clock (%s); using an internal offset", exc)
        return False
    if result.returncode != 0:
        log.info(
            "could not set the system clock (%s); using an internal offset",
            result.stderr.strip() or f"exit {result.returncode}",
        )
        return False
    return True


