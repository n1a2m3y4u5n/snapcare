"""The radio-mode policy: joining, rolling back, and never being stranded.

This is the file that covers the two failures the flow used to have, both of
which ended with a person holding a dispenser they could not reach:

  * a join answered *after* the hotspot came down, so a mistyped password was
    indistinguishable from a successful setup;
  * a hotspot that, once up, was never taken down again — so a router that came
    back slowly after a power cut stranded the device for good.

`wifi` is stubbed at the function level rather than at nmcli, because what is
being tested here is the sequencing: which mechanism is called, in what order,
and what is left behind when one of them fails.
"""
from __future__ import annotations

import threading
import time

import pytest

from snapcare_dispenser import config, network, wifi
from snapcare_dispenser.provisioning import derive_identity


class FakeWifi:
    """Enough of `wifi` to sequence a join, with a record of what was asked.

    `join_result` is what `connect` returns; `mode` is what `status` reports and
    is moved by the calls, so a test reads the same state the supervisor does.
    """

    def __init__(self, mode="disconnected", join_result=(True, "Connected to Home."),
                 saved=(), hotspot_ok=True):
        self.mode = mode
        self.ssid = None
        self.address = None
        self.join_result = join_result
        self.saved = set(saved)
        self.hotspot_ok = hotspot_ok
        self.calls: list[str] = []
        self.forgotten: list[str] = []
        self.connect_args: list[tuple] = []

    # ── what the supervisor calls ──
    def available(self):
        return True

    def status(self):
        self.calls.append("status")
        if self.mode == "connected":
            return wifi.Status(mode="connected", ssid=self.ssid or "Home",
                               address=self.address or "192.168.1.42")
        if self.mode == "hotspot":
            return wifi.Status(mode="hotspot", ssid="SnapCare-V5XH",
                               address=config.AP_ADDRESS)
        return wifi.Status(mode=self.mode, detail=self.mode)

    def saved_ssids(self):
        return set(self.saved)

    def has_known_network(self):
        return bool(self.saved)

    def connect(self, ssid, password, timeout=45, hidden=False):
        self.calls.append("connect")
        self.connect_args.append((ssid, password, hidden))
        self.mode = "disconnected"          # the hotspot went down to try
        ok, detail = self.join_result
        if ok:
            self.mode = "connected"
            self.ssid = ssid
            self.saved.add(ssid)
        return ok, detail

    def start_hotspot(self, identity):
        self.calls.append("start_hotspot")
        if not self.hotspot_ok:
            return False, "the radio refused"
        self.mode = "hotspot"
        return True, identity.ssid

    def stop_hotspot(self):
        self.calls.append("stop_hotspot")
        self.mode = "disconnected"
        return True

    def forget_profiles_for(self, ssid):
        self.calls.append("forget_profiles_for")
        self.forgotten.append(ssid)
        return 1

    def wait_until_connected(self, seconds, poll=2.0, should_stop=None):
        self.calls.append("wait_until_connected")
        return self.status()


class RecordingIndicator:
    fitted = ()

    def __init__(self):
        self.said: list[str] = []

    def network_needs_setup(self):
        self.said.append("needs-setup")

    def network_online(self):
        self.said.append("online")


@pytest.fixture
def identity():
    return derive_identity("a1b2c3d4")


@pytest.fixture
def fake(monkeypatch):
    """Install a FakeWifi over the `wifi` module `network.py` imported."""
    def install(**kwargs):
        stub = FakeWifi(**kwargs)
        for name in ("available", "status", "saved_ssids", "has_known_network",
                     "connect", "start_hotspot", "stop_hotspot",
                     "forget_profiles_for", "wait_until_connected"):
            monkeypatch.setattr(network.wifi, name, getattr(stub, name))
        return stub
    return install


def settle(supervisor, seconds=2.0):
    """Wait for the one worker thread, whatever it is doing."""
    deadline = time.monotonic() + seconds
    while supervisor._busy() and time.monotonic() < deadline:
        time.sleep(0.005)
    assert not supervisor._busy(), "a network worker did not finish"


# ── the answer comes first ──────────────────────────────────────────────────

def test_a_join_is_accepted_before_the_radio_is_touched(fake, identity, monkeypatch):
    """The whole reason this module exists.

    The request arrives over the setup hotspot, and joining the house network
    destroys the socket the answer would travel on. So `begin_join` returns while
    the radio is still an access point, and the join happens afterwards.

    Asserted by holding the join open: if `begin_join` waited for it, this test
    would deadlock rather than fail, which is the difference between the property
    holding and the worker merely being slow to start.
    """
    stub = fake(mode="hotspot")
    joining, release = threading.Event(), threading.Event()
    real_connect = network.wifi.connect

    def held(ssid, passphrase, timeout=45, hidden=False):
        joining.set()
        release.wait(2)
        return real_connect(ssid, passphrase, timeout=timeout, hidden=hidden)

    monkeypatch.setattr(network.wifi, "connect", held)
    supervisor = network.Supervisor(identity, announce=False)

    accepted, message = supervisor.begin_join("Home", "correct")
    assert accepted
    assert "Home" in message
    assert joining.wait(2), "the join should be under way on its own thread"
    # Answered while the radio was still the access point the request arrived on.
    assert supervisor.snapshot()["state"] == network.JOINING
    assert stub.mode == "hotspot"

    release.set()
    settle(supervisor)
    assert stub.connect_args == [("Home", "correct", False)]
    assert supervisor.snapshot()["state"] == network.JOINED


def test_a_successful_join_reports_the_address(fake, identity):
    fake(mode="hotspot")
    supervisor = network.Supervisor(identity, announce=False)
    supervisor.begin_join("Home", "correct")
    settle(supervisor)

    snap = supervisor.snapshot()
    assert snap["state"] == network.JOINED
    assert snap["ssid"] == "Home"
    assert snap["address"] == "192.168.1.42"


def test_two_joins_at_once_are_refused_rather_than_raced(fake, identity, monkeypatch):
    """Two nmcli calls fighting over one radio, and the loser's error message is
    about the driver."""
    stub = fake(mode="hotspot")
    # A join that does not finish on its own, so the second request lands while
    # the first is still running.
    holding = {"go": False}

    def slow_connect(ssid, password, timeout=45, hidden=False):
        while not holding["go"]:
            time.sleep(0.005)
        stub.mode = "connected"
        return True, "Connected."

    monkeypatch.setattr(network.wifi, "connect", slow_connect)
    supervisor = network.Supervisor(identity, announce=False)
    assert supervisor.begin_join("Home", "a")[0] is True
    accepted, message = supervisor.begin_join("Office", "b")
    assert accepted is False
    assert "already" in message

    holding["go"] = True
    settle(supervisor)


# ── the rollback ────────────────────────────────────────────────────────────

def test_a_refused_password_brings_the_setup_network_back(fake, identity):
    """Within seconds. The old firmware left the device with no access point and
    no network until a ten-minute timer expired — ten minutes of a device that
    has simply vanished."""
    stub = fake(mode="hotspot", join_result=(False, "The password was not accepted."))
    supervisor = network.Supervisor(identity, announce=False)

    supervisor.begin_join("Home", "wrong")
    settle(supervisor)

    assert stub.calls.count("start_hotspot") == 1
    assert stub.mode == "hotspot"
    snap = supervisor.snapshot()
    assert snap["state"] == network.FAILED
    assert snap["detail"] == "The password was not accepted."
    assert snap["hotspotBack"] is True


def test_a_failed_join_removes_the_profile_it_left_behind(fake, identity):
    """A wrong-password profile autoconnects. The device would spend the rest of
    its life offering a password it has already been told is wrong, fighting the
    setup hotspot every time."""
    stub = fake(mode="hotspot", join_result=(False, "The password was not accepted."))
    supervisor = network.Supervisor(identity, announce=False)

    supervisor.begin_join("Home", "wrong")
    settle(supervisor)
    assert stub.forgotten == ["Home"]


def test_a_network_that_was_already_saved_keeps_its_profile(fake, identity):
    """Somebody mistyping a new password for the network the device is already
    using must not destroy the working profile it came in on."""
    stub = fake(mode="hotspot", join_result=(False, "The password was not accepted."),
                saved={"Home"})
    supervisor = network.Supervisor(identity, announce=False)

    supervisor.begin_join("Home", "wrong")
    settle(supervisor)
    assert stub.forgotten == []


def test_a_rollback_that_also_fails_is_recorded_honestly(fake, identity):
    """The device is now reachable only over a cable. Saying "the setup network
    is back" would send somebody looking for an SSID that is not there."""
    fake(mode="hotspot", join_result=(False, "The password was not accepted."),
         hotspot_ok=False)
    supervisor = network.Supervisor(identity, announce=False)

    supervisor.begin_join("Home", "wrong")
    settle(supervisor)

    snap = supervisor.snapshot()
    assert snap["state"] == network.FAILED
    assert snap["hotspotBack"] is False


def test_a_hidden_network_is_passed_through_as_hidden(fake, identity):
    stub = fake(mode="hotspot")
    supervisor = network.Supervisor(identity, announce=False)
    supervisor.begin_join("Unlisted", "secret", hidden=True)
    settle(supervisor)
    assert stub.connect_args == [("Unlisted", "secret", True)]


# ── boot ────────────────────────────────────────────────────────────────────

def test_start_does_not_block_the_caller(fake, identity):
    """`start` used to wait up to WIFI_JOIN_TIMEOUT_S before the first scheduler
    tick. On a morning where the power came back at 07:58, that is a dose held up
    by a router."""
    fake(mode="disconnected", saved={"Home"})
    supervisor = network.Supervisor(identity, announce=False)

    began = time.monotonic()
    supervisor.start()
    assert time.monotonic() - began < 0.5
    settle(supervisor)


def test_a_boot_with_nothing_saved_goes_straight_to_the_hotspot(fake, identity):
    stub = fake(mode="disconnected")
    supervisor = network.Supervisor(identity, announce=False)
    supervisor.start()
    settle(supervisor)
    assert "wait_until_connected" not in stub.calls
    assert stub.mode == "hotspot"


def test_a_boot_that_is_already_online_leaves_the_radio_alone(fake, identity):
    stub = fake(mode="connected")
    supervisor = network.Supervisor(identity, announce=False)
    supervisor.start()
    settle(supervisor)
    assert "start_hotspot" not in stub.calls


def test_wifi_management_can_be_switched_off(fake, identity):
    stub = fake(mode="disconnected")
    supervisor = network.Supervisor(identity, manage=False, announce=False)
    supervisor.start()
    supervisor.tick()
    accepted, message = supervisor.begin_join("Home", "x")

    assert stub.calls == []
    assert accepted is False and "off" in message
    assert supervisor.snapshot()["managed"] is False


# ── never stranded ──────────────────────────────────────────────────────────

def test_the_hotspot_is_retried_against_the_known_network(fake, identity, monkeypatch):
    """The stranding fix. A router that takes longer to come back after a power
    cut than the device waits used to leave the dispenser on its own hotspot
    permanently — nothing ever tried the house network again."""
    monkeypatch.setattr(config, "HOTSPOT_RETRY_S", 0)
    monkeypatch.setattr(config, "PORTAL_QUIET_S", 0)
    stub = fake(mode="hotspot", saved={"Home"})
    supervisor = network.Supervisor(identity, announce=False)

    supervisor.tick()                  # notices the hotspot
    supervisor.tick()                  # and that it is worth a retry
    settle(supervisor)

    assert "stop_hotspot" in stub.calls
    assert "wait_until_connected" in stub.calls


def test_a_retry_that_fails_puts_the_hotspot_back(fake, identity, monkeypatch):
    monkeypatch.setattr(config, "HOTSPOT_RETRY_S", 0)
    monkeypatch.setattr(config, "PORTAL_QUIET_S", 0)
    stub = fake(mode="hotspot", saved={"Home"})
    supervisor = network.Supervisor(identity, announce=False)

    supervisor.tick()
    supervisor.tick()
    settle(supervisor)

    assert stub.mode == "hotspot"
    # And deliberately *not* recorded as a failure: nobody asked for this, and a
    # failure banner about an attempt the person never made sends them looking
    # for a problem that is a router being slow.
    assert supervisor.snapshot()["state"] != network.FAILED


def test_a_retry_that_works_reports_the_network(fake, identity, monkeypatch):
    monkeypatch.setattr(config, "HOTSPOT_RETRY_S", 0)
    monkeypatch.setattr(config, "PORTAL_QUIET_S", 0)
    stub = fake(mode="hotspot", saved={"Home"})

    def rejoins(seconds, poll=2.0, should_stop=None):
        stub.mode = "connected"
        stub.ssid = "Home"
        return stub.status()

    monkeypatch.setattr(network.wifi, "wait_until_connected", rejoins)
    supervisor = network.Supervisor(identity, announce=False)

    supervisor.tick()
    supervisor.tick()
    settle(supervisor)

    assert supervisor.snapshot()["state"] == network.JOINED
    assert stub.calls.count("start_hotspot") == 0


def test_nothing_saved_means_no_retry(fake, identity, monkeypatch):
    """Otherwise the hotspot is dropped for nothing, which is a device that
    disappears for half a minute at a time for no reason at all."""
    monkeypatch.setattr(config, "HOTSPOT_RETRY_S", 0)
    monkeypatch.setattr(config, "PORTAL_QUIET_S", 0)
    stub = fake(mode="hotspot")
    supervisor = network.Supervisor(identity, announce=False)

    supervisor.tick()
    supervisor.tick()
    settle(supervisor)
    assert "stop_hotspot" not in stub.calls


def test_somebody_using_the_setup_page_is_not_interrupted(fake, identity, monkeypatch):
    """The alternative is pulling the network out from under a person who is
    halfway through typing their WiFi password."""
    monkeypatch.setattr(config, "HOTSPOT_RETRY_S", 0)
    monkeypatch.setattr(config, "PORTAL_QUIET_S", 300)
    stub = fake(mode="hotspot", saved={"Home"})
    supervisor = network.Supervisor(identity, announce=False)

    supervisor.note_portal_activity()      # the setup page just loaded
    supervisor.tick()
    supervisor.tick()
    settle(supervisor)
    assert "stop_hotspot" not in stub.calls


def test_a_blink_in_the_wifi_is_not_answered_with_a_hotspot(fake, identity):
    """NetworkManager reconnects on its own within seconds. Raising an access
    point every time the WiFi flickers takes the device off the network far more
    often than it ever rescues it."""
    stub = fake(mode="disconnected", saved={"Home"})
    supervisor = network.Supervisor(identity, announce=False)

    supervisor.tick()
    settle(supervisor)
    assert "start_hotspot" not in stub.calls


def test_a_sustained_outage_does_raise_the_hotspot(fake, identity, monkeypatch):
    monkeypatch.setattr(config, "OFFLINE_GRACE_S", -1)
    stub = fake(mode="disconnected", saved={"Home"})
    supervisor = network.Supervisor(identity, announce=False)

    supervisor.tick()
    settle(supervisor)
    assert stub.mode == "hotspot"


def test_a_tick_never_waits_on_the_radio(fake, identity, monkeypatch):
    """`tick` shares the loop that decides whether a dose is owed."""
    monkeypatch.setattr(config, "OFFLINE_GRACE_S", -1)
    fake(mode="disconnected", saved={"Home"})

    def slow_hotspot(identity_):
        time.sleep(0.4)
        return True, "SnapCare-V5XH"

    monkeypatch.setattr(network.wifi, "start_hotspot", slow_hotspot)
    supervisor = network.Supervisor(identity, announce=False)

    began = time.monotonic()
    supervisor.tick()
    assert time.monotonic() - began < 0.2
    settle(supervisor)


# ── telling the room and the cloud ──────────────────────────────────────────

def test_the_ring_says_the_device_needs_a_network(fake, identity):
    """A dispenser sitting on its own hotspot waiting to be configured is
    otherwise indistinguishable from a dispenser that is switched off."""
    fake(mode="disconnected")
    indicator = RecordingIndicator()
    supervisor = network.Supervisor(identity, indicator=indicator, announce=False)

    supervisor.start()
    settle(supervisor)
    assert indicator.said == ["needs-setup"]


def test_the_ring_stops_saying_it_once_the_network_is_up(fake, identity):
    fake(mode="connected")
    indicator = RecordingIndicator()
    supervisor = network.Supervisor(identity, indicator=indicator, announce=False)

    supervisor.start()
    settle(supervisor)
    assert indicator.said == ["online"]


def test_coming_online_is_announced_exactly_once(fake, identity, monkeypatch):
    """The cloud link resets its backoff on this, and a listener called on every
    tick would be a device republishing its state every fifteen seconds."""
    # The tick loop reads a cached answer by default — three nmcli processes is
    # not something to spend every fifteen seconds. This test is about the edge,
    # not the caching, so it asks for a fresh one each time.
    monkeypatch.setattr(config, "NET_POLL_S", 0)
    stub = fake(mode="connected")
    seen = []
    supervisor = network.Supervisor(identity, announce=False,
                                   on_online=lambda state: seen.append(state.ssid))

    supervisor.start()
    settle(supervisor)
    supervisor.tick()
    supervisor.tick()
    assert seen == ["Home"]

    # Off and back on again is a second event, because that is when the cloud
    # link has a stale backoff to collapse.
    stub.mode = "disconnected"
    supervisor.tick()
    stub.mode = "connected"
    supervisor.tick()
    assert seen == ["Home", "Home"]


def test_a_listener_that_raises_does_not_take_the_network_down(fake, identity):
    fake(mode="connected")

    def explode(_state):
        raise RuntimeError("the relay client is unhappy")

    supervisor = network.Supervisor(identity, announce=False, on_online=explode)
    supervisor.start()
    settle(supervisor)
    assert supervisor.snapshot()["state"] in (network.IDLE, network.JOINED)


def test_a_worker_that_raises_is_logged_and_not_fatal(fake, identity, caplog,
                                                      monkeypatch):
    """A network worker that throws must not be a dispenser that stops."""
    fake(mode="hotspot")

    def explode(*_args, **_kwargs):
        raise RuntimeError("nmcli is having a day")

    monkeypatch.setattr(network.wifi, "connect", explode)
    supervisor = network.Supervisor(identity, announce=False)
    with caplog.at_level("ERROR"):
        supervisor.begin_join("Home", "x")
        settle(supervisor)
    assert "a network operation failed" in caplog.text
    # And the next attempt is free to try again.
    assert supervisor.begin_join("Home", "x")[0] is True
