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
from datetime import datetime

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

    thread = threading.Thread(target=link._poll_loop, args=(link._ctl,), daemon=True)
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


# ── receiving a tap ─────────────────────────────────────────────────────────

def command(session, identity, rev: int, **body):
    """Queue a sealed command for the link's next command poll."""
    sealed = envelope.seal(identity.box_key, identity.device_id, "command", rev, body)
    session.queue("GET", "/command", 200,
                  {"ok": True, "rev": rev, "envelope": sealed, "updatedAt": "now"})
    return sealed


def due_dose(dispenser, clock, payload="SC1*W*1:0800-127-000"):
    """Put the device in the state it is in when the app shows a release button."""
    dispenser.apply_payload(payload)
    clock.set(datetime(2026, 7, 29, 8, 0))
    dispenser.tick()
    return dispenser


def test_a_release_from_the_relay_opens_the_tray(link, dispenser, session,
                                                 identity, clock):
    """The path from a push notification tapped on a train."""
    due_dose(dispenser, clock)
    command(session, identity, 1, action="release", tray=1, minutes=480)

    link._command_once()

    assert dispenser.servos.drops.get(1, 0) == 1
    assert dispenser.awaiting_release == []
    assert dispenser.events()[0]["reason"] == "released"
    assert link.status()["commandRev"] == 1


def test_a_release_with_no_tray_releases_everything_due(link, dispenser, session,
                                                        identity, clock):
    """What the app's main-screen button sends."""
    due_dose(dispenser, clock, "SC1*W*1:0800-127-000/2:0800-127-000")
    command(session, identity, 1, action="release")

    link._command_once()
    assert dispenser.servos.drops.get(1, 0) == 1
    assert dispenser.servos.drops.get(2, 0) == 1


def test_a_replayed_release_drops_nothing(link, dispenser, session, identity, clock):
    """The relay hands back the same envelope, or a broken one repeats itself.
    Without the revision check that is a second pill from one tap."""
    due_dose(dispenser, clock)
    sealed = command(session, identity, 1, action="release", tray=1, minutes=480)
    link._command_once()
    assert dispenser.servos.drops.get(1, 0) == 1

    # The same envelope, offered again at the same revision.
    session.queue("GET", "/command", 200,
                  {"ok": True, "rev": 1, "envelope": sealed, "updatedAt": "now"})
    link._command_once()
    assert dispenser.servos.drops.get(1, 0) == 1, "a replay must not open the tray again"


def test_a_release_survives_a_reboot_without_being_collected_twice(dispenser, identity,
                                                                   session, clock):
    """The revision is on the SD card for exactly this. A device that reboots
    inside the window would otherwise collect the command again and, because the
    dose is still due, drop a second one."""
    due_dose(dispenser, clock)
    first = cloud.CloudLink(dispenser, identity, relay_url=RELAY, enabled=True,
                            session=session)
    sealed = command(session, identity, 1, action="release", tray=1, minutes=480)
    first._command_once()
    assert dispenser.servos.drops.get(1, 0) == 1

    session.queue("GET", "/command", 200,
                  {"ok": True, "rev": 1, "envelope": sealed, "updatedAt": "now"})
    restarted = cloud.CloudLink(dispenser, identity, relay_url=RELAY, enabled=True,
                                session=session)
    assert restarted._command_rev == 1, "the revision came back off the disk"
    restarted._command_once()
    assert dispenser.servos.drops.get(1, 0) == 1


def test_a_release_that_arrives_after_the_window_drops_nothing(link, dispenser,
                                                               session, identity, clock):
    """The guard that actually matters. A command is an act, not a state: a
    device that was offline over lunch and reconnects at 3 p.m. must not carry
    out a release tapped at 08:05. Nothing refuses it — it simply finds no dose
    waiting, because the device's own sense of what is due is the authority."""
    due_dose(dispenser, clock)
    clock.set(datetime(2026, 7, 29, 15, 0))
    dispenser.tick()                       # the window closes; the dose is missed
    assert dispenser.awaiting_release == []

    command(session, identity, 1, action="release", tray=1, minutes=480)
    link._command_once()

    assert dispenser.servos.drops.get(1, 0) == 0, "the tray must have stayed shut"
    assert dispenser.events()[0]["reason"] == "not-released"


def test_a_release_naming_a_dose_that_is_not_due_drops_nothing(link, dispenser,
                                                               session, identity, clock):
    due_dose(dispenser, clock)
    command(session, identity, 1, action="release", tray=1, minutes=1200)

    link._command_once()
    assert dispenser.servos.drops.get(1, 0) == 0
    assert [d.tray for d in dispenser.awaiting_release] == [1], "still waiting"


def test_an_unknown_command_is_ignored_rather_than_guessed_at(link, dispenser,
                                                              session, identity, clock):
    due_dose(dispenser, clock)
    command(session, identity, 1, action="selfDestruct", tray=1)

    link._command_once()
    assert dispenser.servos.drops.get(1, 0) == 0


def test_a_command_sealed_by_a_stranger_does_not_open(link, dispenser, session,
                                                      identity, clock):
    """The same protection the schedule slot has. A relay that could forge a
    command could empty a hopper into an empty room."""
    due_dose(dispenser, clock)
    stranger = provisioning.box_key("AAAAA-AAAAA")
    sealed = envelope.seal(stranger, provisioning.device_id(CLAIM), "command", 1,
                           {"action": "release", "tray": 1, "minutes": 480})
    session.queue("GET", "/command", 200,
                  {"ok": True, "rev": 1, "envelope": sealed, "updatedAt": "now"})

    with pytest.raises(envelope.SealError):
        link._command_once()
    assert dispenser.servos.drops.get(1, 0) == 0


def test_the_command_poll_ignores_the_cheap_mode(link, session, monkeypatch):
    """`CLOUD_IDLE_POLL_S` lets a schedule wait fifteen minutes, which is a fair
    trade for a hosting bill. A release cannot wait fifteen minutes — its whole
    window is an hour and somebody is standing there — so this slot is polled
    continuously whatever that setting says."""
    monkeypatch.setattr(config, "CLOUD_IDLE_POLL_S", 900)
    link._command_once()
    assert f"wait={config.CLOUD_HOLD_S}" in session.last["url"]


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


def test_the_report_says_where_the_device_can_be_reached(link, session, identity):
    """So the app can offer the LAN as a shortcut. Somebody standing in the room
    next to the dispenser should not be talking to a data centre to open a tray.

    Inside the sealed envelope, which is the reason it is allowed to name the
    house WiFi at all: only whoever holds the pairing code can read it."""
    link.network_changed(_Status(ssid="Home", address="192.168.1.42"))
    session.queue("PUT", "/reported", 200, {"ok": True, "rev": 1})
    link._publish_once()

    sealed = session.last["body"]["envelope"]
    report = envelope.unseal(identity.box_key, identity.device_id, "reported", sealed)
    assert report["network"]["ssid"] == "Home"
    assert report["network"]["address"] == "192.168.1.42"
    assert report["network"]["deviceUrl"].endswith("pilldispenser.local/")
    assert "Home" not in json.dumps(session.last["url"])


class _Status:
    """The two fields of `wifi.Status` the link keeps."""

    def __init__(self, ssid, address):
        self.ssid = ssid
        self.address = address


# ── coming back after an outage ─────────────────────────────────────────────

def test_the_backoff_is_not_waited_out_once_the_wifi_returns(link):
    """Both loops climb to five minutes, and after a WiFi outage every failure
    that got them there had the same single cause — which has just gone away. A
    device that is back must look back: 'offline' is the one word in that app a
    carer acts on."""
    started = time.monotonic()
    waiter = threading.Thread(target=lambda: link._wait_to_poll(link._ctl, 30), daemon=True)
    waiter.start()
    time.sleep(0.2)

    link.network_changed()
    waiter.join(timeout=2)
    assert not waiter.is_alive(), "the poll wait ignored the network coming back"
    assert time.monotonic() - started < 2


def test_both_loops_see_the_network_come_back(link):
    """One shared flag would be cleared by whichever thread noticed first, and
    the other would sit out its backoff. A counter each loop remembers cannot be
    consumed by its neighbour."""
    before = link._network_epoch
    link.network_changed()
    assert link._network_epoch == before + 1
    assert link._ctl.wake_poller.is_set()
    assert link._ctl.wake_publisher.is_set()


def test_a_poll_backoff_climbs_again_when_the_network_did_not_change(link, session,
                                                                    monkeypatch):
    """The reset is for an outage that ended, not for a relay that is simply
    down — every dispenser in the field retrying a broken relay every five
    seconds is what keeps it broken."""
    monkeypatch.setattr(config, "CLOUD_BACKOFF_MIN_S", 0.01)
    monkeypatch.setattr(config, "CLOUD_BACKOFF_MAX_S", 0.05)
    monkeypatch.setattr(cloud, "_jittered", lambda seconds: seconds)
    waits = []
    monkeypatch.setattr(link, "_wait_to_poll", lambda _ctl, seconds: waits.append(seconds))
    session.fail_with = OSError("the relay is down")

    thread = threading.Thread(target=link._poll_loop, args=(link._ctl,), daemon=True)
    thread.start()
    deadline = time.monotonic() + 2
    while len(waits) < 4 and time.monotonic() < deadline:
        time.sleep(0.005)
    link.stop()
    thread.join(timeout=2)

    assert len(waits) >= 4
    assert waits[1] > waits[0], "the backoff must still grow when nothing changed"


def test_an_unchanged_report_is_not_republished(link, session):
    """A revision, an fsync on the relay and a wake-up for every app watching,
    for a device saying exactly what it said a moment ago."""
    session.queue("PUT", "/reported", 200, {"ok": True, "rev": 1})
    link._publish_once()
    before = len(session.sent)

    link._publish_once()
    assert len(session.sent) == before


def test_every_dose_asks_to_be_published_however_it_was_caused(dispenser, identity,
                                                               session, daemon_wiring,
                                                               clock):
    """There are four ways a dose gets recorded — a release, a dose whose window
    closed untapped, a dose already past its window when the scheduler found it,
    and a manual drop at the bench — and the notification hangs off the one
    place they all pass through.

    Wired per-caller instead, the day somebody adds a fifth is the day that one
    is silently never reported, and the symptom is a carer who is simply not
    told about one kind of dose.
    """
    link = daemon_wiring

    link._ctl.wake_publisher.clear()
    dispenser.drop_now(1)                       # the bench / /dropout path
    assert link._ctl.wake_publisher.is_set()

    dispenser.apply_payload("SC1*W*1:0800-127-000")
    clock.set(datetime(2026, 7, 29, 8, 0))
    dispenser.tick()

    link._ctl.wake_publisher.clear()
    assert len(dispenser.release()) == 1        # the tap, from the LAN or the relay
    assert link._ctl.wake_publisher.is_set()


def test_a_dose_becoming_due_is_published_at_once(dispenser, identity, session,
                                                  daemon_wiring, clock):
    """The latency budget of the whole release model. The app cannot offer a
    button for a dose it has not heard about, so the report has to go up when
    the ring goes green — not at the next heartbeat five minutes later, by which
    point a twelfth of the window is already gone."""
    link = daemon_wiring
    dispenser.apply_payload("SC1*W*1:0800-127-000")
    clock.set(datetime(2026, 7, 29, 8, 0))

    link._ctl.wake_publisher.clear()
    assert dispenser.tick() == [], "nothing is recorded yet — it has only been offered"
    assert link._ctl.wake_publisher.is_set(), "but the app has to be told immediately"


@pytest.fixture
def daemon_wiring(dispenser, identity, session):
    """The link wired to the dispenser the way `daemon.py` wires it."""
    link = cloud.CloudLink(dispenser, identity, relay_url=RELAY, enabled=True,
                           session=session)
    dispenser.on_event = lambda _record: link.nudge()
    dispenser.on_change = link.nudge
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
    waiter = threading.Thread(target=lambda: link._wait_to_publish(link._ctl, 30), daemon=True)
    waiter.start()
    _time.sleep(0.2)
    link.nudge()
    waiter.join(timeout=5)

    assert _time.monotonic() - started < 2.0
    assert not link._ctl.wake_publisher.is_set()     # cleared, ready for the next one


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


def _events(dispenser):
    """What the device wrote down. A drop that moved nothing leaves nothing."""
    return [e["tray"] for e in dispenser.store.read_events()]


def test_a_drop_from_the_cloud_opens_the_tray(link, dispenser):
    """The question `release` cannot answer: does this machine work.

    `release` is bounded by what the device is currently offering, which is right
    for medication and useless on a bench with no prescription loaded — there is
    nothing due, so nothing to release. Somebody who has just assembled a machine,
    or is demonstrating one, is asking whether tray 3 turns.
    """
    link._carry_out({"action": "drop", "tray": 2}, 7)          # noqa: SLF001
    assert _events(dispenser) == [2], "the tray did not open"


def test_a_drop_from_the_cloud_is_marked_manual(link, dispenser):
    """Something left the hopper, so the record must not omit it — and it was not
    a scheduled dose, so the adherence figures must be able to tell."""
    link._carry_out({"action": "drop", "tray": 3}, 7)          # noqa: SLF001
    assert dispenser.store.read_events()[-1]["reason"] == "manual"


def test_a_drop_with_no_tray_is_refused_rather_than_guessed(link, dispenser):
    """There is no "every tray" here and there should not be. A command that
    names nothing is a bug upstream, and opening all eight is not a recovery."""
    link._carry_out({"action": "drop"}, 8)                     # noqa: SLF001
    assert _events(dispenser) == []


def test_a_beep_moves_nothing(link, dispenser):
    """It answers "is this the right box" — the one question that must not cost
    a pill to ask."""
    link._carry_out({"action": "beep"}, 9)                     # noqa: SLF001
    assert _events(dispenser) == []


def test_an_action_this_firmware_does_not_do_is_ignored(link, dispenser):
    """A newer app, or a relay handing back something odd. Ignored and logged —
    never guessed at, because every guess here moves a servo."""
    link._carry_out({"action": "launch", "tray": 1}, 10)       # noqa: SLF001
    assert _events(dispenser) == []


def test_a_beep_on_a_build_with_no_buzzer_is_not_an_error(link, dispenser):
    """A screen-only build is a valid build, and so is one with neither.

    The `Indicator` protocol therefore has no method for making a noise — which
    is how the first version of this shipped calling one that does not exist:

        ERROR  a beep from the cloud failed:
               'FittedIndicator' object has no attribute 'beep'

    Found by pressing the button, not by the suite, because the suite's indicator
    happened to be a different class. So the shape is pinned here instead.
    """
    assert not hasattr(dispenser.indicator, "beep"), \
        "if Indicator grows a beep(), simplify _bench to call it"
    link._carry_out({"action": "beep"}, 11)                    # noqa: SLF001
    assert _events(dispenser) == []


def test_a_hello_marks_the_box_claimed_and_survives_a_restart(link, dispenser, tmp_path):
    """The moment the pairing screen has to come down.

    Pairing happens wholly inside the app — the keys come off a printed code and
    nothing is announced — so the device cannot see it. Between pairing and the
    first prescription, a box that had just been paired went on showing a "pair
    with me" code to the phone that had already done it.

    The claim is written to the card rather than kept in memory: a reboot must
    not make the box ask again, because the phone still has the keys and nothing
    on this side changed.
    """
    assert not link.status()["claimedAt"]
    link._carry_out({"action": "hello"}, 12)                   # noqa: SLF001
    claimed = link.status()["claimedAt"]
    assert claimed, "the box did not record that it had been claimed"
    assert _events(dispenser) == [], "hello must move nothing"

    # A second phone, or the same one re-paired. The first moment stands.
    link._carry_out({"action": "hello"}, 13)                   # noqa: SLF001
    assert link.status()["claimedAt"] == claimed


def test_a_goodbye_lets_the_box_be_claimed_again(link):
    """Both halves, because the first version only had one.

    `hello` alone left the box orphaned: the phone throws its keys away on
    unpair and the box cannot see that, so a machine nobody owns went on
    believing it was owned and never showed its pairing code again. The next
    person in front of it — a new carer, a new phone, somebody demonstrating —
    had nothing they could do.
    """
    link._carry_out({"action": "hello"}, 20)                   # noqa: SLF001
    assert link.status()["claimedAt"]

    link._carry_out({"action": "goodbye"}, 21)                 # noqa: SLF001
    assert not link.status()["claimedAt"], "the box still thinks it is owned"

    # And it can be taken again. This is the whole loop a demonstration needs.
    link._carry_out({"action": "hello"}, 22)                   # noqa: SLF001
    assert link.status()["claimedAt"]
