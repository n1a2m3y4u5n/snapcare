"""The sealed envelope that travels through the relay.

The relay is a mailbox on somebody else's computer. It has to know which
device a message is for, and it must not be able to read it — a schedule is a
list of what medication a named person takes and when they are alone in the
house with it.

So everything that crosses the relay is AES-256-GCM, under a key both ends
derive from the printed claim code (`provisioning.box_key`) and neither end
ever transmits. The relay stores what it is given, hands it back on request,
and is structurally incapable of doing anything else with it.

The format
----------
JSON, because the relay stores it and the browser reads it, and both already
speak JSON:

    {"v": 1, "rev": 7, "alg": "A256GCM",
     "iv": "<base64url, 12 bytes>", "ct": "<base64url, ciphertext‖tag>"}

`rev` is outside the ciphertext because the relay has to compare it to answer
a long poll — "is there anything newer than revision 6" is the entire protocol.
Leaving it in the clear tells a relay operator how many times a schedule has
been edited, which is the one thing they learn and is worth the exchange.

It is *also* inside the authenticated data, which is the part that matters. A
relay that could renumber a revision could hold back today's schedule and serve
last week's under a higher number, and the device would take it: an old
prescription, replayed, looking new. Binding `rev` — and the device id, and
which slot it is — into the AAD means any of those being changed makes the
whole thing fail to open rather than open into something plausible.

Why AES-GCM specifically
------------------------
Not for its own sake: it is what `lib/snapcare/deviceKey.ts` already uses to
seal the app's own data, and it is what WebCrypto offers. A phone has to be
able to do this in a page with no libraries, which rules out most of the
alternatives regardless of their merits.

On the missing dependency
-------------------------
Python has no AES in its standard library, so this is the one part of the
firmware that needs a package. It is handled the same way as the screen and
the buzzer: if it is absent, the feature is absent, it is said out loud at
startup and on the status page, and *the dispenser still dispenses*. A device
that refuses to drop pills because it cannot reach a cloud service would be a
straightforward regression on the version that had no cloud service at all.
"""
from __future__ import annotations

import base64
import json
import os

#: Bump if the wire format changes in a way an old reader would misread. It is
#: carried in the AAD, so a v1 device cannot be handed a v2 envelope that opens.
VERSION = 1

ALG = "A256GCM"

#: 96 bits, which is what GCM is specified for and what WebCrypto's default
#: expects. A different length is not an error in either implementation and
#: silently changes the counter derivation, so it is pinned here rather than
#: left to whoever writes the next caller.
IV_BYTES = 12

#: What to tell somebody whose device cannot seal anything. Named so the daemon,
#: the status page and the tests all say the same sentence.
UNAVAILABLE_HINT = (
    "cloud sync needs AES-GCM, which Python does not ship: "
    "sudo apt install python3-cryptography"
)


class SealError(Exception):
    """A sealed envelope did not open. Never says why, on purpose.

    Wrong key, wrong device, wrong revision, wrong slot and deliberate
    tampering are all the same answer here. Distinguishing them for the caller
    would mean distinguishing them for anybody who can reach the endpoint that
    reports it.
    """


def _aesgcm():
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    except ImportError as exc:  # pragma: no cover - depends on the host
        raise SealError(UNAVAILABLE_HINT) from exc
    return AESGCM


def available() -> bool:
    """Can this machine seal and open? Reported rather than assumed."""
    try:
        _aesgcm()
    except SealError:
        return False
    return True


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _unb64(text: str) -> bytes:
    # Padding is stripped on the way out because it is noise in JSON; it has to
    # be put back before decoding, and Python is strict about it where the
    # browser's atob is not. Getting this wrong shows up as a decode error on
    # exactly one message in four, which is a memorable afternoon.
    padded = text + "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(padded.encode())


def aad(device_id: str, slot: str, rev: int) -> bytes:
    """What the ciphertext is bound to, and therefore cannot be moved away from.

    Every field here is one substitution somebody would otherwise be able to
    make by editing the relay's disk:

      the version  — an envelope from a future format, read by an old device
      the device   — one household's schedule delivered to another's dispenser
      the slot     — what the device *reported* played back to it as a command
      the revision — last month's prescription, renumbered to look like today's
    """
    return f"snapcare/relay/v{VERSION}|{device_id}|{slot}|{rev}".encode()


def seal(key: bytes, device_id: str, slot: str, rev: int, payload: dict) -> dict:
    """Wrap `payload` so that only the holder of `key` can read it back."""
    aesgcm = _aesgcm()
    iv = os.urandom(IV_BYTES)
    plaintext = json.dumps(payload, separators=(",", ":")).encode()
    ciphertext = aesgcm(key).encrypt(iv, plaintext, aad(device_id, slot, rev))
    return {"v": VERSION, "rev": rev, "alg": ALG,
            "iv": _b64(iv), "ct": _b64(ciphertext)}


def unseal(key: bytes, device_id: str, slot: str, envelope: dict) -> dict:
    """Open an envelope, or raise `SealError`.

    The revision is read from the envelope and fed straight into the AAD, which
    looks circular and is not: a forged `rev` produces an AAD that does not
    match the one used to seal, and the open fails. That is precisely the
    check — the caller can then trust `envelope["rev"]` *because* it opened.
    """
    aesgcm = _aesgcm()
    if not isinstance(envelope, dict):
        raise SealError("not an envelope")
    if envelope.get("v") != VERSION or envelope.get("alg") != ALG:
        raise SealError("unrecognised envelope format")

    try:
        rev = int(envelope["rev"])
        iv = _unb64(str(envelope["iv"]))
        ciphertext = _unb64(str(envelope["ct"]))
    except (KeyError, TypeError, ValueError, base64.binascii.Error) as exc:
        raise SealError("malformed envelope") from exc

    if len(iv) != IV_BYTES:
        raise SealError("malformed envelope")

    try:
        plaintext = aesgcm(key).decrypt(iv, ciphertext, aad(device_id, slot, rev))
    except SealError:
        raise
    except Exception as exc:  # noqa: BLE001 - the library's own failure type
        raise SealError("did not open") from exc

    try:
        opened = json.loads(plaintext)
    except json.JSONDecodeError as exc:
        raise SealError("opened, but is not JSON") from exc
    if not isinstance(opened, dict):
        raise SealError("opened, but is not an object")
    return opened
