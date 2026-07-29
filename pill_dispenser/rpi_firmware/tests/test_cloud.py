"""The cloud link, and the rule it is not allowed to break.

Cloud sync is an extra way *in*. A relay that is down, unreachable, hostile or
never configured must cost nobody a dose — the schedule is already on the SD
card and the DS3231 already knows the time. Most of what is below is a way that
could stop being true.

Nothing here opens a socket or starts a thread. The link talks to the network
through one object, so the suite hands it a different one and drives the loop a
step at a time; a test that waits for a real long poll is a test that takes
fifty seconds and passes for the wrong reasons on a slow machine.
"""
from __future__ import annotations

import json
import threading
import time

import pytest

from snapcare_dispenser import cloud, config, envelope, provisioning

pytestmark = pytest.mark.skipif(
    not envelope.available(),
    reason="no AES-GCM here — " + envelope.UNAVAILABLE_HINT,
)

CLAIM = "6V9F5-9QK67"
RELAY = "https://relay.example"


@pytest.fixture
def identity():
    return provisioning.Identity(ssid="SnapCare-V5XH", passphrase="3k8krnp8pv8s",
                                 source="test", claim=CLAIM)


class FakeSession:
    """The network, replaced. Answers are queued; requests are recorded."""

    def __init__(self):
        self.answers: dict[tuple[str, str], list] = {}
        self.sent: list[dict] = []
        self.fail_with: Exception | None = None

    def queue(self, method: str, contains: str, status: int, data=None) -> None:
        self.answers.setdefault((method, contains), []).append((status, data))

    def request(self, method, url, body, timeout, headers):
        self.sent.append({"method": method, "url": url, "body": body,
                          "timeout": timeout, "headers": headers})
        if self.fail_with:
            raise self.fail_with
        for (want_method, contains), queued in self.answers.items():
            if want_method == method and contains in url and queued:
                return queued.pop(0)
        return (204, None)

    @property
    def last(self) -> dict:
        return self.sent[-1]


@pytest.fixture
def session():
    return FakeSession()


@pytest.fixture
def link(dispenser, identity, session):
    return cloud.CloudLink(dispenser, identity, relay_url=RELAY,
                           enabled=True, session=session)


def offer(session, identity, rev: int, payload=None, slot="desired", **extra):
    """Queue a sealed schedule for the link's next poll."""
    body = dict(extra)
    if payload is not None:
        body["payload"] = payload
    sealed = envelope.seal(identity.box_key, identity.device_id, slot, rev, body)
    session.queue("GET", "/desired", 200,
                  {"ok": True, "rev": rev, "envelope": sealed, "updatedAt": "now"})
    return sealed


# ── receiving a schedule ────────────────────────────────────────────────────

def test_a_schedule_from_the_relay_reaches_the_trays(link, dispenser, session, identity):
    offer(session, identity, 1, "SC1*W*1:0800.2000-127-030")
    assert link._poll_once() is True

    status = dispenser.status()
    assert status["payload"] == "SC1*W*1:0800.2000-127-030"
    assert status["scheduleSource"] == "cloud"
    assert link.status()["desiredRev"] == 1


def test_a_schedule_can_arrive_as_slots_rather_than_a_payload(link, dispenser,
                                                              session, identity):
    """The same two shapes `/api/schedule` takes, so the app does not have to
    build an SC1 string to use the cloud path."""
    offer(session, identity, 1, None,
          slots=[{"tray": 2, "times": ["0900"], "days": 31, "durationDays": 14}])
    assert link._poll_once() is True
    assert dispenser.status()["payload"] == "SC1*W*2:0900-031-014"


def test_nothing_new_is_the_ordinary_answer(link, session):
    """204 on every poll, which is what a device sees all day."""
    assert link._poll_once() is False
    assert link.status()["desiredRev"] == 0


def test_an_unpaired_mailbox_is_not_an_error(link, session):
    """404 until something has written to it. A dispenser plugged in before
    anybody has opened the app must not sit in a backoff loop over it."""
    session.queue("GET", "/desired", 404, {"ok": False, "error": "no such device"})
    assert link._poll_once() is False
    assert link.status()["lastError"] == ""


def test_a_poll_that_answers_instantly_does_not_become_a_hot_loop(link, session):
    """The failure this guard exists for.

    Normally a poll blocks for the full hold, and reconnecting at once is what
    makes sync feel instant. But three ordinary situations make the answer come
    back immediately — a mailbox nothing has written to yet, a proxy that
    terminates long polls on sight, a relay with its hold set to zero — and in
    each of them "reconnect at once" is a loop with no delay in it at all. That
    is a dispenser aiming hundreds of requests a second at a relay that is
    already having a bad day.

    Found by the end-to-end test polling before anything had created the
    mailbox: it came back in a third of a second, having asked many times.
    """
    for _ in range(50):
        session.queue("GET", "/desired", 404, {"ok": False, "error": "no such device"})

    thread = threading.Thread(target=link._poll_loop, daemon=True)
    thread.start()
    time.sleep(1.0)
    link.stop()
    thread.join(timeout=10)

    polls = [s for s in session.sent if s["method"] == "GET"]
    assert 1 <= len(polls) <= 2, f"{len(polls)} polls in one second"


# ── the same schedule twice ─────────────────────────────────────────────────

def test_a_revision_that_is_not_newer_is_ignored(link, dispenser, session, identity):
    """The check the relay cannot make for us.

    A relay that is broken, rolled back or hostile can offer last month's
    prescription again. The device's own memory of what it has applied is the
    thing that refuses it — and that memory is on the SD card precisely so it
    survives the power cut that would otherwise be the moment to slip one past.
    """
    offer(session, identity, 5, "SC1*W*1:0800-127-030")
    assert link._poll_once() is True

    offer(session, identity, 5, "SC1*W*1:2200-127-030")
    assert link._poll_once() is False
    offer(session, identity, 3, "SC1*W*1:2200-127-030")
    assert link._poll_once() is False

    assert dispenser.status()["payload"] == "SC1*W*1:0800-127-030"


def test_the_revision_survives_a_restart(dispenser, identity, session, store):
    """A power cut at 08:30 must not become the day's schedule being applied
    again — which, on a schedule change, resets what has already been
    dispensed and gives the morning dose a second time."""
    first = cloud.CloudLink(dispenser, identity, relay_url=RELAY, enabled=True,
                            session=session)
    offer(session, identity, 9, "SC1*W*1:0800-127-030")
    assert first._poll_once() is True

    restarted = cloud.CloudLink(dispenser, identity, relay_url=RELAY, enabled=True,
                                session=session)
    assert restarted.status()["desiredRev"] == 9
    offer(session, identity, 9, "SC1*W*1:0800-127-030")
    assert restarted._poll_once() is False


def test_damaged_cloud_state_starts_from_zero_rather_than_refusing(dispenser, identity,
                                                                   session, store):
    """Re-applying the current schedule is a no-op. Refusing everything would
    leave the device stuck on whatever it had when the file was damaged."""
    (store.dir / config.CLOUD_STATE_FILE.name).write_text("{ this is not json")
    link = cloud.CloudLink(dispenser, identity, relay_url=RELAY, enabled=True,
                           session=session)
    assert link.status()["desiredRev"] == 0


# ── refusing a schedule ─────────────────────────────────────────────────────

def test_a_tray_that_is_not_fitted_is_refused_and_reported(dispenser, identity,
                                                           session, servos):
    """An absent servo cannot jam, so accepting the plan would mean a dose that
    is scheduled, never dispensed, and reported by nothing."""
    servos.pins = {1: 17, 2: 27, 3: 22}
    link = cloud.CloudLink(dispenser, identity, relay_url=RELAY, enabled=True,
                           session=session)

    offer(session, identity, 2, "SC1*W*7:0800-127-030")
    link._poll_once()

    assert "tray" in link.status()["lastError"]
    assert dispenser.status()["payload"] == ""


def test_a_refused_schedule_is_not_fetched_again(dispenser, identity, session, servos):
    """It will be refused identically forever. A device that re-collects it
    every fifty seconds is hammering the relay about something only a person
    can fix, and burying its own log while it does."""
    servos.pins = {1: 17}
    link = cloud.CloudLink(dispenser, identity, relay_url=RELAY, enabled=True,
                           session=session)

    offer(session, identity, 2, "SC1*W*7:0800-127-030")
    link._poll_once()
    assert link.status()["desiredRev"] == 2

    offer(session, identity, 2, "SC1*W*7:0800-127-030")
    assert link._poll_once() is False


def test_an_unparseable_payload_leaves_the_running_schedule_alone(link, dispenser,
                                                                  session, identity):
    offer(session, identity, 1, "SC1*W*1:0800-127-030")
    link._poll_once()

    offer(session, identity, 2, "NOT-AN-SC1-CODE")
    link._poll_once()

    assert dispenser.status()["payload"] == "SC1*W*1:0800-127-030"
    assert link.status()["lastError"]


def test_the_cloud_may_not_set_the_clock(link, dispenser, session, identity, clock):
    """A device that can reach a relay can reach NTP, which is a better
    authority than anything a phone sends. Accepting a time here would mean a
    phone in the wrong timezone can move a dispenser's day."""
    clock.distrust()
    offer(session, identity, 1, "SC1*C*202607290700*2")
    link._poll_once()

    assert not dispenser.clock.trusted
    assert "schedules only" in link.status()["lastError"]


def test_an_envelope_that_does_not_open_is_a_failure_not_a_schedule(link, dispenser,
                                                                    session):
    """Somebody else's device id on this mailbox, or a relay that has been
    tampered with. Either way it must not reach the trays."""
    stranger = provisioning.box_key("SNAPCAREDV")
    sealed = envelope.seal(stranger, provisioning.device_id(CLAIM), "desired", 1,
                           {"payload": "SC1*W*1:0800-127-030"})
    session.queue("GET", "/desired", 200, {"ok": True, "rev": 1, "envelope": sealed})

    with pytest.raises(envelope.SealError):
        link._poll_once()
    assert dispenser.status()["payload"] == ""


# ── reporting upwards ───────────────────────────────────────────────────────

def test_the_report_carries_the_status_and_the_dose_log(link, dispenser, session,
                                                        identity):
    dispenser.drop_now(1)
    session.queue("PUT", "/reported", 200, {"ok": True, "rev": 1})
    link._publish_once()

    sealed = session.last["body"]["envelope"]
    report = envelope.unseal(identity.box_key, identity.device_id, "reported", sealed)
    assert report["status"]["trayCount"] == 8
    assert report["events"][0]["tray"] == 1
    assert report["firmware"]


def test_the_relay_is_told_nothing_it_could_read(link, session, identity):
    """The whole point. Everything on the wire is either the ciphertext or the
    address — never the claim code, and never the box key."""
    session.queue("PUT", "/reported", 200, {"ok": True, "rev": 1})
    link._publish_once()

    wire = json.dumps(session.last)
    assert "6V9F5" not in wire and "9QK67" not in wire
    assert identity.box_key.hex() not in wire
    assert identity.device_id in wire            # the address is not a secret
    assert identity.access_token in wire         # the bearer token, as intended


def test_an_unchanged_report_is_not_republished(link, session):
    """A revision, an fsync on the relay and a wake-up for every app watching,
    for a device saying exactly what it said a moment ago."""
    session.queue("PUT", "/reported", 200, {"ok": True, "rev": 1})
    link._publish_once()
    before = len(session.sent)

    link._publish_once()
    assert len(session.sent) == before


def test_every_dose_asks_to_be_published_however_it_was_caused(dispenser, identity,
                                                               session, daemon_wiring):
    """There are five ways a dose gets recorded — the scheduler, the button,
    the web console, the app's `/dropout` link, a confirmation timing out — and
    the notification hangs off the one place they all pass through.

    Wired per-caller instead, the day somebody adds a sixth is the day that one
    is silently never reported, and the symptom is a carer who is simply not
    told about one kind of dose.
    """
    link = daemon_wiring

    link._wake_publisher.clear()
    dispenser.drop_now(1)                       # the web console / /dropout path
    assert link._wake_publisher.is_set()

    link._wake_publisher.clear()
    dispenser._pending = (1, 480, dispenser.clock.now())
    dispenser.confirm_taken()                   # the button / the page
    assert link._wake_publisher.is_set()


@pytest.fixture
def daemon_wiring(dispenser, identity, session):
    """The link wired to the dispenser the way `daemon.py` wires it."""
    link = cloud.CloudLink(dispenser, identity, relay_url=RELAY, enabled=True,
                           session=session)
    dispenser.on_event = lambda _record: link.nudge()
    return link


def test_a_broken_listener_never_costs_a_dose(dispenser, caplog):
    """It runs while a tray is open and the lock is held. Whatever it raises
    stops there — a broken notifier must not become a dose that was dispensed
    and never written down."""
    dispenser.on_event = lambda _record: (_ for _ in ()).throw(RuntimeError("boom"))

    with caplog.at_level("ERROR"):
        record = dispenser.drop_now(1)

    assert record["tray"] == 1
    assert dispenser.events(limit=1)[0]["tray"] == 1     # written down anyway


def test_a_dose_during_a_backoff_is_published_as_soon_as_the_relay_returns(link):
    """After an outage is exactly when there is something worth sending: the
    doses given while it was down. Waiting out a retry interval that has grown
    to five minutes would hold them back at the worst possible moment."""
    import time as _time

    started = _time.monotonic()
    waiter = threading.Thread(target=lambda: link._wait_to_publish(30), daemon=True)
    waiter.start()
    _time.sleep(0.2)
    link.nudge()
    waiter.join(timeout=5)

    assert _time.monotonic() - started < 2.0
    assert not link._wake_publisher.is_set()     # cleared, ready for the next one


def test_a_dose_makes_the_report_change(link, dispenser, session):
    session.queue("PUT", "/reported", 200, {"ok": True, "rev": 1})
    link._publish_once()
    before = len(session.sent)

    dispenser.drop_now(2)
    session.queue("PUT", "/reported", 200, {"ok": True, "rev": 2})
    link._publish_once()
    assert len(session.sent) > before


def test_a_conflicting_revision_resyncs_instead_of_climbing(link, session):
    """A restart that lost count, against a relay that did not. Climbing one at
    a time would take as many round trips as the device has ever reported."""
    session.queue("PUT", "/reported", 409, {"ok": False, "error": "not newer"})
    session.queue("GET", "/devices", 200,
                  {"ok": True, "desired": {"rev": 0}, "reported": {"rev": 41}})

    with pytest.raises(cloud._Conflict):
        link._publish_once()
    assert link.status()["reportedRev"] == 41


# ── failing safely ──────────────────────────────────────────────────────────

def test_a_relay_that_is_down_never_reaches_the_dispenser(link, dispenser, session):
    """The rule this whole module is bounded by. The loop above `_poll_once`
    catches this and backs off; what matters here is that the dispenser is
    untouched and still knows its schedule."""
    dispenser.apply_payload("SC1*W*1:0800-127-030", source="lan")
    session.fail_with = OSError("name or service not known")

    with pytest.raises(OSError):
        link._poll_once()

    assert dispenser.status()["payload"] == "SC1*W*1:0800-127-030"
    assert dispenser.status()["dispensing"] is True


def test_a_relay_answering_rubbish_is_an_error_not_a_schedule(link, session):
    session.queue("GET", "/desired", 200, {"ok": True, "rev": 1, "envelope": "nope"})
    with pytest.raises(envelope.SealError):
        link._poll_once()


def test_a_failure_is_logged_once_and_then_quietly(link, session, caplog):
    """A relay down for a day must not bury the dose log — they are on the
    same SD card, and the dose log is the one somebody needs."""
    session.fail_with = OSError("down")
    with caplog.at_level("WARNING"):
        for _ in range(20):
            link._note_failure(OSError("down"))
    assert len(caplog.records) == 1


def test_the_link_reports_why_it_is_not_running(dispenser, identity, session):
    unpaired = cloud.CloudLink(dispenser, identity, relay_url="", enabled=True,
                               session=session)
    assert unpaired.status()["state"] == "unpaired"
    assert not unpaired.configured

    off = cloud.CloudLink(dispenser, identity, relay_url=RELAY, enabled=False,
                          session=session)
    assert off.status()["state"] == "off"

    off.start()
    assert not off.running
    assert not session.sent


def test_a_machine_with_no_crypto_says_so_and_does_not_start(dispenser, identity,
                                                             session, monkeypatch):
    monkeypatch.setattr(envelope, "available", lambda: False)
    link = cloud.CloudLink(dispenser, identity, relay_url=RELAY, enabled=True,
                           session=session)
    assert link.status()["state"] == "unsupported"
    assert "python3-cryptography" in link.status()["hint"]

    link.start()
    assert not link.running
    assert not session.sent


def test_the_status_never_carries_the_pairing_code(link):
    """It is handed to anything on the LAN that asks for /api/status."""
    wire = json.dumps(link.status())
    assert "6V9F5" not in wire and "9QK67" not in wire
    assert link.identity.access_token not in wire


# ── moving to a different relay ─────────────────────────────────────────────

def test_changing_relay_forgets_the_revisions(link, session, identity):
    """They were counted against the old relay's mailbox. Carried over, the
    device arrives at a fresh mailbox announcing revision 400 and then ignores
    the schedule waiting there at revision 1."""
    offer(session, identity, 12, "SC1*W*1:0800-127-030")
    link._poll_once()
    assert link.status()["desiredRev"] == 12

    link.reconfigure(relay_url="https://elsewhere.example")
    assert link.status()["desiredRev"] == 0
    assert link.status()["relayUrl"] == "https://elsewhere.example"
    link.stop()


def test_the_same_relay_keeps_them(link, session, identity):
    offer(session, identity, 12, "SC1*W*1:0800-127-030")
    link._poll_once()

    link.reconfigure(relay_url=RELAY + "/")
    assert link.status()["desiredRev"] == 12
    link.stop()


def test_going_lan_only_stops_the_link(link):
    link.reconfigure(relay_url="", enabled=False)
    status = link.status()
    assert status["state"] == "off" and status["relayUrl"] == ""


# ── the wire, in detail ─────────────────────────────────────────────────────

def test_the_poll_asks_for_a_hold_and_allows_for_it(link, session):
    link._poll_once()
    sent = session.last
    assert f"wait={config.CLOUD_HOLD_S}" in sent["url"]
    assert "since=0" in sent["url"]
    # The socket has to outlast the relay's own hold, or every ordinary poll is
    # a client-side timeout — and the timeout path is the one with the backoff.
    assert sent["timeout"] > config.CLOUD_HOLD_S


def test_every_request_is_addressed_and_authorised(link, session):
    link._poll_once()
    sent = session.last
    assert sent["url"].startswith(f"{RELAY}/v1/devices/{link.identity.device_id}")
    assert sent["headers"]["Authorization"] == f"Bearer {link.identity.access_token}"


def test_the_device_will_not_read_an_unbounded_body():
    """A Pi 3B has 1 GB. A relay that is broken or hostile must not be able to
    stop a dispenser dispensing by answering with a very large body."""
    class Huge:
        def read(self, size):
            return b"x" * size

    with pytest.raises(cloud._RelayError):
        cloud._read_json(Huge())
