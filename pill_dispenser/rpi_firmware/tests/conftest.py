"""Fixtures that let the whole firmware run on a laptop.

The design goal the rest of this suite depends on: nothing here needs a
Raspberry Pi, a servo, a network, or a second of real time. A dispenser is
usually in a different room from whoever is editing it and sometimes in a
different country, so a test that needs the hardware is a test nobody runs.
"""
from __future__ import annotations

import sys
from datetime import datetime, timedelta
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from snapcare_dispenser.clock import Clock  # noqa: E402
from snapcare_dispenser.device import Dispenser  # noqa: E402
from snapcare_dispenser.sc1 import ClockSet  # noqa: E402
from snapcare_dispenser.servo import MockBackend, TrayServos  # noqa: E402
from snapcare_dispenser.store import Store  # noqa: E402


class FakeClock(Clock):
    """A clock the test moves by hand, and whose trust the test controls.

    `trusted` is overridden rather than left to the base class, which would
    consult the *host machine's* NTP state — so the suite would pass or fail
    depending on whether the laptop running it happens to be synchronised.
    """

    def __init__(self, start: datetime):
        super().__init__(source=lambda: self._at)
        self._at = start
        self._trusted = True
        # Vouched for without going near `accept`, which would try to set the
        # machine's real clock.
        self._vouched_by = "test"
        self._vouched_at = start

    @property
    def trusted(self) -> bool:
        return self._trusted

    @property
    def source(self) -> str:
        return self._vouched_by or "untrusted"

    def advance(self, **kwargs) -> None:
        self._at += timedelta(**kwargs)

    def set(self, when: datetime) -> None:
        self._at = when

    def distrust(self) -> None:
        self._trusted = False
        self._vouched_by = None

    def accept(self, clock_set, source: str = "phone") -> None:
        """Set the time without trying to touch the host's system clock."""
        self._at = clock_set.to_datetime()
        self._trusted = True
        self._vouched_by = source
        self._vouched_at = self._at


@pytest.fixture
def clock() -> FakeClock:
    # A Wednesday, so day-mask tests have Monday and Sunday on either side.
    return FakeClock(datetime(2026, 7, 29, 7, 0))


@pytest.fixture
def store(tmp_path) -> Store:
    return Store(tmp_path / "state")


@pytest.fixture
def servos() -> TrayServos:
    # sleep is a no-op: a drop is 1.15 s of waiting for a servo that is not
    # there, and the suite runs a few hundred of them.
    return TrayServos(backend=MockBackend(),
                      pins={n: 10 + n for n in range(1, 9)},
                      sleep=lambda _seconds: None)


@pytest.fixture
def dispenser(store, servos, clock) -> Dispenser:
    return Dispenser(store=store, servos=servos, clock=clock)


@pytest.fixture
def clock_payload() -> str:
    return "SC1*C*202607290700*2"  # 2026-07-29 07:00, a Wednesday


__all__ = ["ClockSet", "FakeClock"]
