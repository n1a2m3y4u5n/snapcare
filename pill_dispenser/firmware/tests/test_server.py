"""The HTTP surface: the native API, the app-compatible one, and the pages.

Driven against a real socket rather than by calling handler methods, because
the things most likely to be wrong here are the things a unit test of the
router would skip: status codes, content types, and whether a page the phone
lands on is actually a page.
"""
from __future__ import annotations

import json
import re
import threading
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

import pytest

from snapcare_dispenser import network, provisioning, server, wifi
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


class FakeSupervisor:
    """Stands in for the radio policy: records what was asked, moves no radio."""

    def __init__(self, accept=True, attempt=None):
        self.accept = accept
        self.joins: list[tuple] = []
        self.hotspots = 0
        self.portal_seen = 0
        self._attempt = attempt or {
            "state": "idle", "ssid": "", "detail": "", "address": "",
            "hotspotBack": False, "secondsAgo": None, "busy": False, "managed": True,
        }

    def snapshot(self):
        return dict(self._attempt)

    def note_portal_activity(self):
        self.portal_seen += 1

    def begin_join(self, ssid, password, hidden=False):
        self.joins.append((ssid, password, hidden))
        if not self.accept:
            return False, "already joining; give it a few seconds"
        self._attempt = dict(self._attempt, state="joining", ssid=ssid,
                             detail=f"Joining {ssid}…", busy=True)
        return True, f"Joining {ssid}."

    def raise_hotspot(self):
        self.hotspots += 1
        return True, "SnapCare-V5XH"


@pytest.fixture
def supervisor():
    return FakeSupervisor()


@pytest.fixture
def http(dispenser, offline_wifi, supervisor):
    identity = provisioning.derive_identity("a1b2c3d4")
    httpd = make_server(dispenser, port=0, identity=identity, network=supervisor)
    # A short poll interval: the default 0.5 s is paid on every teardown,
    # and this fixture is built once per test.
    thread = threading.Thread(target=httpd.serve_forever,
                              kwargs={"poll_interval": 0.02}, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{httpd.server_address[1]}"

    class Client:
        base_url = base
        device = dispenser
        network = supervisor

        def get(self, path, host=None):
            request = urllib.request.Request(base + path)
            if host:
                request.add_header("Host", host)
            try:
                with urllib.request.urlopen(request, timeout=10) as response:
                    return response.status, response.headers, response.read().decode()
            except urllib.error.HTTPError as error:
                return error.code, error.headers, error.read().decode()

        def get_json(self, path, host=None):
            status, _, body = self.get(path, host=host)
            return status, json.loads(body)

        def post_json(self, path, payload, host=None):
            headers = {"Content-Type": "application/json"}
            if host:
                headers["Host"] = host
            request = urllib.request.Request(
                base + path, method="POST",
                data=json.dumps(payload).encode(), headers=headers)
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


def test_the_setup_page_only_reaches_for_elements_that_exist(http):
    """No JS engine here, so this checks the one thing a reading cannot.

    Every control on that page is wired by id. A rename leaves
    `getElementById` returning null and the next line throwing, which in a
    browser is silent — the button simply stops working. The last version of this
    page shipped with `password.parentElement.hidden = net.open`, where the
    parent was the whole `<form>`: choosing an open network hid the Join button
    along with the password field, and an open network could not be joined at all.
    """
    _, _, body = http.get("/setup")
    wanted = set(re.findall(r"getElementById\('([^']+)'\)", body))
    # The step list is addressed by a built id — `step('leave', 'done')` — so it
    # is invisible to the pattern above and has to be collected separately.
    wanted |= {"step-" + name for name in re.findall(r"\bstep\('(\w+)'", body)}
    assert len(wanted) > 20, "the setup page has stopped wiring anything up"
    for element_id in sorted(wanted):
        assert f'id="{element_id}"' in body, element_id


def test_the_setup_page_calls_endpoints_this_firmware_serves(http):
    """The page and the router are edited in different files, and a path that
    404s shows up as a setup that hangs rather than as an error."""
    _, _, body = http.get("/setup")
    for path in sorted(set(re.findall(r"fetch\((?:[A-Z_]+ \+ )?'(/[\w/]+)'", body))):
        status, data = http.get_json(path) if "connect" not in path else (200, {"ok": True})
        assert status == 200 and data["ok"], path


def test_the_setup_page_knows_both_addresses_to_look_for(http):
    """While the hotspot is up its DNS resolves every name to the device, so the
    page has to ask both and read the answer out of the body — the address a
    probe succeeded on proves nothing."""
    _, _, body = http.get("/setup")
    assert "http://10.42.0.1" in body
    assert "pilldispenser.local" in body
    assert "/api/wifi/attempt" in body


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
    assert "6V9F5-9QK67" in body                # the pairing code
    assert body.count("<svg") == 4   # join, setup, device, pair


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

def fetch_without_redirects(url, host=None):
    """(status, Location). A phone's probe looks at the answer; it does not follow it."""
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None

    request = urllib.request.Request(url)
    if host:
        request.add_header("Host", host)
    opener = urllib.request.build_opener(NoRedirect)
    try:
        with opener.open(request, timeout=10) as response:
            return response.status, response.headers.get("Location")
    except urllib.error.HTTPError as error:
        return error.code, error.headers.get("Location")


@pytest.mark.parametrize("probe", sorted(server.CAPTIVE_PROBES))
def test_every_captive_probe_redirects_to_setup(http, probe):
    """This redirect is the entire reason the setup page opens by itself.

    A phone joining a network fetches one of these to test for internet. An
    unexpected answer is what makes it conclude it is behind a portal and show
    the page. A 404 is read by some phones as "the network works", and then
    nothing ever appears.
    """
    status, location = fetch_without_redirects(http.base_url + probe)
    assert status == 302
    assert location == "/setup"


def test_a_probe_under_its_own_hostname_is_sent_to_the_devices_address(http):
    """A phone fetches `connectivitycheck.gstatic.com/generate_204`, and some then
    open the portal sheet at *that* origin. A relative redirect would leave the
    setup page there, and every POST it makes would arrive under a name the
    write check refuses — the Join button dead in the one flow that matters
    most."""
    status, location = fetch_without_redirects(http.base_url + "/generate_204",
                                               host="connectivitycheck.gstatic.com")
    assert status == 302
    assert location == "http://10.42.0.1/setup"


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


def test_the_schedule_link_carries_days_and_duration(http):
    """The paper form sheet's path to the device, and the whole reason it exists.

    `/save` has no field for days of the week or course length, and the endpoint
    that does — `POST /api/schedule` — cannot be called from the deployed HTTPS
    app at all (mixed content). So a Mon/Wed/Fri 30-day prescription read
    perfectly off a sheet was shown as a summary and sent nowhere.

    A link can cross that boundary, so this is the same `apply_payload` behind a
    GET.
    """
    from urllib.parse import quote

    payload = "SC1*W*1:0800.2000-021-030"      # Mon/Wed/Fri, 30 days
    status, _headers, body = http.get(f"/schedule?payload={quote(payload, safe='')}")
    assert status == 200
    assert "Schedule accepted" in body

    _status, data = http.get_json("/api/schedule")
    assert data["slots"] == [
        {"tray": 1, "times": ["0800", "2000"], "days": 21, "durationDays": 30}
    ], "the link lost what /save would have lost"


def test_a_bad_schedule_link_changes_nothing_and_says_so(http):
    http.post_json("/api/schedule", {"payload": "SC1*W*1:0800-127-000"})

    status, _headers, body = http.get("/schedule?payload=SC1*W*nonsense")
    assert status == 400
    assert "Not saved" in body

    _status, data = http.get_json("/api/schedule")
    assert data["slots"] == [
        {"tray": 1, "times": ["0800"], "days": 127, "durationDays": 0}
    ], "a refused link must not disturb the schedule already loaded"


def test_the_schedule_link_is_refused_under_somebody_elses_name(http):
    """It changes the schedule, so it is checked like the other mutating GETs.

    Without this, any page a phone on the same WiFi loads could point a hostname
    it controls at the device and replace the prescription.
    """
    from urllib.parse import quote

    payload = quote("SC1*W*2:0900-127-000", safe="")
    status, _headers, _body = http.get(f"/schedule?payload={payload}",
                                       host="dispenser.evil.com")
    assert status == 421

    _status, data = http.get_json("/api/schedule")
    assert not any(s["tray"] == 2 for s in data["slots"])


def test_the_pairing_claim_is_not_readable_cross_origin(http):
    """`/api/identity` hands out the pairing code, and every other credential —
    the device id, the relay access token, the box key — derives from it.

    Reads are not Host-checked, because the captive probes arrive under names
    like `connectivitycheck.gstatic.com`. So the wildcard CORS header was the
    only thing standing between that code and any http:// page a phone on the
    LAN happened to load.
    """
    status, headers, _body = http.get("/api/identity")
    assert status == 200
    assert "Access-Control-Allow-Origin" not in headers

    # Everything else keeps it, or developing against a real device from
    # localhost:3000 stops working.
    status, headers, _body = http.get("/api/status")
    assert status == 200
    assert headers.get("Access-Control-Allow-Origin") == "*"


def test_release_opens_the_tray_and_reports_what_it_opened(http, clock):
    http.post_json("/api/schedule", {"payload": "SC1*W*1:0800-127-000"})
    clock.set(datetime(2026, 7, 29, 8, 0))
    http.device.tick()

    _status, data = http.get_json("/api/status")
    waiting = data["device"]["awaitingRelease"]
    assert [(w["tray"], w["time"]) for w in waiting] == [(1, "0800")]
    # Offset-aware on the wire. The app is in the carer's timezone, not the
    # device's, and a naive stamp there is a release button that appears or
    # disappears by however far apart the two are.
    from datetime import datetime as _dt
    assert _dt.fromisoformat(waiting[0]["dueAt"]).utcoffset() is not None
    assert (_dt.fromisoformat(waiting[0]["expiresAt"])
            - _dt.fromisoformat(waiting[0]["dueAt"])).total_seconds() == 3600

    status, data = http.post_json("/api/release", {})
    assert status == 200 and data["ok"]
    assert [r["tray"] for r in data["released"]] == [1]
    assert data["released"][0]["reason"] == "released"
    assert data["awaitingRelease"] == []


def test_release_with_nothing_waiting_is_ok_and_empty(http):
    """A notification tapped an hour late lands here. It is not an error and it
    must not read as one — telling somebody their dispenser is broken when it is
    behaving correctly is how they stop trusting the screen that matters."""
    status, data = http.post_json("/api/release", {})
    assert status == 200 and data["ok"]
    assert data["released"] == []


def test_release_can_name_one_dose(http, clock):
    http.post_json("/api/schedule",
                   {"payload": "SC1*W*1:0800-127-000/2:0800-127-000"})
    clock.set(datetime(2026, 7, 29, 8, 0))
    http.device.tick()

    status, data = http.post_json("/api/release", {"tray": 2, "at": "0800"})
    assert status == 200
    assert [r["tray"] for r in data["released"]] == [2]
    assert [w["tray"] for w in data["awaitingRelease"]] == [1]


def test_the_release_link_works_for_a_page_that_cannot_fetch(http, clock):
    """An HTTPS app cannot `fetch()` an HTTP device, so the release button is a
    link the person taps. If this shape breaks, the one control the device
    depends on works in development and fails on the deployed app."""
    http.post_json("/api/schedule", {"payload": "SC1*W*1:0800-127-000"})
    clock.set(datetime(2026, 7, 29, 8, 0))
    http.device.tick()

    status, _headers, body = http.get("/release")
    assert status == 200 and "Released tray 1" in body
    assert http.device.servos.drops.get(1, 0) == 1


def test_dismiss_silences_but_leaves_the_dose_releasable(http, clock):
    http.post_json("/api/schedule", {"payload": "SC1*W*1:0800-127-000"})
    clock.set(datetime(2026, 7, 29, 8, 0))
    http.device.tick()

    status, data = http.post_json("/api/dismiss", {})
    assert status == 200 and data["hadAlert"] is True
    assert [w["tray"] for w in data["awaitingRelease"]] == [1], "silenced, not cancelled"

    _status, data = http.post_json("/api/release", {})
    assert [r["tray"] for r in data["released"]] == [1]


# ── WiFi ────────────────────────────────────────────────────────────────────

def test_scanning_lists_networks(http):
    status, data = http.get_json("/api/wifi/scan")
    assert status == 200
    assert [n["ssid"] for n in data["networks"]] == ["Home", "Guest:2G"]
    assert data["networks"][1]["open"] is True


def test_connecting_without_a_network_named_is_refused(http):
    status, data = http.post_json("/api/wifi/connect", {"password": "x"})
    assert status == 400 and not data["ok"]


def test_a_join_is_accepted_rather_than_waited_for(http):
    """202, not 200. The device is still an access point when this answer is
    written — joining the house network is what takes the hotspot, and the phone's
    only route to the device, down. Answering afterwards means never answering,
    and that is how a mistyped password used to look like a finished setup."""
    status, data = http.post_json("/api/wifi/connect",
                                  {"ssid": "Home", "password": "hunter2"})
    assert status == 202
    assert data["ok"] and data["attempt"]["state"] == "joining"
    assert http.network.joins == [("Home", "hunter2", False)]
    assert data["deviceUrl"].endswith("pilldispenser.local/")


def test_an_open_network_is_joined_with_no_password(http):
    """The page sends an empty string for a network that needs none; it has to
    reach the mechanism as "no password", not as a password of ''."""
    http.post_json("/api/wifi/connect", {"ssid": "CafeWiFi", "password": ""})
    assert http.network.joins == [("CafeWiFi", None, False)]


def test_a_hidden_network_is_passed_through(http):
    http.post_json("/api/wifi/connect",
                   {"ssid": "Unlisted", "password": "x", "hidden": True})
    assert http.network.joins == [("Unlisted", "x", True)]


def test_a_hidden_flag_sent_as_a_form_field_is_read_as_a_checkbox(http):
    """A form-encoded body can only send strings, and every non-empty string is
    truthy — so `hidden=false` would turn the flag on."""
    http.post_json("/api/wifi/connect",
                   {"ssid": "Home", "password": "x", "hidden": "false"})
    assert http.network.joins == [("Home", "x", False)]


def test_a_second_join_while_one_is_running_is_a_conflict(http, supervisor):
    supervisor.accept = False
    status, data = http.post_json("/api/wifi/connect", {"ssid": "Home", "password": "x"})
    assert status == 409 and not data["ok"]
    assert "already" in data["message"]


def test_the_attempt_endpoint_is_how_the_page_follows_a_join(http, supervisor):
    """The request that started the join cannot be answered twice, and the page
    that sent it may not exist by the time there is anything to say."""
    supervisor._attempt = {
        "state": "failed", "ssid": "Home",
        "detail": "The password was not accepted.", "address": "",
        "hotspotBack": True, "secondsAgo": 4, "busy": False, "managed": True,
    }
    status, data = http.get_json("/api/wifi/attempt")
    assert status == 200
    assert data["attempt"]["state"] == "failed"
    assert data["attempt"]["detail"] == "The password was not accepted."
    assert data["attempt"]["hotspotBack"] is True
    # And the same record on the general status endpoint, so the app sees it too.
    assert http.get_json("/api/status")[1]["attempt"]["state"] == "failed"


def test_the_hotspot_can_be_asked_for_by_hand(http):
    """The way back in when the network the device is on is one nobody controls
    any more — a changed password, a moved house."""
    status, data = http.post_json("/api/wifi/hotspot", {})
    assert status == 200 and data["ok"]
    assert data["ssid"] == "SnapCare-V5XH"
    assert http.network.hotspots == 1


def test_a_server_built_without_a_supervisor_refuses_honestly(dispenser, offline_wifi):
    """`make run` on a laptop, and anything constructing a server directly. A
    stand-in that manages nothing beats every endpoint growing its own branch."""
    router = server.Router(dispenser, provisioning.derive_identity("a1b2c3d4"))
    accepted, message = router.network.begin_join("Home", "x")
    assert accepted is False and "off" in message
    assert router.network.snapshot()["managed"] is False


# ── who is allowed to change things ─────────────────────────────────────────

def test_a_page_on_a_name_we_do_not_answer_to_cannot_drive_the_device(http):
    """DNS rebinding. Point a hostname you own at the dispenser's address and any
    browser on that WiFi will POST to it for you — no CORS involved, because
    dropping eight trays into a cup does not require reading the answer."""
    status, data = http.post_json("/api/drop", {"tray": 1}, host="dispenser.example.com")
    assert status == 421 and not data["ok"]
    assert http.device.store.read_events() == [], "nothing may have been dropped"


def test_the_mutating_links_the_app_builds_are_checked_too(http):
    """`/dropout?tray=3` opens a tray on a GET. An image tag is enough to fire
    it, so the same rule applies."""
    status, _, _ = http.get("/dropout?tray=3", host="dispenser.example.com")
    assert status == 421
    assert http.device.store.read_events() == []


@pytest.mark.parametrize("host", [
    "pilldispenser.local", "pilldispenser", "pilldispenser.lan", "localhost",
    "10.42.0.1", "192.168.1.42", "127.0.0.1:8080", "[::1]:80",
])
def test_the_names_the_device_is_actually_reached_by_are_allowed(http, host):
    status, data = http.post_json("/api/dismiss", {}, host=host)
    assert status == 200 and data["ok"], host


@pytest.mark.parametrize("host", [
    "evil.example.com", "pilldispenser.evil.com", "pilldispenser.local.evil.com",
])
def test_a_name_that_only_starts_with_ours_is_still_refused(http, host):
    status, _ = http.post_json("/api/dismiss", {}, host=host)
    assert status == 421, host


def test_a_router_domain_can_be_allowed_by_configuration(dispenser, offline_wifi,
                                                         monkeypatch):
    """Some home routers publish DHCP clients under a domain of their own —
    `pilldispenser.fritz.box`. The rule cannot know those, so there is a knob."""
    from snapcare_dispenser import config
    assert not server._is_ours("pilldispenser.fritz.box")
    monkeypatch.setattr(config, "EXTRA_HTTP_HOSTS", frozenset({"pilldispenser.fritz.box"}))
    assert server._is_ours("pilldispenser.fritz.box")


def test_reads_are_not_name_checked(http):
    """The captive probes arrive addressed to `connectivitycheck.gstatic.com`,
    and a name check on a GET would break the one flow that has to work."""
    status, _ = fetch_without_redirects(http.base_url + "/generate_204",
                                        host="connectivitycheck.gstatic.com")
    assert status == 302
    status, data = http.get_json("/api/status", host="anything.example.com")
    assert status == 200 and data["ok"]


def test_a_refused_name_does_not_poison_the_connection(http):
    """The body is refused unread, and on a keep-alive connection an unread body
    is parsed as the start of the next request."""
    http.post_json("/api/schedule", {"payload": "SC1*W*1:0800-127-000"},
                   host="evil.example.com")
    assert http.get_json("/api/status")[1]["ok"]
    assert http.get_json("/api/schedule")[1]["payload"] == ""


# ── keeping the setup page alive ────────────────────────────────────────────

def test_using_the_setup_page_holds_off_the_unattended_retry(http):
    """Otherwise the device is free to take its own hotspot down in the middle of
    somebody typing their WiFi password."""
    before = http.network.portal_seen
    http.get("/setup")
    http.get_json("/api/wifi/scan")
    assert http.network.portal_seen == before + 2


def test_a_captive_probe_is_not_somebody_using_the_page(http):
    """A phone that stays joined to the setup network re-fetches one of these
    every half minute for as long as it is connected. Counting them would mean a
    device whose hotspot somebody once joined never retries the house network
    again — the exact stranding this all exists to fix."""
    before = http.network.portal_seen
    for probe in ("/generate_204", "/hotspot-detect.html"):
        # Without following the redirect, which is what the phone's probe does:
        # it looks at the answer, concludes there is a portal, and shows a sheet.
        # Loading the page in that sheet is a person, and *is* counted.
        fetch_without_redirects(http.base_url + probe)
    assert http.network.portal_seen == before


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
