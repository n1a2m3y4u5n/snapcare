"""What is on the panel, and when.

The policy decides three things and each has a way of being quietly wrong:

  **which screen** — a stale one is worse than a blank one, because a machine
  showing last night's missed dose reads as a machine with a problem right now;
  **for how long** — a transient that never expires hides everything behind it,
  and a standing problem that dwells and then vanishes is a fault the device
  stopped mentioning;
  **how brightly** — a bedside panel at full brightness at 3 a.m. is a real
  complaint, and a blank one at 3 a.m. is somebody who cannot find out whether
  they have a dose waiting without pressing something.

All of it is driven from a fake clock, so these run to the second and take none.
"""
from __future__ import annotations

from dataclasses import replace

import pytest

from snapcare_dispenser.display.health import Health
from snapcare_dispenser.display.presence import Presence


WELL = Health(dispensing=True, problem="", wifi="online", ssid="SNAPCARE-V5XH",
              address="192.168.1.42", next_tray=3, next_at="20:00",
              now="12:34", waiting=0)


@pytest.fixture
def clock():
    return [1000.0]


@pytest.fixture
def policy(clock):
    return Presence(monotonic=lambda: clock[0])


def screen_at(policy, clock, when: float, health=WELL):
    """The screen after advancing to `when`, or None if nothing was repainted."""
    clock[0] = when
    plan = policy.tick(health)
    return plan.screen if plan else None


def showing(policy, clock, when: float, health=WELL, _last=[None]):
    """What is *on the panel* at `when`, repaint or not.

    Different from `screen_at` on purpose. `tick` legitimately returns a fresh
    plan for the same screen — the brightness decays as attention fades, and the
    burn-in offset drifts — so "did it repaint" and "what is it showing" are two
    questions and only the second one is about behaviour.
    """
    screen = screen_at(policy, clock, when, health)
    if screen is not None:
        _last[0] = screen
    return _last[0]


# ── a dose waiting outranks everything except a machine that cannot dispense ─

def test_a_waiting_dose_holds_the_panel_for_as_long_as_it_is_waiting(policy, clock):
    """It is not a notification. Nothing has left the hopper, and this screen is
    the entire prompt — so it stands until the dose is settled, however long
    that is."""
    waiting = replace(WELL, waiting=1)
    assert showing(policy, clock, 1000, waiting) == "due"
    for minute in range(1, 40):
        assert showing(policy, clock, 1000 + minute * 60, waiting) == "due", \
            "the due screen was replaced while the dose was still waiting"


def test_a_waiting_dose_is_never_dimmed(policy, clock):
    """Quiet hours are for the resting screen. A person woken at 3 a.m. by the
    chirp has to be able to see which tray it is."""
    night = replace(WELL, waiting=1, now="03:00")
    clock[0] = 1000
    plan = policy.tick(night)
    assert plan.screen == "due"
    assert plan.brightness == 255


def test_a_machine_that_will_not_dispense_outranks_a_waiting_dose(policy, clock):
    """Never tell somebody to press a button that has been disconnected from the
    thing it is meant to do."""
    stuck = replace(WELL, waiting=1, dispensing=False, problem="gpio")
    assert screen_at(policy, clock, 1000, stuck) == "blocked"


def test_a_standing_problem_does_not_dwell_and_then_hide(policy, clock):
    """A transient expires because it stopped being true. A blocked machine is
    still blocked twenty seconds later, so the screen has to still say so."""
    stuck = replace(WELL, dispensing=False, problem="clock")
    assert showing(policy, clock, 1000, stuck) == "blocked"
    for step in (30, 60, 600, 3600):
        assert showing(policy, clock, 1000 + step, stuck) == "blocked", \
            "the fault stopped being mentioned while it was still true"


# ── the resting rotation, which is what carries everything else ─────────────

def test_resting_rotates_so_the_other_screens_are_reachable_without_a_button(
        policy, clock):
    """Putting the network and the whole-machine status behind an interaction
    would put them behind a skill this device may not assume."""
    seen = []
    for step in range(0, 40, 8):
        screen = screen_at(policy, clock, 1000 + step)
        if screen:
            seen.append(screen)
    assert seen == ["idle", "status", "idle", "status", "idle"]


def test_the_wifi_card_joins_the_rotation_only_when_the_radio_has_something_to_say(
        policy, clock):
    """On a device that has been online for a month it reads "yes, still fine" —
    true, and a waste of one of the few turns anybody will ever look at."""
    offline = replace(WELL, wifi="offline")
    seen = [screen_at(policy, clock, 1000 + step, offline)
            for step in range(0, 24, 8)]
    assert seen == ["idle", "status", "wifi"]


def test_the_rotation_always_restarts_at_idle(clock):
    """Anchored to when resting began, not to uptime.

    Against absolute monotonic time the first frame somebody sees after walking
    up is whatever the clock happens to be on — and `idle`, the one that answers
    "is it alive and when is my next dose", is the one they most often wanted.
    """
    for start in (0.0, 3.5, 1234.5, 99999.0):
        policy = Presence(monotonic=lambda: clock[0])
        clock[0] = start
        assert policy.tick(WELL).screen == "idle"


def test_an_event_restarts_the_rotation(policy, clock):
    """Somebody who has just been shown something and then looks back wants the
    screen that answers the ordinary question, not whichever card was next."""
    assert screen_at(policy, clock, 1000) == "idle"
    assert screen_at(policy, clock, 1008) == "status"

    policy.event("released", tray=3)
    clock[0] = 1010
    assert policy.tick(WELL).screen == "released"

    assert screen_at(policy, clock, 1040) == "idle"


# ── transients expire; nothing is left showing something that stopped being true

def test_a_released_screen_gives_the_panel_back(policy, clock):
    policy.event("released", tray=3)
    assert screen_at(policy, clock, 1000) == "released"
    assert screen_at(policy, clock, 1000 + 60) == "idle"


def test_settling_a_dose_takes_down_a_prompt_that_is_no_longer_true(policy, clock):
    """A dose announced and then withdrawn — a schedule replaced mid-window, an
    alert cleared — must not leave the machine asking somebody to come and press
    a button for pills that are not coming."""
    policy.event("due", tray=3, at="08:00")
    assert screen_at(policy, clock, 1000) == "due"

    policy.event("settled")
    assert screen_at(policy, clock, 1001) == "idle"


def test_joining_a_network_does_not_put_the_setup_card_back_up(policy, clock):
    """`network` fires whenever the radio changes, including on the way back to
    online. That screen says one thing — put me on a network — and showing it to
    celebrate a successful join sends somebody to do a job that has finished."""
    policy.event("network", ssid="SNAPCARE-V5XH")
    assert screen_at(policy, clock, 1000, replace(WELL, wifi="hotspot")) == "network"

    policy.event("settled")
    policy.event("network")
    assert screen_at(policy, clock, 1010, WELL) == "idle"


def test_the_setup_card_appears_on_the_event_not_a_tick_later(policy, clock):
    """The supervisor raises the hotspot and says so. The cached snapshot can be
    a tick behind, and a tick is fifteen seconds of a person standing in front
    of a machine that has not told them what network to join."""
    stale = replace(WELL, wifi="online")
    policy.event("network", ssid="SNAPCARE-V5XH")
    clock[0] = 1000
    plan = policy.tick(stale)
    assert plan.screen == "network"
    assert plan.args == ("SNAPCARE-V5XH",)


# ── the cheap part, which is what keeps it off the tick's budget ────────────

def test_nothing_changing_paints_nothing(policy, clock):
    """A full 320x240 repaint is 38 ms of SPI on a loop that also has to hit a
    scheduled minute."""
    assert screen_at(policy, clock, 1000) == "idle"
    for step in range(1, 8):
        assert screen_at(policy, clock, 1000 + step) is None


def test_a_policy_that_throws_leaves_the_panel_alone(policy, clock):
    """Whatever is up there is at worst stale, which beats a dark screen — a
    machine that looks off gets unplugged."""
    class Exploding:
        def __getattr__(self, name):
            raise RuntimeError("boom")

    clock[0] = 1000
    assert policy.tick(Exploding()) is None


# ── the bedside behaviour ───────────────────────────────────────────────────

def test_quiet_hours_dim_rather_than_blank(policy, clock):
    """A person waking at 3 a.m. wanting to know whether they have a dose due
    must not have to press something to find out."""
    night = replace(WELL, now="03:00")
    clock[0] = 1000
    plan = policy.tick(night)
    assert plan is not None
    assert 0 < plan.brightness < 255, "the panel must be dim, not dark"


def test_boot_shows_something_at_once(policy, clock):
    """Somebody who has just plugged it in and sees a black panel concludes it
    is dead and pulls the plug out again."""
    policy.event("boot")
    clock[0] = 1000
    plan = policy.tick(WELL)
    assert plan is not None
    assert plan.brightness == 255
