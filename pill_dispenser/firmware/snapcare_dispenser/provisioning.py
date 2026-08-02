"""The device's identity, and the QR code that never changes.

The requirement this is built around
------------------------------------
The setup QR must be **the same on every boot, for the life of the device**, so
that it can be printed once and glued to the case. Anything generated fresh at
startup would mean a sticker that goes stale the first time the SD card is
reimaged, and a support call that begins "the code on the box doesn't work any
more".

So the hotspot's name and password are not generated. They are *derived*, by
HMAC-SHA256, from the one number that is physically part of the board:

    /proc/cpuinfo  ->  Serial : 00000000a1b2c3d4

That serial is burned into the SoC. It survives reboots, SD card reimages,
firmware upgrades and a full reinstall of Raspberry Pi OS. Same board, same
serial, same SSID, same passphrase, same QR — byte for byte, every time, with
nothing stored anywhere that could be lost.

It is also different on every board, which is what stops two dispensers in one
house from colliding, and stops the passphrase from being a single number
printed in a manual that anyone could look up.

Why HMAC rather than just using the serial
------------------------------------------
Pi serial numbers are sequential-ish and are printed in logs, on shipping
manifests and in `dmesg`. Deriving with a keyed hash means knowing the serial
does not give you the WiFi passphrase.

That said, this passphrase protects a hotspot that only exists during setup and
only reaches a page that configures WiFi. It is not a secret worth much, and
the salt below is in a public repository. The threat it is actually against is
the neighbour's phone joining by accident, and it is fine for that.

The override
------------
`identity.json` in the state directory wins over the derivation if it exists.
That is for the one real case the derivation cannot serve: a board dies, gets
replaced, and the customer still has the old sticker. Copy the file across and
the printed code keeps working.

The claim code, and why it is derived the same way
--------------------------------------------------
Cloud sync needs a third value: something the phone can present to say "this
dispenser is mine". It is derived exactly like the other two, from the same
serial under a different purpose string, for the same reason — it has to be
printable on the label that is glued on once.

Everything the cloud path needs is then derived from *the claim code*, not from
the serial:

    serial ──HMAC──> claim code ──HKDF──> device id   (the relay's address for it)
                                 ──HKDF──> access token (proves the right to that mailbox)
                                 ──HKDF──> box key    (encrypts the schedule itself)

That second stage matters. The phone never learns the serial — it only ever
sees ten characters off a sticker — so if the keys hung off the serial the
phone could not compute them. Hanging them off the code means holding the code
is exactly equivalent to holding the device, which is the security model a
printed label can actually support, and it is stated rather than implied.

The three purposes are separated by HKDF's `info` argument, so the relay can be
given the access token — it has to be, to tell one mailbox from another — while
remaining unable to work backwards to the box key and read a prescription.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path

from . import config

log = logging.getLogger(__name__)

#: Domain separation, so the SSID suffix and the passphrase cannot ever collide
#: and so this derivation is not the same function as anything else that might
#: one day hash the same serial.
_SALT = b"snapcare/pill-dispenser/ap-identity/v1"

#: No 0/O, no 1/l/I. The passphrase is normally scanned, but somebody will
#: eventually read it off a label and type it, and this is the difference
#: between that working and a support call.
_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz"

#: Uppercase for the SSID suffix — it is read, not typed, and is easier to
#: match against a label at a glance in a list of networks.
_SSID_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"

#: WPA2 requires 8..63 characters. Twelve from a 31-character alphabet is about
#: 59 bits, which is far past anything worth attacking a setup hotspot for.
_PASSPHRASE_LEN = 12
_SSID_SUFFIX_LEN = 4

#: The claim code, printed on the label and typed or scanned into the phone.
#:
#: Ten characters of the 31-symbol SSID alphabet is a little over 49 bits.
#: That is the whole strength of the cloud pairing, so it is worth being
#: explicit about what it has to resist: an attacker who is *guessing*, against
#: a relay that rate-limits and that returns an empty mailbox for every address
#: it has never seen. It does not have to resist somebody who has read the
#: sticker, and it cannot — at that point they are standing next to the device.
_CLAIM_LEN = 10

#: Printed in two groups. Ten unbroken characters is where people lose their
#: place reading a code back to somebody on the phone.
_CLAIM_GROUP = 5

#: Domain separation for the second stage. Different from `_SALT` so that the
#: claim code cannot be fed back into the first stage to recover anything.
_HKDF_SALT = b"snapcare/pill-dispenser/cloud/v1"

#: How many bytes of the device id are used. 16 is 128 bits of address space,
#: which is what makes "guess a mailbox" not a strategy.
_DEVICE_ID_BYTES = 16

#: The claim code on a machine with no Raspberry Pi serial. Fixed and obviously
#: not a real one, so that two developers running `make run` pair against the
#: same mailbox on a shared relay and find each other's test schedules — which
#: is a feature at a bench and is why it is spelled out rather than random.
_FALLBACK_CLAIM = "SNAPCAREDV"


@dataclass(frozen=True)
class Identity:
    ssid: str
    passphrase: str
    #: What it was derived from, or "file" / "fallback". Shown on the setup page
    #: so that a device whose QR is not the printed one says so rather than
    #: leaving somebody scanning a sticker that cannot work.
    source: str
    #: The cloud pairing code, in its printed `XXXXX-XXXXX` form.
    claim: str = ""

    @property
    def wifi_qr(self) -> str:
        return wifi_qr_payload(self.ssid, self.passphrase)

    @property
    def device_id(self) -> str:
        """The relay's address for this device. Public; carries no secret."""
        return device_id(self.claim)

    @property
    def access_token(self) -> str:
        """Proves the right to this mailbox. Shared with the relay, and only it."""
        return access_token(self.claim)

    @property
    def box_key(self) -> bytes:
        """Encrypts the schedule. Never sent anywhere, by either side."""
        return box_key(self.claim)

    @property
    def pair_qr(self) -> str:
        return pair_qr_payload(self.claim)

    def to_json(self) -> dict:
        return {"ssid": self.ssid, "passphrase": self.passphrase,
                "source": self.source, "claim": self.claim}


def cpu_serial(cpuinfo: Path | str = Path("/proc/cpuinfo")) -> str | None:
    """The SoC serial from /proc/cpuinfo, or None if it is not there.

    Present on every Pi. Absent on a laptop, which is why this returns None
    rather than raising — the firmware has to be runnable off-Pi for anyone to
    develop against it.
    """
    serial = ""
    try:
        text = Path(cpuinfo).read_text(encoding="utf-8", errors="replace")
    except OSError:
        text = ""

    match = re.search(r"^Serial\s*:\s*([0-9a-fA-F]+)\s*$", text, re.MULTILINE)
    if match:
        serial = match.group(1)
    else:
        # `/proc/cpuinfo` is not the only place, and on newer boards and
        # kernels it is not a place at all: the `Serial` line comes from the
        # ARM-specific cpuinfo printer, and on a 64-bit kernel — and on the
        # Pi 5 regardless — it is simply absent. The device tree carries the
        # same number and has on every Pi ever made.
        #
        # This matters more than a missing field usually would. Without a
        # serial the firmware falls all the way through to the *development*
        # identity, so a real device quietly announces `SnapCare-DEV0` with a
        # published passphrase and a pairing code that is the same on every
        # such machine — and the printed label on the case says something else
        # entirely. The failure is a device nobody can pair, reported as a
        # working one.
        for node in ("/proc/device-tree/serial-number",
                     "/sys/firmware/devicetree/base/serial-number"):
            try:
                # NUL-terminated in the device tree, and not always hex-clean.
                raw = Path(node).read_bytes().split(b"\x00", 1)[0]
            except OSError:
                continue
            candidate = raw.decode("ascii", "ignore").strip()
            if re.fullmatch(r"[0-9a-fA-F]+", candidate or ""):
                serial = candidate
                break

    if not serial:
        return None

    serial = serial.lower().lstrip("0")
    # Some board revisions report all zeros. That is not an identity — every
    # such device would derive the same SSID and passphrase, so two of them in
    # one house could not be told apart or joined separately.
    return serial or None


def _stream(serial: str, purpose: bytes, length: int, alphabet: str) -> str:
    digest = hmac.new(_SALT, purpose + b"|" + serial.encode(), hashlib.sha256).digest()
    # Rejection-free and unbiased enough: 256 is not a multiple of 31, but the
    # bias is under 4% on the last few symbols of the alphabet and this is a
    # setup hotspot passphrase, not a key.
    return "".join(alphabet[b % len(alphabet)] for b in digest[:length])


def derive_identity(serial: str) -> Identity:
    """The same serial always gives the same SSID, passphrase and claim code."""
    suffix = _stream(serial, b"ssid", _SSID_SUFFIX_LEN, _SSID_ALPHABET)
    passphrase = _stream(serial, b"psk", _PASSPHRASE_LEN, _ALPHABET)
    return Identity(
        ssid=f"{config.AP_SSID_PREFIX}-{suffix}",
        passphrase=passphrase,
        source=f"serial:{serial}",
        claim=derive_claim(serial),
    )


def derive_claim(serial: str) -> str:
    """The printed cloud pairing code for a board, in `XXXXX-XXXXX` form."""
    return format_claim(_stream(serial, b"claim", _CLAIM_LEN, _SSID_ALPHABET))


# ── the claim code, and the three keys under it ─────────────────────────────

def format_claim(code: str) -> str:
    """Group a bare code for printing. `V5XH3K8KPV` -> `V5XH3-K8KPV`."""
    bare = normalise_claim(code)
    if not bare:
        return ""
    return "-".join(bare[i:i + _CLAIM_GROUP] for i in range(0, len(bare), _CLAIM_GROUP))


def normalise_claim(code: str) -> str:
    """What somebody typed, reduced to the code itself — or "" if it is not one.

    Upper-cased, with anything outside the alphabet discarded, so the dashes
    printed on the label, a space where somebody paused, and a trailing newline
    off a form field all arrive as the same ten characters.

    Discarding is safe *because* the alphabet already excludes the ambiguous
    glyphs: there is no O, I, L, 0 or 1 in a real code, so a person who reads a
    5 as an S produces a character that is in the alphabet and lands on a
    mailbox that does not exist — an empty answer, which is the truth — while a
    person who types a stray punctuation mark is not punished for it. What is
    *not* done is silently accepting the wrong length, because that is the
    typo that would otherwise derive a plausible key for the wrong device.
    """
    kept = "".join(c for c in code.upper() if c in _SSID_ALPHABET)
    return kept if len(kept) == _CLAIM_LEN else ""


def hkdf_sha256(ikm: bytes, salt: bytes, info: bytes, length: int) -> bytes:
    """HKDF-SHA256, extract then expand (RFC 5869).

    Written out rather than pulled in because it is nine lines and the firmware
    installs onto a bare Raspberry Pi OS image.

    It is exposed, and takes all four arguments, so that the suite can run the
    RFC's own test vectors through it. That is the only way to be sure this
    agrees with WebCrypto's native HKDF without a browser in the loop — and it
    has to agree, because a phone and a device deriving different keys from the
    same printed code is a pairing that fails with no error at either end.
    """
    prk = hmac.new(salt, ikm, hashlib.sha256).digest()
    out, block, counter = b"", b"", 1
    while len(out) < length:
        block = hmac.new(prk, block + info + bytes([counter]), hashlib.sha256).digest()
        out += block
        counter += 1
    return out[:length]


def _hkdf(claim: str, info: bytes, length: int) -> bytes:
    """The three keys behind a claim code. See the module docstring."""
    bare = normalise_claim(claim)
    if not bare:
        raise ValueError("not a valid claim code")
    return hkdf_sha256(bare.encode(), _HKDF_SALT, info, length)


def device_id(claim: str) -> str:
    """The relay's address for this device.

    Deliberately *not* the claim code itself. The relay sees this on every
    request and writes it to its log; the claim code is the key to the
    plaintext, and a key that appears in a server log is not a key. 128 bits
    through a one-way function means the relay can route without ever being in
    a position to decrypt, even if its whole disk is taken.
    """
    return base64.urlsafe_b64encode(
        _hkdf(claim, b"device-id", _DEVICE_ID_BYTES)).decode().rstrip("=")


def access_token(claim: str) -> str:
    """Proves the right to read and write this device's mailbox.

    Given to the relay, which stores only its SHA-256 — so a stolen relay
    database yields nothing that can be replayed against the relay itself, and
    nothing at all about the box key, which is a different HKDF branch.
    """
    return base64.urlsafe_b64encode(_hkdf(claim, b"access", 32)).decode().rstrip("=")


def box_key(claim: str) -> bytes:
    """The AES-256-GCM key the schedule is sealed with.

    This one never leaves the device or the phone. It is the reason the relay
    can be a dumb mailbox on somebody else's hardware and still not be a place
    where a person's medication times are readable.
    """
    return _hkdf(claim, b"box", 32)


def pair_qr_payload(claim: str, relay_url: str = "") -> str:
    """What the pairing QR on the label carries.

    With a relay configured this is an ordinary `https://` URL, because that is
    the only kind of code a phone's own camera will offer to open — and the
    code goes in the **fragment**, which browsers do not send to the server. So
    scanning the label hands the claim code to the page's JavaScript and to
    nothing else; it is not in the request line, the access log or the proxy in
    between.

    With no relay configured it falls back to a bare `SNAPCARE-PAIR:` string,
    which a plain camera cannot act on but the demo app and any future in-app
    scanner can. That is better than printing a URL to a relay that does not
    exist yet, which would be a label that is wrong from the day it is glued on.
    """
    code = format_claim(claim)
    if not code:
        return ""
    if not relay_url:
        return f"SNAPCARE-PAIR:{code}"
    return f"{relay_url.rstrip('/')}/pair#{code}"


def load_identity(store=None) -> Identity:
    """The device's identity: the stored override, the derivation, or a fallback.

    The order matters. A stored file is a deliberate act by whoever assembled
    the device and always wins. Otherwise the board's own serial decides, which
    is the normal path and the one that makes the printed QR permanent.

    The fallback is for a machine with no serial — a laptop running the
    firmware for development. It is marked as such so the setup page can say
    "this is not the code on your sticker" instead of quietly serving one that
    will change on the next machine.
    """
    if store is not None:
        stored = store.load_identity()
        if stored:
            try:
                # A file written before cloud sync existed has no claim code.
                # Deriving one from this board's serial is the right answer:
                # the file is here because the *board* was replaced, and the
                # sticker on the case predates the code, so there is nothing to
                # match. Pairing is redone once, which is a thing somebody can
                # do; a pairing that silently addresses the wrong mailbox is
                # not.
                claim = normalise_claim(str(stored.get("claim", "")))
                if not claim:
                    serial = cpu_serial()
                    claim = derive_claim(serial) if serial else _FALLBACK_CLAIM
                    log.info("identity.json carries no claim code — deriving this board's")
                return Identity(
                    ssid=str(stored["ssid"]),
                    passphrase=str(stored["passphrase"]),
                    source="file",
                    claim=format_claim(claim),
                )
            except (KeyError, TypeError):
                log.error("identity.json is malformed — falling back to the derived identity")

    serial = cpu_serial()
    if serial:
        return derive_identity(serial)

    log.warning(
        "no CPU serial (not a Raspberry Pi?) — using a development identity. "
        "The setup QR on this machine will not match a printed label."
    )
    return Identity(
        ssid=f"{config.AP_SSID_PREFIX}-DEV0",
        passphrase="snapcaresetup",
        source="fallback",
        claim=format_claim(_FALLBACK_CLAIM),
    )


def wifi_qr_payload(ssid: str, passphrase: str) -> str:
    """The `WIFI:` string that iOS Camera and Android both join a network from.

    No app, no typing, no pairing: the phone's own camera recognises this
    format and offers to join. It is the reason the setup flow is one scan and
    a password rather than a menu of network settings.

        WIFI:T:WPA;S:SnapCare-7QK4;P:mtvk3rh9xdf2;;

    `\\`, `;`, `,`, `:` and `"` are field separators in this format and have to
    be escaped inside a value. Our own SSIDs and passphrases never contain any
    of them, but an identity.json written by hand might, and a code that
    silently truncates at a stray semicolon is one that joins the wrong network
    or none at all.
    """
    return f"WIFI:T:WPA;S:{_escape(ssid)};P:{_escape(passphrase)};;"


def _escape(value: str) -> str:
    out = []
    for char in value:
        if char in "\\;,:\"":
            out.append("\\")
        out.append(char)
    return "".join(out)


def setup_url() -> str:
    """Where the setup page lives while the hotspot is up.

    A literal address rather than a name, because it is scanned *before* any
    name resolution is trustworthy — the phone has just joined a network with
    no internet and its DNS is whatever the portal says it is.
    """
    port = "" if config.HTTP_PORT == 80 else f":{config.HTTP_PORT}"
    return f"http://{config.AP_ADDRESS}{port}/"


def device_url() -> str:
    """Where the device lives once it is on the home network."""
    port = "" if config.HTTP_PORT == 80 else f":{config.HTTP_PORT}"
    return f"http://{config.MDNS_HOSTNAME}.local{port}/"


def label_json(identity: Identity) -> str:
    """Everything that belongs on the printed label, for a build script.

    The access token and the box key are deliberately *not* here. Both are
    recomputable from the claim code by anyone who is meant to have them, and
    printing a key on a label — or leaving it in the output of a command
    somebody pipes into a file — is how a secret stops being one.
    """
    return json.dumps({
        "ssid": identity.ssid,
        "passphrase": identity.passphrase,
        "wifiQr": identity.wifi_qr,
        "setupUrl": setup_url(),
        "deviceUrl": device_url(),
        "source": identity.source,
        "claim": identity.claim,
        "deviceId": identity.device_id,
        "pairQr": pair_qr_payload(identity.claim, config.CLOUD_RELAY_URL),
    }, indent=2)
