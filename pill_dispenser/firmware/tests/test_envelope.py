"""The sealed envelope, and the promise that a browser derives the same keys.

There are two implementations of this crypto and they share no code: this one,
and the JavaScript in `cloud_relay/snapcare_relay/web/lab.html` that the app
side uses. They have to agree exactly — a phone and a dispenser deriving
different keys from the same printed code is a pairing that simply never works,
with no error at either end and nothing in any log.

There is no browser in this suite, so agreement is established the only other
way it can be: by showing that this implementation is the standard one.

  * the key derivation is checked against **RFC 5869's own test vectors**,
    which is what WebCrypto's native HKDF implements
  * the envelope format is pinned to a **golden value**, so a change to the
    AAD, the base64 flavour or the field names fails here rather than in a
    house six months later

`make lab-check` drives the real page in a real browser against a real relay,
which is the end-to-end version of this. These are the part that runs in two
seconds on any machine.
"""
from __future__ import annotations

import json

import pytest

from snapcare_dispenser import envelope, provisioning

pytestmark = pytest.mark.skipif(
    not envelope.available(),
    reason="no AES-GCM here — " + envelope.UNAVAILABLE_HINT,
)


# ── RFC 5869, appendix A ────────────────────────────────────────────────────
#
# Case 1 and case 3 (the empty-salt, empty-info one). Case 2's long inputs add
# nothing here: what is being checked is that this is HKDF and not some
# adjacent construction, and the two below establish that.

def test_hkdf_matches_rfc_5869_case_1():
    out = provisioning.hkdf_sha256(
        ikm=bytes.fromhex("0b" * 22),
        salt=bytes.fromhex("000102030405060708090a0b0c"),
        info=bytes.fromhex("f0f1f2f3f4f5f6f7f8f9"),
        length=42,
    )
    assert out.hex() == (
        "3cb25f25faacd57a90434f64d0362f2a"
        "2d2d0a90cf1a5a4c5db02d56ecc4c5bf"
        "34007208d5b887185865"
    )


def test_hkdf_matches_rfc_5869_case_3():
    """Empty salt and empty info — the degenerate case implementations get
    wrong, usually by substituting a hash-length block of zeros for one and
    not the other."""
    out = provisioning.hkdf_sha256(
        ikm=bytes.fromhex("0b" * 22), salt=b"", info=b"", length=42)
    assert out.hex() == (
        "8da4e775a563c18f715f802a063c5a31"
        "b8a11f5c5ee1879ec3454e5f3c738d2d"
        "9d201395faa4b61a96c8"
    )


def test_the_expansion_is_a_stream_not_a_rehash():
    """A short derivation has to be the prefix of a long one. Getting this
    wrong is invisible until somebody changes a key length."""
    long = provisioning.hkdf_sha256(b"ikm", b"salt", b"info", 64)
    assert provisioning.hkdf_sha256(b"ikm", b"salt", b"info", 16) == long[:16]
    assert len(long) == 64


# ── the envelope format ─────────────────────────────────────────────────────

CLAIM = "6V9F5-9QK67"


@pytest.fixture
def sealed():
    key = provisioning.box_key(CLAIM)
    device = provisioning.device_id(CLAIM)
    return key, device


def test_an_envelope_opens_into_what_went_in(sealed):
    key, device = sealed
    payload = {"payload": "SC1*W*1:0800.2000-127-030", "by": "test"}
    opened = envelope.unseal(key, device, "desired",
                             envelope.seal(key, device, "desired", 4, payload))
    assert opened == payload


def test_the_shape_on_the_wire_is_pinned(sealed):
    """The browser writes this shape by hand. A renamed field is a phone that
    silently stops talking to every dispenser in the field."""
    key, device = sealed
    wrapped = envelope.seal(key, device, "desired", 4, {"payload": "SC1*W*1:0800-127-000"})
    assert set(wrapped) == {"v", "rev", "alg", "iv", "ct"}
    assert wrapped["v"] == 1 and wrapped["alg"] == "A256GCM" and wrapped["rev"] == 4
    # base64url, unpadded, on both fields. The browser's atob is forgiving
    # about padding and Python's b64decode is not, so this is the difference
    # between working and failing on one message in four.
    for field in ("iv", "ct"):
        assert "=" not in wrapped[field]
        assert "+" not in wrapped[field] and "/" not in wrapped[field]
    assert len(envelope._unb64(wrapped["iv"])) == 12


def test_a_golden_envelope_still_opens(sealed):
    """Sealed once, by hand, and committed. If anything about the derivation,
    the AAD or the encoding changes, this stops opening — which is exactly what
    a device in a drawer would do, except that this says so in two seconds."""
    key, device = sealed
    golden = {
        "v": 1, "rev": 7, "alg": "A256GCM",
        "iv": "j4ys0rZoaGh_zN6q",
        "ct": ("vOBaWbVwZjyPkBSmfc_sDsmmmxguRIK4Rq2A60xGf8gEma34v8BGbT"
               "9oM8r8gzOPU0w6z2_GVg"),
    }
    assert envelope.unseal(key, device, "desired", golden) == {
        "payload": "SC1*W*1:0800.2000-127-030"}


@pytest.mark.parametrize("slot,rev,device_suffix", [
    ("reported", 4, ""),      # the device's own words, played back as a command
    ("desired", 5, ""),       # last month's prescription, renumbered
    ("desired", 4, "x"),      # one household's schedule, delivered to another
])
def test_moving_an_envelope_makes_it_fail_rather_than_open(sealed, slot, rev, device_suffix):
    """Every one of these is a substitution somebody could make by editing the
    relay's disk. None of them may produce something that opens."""
    key, device = sealed
    wrapped = envelope.seal(key, device, "desired", 4, {"payload": "SC1*W*1:0800-127-000"})
    wrapped["rev"] = rev
    with pytest.raises(envelope.SealError):
        envelope.unseal(key, device + device_suffix, slot, wrapped)


def test_a_different_claim_code_does_not_open_it(sealed):
    key, device = sealed
    wrapped = envelope.seal(key, device, "desired", 1, {"payload": "SC1*W*1:0800-127-000"})
    with pytest.raises(envelope.SealError):
        envelope.unseal(provisioning.box_key("SNAPCAREDV"), device, "desired", wrapped)


def test_a_flipped_bit_is_refused_rather_than_returned(sealed):
    """GCM authenticates. Without that the relay could change a time by one
    digit and the device would dispense on it."""
    key, device = sealed
    wrapped = envelope.seal(key, device, "desired", 1, {"payload": "SC1*W*1:0800-127-000"})
    raw = bytearray(envelope._unb64(wrapped["ct"]))
    raw[0] ^= 0x01
    wrapped["ct"] = envelope._b64(bytes(raw))
    with pytest.raises(envelope.SealError):
        envelope.unseal(key, device, "desired", wrapped)


@pytest.mark.parametrize("broken", [
    {}, {"v": 2, "rev": 1, "alg": "A256GCM", "iv": "AAAA", "ct": "AAAA"},
    {"v": 1, "rev": 1, "alg": "AESCBC", "iv": "AAAA", "ct": "AAAA"},
    {"v": 1, "rev": 1, "alg": "A256GCM", "iv": "short", "ct": "AAAA"},
    {"v": 1, "rev": "one", "alg": "A256GCM", "iv": "AAAA", "ct": "AAAA"},
    {"v": 1, "rev": 1, "alg": "A256GCM", "iv": "!!!!", "ct": "!!!!"},
    "not a dict", None, 7,
])
def test_rubbish_raises_sealerror_and_never_anything_else(sealed, broken):
    """This parses whatever the relay hands back. A relay that has been
    tampered with, or simply upgraded badly, must not be able to take the
    dispenser down with a malformed body."""
    key, device = sealed
    with pytest.raises(envelope.SealError):
        envelope.unseal(key, device, "desired", broken)


def test_the_same_payload_seals_differently_every_time(sealed):
    """A fresh IV per message. Repeating one under the same key in GCM is the
    failure that loses the key, not just the message."""
    key, device = sealed
    seen = {json.dumps(envelope.seal(key, device, "desired", 1, {"payload": "x"}))
            for _ in range(50)}
    assert len(seen) == 50


def test_a_missing_library_is_reported_rather_than_crashed_on(monkeypatch):
    """The dispenser has to keep dispensing on a machine with no crypto
    library. It says so; it does not fall over."""
    monkeypatch.setattr(envelope, "_aesgcm",
                        lambda: (_ for _ in ()).throw(envelope.SealError("nope")))
    assert not envelope.available()
    with pytest.raises(envelope.SealError):
        envelope.seal(b"\0" * 32, "device", "desired", 1, {})
