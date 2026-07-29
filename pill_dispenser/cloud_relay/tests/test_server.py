"""The relay's HTTP surface, over a real socket.

A real server on a real port rather than the handler called directly. Most of
what can go wrong in `http.server` is in the plumbing — an unread body on a
keep-alive connection, a status with no content length, a header set after
`end_headers` — and none of it is reachable by calling the routing function.
"""
from __future__ import annotations

import json
import threading
import time
import urllib.error
import urllib.request

import pytest

from conftest import DEVICE, OTHER, TOKEN, envelope

from snapcare_relay import config
from snapcare_relay.mailbox import Mailboxes
from snapcare_relay.server import make_server


class Client:
    def __init__(self, base: str):
        self.base = base

    def __call__(self, method, path, body=None, token=TOKEN, timeout=30):
        request = urllib.request.Request(self.base + path, method=method)
        if token is not None:
            request.add_header("Authorization", f"Bearer {token}")
        data = None
        if body is not None:
            raw = body if isinstance(body, (bytes, str)) else json.dumps(body)
            data = raw.encode() if isinstance(raw, str) else raw
            request.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(request, data, timeout=timeout) as response:
                return response.status, dict(response.headers), _decode(response.read())
        except urllib.error.HTTPError as exc:
            return exc.code, dict(exc.headers), _decode(exc.read())


def _decode(raw: bytes):
    """JSON when it is JSON, text when it is a page, None when it is empty."""
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return raw.decode("utf-8", errors="replace")


@pytest.fixture
def http(tmp_path):
    server = make_server(Mailboxes(tmp_path / "relay-data"), port=0)
    # The poll interval is what `shutdown` waits on, so the default of half a
    # second is half a second of teardown on every test in this file. It has
    # nothing to do with request latency.
    thread = threading.Thread(target=lambda: server.serve_forever(poll_interval=0.02),
                              daemon=True)
    thread.start()
    try:
        yield Client(f"http://127.0.0.1:{server.server_address[1]}")
    finally:
        server.shutdown()
        server.server_close()


# ── the shape of it ─────────────────────────────────────────────────────────

def test_health_needs_no_token(http):
    status, _, body = http("GET", "/v1/health", token=None)
    assert status == 200 and body["ok"] is True
    assert body["service"] == "snapcare-relay"


def test_a_schedule_goes_in_and_comes_back(http):
    status, _, body = http("PUT", f"/v1/devices/{DEVICE}/desired",
                           {"envelope": envelope(1)})
    assert status == 200 and body["rev"] == 1

    status, _, body = http("GET", f"/v1/devices/{DEVICE}/desired?since=0")
    assert status == 200
    assert body["envelope"]["ct"] == envelope(1)["ct"]


def test_an_envelope_may_be_sent_bare_or_wrapped(http):
    """The firmware wraps it; a curl one-liner will not. Both are obvious
    readings of the endpoint, so both work."""
    assert http("PUT", f"/v1/devices/{DEVICE}/desired", envelope(1))[0] == 200
    assert http("PUT", f"/v1/devices/{DEVICE}/desired",
                {"envelope": envelope(2)})[0] == 200


def test_nothing_new_is_204_with_no_body(http):
    """One answer meaning 'you are up to date', with nothing to parse — the
    client's handling of it is a single branch."""
    http("PUT", f"/v1/devices/{DEVICE}/desired", envelope(3))
    status, headers, body = http("GET", f"/v1/devices/{DEVICE}/desired?since=3")
    assert status == 204
    assert body is None
    assert headers.get("Content-Length") == "0"


def test_a_stale_revision_is_409_with_the_current_one(http):
    http("PUT", f"/v1/devices/{DEVICE}/desired", envelope(4))
    status, _, body = http("PUT", f"/v1/devices/{DEVICE}/desired", envelope(4))
    assert status == 409
    assert "4" in body["error"]


def test_the_metadata_endpoint_carries_no_ciphertext(http):
    """It is what a status screen polls. There is no reason for it to move a
    payload around, and every reason not to."""
    http("PUT", f"/v1/devices/{DEVICE}/reported", envelope(1))
    status, _, body = http("GET", f"/v1/devices/{DEVICE}")
    assert status == 200
    assert body["reported"]["rev"] == 1
    assert "ct" not in json.dumps(body)


def test_a_device_can_be_unpaired(http):
    http("PUT", f"/v1/devices/{DEVICE}/desired", envelope(1))
    assert http("DELETE", f"/v1/devices/{DEVICE}")[0] == 200
    assert http("GET", f"/v1/devices/{DEVICE}")[0] == 404


# ── authentication ──────────────────────────────────────────────────────────

def test_a_read_may_not_create_a_mailbox(http):
    assert http("GET", f"/v1/devices/{DEVICE}/desired")[0] == 404
    assert http("GET", f"/v1/devices/{DEVICE}")[0] == 404


def test_the_wrong_token_is_refused(http):
    http("PUT", f"/v1/devices/{DEVICE}/desired", envelope(1))
    assert http("GET", f"/v1/devices/{DEVICE}/desired", token="wrong")[0] == 403
    assert http("PUT", f"/v1/devices/{DEVICE}/desired",
                envelope(2), token="wrong")[0] == 403


def test_no_token_at_all_is_refused(http):
    assert http("PUT", f"/v1/devices/{DEVICE}/desired",
                envelope(1), token=None)[0] == 401


def test_one_devices_token_does_not_open_another(http):
    http("PUT", f"/v1/devices/{DEVICE}/desired", envelope(1))
    http("PUT", f"/v1/devices/{OTHER}/desired", envelope(1), token="a-different-token")
    assert http("GET", f"/v1/devices/{OTHER}/desired")[0] == 403


@pytest.mark.parametrize("path", [
    "/v1/devices/../../etc/passwd/desired",
    "/v1/devices/short/desired",
    "/v1/devices/" + "x" * 80 + "/desired",
])
def test_an_id_that_is_not_the_right_shape_never_reaches_the_disk(http, path):
    assert http("PUT", path, envelope(1))[0] == 404


# ── being handed rubbish ────────────────────────────────────────────────────

def test_a_body_that_is_not_json_is_a_400(http):
    assert http("PUT", f"/v1/devices/{DEVICE}/desired", "{ not json")[0] == 400


def test_an_oversized_body_is_refused_unread(http, monkeypatch):
    """And the connection is closed. This is HTTP/1.1 with keep-alive, so a
    body left in the socket is parsed as the start of the next request — which
    gives nonsense answers to correct requests, a far more confusing symptom
    than the refusal it came from."""
    monkeypatch.setattr(config, "MAX_BODY", 200)
    status, _, _ = http("PUT", f"/v1/devices/{DEVICE}/desired",
                        {"envelope": envelope(1, "x" * 500)})
    assert status == 413
    # The next request on a fresh connection is unaffected.
    assert http("PUT", f"/v1/devices/{DEVICE}/desired", envelope(1))[0] == 200


def test_an_unknown_endpoint_is_404_not_a_stack_trace(http):
    assert http("GET", "/v1/nothing/here")[0] == 404


def test_the_wrong_method_is_refused(http):
    http("PUT", f"/v1/devices/{DEVICE}/desired", envelope(1))
    assert http("DELETE", f"/v1/devices/{DEVICE}/desired")[0] == 405


def test_a_slot_that_does_not_exist_is_not_a_slot(http):
    assert http("PUT", f"/v1/devices/{DEVICE}/wishful", envelope(1))[0] == 404


# ── the long poll, over a socket ────────────────────────────────────────────

def test_a_held_poll_returns_the_moment_a_schedule_is_written(http):
    http("PUT", f"/v1/devices/{DEVICE}/reported", envelope(1))
    answer = {}

    def reader():
        answer["got"] = http("GET", f"/v1/devices/{DEVICE}/desired?since=0&wait=10")

    thread = threading.Thread(target=reader)
    thread.start()
    time.sleep(0.3)

    started = time.monotonic()
    http("PUT", f"/v1/devices/{DEVICE}/desired", envelope(1, "arrived"))
    thread.join(timeout=15)

    assert answer["got"][0] == 200
    assert answer["got"][2]["envelope"]["ct"].endswith("arrived")
    assert time.monotonic() - started < 2.0


def test_a_hold_is_capped_at_the_relays_ceiling(http, monkeypatch):
    """The parameter arrives from the network. Without the cap, one client
    asking for a hold of a million seconds is a thread parked forever."""
    monkeypatch.setattr(config, "MAX_HOLD_S", 1)
    http("PUT", f"/v1/devices/{DEVICE}/reported", envelope(1))

    started = time.monotonic()
    status, _, _ = http("GET", f"/v1/devices/{DEVICE}/desired?since=0&wait=9999")
    assert status == 204
    assert time.monotonic() - started < 5.0


@pytest.mark.parametrize("query", ["?since=abc&wait=xyz", "?since=-4&wait=-9", ""])
def test_nonsense_query_values_fall_back_rather_than_failing(http, query):
    http("PUT", f"/v1/devices/{DEVICE}/desired", envelope(1))
    status, _, _ = http("GET", f"/v1/devices/{DEVICE}/desired{query}")
    assert status == 200


# ── talking to a browser ────────────────────────────────────────────────────

def test_cors_lets_the_web_app_read_the_answer(http):
    """The production app is on a different origin. It widens nothing — the
    mailbox is opened by a bearer token, never by a cookie."""
    _, headers, _ = http("GET", "/v1/health", token=None)
    assert headers["Access-Control-Allow-Origin"] == "*"
    assert "Authorization" in headers["Access-Control-Allow-Headers"]


def test_the_preflight_is_answered(http):
    status, headers, _ = http("OPTIONS", f"/v1/devices/{DEVICE}/desired", token=None)
    assert status == 204
    assert "PUT" in headers["Access-Control-Allow-Methods"]


# ── the demo app ────────────────────────────────────────────────────────────

def test_the_lab_is_served_and_is_self_contained(http):
    status, headers, body = http("GET", "/lab", token=None)
    assert status == 200
    assert headers["Content-Type"].startswith("text/html")

    # Same rule as the device's own pages. Nothing is fetched from anywhere:
    # this is a debugging tool, used on bad networks by definition, and it is
    # also served by a relay that a browser may have reached over a captive
    # portal that blocks every other host.
    assert "//cdn." not in body and "//fonts." not in body
    assert "<script src=" not in body and "src=" not in body
    assert "@import" not in body
    assert 'href="/style.css"' in body        # the one sub-resource, same host


def test_the_pairing_url_is_the_same_page(http):
    """The label's QR points at /pair#CODE. The fragment never reaches here."""
    assert http("GET", "/pair", token=None)[0] == 200


def test_the_lab_can_be_switched_off(http, monkeypatch):
    monkeypatch.setattr(config, "SERVE_LAB", False)
    assert http("GET", "/lab", token=None)[0] == 404
    # The API is unaffected — turning off the demo must not take the service
    # down with it.
    assert http("GET", "/v1/health", token=None)[0] == 200
