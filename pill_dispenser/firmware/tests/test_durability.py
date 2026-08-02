"""What must survive a plug pulled at the worst possible instant.

Every test here was written against a reproduction script that drove the real
`Dispenser`, `Scheduler`, `Store` and `Clock` and produced the wrong outcome
before the fix landed. They are kept together rather than filed by module
because durability is not a module: the double dose below is a scheduler mark,
a store payload and a device method disagreeing about what "the same schedule"
means, and the interrupted sweep is a servo, a file and an event log.

The rule for adding one: say what the plug being pulled (or the carer tapping
Save) does to the person in front of the machine. A durability test whose
failure message does not name the dose that goes missing or the pill that falls
twice is a test somebody will delete when it goes red.
"""
from __future__ import annotations

import time
from datetime import datetime, timedelta

import pytest

from snapcare_dispenser import config, rtc, sc1
from snapcare_dispenser.clock import Clock
from snapcare_dispenser.device import Dispenser
from snapcare_dispenser.indicators import LogIndicator
from snapcare_dispenser.servo import MockBackend, TrayServos


@pytest.fixture(autouse=True)
def fresh_rtc_cache():
    """The chip's answer is cached for thirty seconds, process-wide."""
    rtc.invalidate()
    yield
    rtc.invalidate()


def build(store, clock, trays=(1, 2)) -> Dispenser:
    """A dispenser on this store and clock, rebuilt as a reboot would."""
    return Dispenser(store=store, clock=clock,
                     servos=TrayServos(backend=MockBackend(),
                                       pins={t: 10 + t for t in trays},
                                       sleep=lambda _s: None))


def offer_at(device, clock, when: datetime):
    clock.set(when)
    device.tick()
    return device


class Recording(LogIndicator):
    """What the panel and the buzzer were told, in order.

    Deliberately not `FittedIndicator`: these tests are about what the dispenser
    *says*, and asserting through a real screen would couple them to a colour
    vocabulary that is being redrawn in a different branch.
    """

    def __init__(self):
        self.calls: list[tuple] = []

    def dose_due(self, tray: int, when=None) -> None:
        self.calls.append(("due", tray))

    def dose_released(self, tray: int) -> None:
        self.calls.append(("released", tray))

    def dose_missed(self, tray: int, when=None) -> None:
        self.calls.append(("missed", tray, when))

    def schedule_accepted(self, trays: int | None = None) -> None:
        self.calls.append(("schedule",))

    def silence(self) -> None:
        self.calls.append(("silence",))

    def clear(self, tray: int | None = None, at=None) -> None:
        self.calls.append(("clear",))


# ── re-applying a schedule that has not changed ─────────────────────────────

def test_re_applying_an_identical_schedule_does_not_re_drop_the_morning_dose(
        dispenser, servos, clock):
    """A carer taps Save twice, or a cloud resync re-sends the running plan.

    `set_schedule` called `Scheduler.load` unconditionally, which rebuilds every
    tray's `SlotState` with `ever_fired=False` — so the 08:00 dose that had
    already been delivered became due again at 08:20, the chirp restarted, and
    the next tap dropped a second pill. Reproduced against the real classes:
    drops went 1 -> 2. The reachable trigger after a power cut is a lost
    `cloud.json`, whose own comment claims re-applying the current schedule is
    a no-op.
    """
    payload = "SC1*W*1:0800-127-030"
    dispenser.apply_payload(payload, source="cloud")
    offer_at(dispenser, clock, datetime(2026, 7, 29, 8, 0))
    assert len(dispenser.release()) == 1
    assert servos.drops[1] == 1

    clock.set(datetime(2026, 7, 29, 8, 20))
    ok, _message = dispenser.apply_payload(payload, source="cloud")
    assert ok
    dispenser.tick()

    assert dispenser.awaiting_release == [], "the 08:00 dose was offered a second time"
    assert dispenser.release() == []
    assert servos.drops[1] == 1, "tray 1 dropped twice for one 08:00 dose"


def test_re_applying_an_identical_schedule_does_not_restart_the_course(
        dispenser, clock):
    """A 30-day course that is re-sent every night never ends.

    `Scheduler.load` stamps `start_day = today` on every tray, so each re-save
    pushed the end of the course another 30 days out. The medication runs for
    ever and nobody is told.
    """
    payload = "SC1*W*1:0800-127-002"          # two days only
    dispenser.apply_payload(payload, source="cloud")
    started = dispenser.scheduler.state[1].start_day

    clock.advance(days=1)
    dispenser.apply_payload(payload, source="cloud")

    assert dispenser.scheduler.state[1].start_day == started, \
        "the course restarted, so it can never finish"


def test_adding_a_second_medication_does_not_re_drop_the_first(
        dispenser, servos, clock):
    """08:20, the morning dose already given, and the carer adds tray 2.

    The payload genuinely changed, so the identity fast path does not apply —
    but tray 1's line in it did not, and rebuilding its state re-offered a dose
    that was already in the person's hand.
    """
    dispenser.apply_payload("SC1*W*1:0800-127-030", source="api")
    offer_at(dispenser, clock, datetime(2026, 7, 29, 8, 0))
    dispenser.release()
    assert servos.drops[1] == 1

    clock.set(datetime(2026, 7, 29, 8, 20))
    dispenser.apply_payload("SC1*W*1:0800-127-030/2:1200-127-030", source="api")
    dispenser.tick()

    assert dispenser.awaiting_release == []
    assert servos.drops[1] == 1, "tray 1 dropped twice because tray 2 was added"


def test_a_changed_tray_still_forgets_what_it_dispensed(dispenser, servos, clock):
    """The other half of the contract. A tray whose times moved is a new
    prescription for that tray, and it starts from scratch — otherwise the
    08:00 mark would suppress the new 08:00 dose of a different drug."""
    dispenser.apply_payload("SC1*W*1:0800-127-030", source="api")
    offer_at(dispenser, clock, datetime(2026, 7, 29, 8, 0))
    dispenser.release()

    clock.set(datetime(2026, 7, 29, 8, 20))
    dispenser.apply_payload("SC1*W*1:0800.1200-127-030", source="api")
    dispenser.tick()

    assert [(d.tray, d.minutes) for d in dispenser.awaiting_release] == [(1, 480)]
    assert dispenser.scheduler.state[1].ever_fired is False


def test_an_identical_schedule_does_not_withdraw_the_dose_it_is_offering(
        dispenser, clock):
    """Nothing about the plan changed, so the offer standing against it is
    still good. Withdrawing it drops the alert and makes the person watch the
    panel go quiet over a dose they have not taken."""
    dispenser.apply_payload("SC1*W*1:0800-127-030", source="api")
    offer_at(dispenser, clock, datetime(2026, 7, 29, 8, 0))
    assert len(dispenser.awaiting_release) == 1

    dispenser.apply_payload("SC1*W*1:0800-127-030", source="cloud")
    assert [(d.tray, d.minutes) for d in dispenser.awaiting_release] == [(1, 480)], \
        "the standing offer was withdrawn by a resend of its own schedule"


# ── the plug pulled in the middle of a sweep ────────────────────────────────

class CutMidSweep(BaseException):
    """A power cut, modelled honestly.

    Deliberately not an `Exception`: a cut runs no handler and no `finally`, so
    anything the code does to tidy up on the way out would make this test
    describe a crash instead. What is left on the card afterwards is exactly
    what the next boot would find.
    """


class Cutting(TrayServos):
    """Servos that deliver the pills and then lose power mid-stroke."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.parked: list[int] = []

    def drop(self, tray: int) -> None:
        self.drops[tray] = self.drops.get(tray, 0) + 1     # the pills fell
        raise CutMidSweep

    def park(self, tray: int) -> None:
        self.parked.append(tray)


def cutting(trays=(1,)) -> Cutting:
    return Cutting(backend=MockBackend(), pins={t: 10 + t for t in trays},
                   sleep=lambda _s: None)


def test_a_dose_interrupted_mid_drop_is_never_dropped_again(store, clock):
    """The pills clear the gate and the power goes before anything is written.

    `release` wrote the scheduler mark, scheduler.json and the event log *after*
    a two-second sweep, so a cut in that window left scheduler.json still saying
    the dose was owed. The next boot found it inside its grace window, offered
    it, and a tap dropped a second pill — with the log showing one.
    """
    device = build(store, clock, trays=(1,))
    device.apply_payload("SC1*W*1:0800-127-030")
    offer_at(device, clock, datetime(2026, 7, 29, 8, 0))

    device.servos = cutting()
    with pytest.raises(CutMidSweep):
        device.release()
    assert store.inflight_file.exists(), "nothing on the card says a tray opened"

    clock.set(datetime(2026, 7, 29, 8, 5))
    revived = build(store, clock, trays=(1,))
    revived.tick()

    assert revived.awaiting_release == [], "the interrupted dose was offered again"
    assert revived.release() == []
    assert revived.servos.drops.get(1, 0) == 0


def test_a_dose_interrupted_mid_drop_is_written_down_as_unconfirmed(store, clock):
    """The other half: a cut *after* the pills fell and before the log line lost
    the dose entirely, so the carer saw a gap they could not tell from a skip.

    It is recorded as given, because it probably was, and as unconfirmed,
    because nothing watched it happen. One honest line beats two confident
    wrong ones.
    """
    device = build(store, clock, trays=(1,))
    device.apply_payload("SC1*W*1:0800-127-030")
    offer_at(device, clock, datetime(2026, 7, 29, 8, 0))
    device.servos = cutting()
    with pytest.raises(CutMidSweep):
        device.release()

    build(store, clock, trays=(1,))
    written = store.read_events(limit=5)
    assert [(e["time"], e["reason"], e["taken"], e["confirmed"]) for e in written] \
        == [("0800", "interrupted", True, False)]
    assert not store.inflight_file.exists(), "the marker outlived the dose"


def test_an_interrupted_dose_makes_no_claim_on_the_panel(store, clock):
    """`interrupted` is the one outcome the machine does not know, so it leaves
    no ledger entry and the schedule band draws it as an outline. A blue "taken"
    circle here would be the firmware inventing evidence."""
    device = build(store, clock, trays=(1,))
    device.apply_payload("SC1*W*1:0800-127-030")
    offer_at(device, clock, datetime(2026, 7, 29, 8, 0))
    device.servos = cutting()
    with pytest.raises(CutMidSweep):
        device.release()

    revived = build(store, clock, trays=(1,))
    assert revived.today_outcomes() == {}


def test_the_tray_that_was_open_is_closed_at_boot(store, clock):
    """`TrayServos.drop` commands 180°, waits a second, then commands 0°. A cut
    in that second leaves the horn at the far end — the gate open — and nothing
    in the firmware ever closed it: `park` says in its own docstring that it is
    not part of any dose path. It is the one window in the whole system where
    the machine is physically open."""
    device = build(store, clock, trays=(1, 2))
    device.apply_payload("SC1*W*2:0800-127-030")
    offer_at(device, clock, datetime(2026, 7, 29, 8, 0))
    device.servos = cutting(trays=(1, 2))
    with pytest.raises(CutMidSweep):
        device.release()

    revived = Dispenser(store=store, clock=clock, servos=cutting(trays=(1, 2)))
    assert revived.servos.parked == [2], "the tray that could be open was not closed"


def test_an_ordinary_release_leaves_no_marker_behind(dispenser, store, clock):
    """The marker's presence *is* the message, so a dose that completed must not
    leave one — every boot afterwards would declare a perfectly recorded dose
    interrupted."""
    dispenser.apply_payload("SC1*W*1:0800-127-030")
    offer_at(dispenser, clock, datetime(2026, 7, 29, 8, 0))
    assert len(dispenser.release()) == 1
    assert not store.inflight_file.exists()


# ── a damaged record of what was already given ──────────────────────────────

def test_a_damaged_dispensing_record_shuts_the_tray(store, clock):
    """store.py's own docstring: "the safe reading of 'cannot tell' is to refuse
    to dispense". The code did the opposite — `_read_json` returned None,
    `load_state` returned `{}`, every tray got a blank `SlotState`, and the
    morning's doses were offered again.

    `write_atomic` prevents torn writes, not media damage; this is what an SD
    card losing a page leaves behind.
    """
    device = build(store, clock, trays=(1,))
    device.apply_payload("SC1*W*1:0800-127-030")
    offer_at(device, clock, datetime(2026, 7, 29, 8, 0))
    device.release()

    store.state_file.write_text('{"version": 1, "payload": "SC1*W*1:08')

    clock.set(datetime(2026, 7, 29, 8, 30))
    revived = build(store, clock, trays=(1,))
    assert revived.state_unknown
    assert "damaged" in revived.blocked_reason()
    revived.tick()
    assert revived.awaiting_release == [], "a dose already given was offered again"
    assert revived.servos.drops.get(1, 0) == 0


def test_a_damaged_record_with_no_schedule_is_not_a_fault(store, clock):
    """Nothing is loaded, so there is nothing the missing record could be
    hiding. A fresh install refusing to dispense a prescription it has not got
    yet is a fault nobody can act on."""
    store.state_file.write_text("{ not json")
    device = build(store, clock, trays=(1,))
    assert device.state_unknown
    assert device.blocked_reason() == ""


def test_re_sending_the_schedule_repairs_a_damaged_record(store, clock):
    """The operator's way out, and the reason the refusal names it."""
    device = build(store, clock, trays=(1,))
    device.apply_payload("SC1*W*1:0800-127-030")
    store.state_file.write_text("{ not json")

    revived = build(store, clock, trays=(1,))
    assert revived.blocked_reason() != ""
    revived.apply_payload("SC1*W*1:0800-127-030")
    assert revived.blocked_reason() == ""


# ── a clock that goes backwards ─────────────────────────────────────────────

def test_a_rewound_day_does_not_re_release_the_same_dose(dispenser, servos, clock):
    """`next` suppressed a settled dose only while `last_day == day`, but
    `confirm` refuses any mark that is not a forward move. The two agree only
    while the day number never decreases — and it does, for a DST correction on
    a stale clock, for NTP correcting a fast clock across a midnight, and for a
    phone posting `SC1*C*` with an earlier date.

    Reproduced: release the 08:00 dose, rewind one day, then tick and release
    four times — drops went 1, 2, 3, 4, 5, once per fifteen-second tick for the
    whole window.
    """
    dispenser.apply_payload("SC1*W*1:0800-127-030")
    offer_at(dispenser, clock, datetime(2026, 7, 29, 8, 0))
    dispenser.release()
    assert servos.drops[1] == 1

    clock.set(datetime(2026, 7, 28, 8, 0))
    for _ in range(4):
        dispenser.tick()
        dispenser.release()

    assert servos.drops[1] == 1, "a rewound clock dropped a pill on every tick"


def test_a_forward_day_still_offers_the_next_days_dose(dispenser, clock):
    """The other side of the same comparison. Suppression must not become
    permanent — tomorrow's 08:00 is a different dose from today's."""
    dispenser.apply_payload("SC1*W*1:0800-127-030")
    offer_at(dispenser, clock, datetime(2026, 7, 29, 8, 0))
    dispenser.release()

    offer_at(dispenser, clock, datetime(2026, 7, 30, 8, 0))
    assert [(d.tray, d.minutes) for d in dispenser.awaiting_release] == [(1, 480)]


# ── a dose whose window crosses midnight ────────────────────────────────────

def test_a_dose_offered_before_midnight_is_not_reported_missed_after_it(
        dispenser, store, clock):
    """`_overdue_before` runs before anything else and took no `skip`, so a dose
    held in `_due` and still releasable was invisible to it only while it
    belonged to today. One minute past midnight it belonged to a day that had
    ended.

    Reproduced: the 23:30 dose is offered at 23:30 with a deadline of 00:30; the
    tick at 00:00:15 wrote a `window-closed` miss and stopped the chirp while
    twenty-nine minutes of the window were left, and a tap at 00:00 then wrote a
    second, contradictory `released` line for the same dose. Every dose
    scheduled after 23:00 was affected, every night.
    """
    dispenser.apply_payload("SC1*W*1:0800.2330-127-000")
    offer_at(dispenser, clock, datetime(2026, 7, 29, 8, 0))
    dispenser.release()
    offer_at(dispenser, clock, datetime(2026, 7, 29, 23, 30))
    assert [(d.tray, d.minutes) for d in dispenser.awaiting_release] == [(1, 1410)]

    clock.set(datetime(2026, 7, 30, 0, 0, 15))
    assert dispenser.tick() == [], "the dose was reported missed while still owed"
    assert [(d.tray, d.minutes) for d in dispenser.awaiting_release] == [(1, 1410)]

    assert len(dispenser.release()) == 1
    for_2330 = [e for e in store.read_events(limit=10) if e["time"] == "2330"]
    assert [(e["reason"], e["taken"]) for e in for_2330] == [("released", True)]


def test_a_dose_whose_window_really_closes_is_still_reported(dispenser, store, clock):
    """`skip` must not become a way for a dose to escape being settled. Nobody
    taps, the window closes at 00:30, and the carer is told."""
    dispenser.apply_payload("SC1*W*1:2330-127-000")
    offer_at(dispenser, clock, datetime(2026, 7, 29, 23, 30))

    clock.set(datetime(2026, 7, 30, 0, 31))
    events = dispenser.tick()
    assert [(e["time"], e["reason"], e["taken"]) for e in events] \
        == [("2330", "not-released", False)]
    assert dispenser.awaiting_release == []


def test_settling_a_dose_the_device_slept_through_leaves_a_live_alert_up(
        dispenser, clock):
    """A catch-up miss and a live dose in the same tick. `_expire_due` has
    always put the alert back afterwards and the catch-up branch never did, so
    the panel went amber and the room went quiet over a dose that was still
    waiting on a tap."""
    told = Recording()
    dispenser.indicator = told
    dispenser.apply_payload("SC1*W*1:0800.2000-127-000")
    offer_at(dispenser, clock, datetime(2026, 7, 29, 8, 0))
    dispenser.release()                  # tray 1 has fired, so it now has
                                         # evidence about days that have ended
    told.calls.clear()
    offer_at(dispenser, clock, datetime(2026, 7, 30, 8, 0))

    kinds = [call[0] for call in told.calls]
    assert "missed" in kinds, "yesterday's 20:00 dose was not reported"
    assert [(d.tray, d.minutes) for d in dispenser.awaiting_release] == [(1, 480)]
    assert told.calls[-1] == ("due", 1), "the panel was left describing the miss"


# ── the clock, and what is allowed to vouch for it ──────────────────────────

@pytest.fixture
def london(monkeypatch):
    """A zone that actually observes DST, pinned so the test does not depend on
    where the machine running it happens to be."""
    monkeypatch.setenv("TZ", "Europe/London")
    time.tzset()
    yield
    monkeypatch.undo()
    time.tzset()


def test_a_vouched_clock_survives_a_daylight_saving_transition(monkeypatch, london):
    """`_check_for_step` compared naive *local* readings against monotonic, so
    the spring-forward hour looked exactly like an NTP step — and the correction
    it threw away was the only thing making the device right.

    Reproduced: a phone sets the clock on a device whose system time is three
    days stale, ten minutes pass correctly, and the 02:00 jump returns `now()`
    to the stale reading while `trusted` stays True. The device then dispenses
    against the wrong day of the week and reports itself healthy.
    """
    monkeypatch.setattr("snapcare_dispenser.clock.ntp_synchronised",
                        lambda *a, **k: False)
    monkeypatch.setattr("snapcare_dispenser.clock._try_set_system_clock",
                        lambda _t: False)
    monkeypatch.setattr(config, "USE_RTC", False)

    wall = [datetime(2026, 3, 29, 0, 49)]          # fake-hwclock, four days out
    mono = [1000.0]
    clock = Clock(source=lambda: wall[0], monotonic=lambda: mono[0])
    clock.accept(sc1.ClockSet.from_datetime(datetime(2026, 4, 2, 9, 0)),
                 source="api")

    wall[0] += timedelta(minutes=10)               # ten minutes pass correctly
    mono[0] += 600
    assert clock.now() == datetime(2026, 4, 2, 9, 10)

    # 00:59 GMT becomes 02:00 BST: sixty real seconds, and an hour on the face
    # of a naive local clock.
    wall[0] = datetime(2026, 3, 29, 2, 0)
    mono[0] += 60
    assert clock.now() == datetime(2026, 4, 2, 9, 11), \
        "the correction was dropped and the device fell back to a stale clock"
    assert clock.source == "api"


def test_a_real_step_still_takes_the_vouch_with_it(monkeypatch, london):
    """Something moved the system clock and this object did not do it, so the
    thing that was vouching was vouching for a correction that no longer exists.
    Trust is re-derived rather than inherited — which for the case this is
    written for means NTP, since NTP is what stepped it."""
    monkeypatch.setattr("snapcare_dispenser.clock.ntp_synchronised",
                        lambda *a, **k: False)
    monkeypatch.setattr("snapcare_dispenser.clock._try_set_system_clock",
                        lambda _t: False)
    monkeypatch.setattr(config, "USE_RTC", False)

    wall = [datetime(2026, 7, 24, 19, 0)]
    mono = [1000.0]
    clock = Clock(source=lambda: wall[0], monotonic=lambda: mono[0])
    clock.accept(sc1.ClockSet.from_datetime(datetime(2026, 7, 27, 7, 58)),
                 source="api")
    assert clock.source == "api"

    wall[0] = datetime(2026, 7, 27, 7, 58, 3)      # timesyncd steps it
    mono[0] += 1
    assert abs((clock.now() - wall[0]).total_seconds()) < 2
    assert clock.source == "untrusted", "a dropped correction left its voucher"


def test_the_chip_vouching_for_itself_is_not_a_clock_we_have_read(monkeypatch):
    """`source` answered "rtc" from the oscillator flag alone, which says the
    chip kept time and says nothing about whether anything read it. On a DS1302
    build nothing does until `adopt_rtc()` succeeds — a one-shot at boot that
    returns False silently on one bad bit-banged transfer.

    Reproduced: the device reported `source: rtc, trusted: true` while `now()`
    answered the previous Friday from fake-hwclock and the chip held Tuesday.
    That is the wrong-day dispensing the whole module exists to refuse.
    """
    monkeypatch.setattr("snapcare_dispenser.clock.ntp_synchronised",
                        lambda *a, **k: False)
    monkeypatch.setattr("snapcare_dispenser.clock._try_set_system_clock",
                        lambda _t: False)
    monkeypatch.setattr(config, "USE_RTC", True)
    chip_holds = datetime(2026, 7, 28, 9, 30)      # a Tuesday
    monkeypatch.setattr(rtc, "_read_status_uncached", lambda *a: rtc.RtcState(
        present=True, running=True, detail="fine", kind="ds1302", reads=chip_holds))

    monkeypatch.setattr(rtc, "read_time", lambda: None)     # the transient failure
    stale = Clock(source=lambda: datetime(2026, 7, 24, 19, 0))
    assert stale.adopt_rtc() is False
    assert stale.source == "untrusted"
    assert not stale.trusted

    rtc.invalidate()
    monkeypatch.setattr(rtc, "read_time", lambda: chip_holds)
    adopted = Clock(source=lambda: datetime(2026, 7, 24, 19, 0))
    assert adopted.adopt_rtc() is True
    assert adopted.source == "rtc"
    assert adopted.now().date() == chip_holds.date()


def test_a_kernel_applied_chip_still_vouches(monkeypatch):
    """The DS3231 half of the same rule. Its time arrives through the `i2c-rtc`
    overlay before this process starts, so the chip reports no reading of its
    own and the system clock already is the chip's — there is nothing to
    cross-check and nothing to adopt."""
    monkeypatch.setattr("snapcare_dispenser.clock.ntp_synchronised",
                        lambda *a, **k: False)
    monkeypatch.setattr(config, "USE_RTC", True)
    monkeypatch.setattr(rtc, "_read_status_uncached", lambda *a: rtc.RtcState(
        present=True, running=True, detail="fine", kind="ds3231"))

    clock = Clock(source=lambda: datetime(2026, 7, 29, 8, 0))
    assert clock.source == "rtc"
    assert clock.trusted


def test_a_clock_code_may_not_overrule_ntp(dispenser, clock):
    """`Clock.accept` installs an offset with no regard for what is already
    vouching, and nothing ever takes it off: `daemon.run` latches its NTP check,
    so `trust_ntp()` — the only thing that clears an offset — never runs again
    after the first success.

    Reproduced: with the system clock synchronised and reading 08:00, an
    `SC1*C*` code for 17:00 was accepted and `now()` read 17:01 for the rest of
    uptime, from whatever timezone the phone that scanned it was in. `cloud.py`
    has refused this on the relay path from the beginning; the LAN and QR paths
    had no such guard.
    """
    clock._vouched_by = "ntp"                                        # noqa: SLF001
    before = clock.now()

    ok, message = dispenser.apply_payload("SC1*C*202607291700*2", source="api")
    assert not ok
    assert "network" in message
    assert clock.now() == before, "a phone moved a clock NTP was already keeping"


def test_a_clock_code_is_still_accepted_when_nothing_else_is_vouching(
        dispenser, clock):
    """The other side: this is the whole path for a dispenser on a network with
    no internet, and it must keep working."""
    clock.distrust()
    ok, _message = dispenser.apply_payload("SC1*C*202607291700*2", source="api")
    assert ok
    assert clock.now() == datetime(2026, 7, 29, 17, 0)


# ── the dose log ────────────────────────────────────────────────────────────

def test_one_bad_byte_does_not_destroy_the_whole_log(store, clock):
    """`read_events` decoded the entire file at once and took
    `UnicodeDecodeError` as an answer about the *file*, so one flipped bit
    anywhere in it returned `[]` for ever: the app and the carer's phone showed
    no dose history at all, `_restore` reset the SC1 sequence numbers into ones
    already sent, and `_trim_events` silently stopped trimming, so the log grew
    without bound.

    Reproduced by flipping one byte of a five-event log.
    """
    device = build(store, clock, trays=(1,))
    for _ in range(5):
        device.drop_now(1)
    assert len(store.read_events(limit=50)) == 5

    raw = bytearray(store.event_file.read_bytes())
    raw[raw.index(b"{") + 12] = 0xFF
    store.event_file.write_bytes(bytes(raw))

    survivors = store.read_events(limit=50)
    assert len(survivors) >= 4, "one damaged byte took the whole log with it"
    device.drop_now(1)
    assert len(store.read_events(limit=50)) >= 5, "and it stayed unreadable"


def test_a_damaged_log_is_still_trimmed(store, clock, monkeypatch):
    """The trim is what stops an SD card filling up, and it was disabled by
    exactly the same swallowed decode error."""
    monkeypatch.setattr(config, "EVENT_LOG_LIMIT", 10)
    device = build(store, clock, trays=(1,))
    for _ in range(5):
        device.drop_now(1)
    raw = bytearray(store.event_file.read_bytes())
    raw[raw.index(b"{") + 12] = 0xFF
    store.event_file.write_bytes(bytes(raw))

    for _ in range(20):
        device.drop_now(1)
    lines = [line for line in store.event_file.read_text(errors="replace").splitlines()
             if line.strip()]
    assert len(lines) == 10


# ── a schedule for a tray this machine has not got ──────────────────────────

def test_a_restored_schedule_for_an_unfitted_tray_is_not_offered(store, clock):
    """`set_schedule` has always refused a tray with no servo; `_restore` did
    not. A schedule accepted while eight trays were configured and read back
    after `SNAPCARE_TRAYS=4` — exactly the change config.py recommends — offered
    a dose for tray 7 and then raised `KeyError` out of `release` into three
    callers that catch only `RuntimeError`: the app got a 500, the button press
    vanished, and an hour later the dose was recorded `not-released`, a refusal
    the person never made.
    """
    wide = Dispenser(store=store, clock=clock,
                     servos=TrayServos(backend=MockBackend(),
                                       pins={t: 10 + t for t in range(1, 9)},
                                       sleep=lambda _s: None))
    wide.apply_payload("SC1*W*7:0800-127-030")

    narrow = build(store, clock, trays=(1, 2, 3, 4))
    assert narrow.unfitted_trays == (7,), "nothing anywhere says the tray is missing"
    offer_at(narrow, clock, datetime(2026, 7, 29, 8, 0))
    assert narrow.awaiting_release == []
    assert narrow.release() == []


def test_the_unfitted_tray_comes_back_when_its_servo_does(store, clock):
    """Dropped from the running scheduler, never from the card. Correcting
    `SNAPCARE_TRAYS` — or refitting the servo — must restore the prescription
    without anybody re-sending it."""
    wide = Dispenser(store=store, clock=clock,
                     servos=TrayServos(backend=MockBackend(),
                                       pins={t: 10 + t for t in range(1, 9)},
                                       sleep=lambda _s: None))
    wide.apply_payload("SC1*W*7:0800-127-030")
    build(store, clock, trays=(1, 2, 3, 4))          # a boot with four trays

    restored = Dispenser(store=store, clock=clock,
                         servos=TrayServos(backend=MockBackend(),
                                           pins={t: 10 + t for t in range(1, 9)},
                                           sleep=lambda _s: None))
    assert restored.unfitted_trays == ()
    offer_at(restored, clock, datetime(2026, 7, 29, 8, 0))
    assert [(d.tray, d.minutes) for d in restored.awaiting_release] == [(7, 480)]


# ── a chirp for a dose the device will not deliver ──────────────────────────

def test_a_blocked_device_stops_chirping_and_starts_again_when_it_can(
        dispenser, clock):
    """`tick` returns before `_expire_due` whenever the device is blocked, so a
    dose offered at 08:00 whose clock loses its voucher at 08:05 stayed in
    `_due` for ever — and the buzzer repeated every twenty seconds, all night,
    for a dose `release` would refuse."""
    told = Recording()
    dispenser.indicator = told
    dispenser.apply_payload("SC1*W*1:0800-127-000")
    offer_at(dispenser, clock, datetime(2026, 7, 29, 8, 0))

    clock.distrust()
    told.calls.clear()
    dispenser.tick()
    dispenser.tick()
    assert told.calls == [("silence",)], "the chirp ran on, once only"

    clock._trusted = True                                            # noqa: SLF001
    clock.set(datetime(2026, 7, 29, 8, 30))
    dispenser.tick()
    assert told.calls[-1] == ("due", 1), "the alert never came back"


# ── what the panel is allowed to claim about today ──────────────────────────

def test_the_day_plan_is_every_dose_of_the_day_in_order(dispenser, clock):
    """The schedule band draws what has already happened as well as what has
    not, so this is the whole day rather than the rest of it."""
    dispenser.apply_payload("SC1*W*1:0800.2000-127-030/2:1300-127-030")
    plan = dispenser.scheduler.day_plan(clock.day_number(), clock.weekday())
    assert plan == [(1, 480), (2, 780), (1, 1200)]


def test_the_day_plan_drops_a_finished_course_and_a_day_off(dispenser, clock):
    """The same two filters `upcoming` applies and no others: both are days on
    which the tray genuinely has nothing scheduled."""
    dispenser.apply_payload("SC1*W*1:0800-127-001/2:0900-004-000")   # Wed only
    day, weekday = clock.day_number(), clock.weekday()
    assert dispenser.scheduler.day_plan(day, weekday) == [(1, 480), (2, 540)]
    assert dispenser.scheduler.day_plan(day + 1, (weekday + 1) % 7) == []


def test_a_past_dose_with_no_record_is_not_claimed_as_taken(dispenser, store, clock):
    """`read_events` can legitimately come back empty — an SD card only has to
    lose one byte — and a panel that rendered an empty ledger as a row of ticks
    would tell a carer six doses were taken on the strength of no evidence at
    all. Absence has to stay absence all the way to the caller."""
    dispenser.apply_payload("SC1*W*1:0800-127-030")
    offer_at(dispenser, clock, datetime(2026, 7, 29, 8, 0))
    dispenser.release()
    assert dispenser.today_outcomes() == {(1, 480): "taken"}

    store.event_file.unlink()
    revived = build(store, clock, trays=(1,))
    assert revived.today_outcomes() == {}, "a dose was claimed with no evidence"


def test_the_ledger_survives_a_restart_and_empties_at_midnight(store, clock):
    """A reboot at lunchtime must not erase the morning from the panel; a new
    day must not inherit it."""
    device = build(store, clock, trays=(1, 2))
    device.apply_payload("SC1*W*1:0800-127-030/2:0900-127-030")
    offer_at(device, clock, datetime(2026, 7, 29, 8, 0))
    device.release(tray=1, minutes=480)
    offer_at(device, clock, datetime(2026, 7, 29, 9, 0))
    clock.set(datetime(2026, 7, 29, 10, 1))
    device.tick()                                    # the 09:00 window closes

    assert device.today_outcomes() == {(1, 480): "taken", (2, 540): "missed"}
    revived = build(store, clock, trays=(1, 2))
    assert revived.today_outcomes() == {(1, 480): "taken", (2, 540): "missed"}

    clock.advance(days=1)
    assert revived.today_outcomes() == {}


def test_a_bench_drop_does_not_mark_a_scheduled_dose_taken(dispenser, clock):
    """`drop_now` stamps the *current* minute, so letting it into the ledger
    would mark whatever is scheduled for that minute as given — a claim about a
    dose still sitting in the machine."""
    dispenser.apply_payload("SC1*W*1:0800-127-030")
    clock.set(datetime(2026, 7, 29, 8, 0))
    dispenser.drop_now(1)
    assert dispenser.today_outcomes() == {}


def test_the_waiting_dose_the_panel_names_is_the_one_still_owed(dispenser, clock):
    """Two doses owed, the later one released. The green screen has to keep
    naming the tray that is still waiting."""
    dispenser.apply_payload("SC1*W*1:0800-127-030/2:0830-127-030")
    offer_at(dispenser, clock, datetime(2026, 7, 29, 8, 30))
    assert dispenser.first_waiting()[:2] == (1, "08:00")

    dispenser.release(tray=2, minutes=510)
    assert dispenser.first_waiting()[:2] == (1, "08:00")

    dispenser.release(tray=1, minutes=480)
    assert dispenser.first_waiting() is None


def test_the_release_window_is_reported_in_tenths(dispenser, clock):
    """Tenths, not seconds: this rides inside the object the panel compares for
    equality, and a per-second field would repaint the screen four times a
    minute for the whole grace hour."""
    dispenser.apply_payload("SC1*W*1:0800-127-030")     # a 60-minute window
    offer_at(dispenser, clock, datetime(2026, 7, 29, 8, 0))
    assert dispenser.first_waiting()[2] == 10

    seen = []
    for minute in (6, 30, 54, 59):
        clock.set(datetime(2026, 7, 29, 8, minute))
        seen.append(dispenser.first_waiting()[2])
    assert seen == sorted(seen, reverse=True)
    assert seen[0] == 9 and seen[-1] == 0
    assert all(0 <= value <= 10 for value in seen)


# ── which day a recorded dose belongs to ────────────────────────────────────

def test_a_catch_up_miss_says_which_day_it_was(dispenser, store, clock):
    """A reboot after a long outage emits up to `CATCHUP_DAYS` of misses in one
    tick, and every one of them carried the reboot instant and a bare HH:MM — so
    a carer opening the app saw six lines reading "08:00 missed" stamped this
    morning and could not tell six missed mornings from six misses today."""
    dispenser.apply_payload("SC1*W*1:0800-127-000")
    offer_at(dispenser, clock, datetime(2026, 7, 29, 8, 0))
    dispenser.release()

    clock.set(datetime(2026, 8, 1, 9, 0))            # back three days later
    for _ in range(6):
        dispenser.tick()

    misses = [e for e in store.read_events(limit=20) if e["taken"] is False]
    assert {e["forDate"] for e in misses} == {"2026-07-30", "2026-07-31", "2026-08-01"}


def test_the_panel_is_told_the_day_a_missed_dose_belongs_to(dispenser, clock):
    """`Clock.at_minutes` answers for today, which is right for every dose the
    device is watching and wrong for the ones it slept through: the panel said a
    dose from last Friday was missed at 08:00 this morning."""
    told = Recording()
    dispenser.indicator = told
    dispenser.apply_payload("SC1*W*1:0800-127-000")
    offer_at(dispenser, clock, datetime(2026, 7, 29, 8, 0))
    dispenser.release()

    told.calls.clear()
    clock.set(datetime(2026, 7, 31, 9, 0))
    dispenser.tick()

    missed = [call for call in told.calls if call[0] == "missed"]
    assert missed and missed[0][2] == datetime(2026, 7, 30, 8, 0)
