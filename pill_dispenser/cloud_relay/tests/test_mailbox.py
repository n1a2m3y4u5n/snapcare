"""The mailboxes: who may open one, what a revision means, and the waiting.

The relay's whole job is to be boring and correct about three things — routing,
ordering, and not falling over. Everything interesting about the schedule
itself happens at the two ends.
"""
from __future__ import annotations

import threading
import time

import pytest

from conftest import DEVICE, OTHER, TOKEN, envelope

from snapcare_relay import config
from snapcare_relay.mailbox import MailboxError, Mailboxes


# ── who may open one ────────────────────────────────────────────────────────

def test_a_write_creates_the_mailbox_and_binds_the_token(boxes):
    device = boxes.open(DEVICE, TOKEN, create=True)
    assert device.device_id == DEVICE
    assert boxes.count() == 1
    # Same token, same mailbox, for the life of the device.
    assert boxes.open(DEVICE, TOKEN).device_id == DEVICE


def test_a_read_may_not_conjure_a_mailbox(boxes):
    """Otherwise a few thousand GETs with invented ids exhaust MAX_DEVICES and
    the next real dispenser to be plugged in is told the relay is full."""
    with pytest.raises(MailboxError) as raised:
        boxes.open(DEVICE, TOKEN)
    assert raised.value.status == 404
    assert boxes.count() == 0


def test_a_different_token_does_not_open_it(boxes):
    boxes.open(DEVICE, TOKEN, create=True)
    with pytest.raises(MailboxError) as raised:
        boxes.open(DEVICE, "some-other-token")
    assert raised.value.status == 403


def test_a_missing_token_is_refused_before_anything_else(boxes):
    with pytest.raises(MailboxError) as raised:
        boxes.open(DEVICE, "", create=True)
    assert raised.value.status == 401


@pytest.mark.parametrize("bad", [
    "../../etc/passwd", "..", "a/b", "short", "", "x" * 23,
    "kmPLb2W8Zx1NEc1bdYQg.w", "kmPLb2W8Zx1NEc1bdYQg w",
])
def test_an_id_that_is_not_the_right_shape_is_refused(boxes, bad):
    """This string becomes a filename. The check is strict rather than clever
    because reasoning about which traversals survive which layer of path
    decoding is a worse use of anybody's confidence."""
    with pytest.raises(MailboxError) as raised:
        boxes.open(bad, TOKEN, create=True)
    assert raised.value.status == 404


def test_a_full_relay_refuses_rather_than_evicting(boxes):
    """Evicting to make room would let anybody who can reach the relay unpair
    every real device on it just by creating mailboxes."""
    for n in range(config.MAX_DEVICES):
        boxes.open(f"{n:022d}", TOKEN, create=True)

    with pytest.raises(MailboxError) as raised:
        boxes.open(DEVICE, TOKEN, create=True)
    assert raised.value.status == 503
    assert boxes.count() == config.MAX_DEVICES


# ── revisions ───────────────────────────────────────────────────────────────

def test_a_revision_must_increase(boxes):
    device = boxes.open(DEVICE, TOKEN, create=True)
    assert boxes.put(device, "desired", envelope(1)) == 1
    assert boxes.put(device, "desired", envelope(5)) == 5

    for stale in (5, 4, 1):
        with pytest.raises(MailboxError) as raised:
            boxes.put(device, "desired", envelope(stale))
        assert raised.value.status == 409


def test_the_loser_of_a_race_is_told_rather_than_overwritten(boxes):
    """Two phones editing the same prescription. Last-write-wins would make one
    of them watch their change disappear from a screen that said it saved."""
    device = boxes.open(DEVICE, TOKEN, create=True)
    boxes.put(device, "desired", envelope(7, "first"))

    with pytest.raises(MailboxError) as raised:
        boxes.put(device, "desired", envelope(7, "second"))
    assert "not newer than 7" in raised.value.message
    assert boxes.get(device, "desired", 0, 0).envelope["ct"].endswith("first")


@pytest.mark.parametrize("bad", [0, -1, "3", 3.5, None, True])
def test_a_revision_that_is_not_a_counting_number_is_refused(boxes, bad):
    device = boxes.open(DEVICE, TOKEN, create=True)
    with pytest.raises(MailboxError) as raised:
        boxes.put(device, "desired", {"rev": bad})
    assert raised.value.status == 400


def test_the_two_directions_are_independent(boxes):
    """Merging them is how a device's own report of what it did gets played
    back to it as an instruction."""
    device = boxes.open(DEVICE, TOKEN, create=True)
    boxes.put(device, "desired", envelope(4, "schedule"))
    boxes.put(device, "reported", envelope(1, "status"))

    assert boxes.get(device, "desired", 0, 0).envelope["ct"].endswith("schedule")
    assert boxes.get(device, "reported", 0, 0).envelope["ct"].endswith("status")


def test_since_is_how_a_client_says_what_it_already_has(boxes):
    device = boxes.open(DEVICE, TOKEN, create=True)
    boxes.put(device, "desired", envelope(3))

    assert boxes.get(device, "desired", 2, 0) is not None
    assert boxes.get(device, "desired", 3, 0) is None
    assert boxes.get(device, "desired", 9, 0) is None


# ── the waiting ─────────────────────────────────────────────────────────────

def test_a_poll_wakes_the_moment_something_is_written(boxes):
    """This is what makes an edit in the app reach a dispenser in about a
    second while costing one parked thread rather than a request per second."""
    device = boxes.open(DEVICE, TOKEN, create=True)
    found = {}

    def reader():
        found["slot"] = boxes.get(device, "desired", 0, 5.0)

    thread = threading.Thread(target=reader)
    thread.start()
    time.sleep(0.1)

    started = time.monotonic()
    boxes.put(device, "desired", envelope(1))
    thread.join(timeout=5)

    assert found["slot"] is not None
    assert time.monotonic() - started < 1.0


def test_a_poll_gives_up_at_the_hold_and_says_nothing_new(boxes):
    device = boxes.open(DEVICE, TOKEN, create=True)
    started = time.monotonic()
    assert boxes.get(device, "desired", 0, 0.3) is None
    assert 0.25 < time.monotonic() - started < 3.0


def test_a_write_between_the_check_and_the_wait_is_not_missed(boxes):
    """The gap that would otherwise leave a schedule sitting undelivered until
    the next heartbeat — and be entirely invisible in testing, because it needs
    two threads to interleave in one particular way."""
    device = boxes.open(DEVICE, TOKEN, create=True)
    boxes.put(device, "desired", envelope(1))
    # The write already happened, so this must return at once rather than park.
    started = time.monotonic()
    assert boxes.get(device, "desired", 0, 5.0) is not None
    assert time.monotonic() - started < 0.5


def test_one_device_may_not_take_every_thread(boxes):
    """A client stuck in a reconnect loop would otherwise find all of them, and
    the relay stops answering everybody else."""
    device = boxes.open(DEVICE, TOKEN, create=True)
    threads = [threading.Thread(target=lambda: boxes.get(device, "desired", 0, 0.6))
               for _ in range(config.MAX_WAITERS_PER_DEVICE + 3)]
    for thread in threads:
        thread.start()
    time.sleep(0.3)
    assert boxes.held_polls() <= config.MAX_WAITERS_PER_DEVICE
    for thread in threads:
        thread.join(timeout=5)
    assert boxes.held_polls() == 0


def test_a_refused_poll_answers_nothing_new_rather_than_failing(boxes):
    """The client treats it exactly like an expired hold and comes back. A 503
    would send a well-behaved client into its backoff, which is the opposite of
    what an overloaded relay wants."""
    device = boxes.open(DEVICE, TOKEN, create=True)
    blockers = [threading.Thread(target=lambda: boxes.get(device, "desired", 0, 0.5))
                for _ in range(config.MAX_WAITERS_PER_DEVICE)]
    for thread in blockers:
        thread.start()
    time.sleep(0.2)

    assert boxes.get(device, "desired", 0, 5.0) is None   # refused, promptly
    for thread in blockers:
        thread.join(timeout=5)


def test_polls_on_one_device_do_not_wake_polls_on_another(boxes):
    """One condition per device. A shared one makes the relay's cost grow with
    the square of how well it is doing."""
    first = boxes.open(DEVICE, TOKEN, create=True)
    second = boxes.open(OTHER, TOKEN, create=True)
    woke = {}

    def reader():
        woke["slot"] = boxes.get(second, "desired", 0, 0.6)

    thread = threading.Thread(target=reader)
    thread.start()
    time.sleep(0.1)
    boxes.put(first, "desired", envelope(1))
    thread.join(timeout=5)

    assert woke["slot"] is None


# ── surviving a restart ─────────────────────────────────────────────────────

def test_mailboxes_come_back_after_a_restart(boxes, tmp_path):
    """A relay restarted during a deploy that forgot every pairing means every
    dispenser in the field goes quiet until somebody re-scans a label."""
    device = boxes.open(DEVICE, TOKEN, create=True)
    boxes.put(device, "desired", envelope(3, "kept"))

    again = Mailboxes(tmp_path / "relay-data")
    restored = again.open(DEVICE, TOKEN)
    assert restored.slots["desired"].rev == 3
    assert restored.slots["desired"].envelope["ct"].endswith("kept")
    with pytest.raises(MailboxError):
        again.open(DEVICE, "a-different-token")


def test_a_damaged_file_is_skipped_rather_than_stopping_the_relay(boxes, tmp_path):
    """One unreadable mailbox must not take every other device off the air."""
    boxes.open(DEVICE, TOKEN, create=True)
    (tmp_path / "relay-data" / "AAAAAAAAAAAAAAAAAAAAAA.json").write_text("{ truncated")

    again = Mailboxes(tmp_path / "relay-data")
    assert again.open(DEVICE, TOKEN)
    assert again.count() == 1


def test_the_token_is_stored_hashed(boxes, tmp_path):
    """A copy of the relay's disk must not yield anything replayable against
    the relay — and nothing whatever about the box key, which is a different
    branch of the same derivation."""
    boxes.open(DEVICE, TOKEN, create=True)
    on_disk = (tmp_path / "relay-data" / f"{DEVICE}.json").read_text()
    assert TOKEN not in on_disk


def test_forgetting_wakes_whoever_is_waiting(boxes):
    """Promptly, and not by the hold running out.

    The timing assertion is the whole test. Written without it, this passed
    while `forget` was leaving the waiter parked for its full hold: the notify
    woke it, it found no newer revision, and it went straight back to sleep.
    A thread held for the best part of a minute on a device that has just been
    unpaired — and a green test saying otherwise.
    """
    device = boxes.open(DEVICE, TOKEN, create=True)
    done = threading.Event()

    def reader():
        boxes.get(device, "desired", 0, 30.0)
        done.set()

    threading.Thread(target=reader, daemon=True).start()
    time.sleep(0.1)
    started = time.monotonic()
    boxes.forget(device)

    assert done.wait(timeout=5)
    assert time.monotonic() - started < 1.0
    assert boxes.count() == 0


def test_metadata_says_when_the_device_was_last_heard_from(boxes):
    """Derived from what actually happened — the device collecting a schedule,
    or publishing a report — rather than from a client claiming to be one."""
    device = boxes.open(DEVICE, TOKEN, create=True)
    assert device.meta()["deviceLastSeen"] == ""

    boxes.put(device, "reported", envelope(1))
    assert device.meta()["deviceLastSeen"]
    assert device.meta()["reported"]["rev"] == 1
