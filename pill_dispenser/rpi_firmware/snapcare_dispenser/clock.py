"""Whether the device knows what time it is, and whether it should believe itself.

A Raspberry Pi has **no real-time clock and no battery.** This is a real
regression from the Arduino build, which had a DS3231 keeping time on a coin
cell, and the difference has to be handled rather than hoped about.

A Pi that boots with no network does not report *no* time. Raspberry Pi OS ships
`fake-hwclock`, which writes the time to a file periodically and restores it at
boot, so a Pi that was unplugged on Friday evening comes back up on Tuesday
believing it is Friday evening — confidently, with a plausible clock, and with
the wrong day of the week. A tray acting on that opens the Monday/Wednesday/
Friday compartment on a Tuesday and looks perfectly healthy doing it.

So the same rule the AVR firmware used is kept, and matters more here: the
device dispenses nothing until something vouches for the time. Two things can:

  **NTP.** Once the WiFi is up, systemd-timesyncd corrects the clock from the
  network and reports that it has. This is the normal path and needs nobody's
  attention.

  **The phone.** `SC1*C*202607251930*4`, by QR, by API, or by the device's own
  web page. This is the path for a dispenser on a network with no internet, and
  it is why the message exists at all.

`fake-hwclock`'s guess counts as neither. It is better than nothing for file
timestamps and worse than nothing for medication.

A tray that stays shut is a problem someone notices within hours. A tray that
opens at the wrong times is one that nobody notices at all.
"""
from __future__ import annotations

import logging
import os
import subprocess
import time
from datetime import datetime, timedelta

from . import config
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
        return self._vouched_by is not None or ntp_synchronised()

    @property
    def source(self) -> str:
        """Who vouched for the time, for the status page and the logs."""
        if self._vouched_by:
            return self._vouched_by
        if ntp_synchronised():
            return "ntp"
        return "untrusted"

    def status(self) -> dict:
        return {
            "now": self.now().isoformat(timespec="seconds"),
            "trusted": self.trusted,
            "source": self.source,
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
        _try_set_system_clock(target)

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


def _try_set_system_clock(target: datetime) -> None:
    """Best effort, and only as root. Failure is logged — see `Clock`.

    The euid check is not an optimisation. Unprivileged `timedatectl set-time`
    goes to polkit, which on a desktop pops an authentication dialog and on a
    headless device blocks until it times out — so the "harmless" attempt would
    stall the request that set the clock, which is a request somebody is
    standing in front of the machine waiting on.
    """
    if os.geteuid() != 0:
        log.info("not root; keeping the corrected time as an internal offset")
        return

    stamp = target.strftime("%Y-%m-%d %H:%M:%S")
    try:
        result = subprocess.run(
            ["timedatectl", "set-time", stamp],
            capture_output=True, text=True, timeout=10, check=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        log.info("could not set the system clock (%s); using an internal offset", exc)
        return
    if result.returncode != 0:
        log.info(
            "could not set the system clock (%s); using an internal offset",
            result.stderr.strip() or f"exit {result.returncode}",
        )
