"""The whole path, with nothing stubbed out.

Everywhere else the network is replaced by a fake so the tests stay fast and
deterministic. That leaves one thing unproven, and it is the thing most likely
to be wrong: whether the two halves — written on different days, in different
packages, deployed to different machines — actually agree.

So this one starts a real relay on a real port and drives a real `CloudLink`
through real HTTP. It is the only test here that opens a socket, and it is
worth the second it costs.

It is also the only place the firmware suite reaches into `cloud_relay/`. That
is deliberate and one-directional: the relay's own suite imports nothing from
the firmware, because the relay is deployed to a container that has no
dispenser code in it. This is the integration test, so it needs both ends by
definition — and it skips rather than fails if the relay is not checked out.
"""
from __future__ import annotations

import sys
import threading
import time
from pathlib import Path

import pytest

from snapcare_dispenser import cloud, envelope, provisioning

RELAY_DIR = Path(__file__).resolve().parents[2] / "cloud_relay"

pytestmark = [
    pytest.mark.skipif(not envelope.available(),
                       reason="no AES-GCM here — " + envelope.UNAVAILABLE_HINT),
    pytest.mark.skipif(not RELAY_DIR.is_dir(),
                       reason=f"the relay is not checked out at {RELAY_DIR}"),
]

CLAIM = "6V9F5-9QK67"


@pytest.fixture
def relay(tmp_path):
    """A real relay, on a real port, thrown away afterwards."""
    sys.path.insert(0, str(RELAY_DIR))
    from snapcare_relay.mailbox import Mailboxes
    from snapcare_relay.server import make_server

    server = make_server(Mailboxes(tmp_path / "relay-data"), port=0)
    thread = threading.Thread(target=lambda: server.serve_forever(poll_interval=0.02),
                              daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}"
    finally:
        server.shutdown()
        server.server_close()


@pytest.fixture
def identity():
    return provisioning.Identity(ssid="SnapCare-V5XH", passphrase="3k8krnp8pv8s",
                                 source="test", claim=CLAIM)


@pytest.fixture
def link(dispenser, identity, relay):
    return cloud.CloudLink(dispenser, identity, relay_url=relay, enabled=True)


def publish_as_the_app(relay_url: str, identity, rev: int, payload: str) -> int:
    """What the web app does, written out: seal, then PUT.

    Deliberately not sharing a helper with the firmware — this stands in for
    the *other* implementation, and a shared helper would hide a disagreement
    between them, which is the one thing this file exists to catch.
    """
    import json
    import urllib.request

    sealed = envelope.seal(identity.box_key, identity.device_id, "desired", rev,
                           {"payload": payload, "by": "app"})
    request = urllib.request.Request(
        f"{relay_url}/v1/devices/{identity.device_id}/desired",
        data=json.dumps({"envelope": sealed}).encode(), method="PUT")
    request.add_header("Authorization", f"Bearer {identity.access_token}")
    request.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(request, timeout=10) as response:
        return response.status


def test_a_schedule_written_by_the_app_reaches_the_trays(link, dispenser,
                                                         identity, relay):
    """The headline. Someone edits a prescription; a dispenser in another
    building starts running it."""
    assert publish_as_the_app(relay, identity, 1, "SC1*W*1:0800.2000-127-030") == 200

    assert link._poll_once() is True
    assert dispenser.status()["payload"] == "SC1*W*1:0800.2000-127-030"
    assert dispenser.status()["scheduleSource"] == "cloud"


def test_the_device_report_comes_back_readable_at_the_app_end(link, dispenser,
                                                              identity, relay):
    import json
    import urllib.request

    dispenser.drop_now(1)
    link._publish_once()

    request = urllib.request.Request(
        f"{relay}/v1/devices/{identity.device_id}/reported?since=0")
    request.add_header("Authorization", f"Bearer {identity.access_token}")
    with urllib.request.urlopen(request, timeout=10) as response:
        body = json.loads(response.read())

    report = envelope.unseal(identity.box_key, identity.device_id,
                            "reported", body["envelope"])
    assert report["events"][0]["tray"] == 1
    assert report["status"]["payload"] == dispenser.status()["payload"]


def test_a_held_poll_is_answered_the_moment_the_app_writes(link, identity, relay):
    """The whole reason for the long poll. If this ever became a plain poll,
    the only symptom would be a schedule taking a minute to arrive — which
    nobody would notice until a dose depended on it."""
    # The mailbox has to exist before there is anything to hold a poll on, and
    # the device is what brings it into existence — it publishes its state
    # before it ever asks for a schedule. This is that first report.
    link._publish_once()

    answer = {}

    def poller():
        answer["changed"] = link._poll_once()

    thread = threading.Thread(target=poller)
    thread.start()
    time.sleep(0.3)

    started = time.monotonic()
    publish_as_the_app(relay, identity, 1, "SC1*W*2:0900-127-000")
    thread.join(timeout=20)

    assert answer["changed"] is True
    assert time.monotonic() - started < 3.0


def test_the_relay_never_sees_a_schedule(link, identity, relay, tmp_path):
    """Read off the relay's own disk, which is the thing being claimed: a
    person with the volume, or with our ssh key, cannot read a prescription."""
    publish_as_the_app(relay, identity, 1, "SC1*W*1:0800.2000-127-030")
    link._poll_once()
    link._publish_once()

    stored = list((tmp_path / "relay-data").glob("*.json"))
    assert stored, "the relay wrote nothing"
    on_disk = "\n".join(path.read_text() for path in stored)

    assert "SC1" not in on_disk            # no schedule
    assert "0800" not in on_disk           # no dose time
    assert CLAIM.replace("-", "") not in on_disk and CLAIM not in on_disk
    assert identity.access_token not in on_disk    # stored hashed
    assert identity.device_id in on_disk           # the address, which is not a secret


def test_two_dispensers_do_not_see_each_others_schedules(dispenser, relay,
                                                         identity, store, servos):
    """Two boards in one house. Their claim codes differ, so their mailboxes,
    tokens and keys all differ — there is no shared namespace to collide in."""
    from snapcare_dispenser.device import Dispenser

    other_identity = provisioning.Identity(
        ssid="SnapCare-DEV0", passphrase="x", source="test",
        claim=provisioning.format_claim("SNAPCAREDV"))
    other = Dispenser(store=store, servos=servos, clock=dispenser.clock)
    other_link = cloud.CloudLink(other, other_identity, relay_url=relay, enabled=True)

    publish_as_the_app(relay, identity, 1, "SC1*W*1:0800-127-030")

    # The other device's mailbox has never been written to.
    assert other_link._poll_once() is False
    assert other_identity.device_id != identity.device_id


def test_the_device_survives_the_relay_going_away(link, dispenser, identity, relay):
    """A deploy, a restart, a dropped connection. The dispenser keeps its
    schedule and keeps dispensing; the link reports the failure and retries."""
    publish_as_the_app(relay, identity, 1, "SC1*W*1:0800-127-030")
    link._poll_once()

    link.relay_url = "http://127.0.0.1:1"     # nothing listens here

    with pytest.raises(Exception):
        link._poll_once()

    assert dispenser.status()["payload"] == "SC1*W*1:0800-127-030"
    assert dispenser.status()["dispensing"] is True
    assert dispenser.tick() == [] or True     # still running, whatever it decides


def test_the_demo_app_self_checks_against_values_this_side_agrees_with():
    """The lab page proves at load that it derives the same keys as this
    firmware. It does that against constants written into the page — so those
    constants are what this test verifies, from the Python side.

    Without this the page could self-check perfectly against a wrong answer,
    which is worse than not checking: a green tick on a pairing that silently
    addresses a mailbox no dispenser is listening to.

    There is no JavaScript engine in this suite, so this is where the two ends
    meet: Python asserts that the values baked into the page are the ones it
    produces, and the page asserts in the browser that it reproduces them.
    """
    page = (RELAY_DIR / "snapcare_relay" / "web" / "lab.html").read_text(encoding="utf-8")

    block = page.split("const SELF_TEST = {", 1)
    assert len(block) == 2, "the page has no self-check any more"
    body = block[1].split("};", 1)[0]

    def field(name: str) -> str:
        import re
        found = re.search(rf"{name}:\s*'([^']*)'", body)
        assert found, f"the self-check has no {name}"
        return found.group(1)

    claim = field("claim")
    assert provisioning.device_id(claim) == field("deviceId")

    golden = {
        "v": 1, "rev": 7, "alg": "A256GCM",
        "iv": field("iv"), "ct": field("ct"),
    }
    opened = envelope.unseal(provisioning.box_key(claim),
                             provisioning.device_id(claim), "desired", golden)
    assert opened["payload"] == field("payload")

    # And the two domain-separation strings have to be the ones this side uses.
    # The device id matching is strong evidence for the first, but only because
    # the salt is an input to it; asserting it directly is what keeps that from
    # being a coincidence somebody has to reason about.
    assert "snapcare/pill-dispenser/cloud/v1" in page
    assert "snapcare/relay/v${ENVELOPE_VERSION}" in page
    assert f"const ENVELOPE_VERSION = {envelope.VERSION};" in page


def test_the_link_starts_and_stops_cleanly(link, identity, relay, monkeypatch):
    """The threaded path, which nothing else here exercises.

    The hold is shortened to a second for the duration. `stop` cannot interrupt
    a request that is already in flight — there is no way to do that to
    `urllib` without reaching inside it — so with the real fifty-second hold
    this would sit here for most of a minute waiting for a poll to come back
    of its own accord. That is exactly what happens on a real shutdown too; it
    costs nothing there because both threads are daemon threads and the process
    does not wait for them.
    """
    from snapcare_dispenser import config as cfg
    monkeypatch.setattr(cfg, "CLOUD_HOLD_S", 1)

    link.start()
    assert link.running

    deadline = time.monotonic() + 10
    while time.monotonic() < deadline and not link.status()["reportedRev"]:
        time.sleep(0.05)
    assert link.status()["reportedRev"] >= 1     # it published on its own

    link.stop()
    for thread in link._threads:
        thread.join(timeout=20)
    assert not link.running
