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
from snapcare_dispenser.display import health
from snapcare_dispenser.display.presence import Presence


#: A machine that is up and has told us about itself. `known=True` matters:
#: it defaults False, meaning "no snapshot has been taken yet", and the policy
#: shows the boot frame until one has. A fixture without it is describing a
#: device that has only just been plugged in.
WELL = Health(dispensing=True, problem="", wifi="online", ssid="SNAPCARE-V5XH",
              address="192.168.1.42", next_tray=3, next_at="20:00",
              now="12:34", waiting=0, known=True, clock_source="ntp",
              trays_loaded=2,
              #: A machine with two trays loaded has been prescribed, by
              #: definition — `snapshot` computes both from the same
              #: `scheduler.slots`. Stated here so the fixture cannot describe a
              #: device that is dispensing *and* still asking to be set up.
              prescribed=True)

#: On a network, dispensing nothing, because nobody has sent it a prescription.
#: The second half of setup, and the state the pairing frame exists for.
UNCLAIMED = replace(WELL, prescribed=False, trays_loaded=0,
                    next_tray=None, next_at="", claim="DDBQE-KEJ78",
                    pair_payload="https://relay.example/pair#DDBQEKEJ78")


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


def showing(policy, clock, when: float, health=WELL):
    """What is *on the panel* at `when`, repaint or not.

    Different from `screen_at` on purpose: `tick` answers "did anything change",
    and returns None whenever the answer is no, so "what is on the panel" has to
    be tracked by whoever is asking.

    The last screen is kept on the `policy` rather than in a default argument.
    It used to be `_last=[None]`, which is one list shared by every call in the
    module — so a test's idea of what was on the panel leaked into the next
    test, and whether a test passed depended on which ones ran before it.
    """
    screen = screen_at(policy, clock, when, health)
    if screen is not None:
        policy._showing_in_test = screen  # noqa: SLF001 - test bookkeeping
    return getattr(policy, "_showing_in_test", None)


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
    # The one exception to the night palette, and the reason the device exists:
    # a dose waiting at 3 a.m. is shown in full colour at any hour.
    assert plan.night is False


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

def test_the_resting_screen_is_the_only_resting_screen(policy, clock):
    """The rotation is gone, and this is what replaced it.

    `idle`, `status` and `wifi` used to take turns, which had two faults: the
    fact you wanted was not there when you looked, and the row moved. The status
    bar now carries permanently, in fixed positions, everything `status` showed,
    and the hero's secondary line carries the address `wifi` showed — so there
    is nothing left to rotate and no waiting for a card to come round.

    It was also broken: `rest_rotate_s` was 8 s while `tick` runs on the 15 s
    scheduler loop, so the sequence aliased to `idle` about a tenth of the time
    and `status` held for two minutes at a stretch.
    """
    seen = {screen_at(policy, clock, 1000 + step) for step in range(0, 600, 15)}
    assert seen <= {"idle", None}, f"something else took a turn: {seen}"


# ── transients expire; nothing is left showing something that stopped being true

def test_a_release_takes_no_screen_of_its_own(policy, clock):
    """배출은 눈앞에서 일어난다. 서보가 돌고 약이 컵에 떨어지는 것이 확인이고,
    거기에 화면을 하나 더 얹는 것은 이미 끝난 일을 다시 알리는 일이다.

    `network` 가 다시 붙는 전환과 같은 처리다 — 그쪽도 자기 화면 없이 아래로
    떨어진다. 확인이 사라지는 것은 아니다. 누르는 순간 알람이 그치고 짧은 확인음이
    나며, 아래 띠의 그 복용 표시가 파랑으로 바뀐다."""
    policy.event("released", tray=3)
    assert screen_at(policy, clock, 1000) == "idle"


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
    # `args` now leads with the whole snapshot — the screens read what they need
    # off it rather than being handed loose scalars that can disagree with it.
    # What matters here is that the *event's* SSID is the one carried, not the
    # stale snapshot's.
    assert plan.args[0].ssid == "SNAPCARE-V5XH"


# ── the second half of setup: a network, and no prescription ────────────────

def test_a_machine_nobody_has_prescribed_for_shows_its_pairing_code(policy, clock):
    """The state that used to have no screen.

    A dispenser on WiFi with nothing loaded sat on the resting frame saying "no
    doses today" — which is true, and is also exactly what a fully configured
    machine says on a quiet Sunday. So the one state where somebody has to go
    and *do* something looked identical to the state where nobody does.
    """
    assert screen_at(policy, clock, 1000, UNCLAIMED) == "pair"


def test_a_prescribed_machine_never_asks_to_be_paired(policy, clock):
    """The frame has to clear on its own. A setup card that outlives setup is a
    machine that looks broken to the person who just finished setting it up."""
    assert screen_at(policy, clock, 1000, replace(UNCLAIMED, prescribed=True)) == "idle"


def test_a_schedule_off_a_paper_sheet_counts_as_prescribed(policy, clock):
    """It never touches the relay, so `appliedAt` stays empty for it — and a
    machine dispensing from a photographed form sheet must not be showing a
    setup screen. `snapshot` reads `scheduler.slots` for exactly this."""
    from_paper = replace(UNCLAIMED, prescribed=True, trays_loaded=2)
    assert screen_at(policy, clock, 1000, from_paper) == "idle"


def test_a_waiting_dose_outranks_the_pairing_code(policy, clock):
    """Every rung above this one is the machine doing its job. A dose waiting on
    a press must never be covered by a setup card — that is the screen the whole
    device exists to show."""
    owed = replace(UNCLAIMED, waiting=1, waiting_tray=3, waiting_at="08:00")
    assert screen_at(policy, clock, 1000, owed) == "due"


def test_a_machine_that_cannot_dispense_says_so_instead(policy, clock):
    """Same rule, one rung higher: never invite somebody to set up a machine
    whose trays will not open. They would finish and it still would not work."""
    broken = replace(UNCLAIMED, dispensing=False, problem="gpio")
    assert screen_at(policy, clock, 1000, broken) == "blocked"


def test_the_network_comes_before_the_phone(policy, clock):
    """Forced by the order of the job: a phone cannot reach a dispenser that is
    not on a network yet, so the pairing code would be an instruction nobody
    could carry out."""
    on_hotspot = replace(UNCLAIMED, wifi="hotspot", address="",
                         passphrase="k7mfq3ptx9wd")
    assert screen_at(policy, clock, 1000, on_hotspot) == "network"


def test_no_code_means_no_pairing_frame(policy, clock):
    """A QR of nothing scans as garbage, and a frame drawn before the first
    reading would have exactly that. Falls through to the resting frame."""
    assert screen_at(policy, clock, 1000, replace(UNCLAIMED, pair_payload="")) == "idle"


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
    # A palette, not a brightness. This build's backlight is tied to 3V3 and
    # there is no pin to dim, so "quiet" is a darker set of colours and the
    # panel is never blanked — the invariant this test has always been about.
    assert plan.night is True
    assert plan.screen == "idle", "quiet hours must not take the screen away"


def test_boot_shows_something_at_once(policy, clock):
    """Somebody who has just plugged it in and sees a black panel concludes it
    is dead and pulls the plug out again."""
    policy.event("boot")
    clock[0] = 1000
    plan = policy.tick(WELL)
    assert plan is not None
    assert plan.screen == "boot"
    # Never dimmed on the way up: somebody is standing over it having just
    # plugged it in.
    assert plan.night is False
