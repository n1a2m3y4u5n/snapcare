"""Fixtures for the relay's suite.

Nothing here imports the firmware. The relay is deployed on its own, to a
container that has no dispenser code in it, and a test suite that reaches
across would hide the day that stopped being true.

It also means the envelopes below are plain dictionaries with nothing sealed in
them, which is the point being made: the relay carries whatever it is given and
has never been able to read any of it.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from snapcare_relay import config  # noqa: E402
from snapcare_relay.mailbox import Mailboxes  # noqa: E402

#: A device id of the right shape: 22 characters of base64url, which is what
#: 16 bytes encodes to. The relay checks the shape because this string becomes
#: a filename.
DEVICE = "kmPLb2W8Zx1NEc1bdYQgXw"
OTHER = "AAAAAAAAAAAAAAAAAAAAAA"
TOKEN = "a-token-that-only-the-holder-of-the-claim-code-can-compute"


@pytest.fixture
def boxes(tmp_path) -> Mailboxes:
    return Mailboxes(tmp_path / "relay-data")


@pytest.fixture(autouse=True)
def modest_limits(monkeypatch):
    """Small enough that the caps can actually be reached in a test."""
    monkeypatch.setattr(config, "MAX_DEVICES", 5)
    monkeypatch.setattr(config, "MAX_WAITERS", 4)
    monkeypatch.setattr(config, "MAX_WAITERS_PER_DEVICE", 2)


def envelope(rev: int, note: str = "sealed") -> dict:
    """What a client hands over. The relay never looks inside one."""
    return {"v": 1, "rev": rev, "alg": "A256GCM", "iv": "AAAAAAAAAAAAAAAA",
            "ct": f"opaque-ciphertext-{note}"}
