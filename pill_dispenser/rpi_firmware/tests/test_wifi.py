"""The nmcli layer. Only the parsing and the failure paths — nmcli itself is stubbed.

There is one thing here worth a test rather than a read-through, and it is the
terse-output splitter. `nmcli -t` escapes colons inside fields, and a naive
`split(':')` works perfectly until somebody's router is called "Guest:2G" — at
which point the setup page offers a network whose name is a truncation, and
joining it fails with an error about the network not existing.
"""
from __future__ import annotations

import subprocess

import pytest

from snapcare_dispenser import wifi


def stub_nmcli(monkeypatch, handler):
    """Replace nmcli with a function from argv to (returncode, stdout, stderr)."""
    def fake(*args, timeout=30):
        code, out, err = handler(list(args))
        return subprocess.CompletedProcess(args, code, out, err)
    monkeypatch.setattr(wifi, "_nmcli", fake)


def working_nmcli(calls=None, address="192.168.1.42"):
    """A handler for an nmcli where everything succeeds and DHCP answers.

    The address matters: `connect` treats an association with no lease as a
    failure, so a stub that answers nothing to `IP4.ADDRESS` is a stub of a
    router that never handed one out.
    """
    def handler(args):
        if calls is not None:
            calls.append(args)
        if args[:2] == ["--version"]:
            return 0, "nmcli tool, version 1.42\n", ""
        if "IP4.ADDRESS" in args:
            return 0, f"IP4.ADDRESS[1]:{address}/24\n", ""
        return 0, "", ""
    return handler


# ── the terse splitter ──────────────────────────────────────────────────────

@pytest.mark.parametrize("line,fields", [
    ("Home:88:WPA2", ["Home", "88", "WPA2"]),
    (r"Guest\:2G:40:", ["Guest:2G", "40", ""]),
    (r"back\\slash:70:WPA2", ["back\\slash", "70", "WPA2"]),
    ("::", ["", "", ""]),
    ("", [""]),
])
def test_terse_output_splits_on_unescaped_colons(line, fields):
    assert wifi._split_terse(line) == fields


def test_a_network_named_with_a_colon_survives_a_scan(monkeypatch):
    stub_nmcli(monkeypatch, lambda args: (
        (0, "Home:88:WPA2\n" + r"Guest\:2G:40:" + "\n", "")
        if "list" in args else (0, "", "")))
    networks = wifi.scan()
    assert [n.ssid for n in networks] == ["Home", "Guest:2G"]
    assert networks[1].security == "" and networks[1].to_json()["open"] is True


# ── scanning ────────────────────────────────────────────────────────────────

def test_duplicate_ssids_collapse_to_the_strongest(monkeypatch):
    """A mesh or a dual-band router advertises the same name several times, and
    a setup page listing it four times looks broken."""
    stub_nmcli(monkeypatch, lambda args: (
        (0, "Home:41:WPA2\nHome:88:WPA2\nHome:12:WPA2\n", "")
        if "list" in args else (0, "", "")))
    networks = wifi.scan()
    assert len(networks) == 1
    assert networks[0].signal == 88


def test_hidden_networks_are_left_out(monkeypatch):
    """There is no name to show and nothing to tap."""
    stub_nmcli(monkeypatch, lambda args: (
        (0, ":55:WPA2\nHome:88:WPA2\n", "") if "list" in args else (0, "", "")))
    assert [n.ssid for n in wifi.scan()] == ["Home"]


def test_networks_come_back_strongest_first(monkeypatch):
    stub_nmcli(monkeypatch, lambda args: (
        (0, "Far:10:WPA2\nNear:90:WPA2\nMid:50:WPA2\n", "")
        if "list" in args else (0, "", "")))
    assert [n.ssid for n in wifi.scan()] == ["Near", "Mid", "Far"]


def test_a_scan_that_fails_returns_nothing_rather_than_raising(monkeypatch):
    monkeypatch.setattr(wifi, "_nmcli", lambda *a, **k: None)
    assert wifi.scan() == []
    assert wifi.saved_ssids() == set()


def test_our_own_hotspot_is_not_offered_as_a_saved_network(monkeypatch):
    stub_nmcli(monkeypatch, lambda args: (
        0, f"Home:802-11-wireless\n{wifi.AP_CONNECTION}:802-11-wireless\n"
           "Wired:802-3-ethernet\n", ""))
    assert wifi.saved_ssids() == {"Home"}


# ── status ──────────────────────────────────────────────────────────────────

def test_status_when_no_network_manager_is_installed(monkeypatch):
    monkeypatch.setattr(wifi, "_nmcli", lambda *a, **k: None)
    assert wifi.status().mode == "unavailable"


def test_status_distinguishes_the_hotspot_from_a_real_network(monkeypatch):
    def handler(args):
        if args[:2] == ["--version"]:
            return 0, "nmcli tool, version 1.42\n", ""
        if "device" in args and "status" in args:
            return 0, f"wlan0:wifi:connected:{wifi.AP_CONNECTION}\n", ""
        if "802-11-wireless.ssid" in args:
            return 0, "802-11-wireless.ssid:SnapCare-V5XH\n", ""
        return 0, "", ""

    stub_nmcli(monkeypatch, handler)
    state = wifi.status()
    assert state.mode == "hotspot"
    assert state.ssid == "SnapCare-V5XH"
    assert state.online is False


def test_status_reports_a_joined_network_and_its_address(monkeypatch):
    def handler(args):
        if args[:2] == ["--version"]:
            return 0, "nmcli tool, version 1.42\n", ""
        if "device" in args and "status" in args:
            return 0, "eth0:ethernet:unavailable:--\nwlan0:wifi:connected:Home\n", ""
        if "IP4.ADDRESS" in args:
            return 0, "IP4.ADDRESS[1]:192.168.1.42/24\n", ""
        return 0, "", ""

    stub_nmcli(monkeypatch, handler)
    state = wifi.status()
    assert (state.mode, state.ssid, state.address) == ("connected", "Home", "192.168.1.42")
    assert state.online is True


# ── joining ─────────────────────────────────────────────────────────────────

def test_a_rejected_password_says_so_in_plain_words(monkeypatch):
    """NetworkManager reports it as a generic activation failure. Passing that
    through tells somebody their router is broken when they mistyped a
    password — the single most likely thing to go wrong in this whole flow."""
    def handler(args):
        if args[:2] == ["--version"]:
            return 0, "nmcli tool, version 1.42\n", ""
        if "connect" in args:
            return 4, "", "Error: Connection activation failed: Secrets were required\n"
        return 0, "", ""

    stub_nmcli(monkeypatch, handler)
    ok, message = wifi.connect("Home", "wrong")
    assert not ok
    assert message == "The password was not accepted."


def test_joining_takes_the_hotspot_down_first(monkeypatch):
    """One radio cannot be an access point and a client on two channels at
    once, and leaving the AP up makes the join fail with a driver-level error
    that says nothing about what the person did."""
    calls = []
    stub_nmcli(monkeypatch, working_nmcli(calls))
    ok, _ = wifi.connect("Home", "correct")
    assert ok

    down = next(i for i, a in enumerate(calls) if a[:2] == ["connection", "down"])
    connect = next(i for i, a in enumerate(calls) if "connect" in a and "device" in a)
    assert down < connect


def test_an_association_with_no_address_is_not_a_join(monkeypatch):
    """nmcli returns 0 for an association it never got a lease for — a profile
    with `ipv4.may-fail`, or a router that answers the handshake and then never
    answers DHCP. A device with no address is not on the network in any sense the
    app can use, and reporting success there is how setup 'worked' and the
    dispenser was never seen again."""
    def handler(args):
        if args[:2] == ["--version"]:
            return 0, "nmcli tool, version 1.42\n", ""
        return 0, "", ""      # nothing ever answers IP4.ADDRESS

    stub_nmcli(monkeypatch, handler)
    ok, message = wifi.connect("Home", "correct")
    assert not ok
    assert "did not hand out an address" in message


def test_an_open_network_is_joined_without_a_password(monkeypatch):
    seen = []
    stub_nmcli(monkeypatch, working_nmcli(seen))
    ok, _ = wifi.connect("CafeWiFi", None)
    assert ok
    joining = next(a for a in seen if "connect" in a and "device" in a)
    assert "password" not in joining


def test_a_hidden_network_is_joined_by_name(monkeypatch):
    """Without `hidden yes` nmcli scans, does not see the name, and reports that
    no such network exists — which is true of the scan and not of the house."""
    seen = []
    stub_nmcli(monkeypatch, working_nmcli(seen))
    ok, _ = wifi.connect("Unlisted", "secret", hidden=True)
    assert ok
    joining = next(a for a in seen if "connect" in a and "device" in a)
    assert joining[joining.index("hidden") + 1] == "yes"


def test_a_missing_network_suggests_the_hidden_path(monkeypatch):
    def handler(args):
        if args[:2] == ["--version"]:
            return 0, "nmcli tool, version 1.42\n", ""
        if "connect" in args:
            return 10, "", "Error: No network with SSID 'Upstairs' found.\n"
        return 0, "", ""

    stub_nmcli(monkeypatch, handler)
    ok, message = wifi.connect("Upstairs", "x")
    assert not ok
    assert "hidden" in message


def test_connect_refuses_when_network_manager_is_missing(monkeypatch):
    monkeypatch.setattr(wifi, "_nmcli", lambda *a, **k: None)
    ok, message = wifi.connect("Home", "x")
    assert not ok and "not available" in message


# ── the passphrase must not reach the journal ───────────────────────────────

def test_the_wifi_password_is_never_written_to_the_log(caplog):
    """The journal on this device is read over somebody's shoulder, pasted into
    a bug report and copied off the SD card. Every join carries the house WiFi
    password as a positional argument, so any log line naming the command line
    is a log line naming the password."""
    line = wifi._redacted(["device", "wifi", "connect", "Home",
                           "password", "hunter2", "ifname", "wlan0"])
    assert "hunter2" not in line
    assert "<hidden>" in line
    assert "Home" in line, "the network name is not the secret and is worth logging"


def test_a_failing_subprocess_does_not_log_the_password(monkeypatch, caplog):
    def explode(*args, **kwargs):
        raise OSError("nmcli fell over")

    monkeypatch.setattr(wifi.subprocess, "run", explode)
    with caplog.at_level("WARNING"):
        assert wifi._nmcli("device", "wifi", "connect", "Home",
                           "password", "hunter2") is None
    assert "hunter2" not in caplog.text
    assert "<hidden>" in caplog.text


# ── cleaning up after a failed join ─────────────────────────────────────────

def test_a_failed_join_profile_is_matched_by_ssid_not_by_name(monkeypatch):
    """nmcli calls the second profile for a network `Home 1`. A
    `connection delete Home` leaves that one behind, autoconnecting forever with
    a password the device has already been told is wrong."""
    deleted = []

    def handler(args):
        if args[:2] == ["--version"]:
            return 0, "nmcli tool, version 1.42\n", ""
        if args[:3] == ["-t", "-f", "NAME,TYPE"]:
            return 0, ("Home:802-11-wireless\n"
                       "Home 1:802-11-wireless\n"
                       "Office:802-11-wireless\n"
                       f"{wifi.AP_CONNECTION}:802-11-wireless\n"), ""
        if "802-11-wireless.ssid" in args:
            name = args[-1]
            ssid = "Home" if name in ("Home", "Home 1") else name
            return 0, f"802-11-wireless.ssid:{ssid}\n", ""
        if args[:2] == ["connection", "delete"]:
            deleted.append(args[2])
            return 0, "", ""
        return 0, "", ""

    stub_nmcli(monkeypatch, handler)
    assert wifi.forget_profiles_for("Home") == 2
    assert deleted == ["Home", "Home 1"]


def test_our_own_hotspot_survives_a_cleanup(monkeypatch):
    """Deleting it would leave the device with no way back in at all."""
    deleted = []

    def handler(args):
        if args[:3] == ["-t", "-f", "NAME,TYPE"]:
            return 0, f"{wifi.AP_CONNECTION}:802-11-wireless\n", ""
        if args[:2] == ["connection", "delete"]:
            deleted.append(args[2])
        return 0, "", ""

    stub_nmcli(monkeypatch, handler)
    assert wifi.forget_profiles_for("SnapCare-V5XH") == 0
    assert deleted == []


# ── standing back while NetworkManager autoconnects ─────────────────────────

def test_waiting_returns_as_soon_as_a_network_is_joined(monkeypatch):
    answers = iter([
        wifi.Status(mode="disconnected"),
        wifi.Status(mode="disconnected"),
        wifi.Status(mode="connected", ssid="Home", address="192.168.1.42"),
    ])
    monkeypatch.setattr(wifi, "status", lambda: next(answers))
    monkeypatch.setattr(wifi.time, "sleep", lambda _s: None)

    state = wifi.wait_until_connected(30, poll=0.01)
    assert state.mode == "connected" and state.ssid == "Home"


def test_waiting_gives_up_and_says_what_it_saw(monkeypatch):
    monkeypatch.setattr(wifi, "status", lambda: wifi.Status(mode="disconnected",
                                                            detail="unavailable"))
    monkeypatch.setattr(wifi.time, "sleep", lambda _s: None)
    state = wifi.wait_until_connected(0, poll=0.01)
    assert state.mode == "disconnected" and state.detail == "unavailable"


def test_waiting_stops_when_the_firmware_is_shutting_down(monkeypatch):
    """A join can be half a minute long, and a device being asked to stop must
    not spend that time waiting for a router."""
    monkeypatch.setattr(wifi, "status", lambda: wifi.Status(mode="disconnected"))
    monkeypatch.setattr(wifi.time, "sleep", lambda _s: None)
    state = wifi.wait_until_connected(600, poll=0.01, should_stop=lambda: True)
    assert state.mode == "disconnected"


# ── the hotspot ─────────────────────────────────────────────────────────────

def test_the_hotspot_profile_never_autoconnects(monkeypatch):
    """Otherwise a device that is perfectly happy on the home network raises a
    competing access point at every boot and drops off the network doing it."""
    from snapcare_dispenser.provisioning import derive_identity

    seen = []

    def handler(args):
        seen.append(args)
        return (0, "nmcli tool, version 1.42\n", "") if args[:2] == ["--version"] else (0, "", "")

    stub_nmcli(monkeypatch, handler)
    monkeypatch.setattr(wifi, "ensure_captive_dns", lambda: True)

    ok, _ = wifi.start_hotspot(derive_identity("a1b2c3d4"))
    assert ok

    add = next(a for a in seen if a[:2] == ["connection", "add"])
    assert add[add.index("autoconnect") + 1] == "no"

    modify = next(a for a in seen if a[:2] == ["connection", "modify"])
    assert modify[modify.index("802-11-wireless.mode") + 1] == "ap"
    # A Pi 3B's radio is 2.4 GHz only; saying so avoids a driver-level failure.
    assert modify[modify.index("802-11-wireless.band") + 1] == "bg"
    # 'shared' is what brings up DHCP and DNS for whoever joins.
    assert modify[modify.index("ipv4.method") + 1] == "shared"
    assert modify[modify.index("wifi-sec.psk") + 1] == derive_identity("a1b2c3d4").passphrase


def test_the_hotspot_profile_is_rebuilt_rather_than_reused(monkeypatch):
    """A profile left half-configured by an interrupted run would otherwise
    produce a hotspot whose passphrase no longer matches the printed label."""
    from snapcare_dispenser.provisioning import derive_identity

    seen = []
    stub_nmcli(monkeypatch, lambda args: (seen.append(args), (0, "", ""))[1])
    monkeypatch.setattr(wifi, "ensure_captive_dns", lambda: True)
    monkeypatch.setattr(wifi, "available", lambda: True)

    wifi.start_hotspot(derive_identity("a1b2c3d4"))
    assert ["connection", "delete", wifi.AP_CONNECTION] in seen


def test_the_captive_dns_rule_is_a_wildcard_to_the_device(monkeypatch, tmp_path):
    """The one line that makes the setup page open by itself."""
    monkeypatch.setattr(wifi, "DNSMASQ_SHARED_DIR", tmp_path / "dnsmasq-shared.d")
    monkeypatch.setattr(wifi, "PORTAL_DNS_CONF",
                        tmp_path / "dnsmasq-shared.d" / "snapcare-portal.conf")
    assert wifi.ensure_captive_dns()
    assert "address=/#/10.42.0.1" in wifi.PORTAL_DNS_CONF.read_text()


def test_an_unwritable_dns_rule_is_reported_not_fatal(monkeypatch, tmp_path):
    """The portal still works if somebody navigates to the address themselves,
    which is why the printed label carries that URL as a second QR."""
    blocked = tmp_path / "not-a-dir"
    blocked.write_text("in the way")
    monkeypatch.setattr(wifi, "DNSMASQ_SHARED_DIR", blocked / "sub")
    monkeypatch.setattr(wifi, "PORTAL_DNS_CONF", blocked / "sub" / "portal.conf")
    assert wifi.ensure_captive_dns() is False
