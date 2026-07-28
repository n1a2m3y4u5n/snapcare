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
"""
from __future__ import annotations

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


@dataclass(frozen=True)
class Identity:
    ssid: str
    passphrase: str
    #: What it was derived from, or "file" / "fallback". Shown on the setup page
    #: so that a device whose QR is not the printed one says so rather than
    #: leaving somebody scanning a sticker that cannot work.
    source: str

    @property
    def wifi_qr(self) -> str:
        return wifi_qr_payload(self.ssid, self.passphrase)

    def to_json(self) -> dict:
        return {"ssid": self.ssid, "passphrase": self.passphrase, "source": self.source}


def cpu_serial(cpuinfo: Path | str = Path("/proc/cpuinfo")) -> str | None:
    """The SoC serial from /proc/cpuinfo, or None if it is not there.

    Present on every Pi. Absent on a laptop, which is why this returns None
    rather than raising — the firmware has to be runnable off-Pi for anyone to
    develop against it.
    """
    try:
        text = Path(cpuinfo).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None

    match = re.search(r"^Serial\s*:\s*([0-9a-fA-F]+)\s*$", text, re.MULTILINE)
    if not match:
        return None

    serial = match.group(1).lower().lstrip("0")
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
    """The same serial always gives the same SSID and passphrase."""
    suffix = _stream(serial, b"ssid", _SSID_SUFFIX_LEN, _SSID_ALPHABET)
    passphrase = _stream(serial, b"psk", _PASSPHRASE_LEN, _ALPHABET)
    return Identity(
        ssid=f"{config.AP_SSID_PREFIX}-{suffix}",
        passphrase=passphrase,
        source=f"serial:{serial}",
    )


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
                return Identity(
                    ssid=str(stored["ssid"]),
                    passphrase=str(stored["passphrase"]),
                    source="file",
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
    """Everything that belongs on the printed label, for a build script."""
    return json.dumps({
        "ssid": identity.ssid,
        "passphrase": identity.passphrase,
        "wifiQr": identity.wifi_qr,
        "setupUrl": setup_url(),
        "deviceUrl": device_url(),
        "source": identity.source,
    }, indent=2)
