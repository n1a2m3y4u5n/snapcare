"""The HTTP surface: the native API, the app-compatible one, and the pages.

Driven against a real socket rather than by calling handler methods, because
the things most likely to be wrong here are the things a unit test of the
router would skip: status codes, content types, and whether a page the phone
lands on is actually a page.
"""
from __future__ import annotations

import json
import threading
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

import pytest

from snapcare_dispenser import provisioning, server, wifi
from snapcare_dispenser.server import make_server


@pytest.fixture
def offline_wifi(monkeypatch):
    """No nmcli. The suite must not depend on the laptop's own network."""
    monkeypatch.setattr(wifi, "available", lambda: False)
    monkeypatch.setattr(wifi, "status",
                        lambda: wifi.Status(mode="connected", ssid="Test", address="10.0.0.5"))
    monkeypatch.setattr(wifi, "scan", lambda rescan=True: [
        wifi.Network(ssid="Home", signal=88, security="WPA2", saved=False),
        wifi.Network(ssid="Guest:2G", signal=40, security="", saved=False),
    ])


@pytest.fixture
def http(dispenser, offline_wifi):
    identity = provisioning.derive_identity("a1b2c3d4")
    httpd = make_server(dispenser, port=0, identity=identity)
    # A short poll interval: the default 0.5 s is paid on every teardown,
    # and this fixture is built once per test.
    thread = threading.Thread(target=httpd.serve_forever,
                              kwargs={"poll_interval": 0.02}, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{httpd.server_address[1]}"

    class Client:
        base_url = base
        device = dispenser

        def get(self, path):
            try:
                with urllib.request.urlopen(base + path, timeout=10) as response:
                    return response.status, response.headers, response.read().decode()
            except urllib.error.HTTPError as error:
                return error.code, error.headers, error.read().decode()

        def get_json(self, path):
            status, _, body = self.get(path)
            return status, json.loads(body)

        def post_json(self, path, payload):
            request = urllib.request.Request(
                base + path, method="POST",
                data=json.dumps(payload).encode(),
                headers={"Content-Type": "application/json"})
            try:
                with urllib.request.urlopen(request, timeout=10) as response:
                    return response.status, json.loads(response.read().decode())
            except urllib.error.HTTPError as error:
                return error.code, json.loads(error.read().decode())

    yield Client()
    httpd.shutdown()
    httpd.server_close()


# ── status and pages ────────────────────────────────────────────────────────

def test_status_reports_the_whole_device(http):
    status, data = http.get_json("/api/status")
    assert status == 200 and data["ok"]
    assert data["device"]["trays"] == list(range(1, 9))
    assert data["device"]["servoBackend"] == "mock"
    assert data["identity"]["ssid"] == "SnapCare-V5XH"
    assert data["urls"]["device"].endswith("pilldispenser.local/")


def test_the_console_is_served_when_the_device_is_on_a_network(http):
    status, headers, body = http.get("/")
    assert status == 200
    assert headers["Content-Type"].startswith("text/html")
    assert "SnapCare dispenser" in body


def test_the_setup_page_is_served_when_it_is_not(http, monkeypatch):
    """Whoever is looking joined the setup hotspot to configure WiFi. Serving
    the tray console would be correct and useless."""
    monkeypatch.setattr(wifi, "status", lambda: wifi.Status(mode="hotspot"))
    status, _, body = http.get("/")
    assert status == 200
    assert "Set up the pill dispenser" in body


def test_the_pages_load_their_stylesheet_and_nothing_else(http):
    for path in ("/", "/setup", "/label"):
        _, _, body = http.get(path)
        assert 'href="/style.css"' in body
        # A device on an isolated network cannot reach a CDN, and a page that
        # waits on one renders blank on the only screen that matters.
        assert "//fonts." not in body and "cdn." not in body
        assert "<script src=" not in body

    status, headers, _ = http.get("/style.css")
    assert status == 200 and headers["Content-Type"].startswith("text/css")


def test_the_label_page_carries_the_permanent_credentials(http):
    status, _, body = http.get("/label")
    assert status == 200
    assert "SnapCare-V5XH" in body
    assert "3k8krnp8pv8s" in body
    assert body.count("<svg") == 3   # join, setup, device


def test_the_qr_endpoints_return_svg(http):
    for path in ("/qr/wifi.svg", "/qr/setup.svg", "/qr/device.svg"):
        status, headers, body = http.get(path)
        assert status == 200
        assert headers["Content-Type"].startswith("image/svg+xml")
        assert body.startswith("<svg")


def test_an_unknown_endpoint_is_a_404(http):
    status, data = http.get_json("/api/nope")
    assert status == 404 and not data["ok"]


# ── the captive portal ──────────────────────────────────────────────────────

@pytest.mark.parametrize("probe", sorted(server.CAPTIVE_PROBES))
def test_every_captive_probe_redirects_to_setup(http, probe):
    """This redirect is the entire reason the setup page opens by itself.

    A phone joining a network fetches one of these to test for internet. An
    unexpected answer is what makes it conclude it is behind a portal and show
    the page. A 404 is read by some phones as "the network works", and then
    nothing ever appears.
    """
    request = urllib.request.Request(http.base_url + probe)

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None

    opener = urllib.request.build_opener(NoRedirect)
    try:
        with opener.open(request, timeout=10) as response:
            status, location = response.status, response.headers.get("Location")
    except urllib.error.HTTPError as error:
        status, location = error.code, error.headers.get("Location")

    assert status == 302
    assert location == "/setup"


# ── the native schedule API ─────────────────────────────────────────────────

def test_posting_a_weekly_payload(http):
    status, data = http.post_json("/api/schedule",
                                  {"payload": "SC1*W*1:0800.2000-127-030/3:1900-021-000"})
    assert status == 200 and data["ok"]

    status, data = http.get_json("/api/schedule")
    assert data["payload"] == "SC1*W*1:0800.2000-127-030/3:1900-021-000"
    assert [s["tray"] for s in data["slots"]] == [1, 3]


def test_posting_slots_as_json(http):
    status, data = http.post_json("/api/schedule", {"slots": [
        {"tray": 2, "times": ["0900", "2100"], "days": 21, "durationDays": 14},
    ]})
    assert status == 200 and data["ok"]
    assert data["payload"] == "SC1*W*2:0900.2100-021-014"


def test_an_empty_slot_list_clears_the_device(http):
    http.post_json("/api/schedule", {"payload": "SC1*W*1:0800-127-000"})
    status, data = http.post_json("/api/schedule", {"slots": []})
    assert status == 200 and data["ok"]
    _, data = http.get_json("/api/schedule")
    assert data["slots"] == []


@pytest.mark.parametrize("body", [
    {"payload": "SC1*W*1:9999-127-000"},
    {"payload": "not an sc1 code"},
    {"slots": [{"tray": 99, "times": ["0800"]}]},
    {"slots": "nonsense"},
    {},
])
def test_a_bad_schedule_is_a_400_and_not_a_crash(http, body):
    status, data = http.post_json("/api/schedule", body)
    assert status == 400 and not data["ok"]


def test_a_schedule_reports_what_the_s_form_would_lose(http):
    http.post_json("/api/schedule", {"payload": "SC1*W*1:0800-021-030"})
    _, data = http.get_json("/api/schedule")
    assert any("days of the week" in note for note in data["notes"])


# ── dropping and confirming ─────────────────────────────────────────────────

def test_dropping_a_tray(http):
    status, data = http.post_json("/api/drop", {"tray": 4})
    assert status == 200 and data["ok"]
    assert data["event"]["tray"] == 4 and data["event"]["reason"] == "manual"
    assert http.device.servos.backend.angles(http.device.servos.pins[4]) == [2500, 500, 0]


@pytest.mark.parametrize("body", [{"tray": 0}, {"tray": 99}, {"tray": "x"}, {}])
def test_dropping_a_tray_that_is_not_there(http, body):
    status, data = http.post_json("/api/drop", body)
    assert status == 400 and not data["ok"]


def test_the_event_log_is_readable(http):
    http.post_json("/api/drop", {"tray": 1})
    http.post_json("/api/drop", {"tray": 2})
    status, data = http.get_json("/api/events?limit=10")
    assert status == 200
    assert [e["tray"] for e in data["events"]] == [2, 1]
    assert data["events"][0]["sc1"].startswith("SC1*E*2*")


def test_setting_the_clock_from_a_browser_time(http, clock):
    """The offline path to a trustworthy clock: the device may have no NTP, and
    the browser reading the page always knows the time."""
    clock.distrust()
    assert http.get_json("/api/status")[1]["device"]["dispensing"] is False

    status, data = http.post_json("/api/clock", {"iso": "2026-07-29T09:15:00"})
    assert status == 200 and data["ok"], data
    assert http.get_json("/api/status")[1]["device"]["dispensing"] is True


def test_setting_the_clock_from_an_sc1_code(http, clock):
    clock.distrust()
    status, data = http.post_json("/api/clock", {"payload": "SC1*C*202607290915*2"})
    assert status == 200 and data["ok"]


def test_a_clock_code_with_the_wrong_weekday_is_refused(http):
    status, data = http.post_json("/api/clock", {"payload": "SC1*C*202607290915*3"})
    assert status == 400 and not data["ok"]


def test_confirm_and_dismiss(http, clock):
    http.post_json("/api/schedule", {"payload": "SC1*W*1:0800-127-000"})
    clock.set(datetime(2026, 7, 29, 8, 0))
    http.device.tick()

    status, data = http.post_json("/api/confirm", {})
    assert status == 200 and data["ok"] and data["event"]["confirmed"]

    status, data = http.post_json("/api/dismiss", {})
    assert status == 200 and data["hadAlert"] is False


# ── WiFi ────────────────────────────────────────────────────────────────────

def test_scanning_lists_networks(http):
    status, data = http.get_json("/api/wifi/scan")
    assert status == 200
    assert [n["ssid"] for n in data["networks"]] == ["Home", "Guest:2G"]
    assert data["networks"][1]["open"] is True


def test_connecting_without_a_network_named_is_refused(http):
    status, data = http.post_json("/api/wifi/connect", {"password": "x"})
    assert status == 400 and not data["ok"]


def test_the_identity_endpoint_gives_the_label_values(http):
    status, data = http.get_json("/api/identity")
    assert status == 200
    assert data["ssid"] == "SnapCare-V5XH"
    assert data["wifiQr"].startswith("WIFI:T:WPA;S:SnapCare-V5XH;")


# ── the app-compatibility layer ─────────────────────────────────────────────
#
# These are the exact URLs `lib/hardware/dispenser.ts` builds. That file is not
# ours to edit, so the shapes below are a contract, not a choice.

def compat_save_url(plan: list[dict]) -> str:
    """Rebuild what `saveUrl` in the web app produces, parameter for parameter."""
    query = {"trayinst": str(max(0, len(plan) - 1))}
    for entry in plan:
        tray = entry["tray"]
        query[f"trayNames{tray}"] = entry["name"]
        query[f"time{tray}"] = entry["time"]
        query[f"color{tray}"] = str(entry["color"])
        query[f"trayAlertEna{tray}"] = "on"
    return "/save?" + urllib.parse.urlencode(query)


def test_the_apps_save_link_loads_a_schedule(http):
    url = compat_save_url([
        {"tray": 1, "name": "Metformin", "time": "08:00", "color": 2},
        {"tray": 2, "name": "Ramipril", "time": "20:00", "color": 2},
    ])
    status, headers, body = http.get(url)
    assert status == 200
    # A person arrives here by top-level navigation from the app, so this has
    # to be a readable page, not a JSON body.
    assert headers["Content-Type"].startswith("text/html")
    assert "Schedule saved" in body
    assert "Metformin" in body

    _, data = http.get_json("/api/schedule")
    assert data["payload"] == "SC1*W*1:0800-127-000/2:2000-127-000"


def test_the_save_page_says_what_the_link_format_cannot_carry(http):
    """It has no field for days of the week or for a course length, so every
    tray it defines runs daily and indefinitely. Showing a tick and saying
    nothing would let a Mon/Wed/Fri prescription dispense seven days a week."""
    _, _, body = http.get(compat_save_url([
        {"tray": 1, "name": "Warfarin", "time": "18:00", "color": 3}]))
    assert "every day" in body and "indefinitely" in body
    assert "SC1*W*" in body


def test_a_tray_without_its_alert_enabled_is_left_out(http):
    """`trayAlertEnaN` is an HTML checkbox: present when on, absent when off."""
    status, _, body = http.get("/save?time1=08:00&trayNames1=A&color1=2")
    assert status == 400
    assert "named no trays" in body


def test_a_save_link_with_an_impossible_time_changes_nothing(http):
    http.post_json("/api/schedule", {"payload": "SC1*W*5:1200-127-000"})
    status, _, body = http.get("/save?time1=99:99&trayAlertEna1=on&trayNames1=A")
    assert status == 400
    assert "not a" in body
    _, data = http.get_json("/api/schedule")
    assert data["payload"] == "SC1*W*5:1200-127-000", "the loaded plan must survive"


def test_the_apps_dropout_link_drops_a_tray(http):
    status, headers, body = http.get("/dropout?tray=3")
    assert status == 200
    assert headers["Content-Type"].startswith("text/html")
    assert "Tray 3 dropped" in body
    assert http.device.servos.backend.angles(http.device.servos.pins[3]) == [2500, 500, 0]


@pytest.mark.parametrize("query", ["", "?tray=", "?tray=x", "?tray=99"])
def test_a_bad_dropout_link_is_a_readable_refusal(http, query):
    status, headers, body = http.get("/dropout" + query)
    assert status == 400
    assert headers["Content-Type"].startswith("text/html")
    assert "Nothing dropped" in body


def test_the_apps_dismiss_link(http):
    status, _, body = http.get("/dismiss")
    assert status == 200
    assert "Nothing was alerting" in body


# ── robustness ──────────────────────────────────────────────────────────────

def test_the_api_allows_cross_origin_reads(http):
    """So the web app can be developed against a real device from localhost."""
    _, headers, _ = http.get("/api/status")
    assert headers["Access-Control-Allow-Origin"] == "*"


def test_an_oversized_body_does_not_take_the_device_down(http):
    request = urllib.request.Request(
        http.base_url + "/api/schedule", method="POST",
        data=json.dumps({"payload": "SC1*W*" + "1" * (server.MAX_BODY + 10)}).encode(),
        headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            code = response.status
    except urllib.error.HTTPError as error:
        code = error.code
    assert code == 413
    # Still answering afterwards is the other half of the assertion: the
    # refused body must not be left in the socket to be read as the next
    # request on a keep-alive connection.
    assert http.get_json("/api/status")[1]["ok"]


def test_a_malformed_body_is_a_400_not_a_stack_trace(http):
    request = urllib.request.Request(
        http.base_url + "/api/schedule", method="POST",
        data=b"{{{not json",
        headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            code = response.status
    except urllib.error.HTTPError as error:
        code = error.code
    assert code == 400


def test_a_form_encoded_body_also_works(http):
    """A curl one-liner or an HTML form should reach the same place the app does."""
    request = urllib.request.Request(
        http.base_url + "/api/schedule", method="POST",
        data=urllib.parse.urlencode({"payload": "SC1*W*6:0730-127-000"}).encode(),
        headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(request, timeout=10) as response:
        assert response.status == 200
    _, data = http.get_json("/api/schedule")
    assert data["payload"] == "SC1*W*6:0730-127-000"


def test_a_schedule_can_arrive_by_navigation_with_days_and_duration(http):
    """The web app is served over HTTPS and the device speaks HTTP, so the
    browser blocks every fetch() between them. The one thing it does not block
    is a top-level navigation — a GET. POST /api/schedule is therefore
    unreachable from the deployed app, and /save, which was reachable, has no
    field for days of the week or course length.

    Without this route a Mon/Wed/Fri prescription dispenses seven days a week
    and a 30-day course runs until the hopper is empty."""
    payload = "SC1*W*1:0800-021-030"          # Mon/Wed/Fri, thirty days
    status, headers, body = http.get(f"/api/schedule?payload={payload.replace('*', '%2A')}")
    assert status == 200
    # Arrived by navigation, so it must be a page a person can read.
    assert headers["Content-Type"].startswith("text/html")
    assert "Schedule saved" in body

    _, data = http.get_json("/api/schedule")
    assert data["payload"] == payload


def test_a_schedule_link_that_is_malformed_changes_nothing(http):
    _, before = http.get_json("/api/schedule")
    status, _, body = http.get("/api/schedule?payload=SC1%2AW%2Anonsense")
    assert status == 400
    assert "Not saved" in body
    _, after = http.get_json("/api/schedule")
    assert after["payload"] == before["payload"]
