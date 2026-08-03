"""The mailboxes, and the waiting that makes a poll feel like a push.

One mailbox per device, three slots in each:

    desired    what the app wants the dispenser to be doing   (app writes, device reads)
    reported   what the dispenser says it is doing            (device writes, app reads)
    command    do this one thing, now                         (app writes, device reads)

`desired` and `command` are both written by the app and read by the device, and
they are separate slots because they are different kinds of statement. `desired`
is a *state*: the schedule, which stays true until it is edited, and which a
device rejoining after a week should adopt. `command` is an *act*: release the
08:00 dose, which was true for one hour on one morning.

Collapsing them would break in exactly one direction, and it is the dangerous
one. A device that was offline over lunch reconnects, finds the newest thing in
the box, and applies it — which is correct for a schedule and is a pill dropped
into an empty room for a release. Keeping them apart lets the device treat each
as what it is; see `cloud.py`, which additionally requires that a release name a
dose it is *currently* offering before it moves anything.

All three slots hold an opaque envelope. This module never looks inside one and
has no key that would let it — see `snapcare_dispenser/envelope.py` for what is
in there and why the relay is kept out of it. What this file *does* care about
is the revision number, because "is there anything newer than revision 6" is the
whole of the protocol.

Revisions, and who assigns them
-------------------------------
The writer proposes; the relay only ever accepts an increase. That is not
bookkeeping — the revision is sealed into the envelope's authenticated data, so
the relay cannot assign one without being able to re-seal, which it cannot.

The consequence is optimistic concurrency, and it is the right shape here: two
phones editing the same prescription both write revision 8, one of them is
told 409 and the current revision, and it re-reads and re-writes. The
alternative — last write wins — is a schedule silently reverting on a screen
that showed it saved.

Waiting
-------
A poll that finds nothing new parks on a condition variable until either
somebody writes or the hold expires. This is what makes an edit in the app
reach the device in about a second while costing one thread rather than one
request per second per device.

The bound on that is real and enforced above: threads are the scarce resource
in a `ThreadingHTTPServer`, and a client stuck in a reconnect loop will find
every one of them if allowed to.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import tempfile
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from . import config

log = logging.getLogger("relay")

SLOTS = ("desired", "reported", "command")


class MailboxError(Exception):
    """Refused, with an HTTP status and a sentence for the client."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _token_digest(token: str) -> str:
    """What is stored instead of the token itself.

    The relay has to recognise a returning client, which needs a comparison,
    not the value. Storing the digest means a copy of the relay's disk yields
    nothing that can be replayed against the relay — and nothing whatever about
    the box key, which is a different branch of the same derivation and never
    leaves the device or the phone.
    """
    return hashlib.sha256(token.encode()).hexdigest()


@dataclass
class Slot:
    rev: int = 0
    envelope: dict | None = None
    updated_at: str = ""
    #: Only ever set by a *read*, and only used for display. It is what lets
    #: the app say "the dispenser last collected its schedule four minutes ago"
    #: rather than "connected", which is a word that stays true after the plug
    #: has been pulled.
    read_at: str = ""

    def to_meta(self) -> dict:
        return {"rev": self.rev, "updatedAt": self.updated_at,
                "readAt": self.read_at,
                "bytes": len(json.dumps(self.envelope)) if self.envelope else 0}


@dataclass
class Device:
    device_id: str
    token_digest: str
    created_at: str
    slots: dict[str, Slot] = field(default_factory=lambda: {s: Slot() for s in SLOTS})

    #: One condition per device rather than one global. A device waking every
    #: other waiter in the world on every heartbeat is a relay whose cost grows
    #: with the square of how well it is doing.
    condition: threading.Condition = field(
        default_factory=lambda: threading.Condition(), repr=False)
    waiters: int = 0

    #: Set by `forget`. A parked poll has to be able to tell "nothing new yet"
    #: from "this mailbox no longer exists" — without it a waiter wakes on the
    #: notify, finds no newer revision, and goes back to sleep for the rest of
    #: its hold, which is a thread held for the best part of a minute on a
    #: device that has just been unpaired.
    gone: bool = False

    def to_json(self) -> dict:
        return {
            "deviceId": self.device_id,
            "tokenDigest": self.token_digest,
            "createdAt": self.created_at,
            "slots": {name: {"rev": slot.rev, "envelope": slot.envelope,
                             "updatedAt": slot.updated_at, "readAt": slot.read_at}
                      for name, slot in self.slots.items()},
        }

    @classmethod
    def from_json(cls, data: dict) -> "Device":
        device = cls(
            device_id=str(data["deviceId"]),
            token_digest=str(data["tokenDigest"]),
            created_at=str(data.get("createdAt") or _now()),
        )
        for name, raw in (data.get("slots") or {}).items():
            if name not in SLOTS or not isinstance(raw, dict):
                continue
            device.slots[name] = Slot(
                rev=int(raw.get("rev") or 0),
                envelope=raw.get("envelope") if isinstance(raw.get("envelope"), dict) else None,
                updated_at=str(raw.get("updatedAt") or ""),
                read_at=str(raw.get("readAt") or ""),
            )
        return device

    def touched_at(self) -> str:
        """The most recent sign of life, from either end."""
        stamps = [self.created_at]
        for slot in self.slots.values():
            stamps += [slot.updated_at, slot.read_at]
        return max(s for s in stamps if s)

    def meta(self) -> dict:
        return {
            "deviceId": self.device_id,
            "createdAt": self.created_at,
            "desired": self.slots["desired"].to_meta(),
            "reported": self.slots["reported"].to_meta(),
            "command": self.slots["command"].to_meta(),
            # All three are things the *device* does, so between them they are
            # the honest answer to "is it still there" — derived from what
            # actually happened rather than from a client claiming to be a
            # dispenser. The command slot's `readAt` is the sharpest of them:
            # the device parks a poll on it continuously, so a stale one means
            # a release tapped now would not arrive.
            "deviceLastSeen": max(self.slots["desired"].read_at,
                                  self.slots["command"].read_at,
                                  self.slots["reported"].updated_at) or "",
        }


def write_atomic(path: Path, text: str) -> None:
    """Same discipline as the firmware's store, for the same reason.

    A relay killed mid-write during a deploy — which is when it is killed —
    must come back with the whole old file or the whole new one. A truncated
    mailbox is a pairing lost, and the person who has to fix it is holding a
    dispenser in another country.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(dir=str(path.parent), prefix=f".{path.name}.", suffix=".tmp")
    tmp = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
        dir_fd = os.open(str(path.parent), os.O_RDONLY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise


class Mailboxes:
    """Every device the relay knows about, in memory, backed by files."""

    def __init__(self, directory: Path | None = None, now=time.monotonic,
                 on_write=None):
        """`on_write(device_id, slot, rev)` runs after a successful write.

        A callback rather than a call to `hook.notify` directly, because this
        class stores envelopes and knows nothing about HTTP — and because the
        tests need to see that it fires exactly once per accepted write without
        standing up a web server to catch it.
        """
        self.dir = Path(directory) if directory else config.DATA_DIR
        self.dir.mkdir(parents=True, exist_ok=True)
        self._now = now
        self._on_write = on_write
        self._devices: dict[str, Device] = {}
        # Guards the dictionary itself. Each device's own condition guards its
        # slots — two locks rather than one so that a hundred parked polls on
        # one device cannot stop a different device being created.
        self._lock = threading.RLock()
        self._waiters = 0
        self._load()

    # ── durability ──────────────────────────────────────────────────────────

    def _path(self, device_id: str) -> Path:
        # The id is base64url of a hash, so it cannot contain a slash or a dot
        # sequence — but this is the one place a request-supplied string
        # becomes a filename, and "cannot" is doing a lot of work in that
        # sentence. `_valid_id` is what actually enforces it, before we get here.
        return self.dir / f"{device_id}.json"

    def _load(self) -> None:
        cutoff = time.time() - config.EXPIRE_DAYS * 86400
        for path in sorted(self.dir.glob("*.json")):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                device = Device.from_json(data)
            except (json.JSONDecodeError, OSError, KeyError, TypeError, ValueError) as exc:
                log.error("%s is unreadable (%s) — skipping it", path.name, exc)
                continue
            if path.stat().st_mtime < cutoff:
                log.info("%s has not been touched in %d days — removing it",
                         device.device_id[:8], config.EXPIRE_DAYS)
                path.unlink(missing_ok=True)
                continue
            self._devices[device.device_id] = device
        if self._devices:
            log.info("loaded %d mailbox(es) from %s", len(self._devices), self.dir)

    def _persist(self, device: Device) -> None:
        write_atomic(self._path(device.device_id), json.dumps(device.to_json(), indent=2))

    # ── finding and creating ────────────────────────────────────────────────

    @staticmethod
    def _valid_id(device_id: str) -> bool:
        """22 characters of base64url, which is what 16 bytes encodes to.

        Checked strictly because this string becomes a filename. Rejecting
        anything unexpected here is cheaper than reasoning about whether a
        given traversal is reachable through whatever path decoding the HTTP
        layer happens to do this year.
        """
        return (len(device_id) == 22
                and all(c.isalnum() or c in "-_" for c in device_id))

    def open(self, device_id: str, token: str, create: bool = False) -> Device:
        """The mailbox for this id. `create` is only ever true for a write.

        First contact binds the token. There is no registration step because
        there is nothing a registration step could check: the claim code is
        printed on the device, and holding it *is* the credential. What this
        does buy is that a second party who later guesses the id cannot read or
        write the mailbox — they would have to also produce the token, which is
        a different HKDF branch of the same 49-bit code they did not have.

        Creating only on a write is what stops the free-registration property
        from being a way to fill the relay. Reads are unlimited and cost
        nothing to refuse; if any request could conjure a mailbox, a few
        thousand GETs with invented ids would exhaust `MAX_DEVICES` and the
        next real dispenser to be plugged in would be told the relay is full.
        Both ends write before they need to read — the device publishes its
        state at startup, the app writes a schedule — so nothing legitimate
        notices the restriction.
        """
        if not self._valid_id(device_id):
            raise MailboxError(404, "no such device")
        if not token:
            raise MailboxError(401, "no access token")

        digest = _token_digest(token)
        with self._lock:
            device = self._devices.get(device_id)
            if device is None:
                if not create:
                    raise MailboxError(404, "no such device")
                if len(self._devices) >= config.MAX_DEVICES:
                    # Refuse rather than evict. Evicting to make room would let
                    # anybody who can reach the relay unpair every real device
                    # on it simply by creating mailboxes.
                    raise MailboxError(503, "the relay is full")
                device = Device(device_id=device_id, token_digest=digest,
                                created_at=_now())
                self._devices[device_id] = device
                self._persist(device)
                log.info("new mailbox %s… (%d in use)", device_id[:8], len(self._devices))
                return device

        # compare_digest, not ==. String comparison stops at the first
        # differing byte, and the time it took to stop is a measurement of how
        # much of the token was right.
        if not hmac.compare_digest(device.token_digest, digest):
            raise MailboxError(403, "that token does not open this mailbox")
        return device

    def forget(self, device: Device) -> None:
        """Unpair: drop the mailbox and wake anybody parked on it."""
        with self._lock:
            self._devices.pop(device.device_id, None)
        self._path(device.device_id).unlink(missing_ok=True)
        with device.condition:
            device.gone = True
            for slot in device.slots.values():
                slot.envelope, slot.rev = None, 0
            device.condition.notify_all()
        log.info("mailbox %s… forgotten", device.device_id[:8])

    def count(self) -> int:
        with self._lock:
            return len(self._devices)

    # ── reading and writing a slot ──────────────────────────────────────────

    def put(self, device: Device, slot_name: str, envelope: dict) -> int:
        """Store an envelope. Returns the revision now current.

        The revision must increase. A client that is behind is told so, with
        the current value, rather than being allowed to overwrite: the writer
        that lost is the one holding a stale copy of the schedule, and letting
        it win is how an edit made on a second phone silently disappears.
        """
        rev = envelope.get("rev")
        if not isinstance(rev, int) or isinstance(rev, bool) or rev < 1:
            raise MailboxError(400, "the envelope needs an integer revision of 1 or more")

        with device.condition:
            current = device.slots[slot_name]
            if rev <= current.rev:
                raise MailboxError(
                    409, f"revision {rev} is not newer than {current.rev}")
            current.rev = rev
            current.envelope = envelope
            current.updated_at = _now()
            self._persist(device)
            # Under the condition, so a poll cannot check the revision, find
            # nothing, and start waiting in the gap between this write and the
            # wake-up — which is a schedule that sits undelivered until the
            # next heartbeat and is entirely invisible in testing.
            device.condition.notify_all()

        # Outside the lock. The callback goes to the network, and holding a
        # device's condition across a network call would park every poll on
        # that device behind it — the dispenser's own long poll included.
        if self._on_write is not None:
            try:
                self._on_write(device.device_id, slot_name, rev)
            except Exception:            # noqa: BLE001 - see below
                # The write has already succeeded and the client is about to be
                # told so. A notification that does not go out costs a buzz; an
                # exception raised here would cost the dose event itself.
                log.exception("write hook failed")
        return rev

    def get(self, device: Device, slot_name: str, since: int, hold_s: float) -> Slot | None:
        """The slot if it is newer than `since`, else None once the hold expires.

        `since` is how the caller says what it already has, so a device that
        reconnects after a drop does not re-apply the schedule it is already
        running, and a device that has *never* connected passes 0 and is given
        whatever is there.
        """
        deadline = self._now() + max(0.0, hold_s)

        with device.condition:
            slot = device.slots[slot_name]
            if slot.rev > since and slot.envelope is not None:
                return self._mark_read(device, slot)

            if hold_s <= 0:
                return None

            if not self._reserve(device):
                # Answering "nothing new" is the right refusal: the client
                # treats it exactly like an expired hold and comes back. A 503
                # would send it into its backoff, which is the opposite of what
                # an overloaded relay wants from a client that is behaving.
                log.warning("too many polls held open; answering %s… immediately",
                            device.device_id[:8])
                return None

            try:
                while True:
                    remaining = deadline - self._now()
                    if remaining <= 0 or device.gone:
                        return None
                    device.condition.wait(remaining)
                    if device.gone:
                        return None
                    slot = device.slots[slot_name]
                    if slot.rev > since and slot.envelope is not None:
                        return self._mark_read(device, slot)
            finally:
                self._release(device)

    def _mark_read(self, device: Device, slot: Slot) -> Slot:
        slot.read_at = _now()
        # Not persisted. It is worth a fact on a status page and not worth an
        # fsync per poll on an SD card or a cloud volume; losing it across a
        # restart costs one heartbeat's worth of accuracy.
        return slot

    def _reserve(self, device: Device) -> bool:
        with self._lock:
            if self._waiters >= config.MAX_WAITERS:
                return False
            if device.waiters >= config.MAX_WAITERS_PER_DEVICE:
                return False
            self._waiters += 1
            device.waiters += 1
            return True

    def _release(self, device: Device) -> None:
        with self._lock:
            self._waiters = max(0, self._waiters - 1)
            device.waiters = max(0, device.waiters - 1)

    def held_polls(self) -> int:
        with self._lock:
            return self._waiters
