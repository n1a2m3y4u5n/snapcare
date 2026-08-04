"""The fitted peripherals: the screen, the buzzer and the RTC.

None of these need the parts to be present. What is being tested is the
behaviour around them — that a missing one degrades instead of crashing, that a
present one is driven in the right order, and that the RTC is believed only when
it deserves to be.

The screen is checked by *which screen was painted*, in order, rather than by
what the pixels came out as. Those are two different questions and only the
first one is this module's: whether a released dose paints the released screen,
and whether the setup hint comes back after a dose has borrowed the panel. What
those screens look like belongs with the code that draws them.
"""
from __future__ import annotations

from datetime import datetime

import pytest

import types

from snapcare_dispenser import config, indicators, rtc, sc1
from snapcare_dispenser.clock import Clock
from snapcare_dispenser.display.canvas import Rgb565
from snapcare_dispenser.indicators import (
    FittedIndicator, LogIndicator, make_indicator,
)


class FakeDisplay:
    """A panel that records the frames pushed at it instead of lighting up.

    It hands out a real `Rgb565` at the fitted panel's own size, not a stub, so
    anything that actually draws is drawing on the surface the ILI9341 reads —
    a screen function that runs off the end of the buffer, or lays out against a
    width it invented, fails here rather than on the bench.
    """

    backend = "fake"
    width, height = 320, 240

    def __init__(self):
        self.frames = []
        self.closed = False

    def new_canvas(self):
        return Rgb565(self.width, self.height)

    def show(self, canvas):
        self.frames.append(canvas)

    def close(self):
        self.closed = True


class SpyScreens:
    """Stands in for `display.screens`, recording what was asked for.

    Each entry is the screen's name and the arguments it was given, which is how
    the tray number and the time are checked — the two things this device can say
    and the LED ring it replaced could not.
    """

    def __init__(self):
        self.painted = []
        #: 프레임마다 딸려 온 키워드. 지금은 `beat` 하나이고, 박동이 어떤 내용으로
        #: 그려졌는지를 `painted` 와 나란히 보려고 따로 담는다. `painted` 의 모양을
        #: 바꾸면 이 파일의 언패킹 스무 곳이 같이 깨진다.
        self.extras = []

    def __getattr__(self, name):
        # `theme` is keyword-only and swallowed: every real screen takes the
        # packed palette, and what this spy is here to record is which frame was
        # asked for and with what facts, not what colour it came out.
        def screen(canvas, *args, theme=None, **extra):
            self.painted.append((name, args))
            self.extras.append(extra)
        return screen

    @property
    def names(self):
        return [name for name, _ in self.painted]


@pytest.fixture
def screens(monkeypatch):
    spy = SpyScreens()
    monkeypatch.setattr(indicators, "screens", spy)
    return spy


class FakeBuzzer:
    def __init__(self):
        self.beeps = 0
        self.patterns = 0
        self.calls = []

    def beep(self, seconds=None):
        self.beeps += 1

    def pattern(self, on_s, off_s, total_s):
        """진짜 `Buzzer.pattern` 과 같은 모양이어야 한다.

        복용 알람이 이걸 부르게 바뀌었을 때 여기가 없어서 세 시험이 깨졌고, 증상은
        `AttributeError` 였다 — 즉 **가짜가 진짜와 다른 모양이면 시험은 없는 기능을
        통과시키거나 있는 기능을 실패시킨다.** 실제로 부저를 `indicator.beep()` 로
        부르던 버그도 시험이 못 잡았는데, 이유가 정확히 같았다.

        시간은 재지 않는다. 몇 번 울렸는지만 세면 이 파일이 묻는 것에는 충분하고,
        진짜로 기다리면 시험 하나가 1.4초씩 걸린다.
        """
        self.patterns += 1
        self.beeps += 1
        #: What it was actually asked for, so a test can tell the alarm's
        #: shape from the acknowledgement's without timing anything.
        self.calls.append((on_s, off_s, total_s))

    def off(self):
        pass

    def close(self):
        pass


# ── the vocabulary ──────────────────────────────────────────────────────────

def test_each_event_paints_its_own_screen(screens):
    """Carried over from the Arduino build's colours unchanged, so somebody who
    has used one device understands the other."""
    display = FakeDisplay()
    indicator = FittedIndicator(display=display, buzzer=None)

    indicator.dose_due(1)
    indicator.dose_released(1)
    indicator.dose_missed(2)
    indicator.schedule_accepted()
    indicator.clear()

    # 배출은 자기 화면을 갖지 않는다 — 눈앞에서 일어나는 일이라 화면이 다시 알릴
    # 것이 없고, 아래로 떨어져 쉬는 화면이 나온다.
    assert screens.names == ["due", "idle", "missed", "schedule", "idle"]
    assert len(display.frames) == 5, "every state has to reach the panel"


def test_the_screen_says_which_tray_and_when(screens):
    """The one thing the screen can do that the ring could not. A ring on an
    eight-hopper machine says "a dose" and leaves the person to guess which."""
    indicator = FittedIndicator(display=FakeDisplay(), buzzer=None)

    indicator.dose_due(2, datetime(2026, 8, 1, 8, 0))
    indicator.dose_released(2)
    indicator.dose_missed(3, "08:00")

    # Every screen now leads with the whole snapshot and reads what it needs off
    # it, rather than being handed loose scalars that can disagree with it. The
    # facts asserted are the same two the ring could never say.
    name, args = screens.painted[0]
    assert name == "due"
    assert (args[0].waiting_tray, args[0].waiting_at) == (2, "08:00")
    # 배출은 화면을 갖지 않으므로 그 자리는 쉬는 화면이다.
    assert screens.painted[1][0] == "idle"
    assert screens.painted[2][0] == "missed"
    assert screens.painted[2][1][1:] == (3, "08:00")


def test_a_datetime_never_reaches_a_screen_as_one(screens):
    """`screens._clock_text` reads `'0800'`, `'08:00'` and minutes-since-midnight
    — every shape this project carries a time in except the `datetime` this
    module has closest to hand, which renders as `2026-` on the panel. That is a
    screen confidently showing the wrong thing, which is worse than a blank one,
    so the conversion happens here."""
    indicator = FittedIndicator(display=FakeDisplay(), buzzer=None)
    indicator.dose_due(1, datetime(2026, 8, 1, 20, 5))
    name, args = screens.painted[0]
    assert (name, args[0].waiting_tray, args[0].waiting_at) == ("due", 1, "20:05")


def test_a_caller_that_does_not_know_the_time_still_gets_a_screen(screens):
    """`device.py` passes a tray and nothing else. The clock is right to within
    a tick there, because this is called the moment the dose comes due."""
    indicator = FittedIndicator(display=FakeDisplay(), buzzer=None)
    indicator.dose_due(1)

    name, args = screens.painted[0]
    assert (name, args[0].waiting_tray) == ("due", 1)
    when = args[0].waiting_at
    assert isinstance(when, str) and len(when) == 5 and when[2] == ":"


# ── the network hint ────────────────────────────────────────────────────────

def test_a_device_waiting_to_be_set_up_says_so_in_the_room(screens):
    """Otherwise a dispenser sitting on its own hotspot waiting to be configured
    is indistinguishable from a dispenser that is switched off, and the only cue
    anybody gets is the app staying empty."""
    indicator = FittedIndicator(display=FakeDisplay(), buzzer=None)

    indicator.network_needs_setup()
    assert screens.names == ["network"]

    indicator.network_online()
    assert screens.names == ["network", "idle"]


def test_the_setup_screen_carries_the_network_to_join(screens):
    """The one screen with a word on it, and the reason `font.py` has letters at
    all: a person cannot join a network whose name is not in front of them."""
    indicator = FittedIndicator(display=FakeDisplay(), buzzer=None)

    indicator.network_needs_setup("SNAPCARE-V5XH")
    assert len(screens.painted) == 1
    name, args = screens.painted[0]
    assert name == "network"
    assert args[0].ssid == "SNAPCARE-V5XH"

    # And with nothing passed, this device's own permanent SSID rather than a
    # blank — the caller in network.py does not supply one.
    indicator.network_online()
    indicator.network_needs_setup()
    assert screens.painted[-1][1][0].ssid.startswith(config.AP_SSID_PREFIX)


def test_the_network_hint_never_sounds(monkeypatch):
    """A chirp has meant "there are pills in the cup" since the Arduino build.
    Spending it on a network problem teaches the one person this project is built
    around to walk over and find nothing there."""
    monkeypatch.setattr(config, "PULSE_DARK_S", 0.01)
    buzzer = FakeBuzzer()
    indicator = FittedIndicator(display=None, buzzer=buzzer)
    try:
        indicator.network_needs_setup()
        _sleep(0.08)
        assert buzzer.beeps == 0
    finally:
        indicator.close()


def test_a_waiting_dose_outranks_the_network_hint(screens):
    """Medication is the job; the network is only how the schedule got here."""
    indicator = FittedIndicator(display=FakeDisplay(), buzzer=None)

    indicator.dose_due(1)
    indicator.network_needs_setup()
    assert screens.names == ["due"], "the due screen must not be painted over"

    indicator.network_online()
    assert screens.names == ["due"], "and nor must it be cleared"


def test_the_hint_comes_back_after_the_dose_that_borrowed_the_screen(screens):
    """A device that was never configured must not go quietly dark after its
    first dose."""
    indicator = FittedIndicator(display=FakeDisplay(), buzzer=None)

    indicator.network_needs_setup()
    indicator.dose_due(1)
    indicator.dose_released(1)
    indicator.clear()
    # 순서가 아니라 두 가지를 본다. 배출이 자기 화면을 가져가지 않았다는 것과,
    # 그 뒤에 설정 힌트가 돌아왔다는 것. 사이에 무엇이 몇 장 지나갔는지는 이
    # 시험이 지키려는 것이 아니고, 정책이 바뀔 때마다 여기를 고치게 만든다.
    assert "released" not in screens.names
    assert screens.names[-1] == "network"
    assert screens.names[:2] == ["network", "due"]


def test_the_screen_goes_idle_when_there_is_nothing_to_say(screens):
    indicator = FittedIndicator(display=FakeDisplay(), buzzer=None)
    indicator.dose_due(1)
    indicator.clear()
    assert screens.names == ["due", "idle"]


def test_every_indicator_answers_the_network_methods():
    """`network.py` calls these on whatever is installed, including the no-op
    base — a build with no screen is a valid build."""
    for indicator in (indicators.Indicator(), LogIndicator()):
        indicator.network_needs_setup()
        indicator.network_online()


def test_the_screen_reports_itself_as_fitted():
    assert FittedIndicator(display=FakeDisplay(), buzzer=None).fitted == ("display",)
    assert FittedIndicator(display=None, buzzer=FakeBuzzer()).fitted == ("buzzer",)
    assert FittedIndicator(display=FakeDisplay(),
                           buzzer=FakeBuzzer()).fitted == ("display", "buzzer")
    assert LogIndicator().fitted == ()


# ── the chirp ───────────────────────────────────────────────────────────────

def test_the_buzzer_sounds_while_a_dose_waits_and_stops_when_confirmed(monkeypatch):
    """The chirp is what fetches somebody from another room. Without it the
    confirm button is close to useless — nobody acknowledges what they never
    noticed — and the log fills with unconfirmed doses."""
    monkeypatch.setattr(config, "PULSE_DARK_S", 0.01)
    buzzer = FakeBuzzer()
    indicator = FittedIndicator(display=None, buzzer=buzzer)

    try:
        indicator.dose_due(1)
        _wait_until(lambda: buzzer.beeps >= 3, "the buzzer never repeated")

        indicator.dose_released(1)
        settled = buzzer.beeps
        _sleep(0.1)
        assert buzzer.beeps == settled, "the chirp continued after confirmation"
    finally:
        indicator.close()


def test_a_dose_left_untaken_gets_more_insistent(monkeypatch):
    """One intensity cannot serve an hour.

    Start at the urgent setting and it is too much for somebody walking past a
    dose that has just come due; hold the gentle one for the whole grace window
    and the person in the next room never comes. Time is the only lever that
    separates those two, because a dose ignored for a minute really is a
    different situation from one that appeared five seconds ago.
    """
    monkeypatch.setattr(config, "PULSE_DARK_S", 0.01)
    monkeypatch.setattr(config, "PULSE_URGENT_DARK_S", 0.01)
    monkeypatch.setattr(config, "BUZZER_URGENT_AFTER_S", 0)  # 처음부터 급하게
    buzzer = FakeBuzzer()
    indicator = FittedIndicator(display=None, buzzer=buzzer)
    try:
        indicator.dose_due(1)
        _wait_until(lambda: buzzer.calls, "the buzzer never sounded")
        on_s, off_s, total_s = buzzer.calls[0]
        assert total_s == config.PULSE_URGENT_LIT_S
        assert off_s == config.BUZZER_URGENT_GAP_S
    finally:
        indicator.close()


def test_the_urgent_setting_is_actually_more_urgent():
    """Checked on the shipped values, with nothing patched.

    The test above proves the loop *switches*; this proves the thing it
    switches to is worse to ignore. Without it somebody tuning these numbers
    can leave the urgent phase quieter than the gentle one and both tests still
    pass, which is a machine that gets calmer the longer a dose sits.
    """
    assert config.BUZZER_URGENT_GAP_S < config.BUZZER_GAP_S

    # 귀로: "더 급하다" 는 삑과 삑 **사이**가 좁다는 뜻이고, 재는 값은 소리 나는
    # 시간의 비율이다.
    def duty(on_s, off_s):
        return on_s / (on_s + off_s)

    assert duty(config.BUZZER_URGENT_BEEP_S, config.BUZZER_URGENT_GAP_S) > \
           duty(config.BUZZER_BEEP_S, config.BUZZER_GAP_S)

    # 눈으로: 박자가 **더 자주** 뛴다. 재는 것은 한 박자의 길이가 아니라 주기다 —
    # 급한 쪽의 밝은 시간이 더 짧은 것은 뒤집힌 것이 아니라 더 자주 뛴다는 뜻이다.
    gentle = config.PULSE_LIT_S + config.PULSE_DARK_S
    urgent = config.PULSE_URGENT_LIT_S + config.PULSE_URGENT_DARK_S
    assert urgent < gentle, "급해졌는데 화면이 더 느리게 뛴다"


def test_the_urgency_resets_for_the_next_dose(monkeypatch):
    """Or the first chirp of the morning arrives at the pitch of last night's."""
    monkeypatch.setattr(config, "PULSE_DARK_S", 0.01)
    monkeypatch.setattr(config, "BUZZER_URGENT_AFTER_S", 0)
    buzzer = FakeBuzzer()
    indicator = FittedIndicator(display=None, buzzer=buzzer)
    try:
        indicator.dose_due(1)
        _wait_until(lambda: buzzer.calls, "the buzzer never sounded")
        indicator.dose_released(1)
        _sleep(1.2)          # 루프가 쉬는 쪽으로 한 바퀴 돌 시간
        monkeypatch.setattr(config, "BUZZER_URGENT_AFTER_S", 3600)
        buzzer.calls.clear()
        indicator.dose_due(2)
        _wait_until(lambda: buzzer.calls, "the second dose never sounded")
        assert buzzer.calls[0][2] == config.PULSE_LIT_S
    finally:
        indicator.close()


def test_a_press_is_answered_before_the_servo_finishes(monkeypatch):
    """The two seconds people press twice in.

    A tap starts a sweep and nothing else changes until it ends, so the machine
    feels broken at the moment it is working. The tick has to be unmistakably
    not the alarm, or it teaches somebody that the alarm means "done".
    """
    buzzer = FakeBuzzer()
    indicator = FittedIndicator(display=None, buzzer=buzzer)
    try:
        indicator.acknowledge()
        _wait_until(lambda: buzzer.calls, "the press was never acknowledged")
        on_s, off_s, total_s = buzzer.calls[0]
        assert total_s == config.BUZZER_ACK_S
        assert total_s < config.PULSE_LIT_S
        assert on_s < config.BUZZER_BEEP_S
    finally:
        indicator.close()


def test_dismissing_also_silences_the_chirp(monkeypatch):
    monkeypatch.setattr(config, "PULSE_DARK_S", 0.01)
    buzzer = FakeBuzzer()
    indicator = FittedIndicator(display=None, buzzer=buzzer)
    try:
        indicator.dose_due(1)
        _wait_until(lambda: buzzer.beeps >= 1, "the buzzer never sounded")
        indicator.clear()
        settled = buzzer.beeps
        _sleep(0.1)
        assert buzzer.beeps == settled
    finally:
        indicator.close()


def test_nothing_sounds_when_no_dose_is_waiting(monkeypatch):
    monkeypatch.setattr(config, "PULSE_DARK_S", 0.01)
    buzzer = FakeBuzzer()
    indicator = FittedIndicator(display=None, buzzer=buzzer)
    try:
        indicator.schedule_accepted()
        _sleep(0.08)
        assert buzzer.beeps == 0
    finally:
        indicator.close()


# ── degrading ───────────────────────────────────────────────────────────────

def test_a_failing_screen_does_not_take_the_dispenser_down(screens):
    """The pills still come out; the room is just quieter."""
    class BrokenDisplay(FakeDisplay):
        def show(self, canvas):
            raise OSError("the panel is not there")

    indicator = FittedIndicator(display=BrokenDisplay(), buzzer=None)
    indicator.dose_due(1)      # must not raise
    indicator.dose_released(1)
    assert indicator.display is None, (
        "a broken panel is dropped rather than repainted on every tick forever"
    )


def test_a_screen_function_that_throws_is_survivable(screens, monkeypatch):
    """A screen is drawn from the scheduler tick, so a bug in one of them —
    a tray number the font has no glyph for, an off-by-one past the buffer —
    must cost a picture and not a dose."""
    def explode(canvas, *args):
        raise IndexError("drew off the end of the buffer")

    monkeypatch.setattr(screens, "due", explode, raising=False)
    indicator = FittedIndicator(display=FakeDisplay(), buzzer=None)
    indicator.dose_due(1)      # must not raise
    assert indicator.display is None


def test_a_device_with_neither_part_still_works(monkeypatch):
    monkeypatch.setattr(indicators, "make_display",
                        lambda *a, **k: (_ for _ in ()).throw(OSError("no panel")))
    monkeypatch.setattr(indicators, "Buzzer",
                        lambda *a, **k: (_ for _ in ()).throw(OSError("no buzzer")))
    indicator = make_indicator()
    assert isinstance(indicator, LogIndicator)
    indicator.dose_due(1)      # must not raise


def test_a_panel_that_reports_itself_absent_is_not_counted_as_fitted(monkeypatch):
    """`make_display` never raises: a panel that would not come up comes back as
    a `NoDisplay`, which answers every call and draws nothing.

    That object must not be reported as a screen. A status page listing a screen
    on a machine whose screen is dark sends somebody looking for a loose wire
    that is not there.
    """
    from snapcare_dispenser.display import NoDisplay

    monkeypatch.setattr(indicators, "Buzzer",
                        lambda *a, **k: (_ for _ in ()).throw(OSError("no buzzer")))
    for absent in (NoDisplay(), None):
        monkeypatch.setattr(indicators, "make_display", lambda *a, **k: absent)
        assert isinstance(make_indicator(), LogIndicator)


def test_one_missing_part_does_not_disable_the_other(monkeypatch):
    monkeypatch.setattr(indicators, "make_display", lambda *a, **k: FakeDisplay())
    monkeypatch.setattr(indicators, "Buzzer",
                        lambda *a, **k: (_ for _ in ()).throw(OSError("no buzzer")))
    indicator = make_indicator()
    try:
        assert indicator.fitted == ("display",)
    finally:
        indicator.close()


# ── silencing without cancelling ────────────────────────────────────────────

def test_silence_stops_the_chirp_and_leaves_the_screen(monkeypatch, screens):
    """A person who silences a chime has asked for quiet, not withdrawn their
    medication. The dose is still owed and still releasable, so the screen has to
    go on saying so — a blank screen over a waiting dose is the device lying."""
    monkeypatch.setattr(config, "PULSE_DARK_S", 0.01)
    buzzer = FakeBuzzer()
    indicator = FittedIndicator(display=FakeDisplay(), buzzer=buzzer)
    try:
        indicator.dose_due(1)
        _wait_until(lambda: buzzer.beeps >= 1, "the buzzer never sounded")

        indicator.silence()
        settled = buzzer.beeps
        _sleep(0.1)
        assert buzzer.beeps == settled, "the chirp continued after being silenced"
        # 장수가 아니라 내용을 본다. 알람이 우는 동안 화면이 같은 박자로 뛰므로
        # `due` 가 여러 장 나오는 것은 정상이고, 이 시험이 지키려는 것은 그 사이에
        # **다른 화면이 끼어들지 않는다**는 쪽이다.
        assert set(screens.names) == {"due"}, "the screen must stand while the dose does"
    finally:
        indicator.close()


def test_the_pulse_paints_the_same_dose_the_standing_frame_did(screens, monkeypatch):
    """벤치에서 실제로 나온 것. 박동이 좋은 프레임을 빈 시계로 덧칠했다.

        due frame: waiting=1 tray=2 at='14:27' frac=0 beat=False -> '14:27'
        due frame: waiting=0 tray=None at=''    frac=0 beat=True  -> '--:--'

    복용은 스냅샷보다 먼저 화면에 존재한다. 틱이 `Dispenser.tick` 안에서
    `dose_due` 를 부르고 `_show` 는 그 뒤에 다음 스냅샷을 뜨기 때문이고, `presence`
    는 그 틈을 알려진 복용을 붙들어(latch) 메운다. 박동이 그것을 지나쳐 `_health`
    를 새로 읽으면 그 보정이 통째로 버려지고, 기계 앞에 선 사람이 보는 것은 시각도
    트레이도 없는 초록 화면이다.
    """
    monkeypatch.setattr(config, "PULSE_DARK_S", 0.01)
    indicator = FittedIndicator(display=FakeDisplay(), buzzer=FakeBuzzer())
    try:
        indicator.dose_due(2, "14:27")
        _wait_until(lambda: len(screens.painted) >= 2, "the pulse never painted")

        standing = screens.painted[0][1][0]
        for name, args in screens.painted[1:]:
            assert name == "due"
            drawn = args[0]
            assert (drawn.waiting_tray, drawn.waiting_at) == \
                   (standing.waiting_tray, standing.waiting_at), \
                   "the pulse drew a different dose from the frame it beats against"
        assert (standing.waiting_tray, standing.waiting_at) == (2, "14:27")
    finally:
        indicator.close()


def test_every_indicator_answers_silence():
    """`Dispenser.dismiss` calls this on whatever is installed, including the
    no-op base — a build with no screen and no buzzer is a valid build."""
    for indicator in (indicators.Indicator(), LogIndicator()):
        indicator.silence()


# ── the RTC ─────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def fresh_rtc_cache():
    rtc.invalidate()
    yield
    rtc.invalidate()


def test_no_rtc_is_not_a_trustworthy_rtc(monkeypatch):
    monkeypatch.setattr(rtc, "kernel_rtc_present", lambda *a: False)
    state = rtc.read_status()
    assert not state.present and not state.trustworthy
    assert state.running is None


def test_a_stopped_oscillator_is_not_trusted(monkeypatch):
    """The failure this check exists for. A dead coin cell does not make the
    chip vanish from the bus — it makes it answer, promptly, with nonsense."""
    monkeypatch.setattr(rtc, "kernel_rtc_present", lambda *a: True)
    monkeypatch.setattr(rtc, "_read_status_uncached", lambda *a: rtc.RtcState(
        present=True, running=False, detail="oscillator stopped"))
    assert not rtc.read_status().trustworthy


def test_a_running_oscillator_is_trusted(monkeypatch):
    monkeypatch.setattr(rtc, "_read_status_uncached", lambda *a: rtc.RtcState(
        present=True, running=True, detail="fine"))
    assert rtc.read_status().trustworthy


def test_being_unable_to_read_the_flag_is_not_the_same_as_a_failed_chip(monkeypatch):
    """None means 'we could not tell'; False means 'this chip is lying'. Only
    the second is a statement about the hardware, and the status page says so."""
    monkeypatch.setattr(rtc, "_read_status_uncached", lambda *a: rtc.RtcState(
        present=True, running=None, detail="smbus2 is not installed"))
    state = rtc.read_status()
    assert state.present and state.running is None
    assert not state.trustworthy, "uncertain must fall towards the tray staying shut"


def test_the_status_is_cached(monkeypatch):
    calls = []

    def counted(*_args):
        calls.append(1)
        return rtc.RtcState(present=True, running=True, detail="fine")

    monkeypatch.setattr(rtc, "_read_status_uncached", counted)
    for _ in range(20):
        rtc.read_status()
    assert len(calls) == 1, "the I2C bus was opened on every tick"


# ── seeding the clock chip ──────────────────────────────────────────────────
#
# This is the half of the RTC that nothing used to test, and the bug it hid was
# the whole point of fitting the part: the chip was never written, so it never
# vouched, and a device that lost power came back refusing to dispense.

class SpyRtc:
    """Records what was written to the chip, without there being a chip."""

    def __init__(self):
        self.vouched: list[datetime] = []

    def __call__(self, when):
        self.vouched.append(when)
        return True


@pytest.fixture
def spy_vouch(monkeypatch):
    spy = SpyRtc()
    monkeypatch.setattr(rtc, "vouch", spy)
    return spy


def test_setting_the_clock_writes_the_chip_even_when_ntp_owns_the_system_clock(
        monkeypatch, spy_vouch):
    """The regression this test exists for.

    `timedatectl set-time` is refused outright whenever NTP is enabled —
    "Automatic time synchronization is enabled", non-zero exit — and NTP is
    enabled on every device that has been through Stage 0. The two writes used
    to be chained with `and`, so the refusal short-circuited the RTC write and
    the chip was never told anything on a healthy networked build. Months of
    correct operation, and the first power cut that outlasted the router left
    the tray shut.
    """
    monkeypatch.setattr("snapcare_dispenser.clock._try_set_system_clock",
                        lambda _target: False)          # exactly what NTP causes

    clock = Clock()
    clock.accept(sc1.ClockSet.from_datetime(datetime(2026, 8, 1, 9, 15)), source="phone")

    assert spy_vouch.vouched == [datetime(2026, 8, 1, 9, 15)], (
        "the chip must be written whether or not the system clock could be set"
    )


def test_seeding_refuses_a_time_no_correct_clock_could_read(monkeypatch, spy_vouch):
    """Worse than leaving the chip unvouched: the token would assert that the
    nonsense is trustworthy, and it would survive every future boot."""
    clock = Clock(source=lambda: datetime(2019, 1, 1, 12, 0))
    assert clock.seed_rtc() is False
    assert spy_vouch.vouched == []


def test_seeding_is_skipped_on_a_build_with_no_rtc(monkeypatch, spy_vouch):
    monkeypatch.setattr(config, "USE_RTC", False)
    assert Clock().seed_rtc() is False
    assert spy_vouch.vouched == []


def test_the_daemon_seeds_the_chip_when_ntp_arrives(monkeypatch, spy_vouch, tmp_path):
    """The case that was missed entirely.

    A networked device corrects itself from NTP within seconds of booting and
    then never receives an `SC1*C*` code, because it has no need of one. Nothing
    wrote that good time down, so the coin cell was carrying nothing.
    """
    from snapcare_dispenser import daemon as daemon_module

    built = daemon_module.Daemon.__new__(daemon_module.Daemon)   # no hardware
    built.dispenser = types.SimpleNamespace(clock=Clock())
    built._last_seeded = 0.0

    built._seed_rtc("NTP synchronised")
    assert len(spy_vouch.vouched) == 1
    assert built._last_seeded > 0


def test_the_chip_is_not_reseeded_from_its_own_reading(monkeypatch, spy_vouch):
    """Circular: the chip vouching for itself, laundered into a fresh token that
    claims the drifted time is correct."""
    from snapcare_dispenser import daemon as daemon_module

    built = daemon_module.Daemon.__new__(daemon_module.Daemon)
    clock = Clock()
    monkeypatch.setattr(type(clock), "source", property(lambda _self: "rtc"))
    built.dispenser = types.SimpleNamespace(clock=clock)
    built._last_seeded = 0.0
    monkeypatch.setattr(config, "RTC_RESEED_S", 1)

    built._reseed_rtc_if_due()
    assert spy_vouch.vouched == [], "an RTC-vouched clock must not re-seed the RTC"


def test_the_chip_is_reseeded_periodically_while_ntp_is_vouching(monkeypatch, spy_vouch):
    """Drift, and the self-heal for a chip that could not be seeded earlier."""
    from snapcare_dispenser import daemon as daemon_module

    built = daemon_module.Daemon.__new__(daemon_module.Daemon)
    clock = Clock()
    monkeypatch.setattr(type(clock), "source", property(lambda _self: "ntp"))
    built.dispenser = types.SimpleNamespace(clock=clock)
    built._last_seeded = 0.0
    monkeypatch.setattr(config, "RTC_RESEED_S", 1)

    built._reseed_rtc_if_due()
    assert len(spy_vouch.vouched) == 1

    built._reseed_rtc_if_due()          # immediately again
    assert len(spy_vouch.vouched) == 1, "the interval must actually bound this"


# ── the RTC and the clock together ──────────────────────────────────────────

def test_a_healthy_rtc_lets_the_device_dispense_with_no_network(monkeypatch):
    """The whole reason for fitting one: correct time through a power cut, on a
    device that may never see NTP."""
    monkeypatch.setattr("snapcare_dispenser.clock.ntp_synchronised", lambda *a, **k: False)
    monkeypatch.setattr(rtc, "_read_status_uncached", lambda *a: rtc.RtcState(
        present=True, running=True, detail="fine"))

    clock = Clock(source=lambda: datetime(2026, 7, 29, 8, 0))
    assert clock.source == "rtc"
    assert clock.trusted


def test_a_flat_rtc_battery_leaves_the_tray_shut(monkeypatch):
    monkeypatch.setattr("snapcare_dispenser.clock.ntp_synchronised", lambda *a, **k: False)
    monkeypatch.setattr(rtc, "_read_status_uncached", lambda *a: rtc.RtcState(
        present=True, running=False, detail="oscillator stopped"))

    clock = Clock(source=lambda: datetime(2026, 7, 29, 8, 0))
    assert clock.source == "untrusted"
    assert not clock.trusted


def test_ntp_outranks_the_rtc(monkeypatch):
    """NTP is continuously corrected; the RTC drifts. When both are available
    the answer should say so."""
    monkeypatch.setattr("snapcare_dispenser.clock.ntp_synchronised", lambda *a, **k: True)
    monkeypatch.setattr(rtc, "_read_status_uncached", lambda *a: rtc.RtcState(
        present=True, running=True, detail="fine"))

    assert Clock(source=lambda: datetime(2026, 7, 29, 8, 0)).source == "ntp"


def test_a_clock_that_predates_the_firmware_is_never_trusted(monkeypatch):
    """No correct clock can read 2019, whatever is vouching for it."""
    monkeypatch.setattr("snapcare_dispenser.clock.ntp_synchronised", lambda *a, **k: True)
    assert not Clock(source=lambda: datetime(2019, 1, 1)).trusted


def test_the_status_page_explains_an_untrusted_rtc(monkeypatch):
    monkeypatch.setattr("snapcare_dispenser.clock.ntp_synchronised", lambda *a, **k: False)
    monkeypatch.setattr(rtc, "_read_status_uncached", lambda *a: rtc.RtcState(
        present=True, running=False, detail="its battery is flat"))

    status = Clock(source=lambda: datetime(2026, 7, 29, 8, 0)).status()
    assert status["trusted"] is False
    assert status["rtc"]["present"] is True
    assert "battery is flat" in status["rtc"]["detail"]


# ── helpers ─────────────────────────────────────────────────────────────────

def _sleep(seconds):
    import time
    time.sleep(seconds)


def _wait_until(predicate, message, timeout=3.0):
    import time
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.005)
    raise AssertionError(message)


# ── a device that cannot move anything ──────────────────────────────────────
#
# The mock servo backend means two opposite things depending on where it is
# running, and telling them apart is the whole point of these tests.
#
# On a laptop it is the dev harness: `make run` is the real firmware with the
# horns swapped for a recorder, and doses *should* be simulated end to end.
#
# On a Raspberry Pi it means every GPIO library is missing. Before this, the
# scheduler ran anyway — it wrote "dispensed" into the dose log and the cloud
# link published it, so a carer's phone showed a full day of medication that
# was still sitting in the hopper, from a device whose status page said it was
# healthy. That is strictly worse than a tray that never opens, because nobody
# ever finds out.

def _dispenser_on(tmp_path, *, on_a_pi: bool, monkeypatch):
    from snapcare_dispenser import gpiochip, sc1
    from snapcare_dispenser.device import Dispenser
    from snapcare_dispenser.servo import MockBackend, TrayServos
    from snapcare_dispenser.store import Store

    monkeypatch.setattr(gpiochip, "on_raspberry_pi", lambda *a, **k: on_a_pi)

    clock = Clock()
    clock.accept(sc1.ClockSet.from_datetime(datetime(2026, 8, 1, 7, 59)), source="phone")
    return Dispenser(store=Store(tmp_path), servos=TrayServos(backend=MockBackend()),
                     clock=clock, indicator=LogIndicator())


def test_a_pi_with_no_gpio_library_refuses_to_dispense(tmp_path, monkeypatch):
    from snapcare_dispenser import sc1

    device = _dispenser_on(tmp_path, on_a_pi=True, monkeypatch=monkeypatch)
    device.set_schedule(sc1.decode_any_schedule("SC1*W*1:0800-127-000"))

    assert device.servos_usable is False
    assert "no GPIO library" in device.blocked_reason()

    device.clock.accept(sc1.ClockSet.from_datetime(datetime(2026, 8, 1, 8, 1)),
                        source="phone")
    assert device.tick() == [], "a dose was recorded by a device that cannot move"
    assert device.store.read_events() == [], "and it reached the log a carer reads"


def test_the_same_backend_on_a_laptop_is_the_dev_harness_and_does_dispense(tmp_path, monkeypatch):
    from snapcare_dispenser import sc1

    device = _dispenser_on(tmp_path, on_a_pi=False, monkeypatch=monkeypatch)
    device.set_schedule(sc1.decode_any_schedule("SC1*W*1:0800-127-000"))

    assert device.servos_usable is True
    assert device.blocked_reason() == ""

    device.clock.accept(sc1.ClockSet.from_datetime(datetime(2026, 8, 1, 8, 1)),
                        source="phone")
    device.tick()
    assert [d.tray for d in device.awaiting_release] == [1]
    assert [r["tray"] for r in device.release()] == [1]


def test_a_manual_drop_on_a_dead_pi_raises_rather_than_claiming_success(tmp_path, monkeypatch):
    # This is the path the assembly guide uses to prove wiring. A cheerful
    # `{"ok": true}` there, on a device that cannot move, is the single worst
    # moment to be told everything is fine.
    device = _dispenser_on(tmp_path, on_a_pi=True, monkeypatch=monkeypatch)
    with pytest.raises(RuntimeError, match="python3-lgpio"):
        device.drop_now(1)
    assert device.store.read_events() == []


def test_the_status_page_says_which_of_the_two_reasons_it_is(tmp_path, monkeypatch):
    from snapcare_dispenser import sc1

    device = _dispenser_on(tmp_path, on_a_pi=True, monkeypatch=monkeypatch)
    status = device.status()
    assert status["dispensing"] is False
    assert status["servoUsable"] is False
    assert status["servoTiming"] == "none"
    # The clock is fine here, so the reason must name the GPIO problem rather
    # than sending somebody off to check a coin cell.
    assert "GPIO" in status["blockedReason"]
    assert "clock" not in status["blockedReason"]

    # And with the servos fine, the other gate has to be the one named. The two
    # reasons send somebody to opposite ends of the machine — an apt install
    # versus a coin cell — so collapsing them into one "not dispensing" turns a
    # fixable device into a puzzle.
    working = _dispenser_on(tmp_path, on_a_pi=False, monkeypatch=monkeypatch)
    monkeypatch.setattr(type(working.clock), "trusted", property(lambda _self: False))
    assert working.status()["dispensing"] is False
    assert "clock" in working.status()["blockedReason"]
    assert "GPIO" not in working.status()["blockedReason"]


def test_the_pulse_has_a_dark_phase_with_an_actual_length():
    """0 이면 검정 프레임의 길이는 패널을 칠하는 시간이고, 그건 정해진 값이 아니다.

    이것이 실제로 일어난 일이다. 이 값은 소리 쪽 논리만 보고 0 으로 정해졌는데 —
    "부저 울리는 시간 사이에 텀이 너무 길다" — 화면도 같은 값을 쓴다. 그래서 남은
    검정 시간은 패널을 두 번 칠하는 시간(한 장에 38ms)뿐이었고, 그건 프레임마다
    달랐다. 어떤 박자에는 검정이 보이고 어떤 박자에는 안 보였다.

    벤치에서 그대로 나온 말: "알람 울릴 때 화면 깜빡이는게 좀 불안정함."
    """
    for dark in (config.PULSE_DARK_S, config.PULSE_URGENT_DARK_S):
        # 패널 한 장이 38ms 다. 그 몇 배는 되어야 칠하는 시간이 박자를 흔들지 않는다.
        assert dark >= 0.15, "검정 프레임이 패널을 칠하는 시간과 구별되지 않는다"


def test_the_green_outweighs_the_black():
    """초록은 **상태**(복용이 기다린다)이고 검정은 박자일 뿐이다.

    반반이면 이 화면은 초록이 뛰는 것이 아니라 두 색이 번갈아 드는 것이 되고,
    그러면 무슨 상태인지가 흐려진다. 벤치에서 나온 말이 그것이다 — "초록색을
    띄우는 시간이 살짝 더 길거나 균형이 있어야 될듯."
    """
    for lit, dark in ((config.PULSE_LIT_S, config.PULSE_DARK_S),
                      (config.PULSE_URGENT_LIT_S, config.PULSE_URGENT_DARK_S)):
        assert lit > dark * 2, "검정이 박자가 아니라 절반이 됐다"


def test_the_pulse_stays_under_the_photosensitivity_line():
    """WCAG 2.3.1 의 3Hz. 이 패널은 사람 얼굴 앞 30cm 에서 한 시간을 깜빡일 수 있다.

    유예 창이 60분이고 그 내내 이 박자가 돈다. 넘길 여지가 있는 값이 아니다.
    """
    for lit, dark in ((config.PULSE_LIT_S, config.PULSE_DARK_S),
                      (config.PULSE_URGENT_LIT_S, config.PULSE_URGENT_DARK_S)):
        assert 1.0 / (lit + dark) < 3.0
