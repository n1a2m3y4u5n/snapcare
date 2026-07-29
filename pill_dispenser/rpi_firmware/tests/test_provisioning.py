"""The identity behind the QR code, and the promise that it never changes.

The requirement being tested is a physical one: somebody prints a label, glues
it to a device, and that label has to keep working after reboots, firmware
upgrades and a complete reimage of the SD card. Everything below is a way that
promise could quietly break.
"""
from __future__ import annotations

import pytest

from snapcare_dispenser import provisioning, qr

CPUINFO = """\
processor\t: 0
model name\t: ARMv7 Processor rev 4 (v7l)
Hardware\t: BCM2835
Revision\t: a02082
Serial\t\t: 00000000a1b2c3d4
Model\t\t: Raspberry Pi 3 Model B Rev 1.2
"""


@pytest.fixture
def cpuinfo(tmp_path):
    path = tmp_path / "cpuinfo"
    path.write_text(CPUINFO)
    return path


# ── the serial ──────────────────────────────────────────────────────────────

def test_the_serial_is_read_from_cpuinfo(cpuinfo):
    assert provisioning.cpu_serial(cpuinfo) == "a1b2c3d4"


def test_a_machine_with_no_serial_returns_none(tmp_path):
    empty = tmp_path / "cpuinfo"
    empty.write_text("processor\t: 0\n")
    assert provisioning.cpu_serial(empty) is None
    assert provisioning.cpu_serial(tmp_path / "does-not-exist") is None


def test_an_all_zero_serial_is_not_an_identity(tmp_path):
    """Some board revisions report zeros. Every such device would derive the
    same SSID and passphrase, so two of them in one house could not be told
    apart — which is exactly what the derivation exists to prevent."""
    path = tmp_path / "cpuinfo"
    path.write_text("Serial\t\t: 0000000000000000\n")
    assert provisioning.cpu_serial(path) is None


# ── the derivation ──────────────────────────────────────────────────────────

def test_the_same_board_always_derives_the_same_identity():
    """The whole promise of the printed label, in one assertion."""
    first = provisioning.derive_identity("a1b2c3d4")
    for _ in range(50):
        again = provisioning.derive_identity("a1b2c3d4")
        assert (again.ssid, again.passphrase) == (first.ssid, first.passphrase)


def test_the_identity_is_pinned_to_an_exact_value():
    """A regression guard, not a tautology.

    If anybody changes the salt, the alphabet or the hash, every device already
    in the world stops matching its printed label — and nothing else in this
    suite would notice, because the derivation would still be perfectly
    deterministic. It would just be deterministically different.
    """
    identity = provisioning.derive_identity("a1b2c3d4")
    assert identity.ssid == "SnapCare-V5XH"
    assert identity.passphrase == "3k8krnp8pv8s"


def test_different_boards_get_different_identities():
    seen = {provisioning.derive_identity(f"{n:016x}").ssid for n in range(500)}
    # Collisions are possible in a 4-character space and are not a fault; two
    # in five hundred would be. This is a smoke check on the spread, not a
    # uniqueness guarantee.
    assert len(seen) > 490


def test_the_passphrase_is_a_legal_wpa2_key():
    for n in range(200):
        passphrase = provisioning.derive_identity(f"{n:016x}").passphrase
        assert 8 <= len(passphrase) <= 63
        assert passphrase.isascii() and passphrase.isalnum()


def test_the_passphrase_avoids_characters_that_are_read_wrongly():
    """Normally scanned, but somebody will eventually type it off a label."""
    for n in range(200):
        identity = provisioning.derive_identity(f"{n:016x}")
        assert not set(identity.passphrase) & set("01loIO")
        assert not set(identity.ssid.split("-")[1]) & set("01LOIO")


def test_the_ssid_carries_the_configured_prefix():
    assert provisioning.derive_identity("beef").ssid.startswith("SnapCare-")


# ── loading it ──────────────────────────────────────────────────────────────

def test_a_stored_identity_beats_the_derivation(store):
    """For the one case the derivation cannot serve: a board is replaced and
    the customer still has the old sticker."""
    store.save_identity({"ssid": "SnapCare-OLD1", "passphrase": "keepthisone"})
    identity = provisioning.load_identity(store)
    assert identity.ssid == "SnapCare-OLD1"
    assert identity.source == "file"


def test_a_malformed_stored_identity_falls_back_rather_than_crashing(store):
    store.save_identity({"ssid": "SnapCare-OLD1"})   # no passphrase
    identity = provisioning.load_identity(store)
    assert identity.source != "file"
    assert identity.passphrase


def test_a_development_machine_is_marked_as_such(store, monkeypatch):
    """So the setup page can say 'this is not the code on your sticker' rather
    than serving one that will differ on the next machine."""
    monkeypatch.setattr(provisioning, "cpu_serial", lambda *a, **k: None)
    identity = provisioning.load_identity(store)
    assert identity.source == "fallback"


# ── the WiFi QR payload ─────────────────────────────────────────────────────

def test_the_wifi_payload_is_the_format_phones_understand():
    payload = provisioning.wifi_qr_payload("SnapCare-7QK4", "mtvk3rh9xdf2")
    assert payload == "WIFI:T:WPA;S:SnapCare-7QK4;P:mtvk3rh9xdf2;;"


@pytest.mark.parametrize("value,escaped", [
    ("a;b", "a\\;b"),
    ("a:b", "a\\:b"),
    ("a,b", "a\\,b"),
    ('a"b', 'a\\"b'),
    ("a\\b", "a\\\\b"),
])
def test_separators_inside_a_value_are_escaped(value, escaped):
    """A code that truncates at a stray semicolon joins the wrong network, or
    none, and gives no hint why."""
    assert f"S:{escaped};" in provisioning.wifi_qr_payload(value, "password")
    assert f"P:{escaped};;" in provisioning.wifi_qr_payload("ssid", value)


def test_a_derived_payload_needs_no_escaping():
    """Belt and braces: the alphabets are chosen so this can never bite."""
    for n in range(100):
        identity = provisioning.derive_identity(f"{n:016x}")
        assert "\\" not in identity.wifi_qr


# ── the codes themselves ────────────────────────────────────────────────────

def test_the_setup_qr_actually_decodes_back():
    """The practice `form_sheet_parser/cli.py` already follows here, for the
    reason it gives: an unreadable QR produced without complaint is the failure
    that costs an afternoon — and this one gets printed onto a sticker."""
    identity = provisioning.derive_identity("a1b2c3d4")
    try:
        assert qr.verify(identity.wifi_qr)
        assert qr.verify(provisioning.setup_url())
        assert qr.verify(provisioning.device_url())
    except qr.QREncoderUnavailable:
        pytest.skip("no QR encoder installed")


def test_the_svg_is_self_contained_and_square():
    try:
        svg = qr.to_svg(provisioning.derive_identity("a1b2c3d4").wifi_qr)
    except qr.QREncoderUnavailable:
        pytest.skip("no QR encoder installed")

    assert svg.startswith("<svg") and svg.endswith("</svg>")
    # Nothing is fetched from anywhere: the phone reading this page is on a
    # network with no internet by definition. (The xmlns is a namespace
    # identifier, not a URL anything dereferences.)
    assert "<image" not in svg and "href" not in svg
    assert svg.count("http") == 1 and 'xmlns="http://www.w3.org/2000/svg"' in svg
    assert 'width="' in svg and svg.count('viewBox="0 0 ') == 1


def test_the_quiet_zone_is_present():
    """Four modules of border are part of the code, not a margin. Without them
    it does not scan, and somebody will crop this label."""
    try:
        matrix = qr.qr_matrix("WIFI:T:WPA;S:SnapCare-7QK4;P:mtvk3rh9xdf2;;")
    except qr.QREncoderUnavailable:
        pytest.skip("no QR encoder installed")

    for row in matrix[:4] + matrix[-4:]:
        assert not any(row)
    for row in matrix:
        assert not any(row[:4]) and not any(row[-4:])


def test_the_urls_use_an_address_during_setup_and_a_name_afterwards():
    """The setup URL is scanned before any name resolution can be trusted —
    the phone has just joined a network whose DNS is whatever the portal says."""
    assert provisioning.setup_url().startswith("http://10.42.0.1")
    assert "pilldispenser.local" in provisioning.device_url()


# ── the claim code, and the keys under it ───────────────────────────────────

def test_the_claim_code_is_pinned_to_an_exact_value():
    """Same guard as the SSID above, and it bites harder.

    A device that stops matching its label can be re-provisioned by somebody
    standing next to it. A device whose *claim code* changes has silently moved
    to a different relay mailbox — the app keeps polling the old one, sees a
    dispenser that has not been heard from in days, and there is nothing at
    either end reporting a fault.
    """
    assert provisioning.derive_identity("a1b2c3d4").claim == "6V9F5-9QK67"


def test_the_claim_code_is_independent_of_the_wifi_identity():
    """Different purpose strings, so reading one off a label gives the other.

    They are printed side by side, so this is not about secrecy between them —
    it is that a single HMAC reused for two purposes is how a change to one
    quietly becomes a change to the other.
    """
    identity = provisioning.derive_identity("a1b2c3d4")
    bare = provisioning.normalise_claim(identity.claim)
    assert bare not in identity.passphrase.upper()
    assert bare[:4] != identity.ssid.split("-")[1]


def test_different_boards_get_different_claim_codes():
    seen = {provisioning.derive_identity(f"{n:016x}").claim for n in range(500)}
    assert len(seen) == 500


def test_the_claim_code_avoids_characters_that_are_read_wrongly():
    """It is printed on a sticker and read back over a telephone."""
    for n in range(200):
        claim = provisioning.derive_identity(f"{n:016x}").claim
        assert not set(claim) & set("01LOIO")
        assert len(provisioning.normalise_claim(claim)) == 10


@pytest.mark.parametrize("typed", [
    "6V9F5-9QK67", "6v9f59qk67", "  6V9F5 9QK67  ", "6V9F5–9QK67\n",
    "6V9F5_9QK67", "6V9F5/9QK67",
])
def test_a_code_survives_being_typed_by_a_person(typed):
    """Dashes, spaces, an en-dash off a word processor, a trailing newline from
    a form field. All of them are the same ten characters."""
    assert provisioning.normalise_claim(typed) == "6V9F59QK67"


@pytest.mark.parametrize("wrong", ["", "6V9F5", "6V9F5-9QK6", "6V9F5-9QK678", "----"])
def test_a_code_of_the_wrong_length_is_refused_rather_than_padded(wrong):
    """The typo that matters. A short code silently extended, or a long one
    truncated, derives a perfectly valid key for a mailbox nobody owns — and
    the symptom is a dispenser that never syncs, with no error anywhere."""
    assert provisioning.normalise_claim(wrong) == ""
    with pytest.raises(ValueError):
        provisioning.device_id(wrong)


def test_the_three_keys_are_pinned_and_differ_from_each_other():
    """The relay is *given* the access token. If the three branches ever
    collapsed into one value, handing it over would hand over the box key —
    and every schedule the relay has ever stored becomes readable."""
    claim = provisioning.derive_identity("a1b2c3d4").claim
    assert provisioning.device_id(claim) == "kmPLb2W8Zx1NEc1bdYQgXw"

    values = {
        provisioning.device_id(claim),
        provisioning.access_token(claim),
        provisioning.box_key(claim).hex(),
    }
    assert len(values) == 3
    assert len(provisioning.box_key(claim)) == 32


def test_the_keys_come_from_the_code_not_the_serial():
    """The phone only ever sees ten characters off a sticker. If the keys hung
    off the serial number the phone could not compute them at all."""
    from_board = provisioning.derive_identity("a1b2c3d4")
    from_sticker = provisioning.device_id(" 6v9f5 9qk67 ")
    assert from_sticker == from_board.device_id


def test_the_device_id_does_not_leak_the_claim_code():
    """It is in the relay's access log. The claim code is the key to every
    schedule that device has ever been sent."""
    claim = provisioning.derive_identity("a1b2c3d4").claim
    identifier = provisioning.device_id(claim)
    bare = provisioning.normalise_claim(claim)
    assert bare not in identifier.upper()
    assert bare not in provisioning.access_token(claim).upper()


# ── the pairing QR ──────────────────────────────────────────────────────────

def test_the_pairing_code_keeps_the_claim_out_of_the_request_line():
    """A fragment is not sent to the server. That is the whole reason the URL is
    shaped this way: the claim code reaches the page's JavaScript and neither
    the relay, its access log, nor any proxy between them."""
    claim = provisioning.derive_identity("a1b2c3d4").claim
    url = provisioning.pair_qr_payload(claim, "https://relay.example/")
    assert url == "https://relay.example/pair#6V9F5-9QK67"
    assert claim not in url.split("#")[0]


def test_with_no_relay_the_pairing_code_is_not_a_url():
    """Printing a URL to a relay that does not exist yet is a label that is
    wrong from the day it is glued on."""
    claim = provisioning.derive_identity("a1b2c3d4").claim
    assert provisioning.pair_qr_payload(claim) == "SNAPCARE-PAIR:6V9F5-9QK67"


def test_the_pairing_qr_actually_decodes_back():
    claim = provisioning.derive_identity("a1b2c3d4").claim
    try:
        assert qr.verify(provisioning.pair_qr_payload(claim))
        assert qr.verify(provisioning.pair_qr_payload(claim, "https://relay.example"))
    except qr.QREncoderUnavailable:
        pytest.skip("no QR encoder installed")


# ── a replaced board ────────────────────────────────────────────────────────

def test_a_stored_identity_carries_its_claim_code(store):
    """The case identity.json exists for: the board died, the sticker did not.
    The pairing has to move with it or the app is left polling a dead mailbox."""
    store.save_identity({"ssid": "SnapCare-OLD1", "passphrase": "keepthisone",
                         "claim": "6V9F5-9QK67"})
    identity = provisioning.load_identity(store)
    assert identity.claim == "6V9F5-9QK67"
    assert identity.device_id == provisioning.device_id("6V9F59QK67")


def test_an_identity_file_from_before_cloud_sync_still_loads(store):
    """It has no claim code. Deriving this board's is right — the file is here
    because the board was replaced, so there is no old pairing to preserve."""
    store.save_identity({"ssid": "SnapCare-OLD1", "passphrase": "keepthisone"})
    identity = provisioning.load_identity(store)
    assert identity.source == "file"
    assert provisioning.normalise_claim(identity.claim)


def test_a_development_machine_has_a_usable_claim_code(store, monkeypatch):
    """`make run` on a laptop has to be able to pair against a relay, or the
    whole cloud path can only be exercised on hardware."""
    monkeypatch.setattr(provisioning, "cpu_serial", lambda *a, **k: None)
    identity = provisioning.load_identity(store)
    assert identity.claim == "SNAPC-AREDV"
    assert identity.device_id
