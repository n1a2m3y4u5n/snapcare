"""The protocol, against the same vectors the other three implementations use.

Most of the cases below are lifted from `firmware/test/test_sc1.cpp`, including
its whole list of malformed payloads. That duplication is the point: four
implementations of SC1 exist, they share no code, and these vectors are the
only thing keeping them speaking the same language. A drift between them has no
symptom on hardware — the device simply stops accepting schedules, silently.

`test_agrees_with_form_sheet_parser` goes further and runs this module against
the Python implementation that already lives in the repo, which is the reader
that turns a photographed paper sheet into a payload. If those two disagree, a
caregiver's sheet produces a schedule this firmware will not load.
"""
from __future__ import annotations

from datetime import datetime

import pytest

from snapcare_dispenser import sc1


# ── which direction is this ─────────────────────────────────────────────────

@pytest.mark.parametrize("payload,kind", [
    ("SC1*S*1:0800", "schedule"),
    ("SC1*W*1:0800-127-030", "weekly"),
    ("SC1*E*1*0800*T*01", "event"),
    ("SC1*C*202607251930*5", "clock"),
    ("SC1*X*1:0800", None),
    ("NOPE*S*1:0800", None),
    ("", None),
    ("SC1", None),
    # A camera or a form field will hand over whatever it read. None of this is
    # addressed to us and none of it may throw.
    ("4006381333931", None),
    ("https://example.com/", None),
])
def test_message_kind(payload, kind):
    assert sc1.message_kind(payload) == kind


# ── schedules ───────────────────────────────────────────────────────────────

def test_decode_schedule():
    slots = sc1.decode_schedule("SC1*S*1:0800.2000/2:1800")
    assert [s.slot for s in slots] == [1, 2]
    assert slots[0].times == [8 * 60, 20 * 60]
    assert slots[1].times == [18 * 60]
    # An `S` message says nothing about days or duration, so every tray in one
    # is every-day and ongoing.
    assert all(s.days == sc1.EVERY_DAY and s.duration_days == 0 for s in slots)


def test_decode_weekly():
    slots = sc1.decode_weekly("SC1*W*1:0800.2000-127-030/3:1900-021-000")
    assert [s.slot for s in slots] == [1, 3]
    assert slots[0].days == sc1.EVERY_DAY
    assert slots[0].duration_days == 30
    # 21 = 0b0010101 = Monday, Wednesday, Friday.
    assert slots[1].days == 0b0010101
    assert slots[1].duration_days == 0


def test_times_are_sorted_and_deduplicated():
    slots = sc1.decode_schedule("SC1*S*1:2000.0800.1300")
    assert slots[0].times == [8 * 60, 13 * 60, 20 * 60]


def test_one_tray_cannot_be_asked_for_two_pills_at_one_minute():
    """`0800.0800` 은 한 번이다. 물리적으로 한 번일 수밖에 없다.

    스케줄러의 고수위 표시는 `(day, minutes)` 라서 같은 분의 두 번째 복용은 어떤
    경로에서는 눌리고 어떤 경로에서는 안 눌린다. 그 모호함을 여기서, 한 번, 가장자리
    에서 끝낸다 — 아래쪽 어디에서도 두 번짜리 계획을 보지 않는다.

    통째로 거부하던 것을 고친 것이기도 하다. 한 칸의 오타가 다른 칸들의 계획까지
    같이 버렸고, 사람에게 남는 것은 "그 일정 코드는 읽지 못했습니다" 와 아무 일정도
    없는 기기였다.
    """
    for payload in ("SC1*S*1:0800.0800", "SC1*W*1:0800.0800-127-030"):
        slots = sc1.decode_any_schedule(payload)
        assert slots is not None, f"{payload} 가 통째로 거부됐다"
        assert slots[0].times == [8 * 60]

    # 다른 시각은 그대로 둘 다 남는다 — 한 칸이 하루에 여러 번인 것은 정상이다.
    assert sc1.decode_schedule("SC1*S*1:0800.0800.2000")[0].times == [480, 1200]
    assert sc1.slots_from_json(
        [{"tray": 1, "times": ["0800", "0800", "2000"]}])[0].times == [480, 1200]

    # 시각이 하나도 안 남으면 그것은 계획이 아니다.
    assert sc1.slots_from_json([{"tray": 1, "times": []}]) is None


def test_an_empty_body_clears_the_tray():
    assert sc1.decode_schedule("SC1*S*") == []
    assert sc1.decode_weekly("SC1*W*") == []


def test_decode_any_schedule():
    assert len(sc1.decode_any_schedule("SC1*S*4:0730")) == 1
    assert len(sc1.decode_any_schedule("SC1*W*4:0730-127-007")) == 1
    # An event is the other direction and must not be read as a schedule.
    assert sc1.decode_any_schedule("SC1*E*1*0800*T*01") is None


@pytest.mark.parametrize("payload", [
    "SC1*S",
    "SC1*S*1",                    # no times
    "SC1*S*1:",                   # still no times
    "SC1*S*1:080",                # three digits
    "SC1*S*1:2599",               # 25:99
    "SC1*S*1:2400",               # 24:00 is tomorrow's 00:00
    "SC1*S*0:0800",               # compartments start at 1
    "SC1*S*9:0800",               # ...and this tray has eight
    "SC1*S*99999:0800",           # must not wrap into a valid slot
    "SC1*S*1:0800/1:1200",        # one compartment, two plans
    "SC1*S*1:0800/",              # trailing separator
    "SC1*S*1:0800.",              # trailing time separator
    "SC1*S*1:0800.1200.1300.1400.1500.1600.1700",   # more times than MAX_TIMES
    "SC1*W*1:0800",               # weekly form missing its attributes
    "SC1*W*1:0800-127",           # ...and missing one of them
    "SC1*W*1:0800-000-030",       # a mask that never fires
    "SC1*W*1:0800-128-030",       # a day that does not exist
    "SC1*W*1:0800-127-030-9",     # an attribute too many
])
def test_malformed_schedules_are_refused(payload):
    assert sc1.decode_schedule(payload) is None or sc1.message_kind(payload) != "schedule"
    assert sc1.decode_any_schedule(payload) is None


def test_a_full_eight_tray_weekly_plan_round_trips():
    payload = "/".join(f"{n}:0800.1300.2000-127-030" for n in range(1, 9))
    payload = f"SC1*W*{payload}"
    slots = sc1.decode_weekly(payload)
    assert len(slots) == 8
    assert sc1.encode_weekly(slots) == payload


def test_encoding_round_trips():
    for payload in ["SC1*S*1:0800.2000/2:1800", "SC1*S*", "SC1*S*8:2359"]:
        assert sc1.encode_schedule(sc1.decode_schedule(payload)) == payload
    for payload in ["SC1*W*1:0800.2000-127-030/3:1900-021-000", "SC1*W*"]:
        assert sc1.encode_weekly(sc1.decode_weekly(payload)) == payload


def test_s_form_reports_what_it_cannot_carry():
    slots = sc1.decode_weekly("SC1*W*1:0800-021-030")
    notes = sc1.loses_detail(slots)
    assert any("days of the week" in n for n in notes)
    assert any("duration" in n for n in notes)
    # And an all-days ongoing plan loses nothing, so it must say nothing.
    assert sc1.loses_detail(sc1.decode_weekly("SC1*W*1:0800-127-000")) == []


# ── events ──────────────────────────────────────────────────────────────────

def test_encode_event():
    assert sc1.encode_event(sc1.DoseEvent(1, 8 * 60, True, 7)) == "SC1*E*1*0800*T*07"
    assert sc1.encode_event(sc1.DoseEvent(3, 19 * 60 + 30, False, 12)) == "SC1*E*3*1930*M*12"


def test_event_sequence_wraps_at_100():
    assert sc1.encode_event(sc1.DoseEvent(1, 0, True, 100)).endswith("*00")
    assert sc1.encode_event(sc1.DoseEvent(1, 0, True, 143)).endswith("*43")


def test_every_encodable_event_fits_the_device_screen():
    """The 20-character ceiling, checked exhaustively rather than by argument.

    It is the one limit in this protocol whose violation cannot be seen: a
    payload one character too long does not fail to send, it produces a QR that
    a phone either cannot read or — worse — reads as a valid shorter prefix.
    """
    for slot in range(1, 9):
        for minutes in range(0, 24 * 60, 7):
            for taken in (True, False):
                payload = sc1.encode_event(sc1.DoseEvent(slot, minutes, taken, 99))
                assert payload is not None
                assert len(payload) <= sc1.MAX_DEVICE_PAYLOAD


def test_event_round_trip():
    for slot in (1, 8, 99):
        for minutes in (0, 8 * 60, 23 * 60 + 59):
            original = sc1.DoseEvent(slot, minutes, minutes % 2 == 0, minutes % 100)
            decoded = sc1.decode_event(sc1.encode_event(original))
            assert decoded == original


@pytest.mark.parametrize("payload", [
    "SC1*E*1*0800",             # fields missing
    "SC1*E*1*0800*X*01",        # neither taken nor missed
    "SC1*E*1*0800*T",           # no sequence number
    "SC1*E*1*0800*T*011",       # sequence out of range
    "SC1*E*0*0800*T*01",        # compartments start at 1
    "SC1*E*1*2500*T*01",        # not a time
    "SC1*E*1*0800*T*01*9",      # trailing rubbish
    "SC1*S*1:0800",             # the other direction
])
def test_malformed_events_are_refused(payload):
    assert sc1.decode_event(payload) is None


def test_an_unencodable_event_returns_none_rather_than_a_truncation():
    assert sc1.encode_event(sc1.DoseEvent(1, 24 * 60, True, 0)) is None
    assert sc1.encode_event(sc1.DoseEvent(0, 0, True, 0)) is None
    assert sc1.encode_event(sc1.DoseEvent(100, 0, True, 0)) is None


# ── the clock ───────────────────────────────────────────────────────────────

def test_encode_clock():
    assert sc1.encode_clock(datetime(2026, 7, 25, 19, 30)) == "SC1*C*202607251930*5"
    assert len(sc1.encode_clock(datetime(2026, 7, 25, 19, 30))) == 20


def test_decode_clock():
    parsed = sc1.decode_clock("SC1*C*202607251930*5")
    assert parsed.to_datetime() == datetime(2026, 7, 25, 19, 30)
    assert parsed.weekday == 5  # Saturday, Monday being 0


def test_clock_round_trips_over_a_decade():
    when = datetime(2026, 1, 1, 0, 0)
    for _ in range(0, 4000, 7):
        assert sc1.decode_clock(sc1.encode_clock(when)).to_datetime() == when
        when = when.replace(year=when.year + 1) if when.month == 12 else when
        when = when + (datetime(2026, 1, 8) - datetime(2026, 1, 1))
        if when.year > 2035:
            break


def test_leap_years():
    assert sc1.decode_clock("SC1*C*202802291200*1") is not None   # 2028 is a leap year
    assert sc1.decode_clock("SC1*C*202702291200*0") is None       # 2027 is not
    assert sc1.decode_clock("SC1*C*200002291200*1") is not None   # 2000 is (400)
    assert sc1.decode_clock("SC1*C*210002281200*1") is None       # outside 2000-2099


@pytest.mark.parametrize("payload", [
    "SC1*C*202602301200*4",   # 30 February
    "SC1*C*202513321200*4",   # month 13, day 32
    "SC1*C*202607252500*4",   # 25 o'clock
    "SC1*C*202607251960*4",   # 60 minutes
    "SC1*C*202607251930*7",   # eight days in the week
    "SC1*C*199912311200*4",   # before the century this protocol admits
    "SC1*C*210001011200*4",   # after it
    "SC1*C*2026072519304",    # separator missing
    "SC1*C*20260725193*4",    # a digit short
    "SC1*C*202607251930*44",  # a digit too many
    "SC1*C**4",
    "SC1*S*1:0800",
])
def test_malformed_clocks_are_refused(payload):
    assert sc1.decode_clock(payload) is None


def test_a_weekday_that_contradicts_its_date_is_refused():
    """Stricter here than in the C++, deliberately — see `decode_clock`.

    2026-07-25 is a Saturday, which is 5. Accepting a 4 would shift every day
    mask by one, so a Mon/Wed/Fri prescription would start dispensing on
    Sunday, Tuesday and Thursday, with nothing anywhere reporting a fault.
    """
    assert sc1.decode_clock("SC1*C*202607251930*5") is not None
    assert sc1.decode_clock("SC1*C*202607251930*4") is None


# ── the parts that are not the wire format ──────────────────────────────────

def test_case_and_whitespace_are_tolerated():
    # QR alphanumeric mode is uppercase, but readers and text boxes are not
    # careful about it, and the app's TypeScript upper-cases before parsing.
    assert sc1.decode_schedule("  sc1*s*1:0800  \n") is not None
    assert sc1.message_kind(" sc1*w*1:0800-127-000 ") == "weekly"


def test_json_round_trip():
    slots = sc1.decode_weekly("SC1*W*1:0800.2000-127-030/3:1900-021-000")
    assert sc1.slots_from_json(sc1.slots_to_json(slots)) == slots


@pytest.mark.parametrize("payload", [
    [{"tray": 0, "times": ["0800"]}],                    # trays start at 1
    [{"tray": 9, "times": ["0800"]}],                    # ...and stop at 8
    [{"tray": 1, "times": []}],                          # a tray that never drops
    [{"tray": 1, "times": ["0800"], "days": 0}],         # a mask that never fires
    [{"tray": 1, "times": ["0800"], "days": 128}],
    [{"tray": 1, "times": ["2500"]}],
    [{"tray": 1, "times": ["0800"]}, {"tray": 1, "times": ["1200"]}],
    [{"times": ["0800"]}],                               # no tray at all
    "not a list",
])
def test_malformed_json_is_refused(payload):
    assert sc1.slots_from_json(payload) is None


def test_agrees_with_the_form_sheet_reader():
    """The paper path and this firmware must produce the same bytes.

    `form_sheet_parser/schedule.py` is what turns a photographed sheet into a
    payload. If it and this module disagree, a caregiver fills in a form and
    the dispenser refuses the schedule it produces — with no way for either of
    them to find out why.
    """
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from form_sheet_parser import schedule as sheet  # noqa: PLC0415

    plan = sheet.SchedulePlan(layers=[
        sheet.LayerPlan(layer=1, times=["0800", "2000"], days=sheet.EVERY_DAY,
                        duration_days=30),
        sheet.LayerPlan(layer=3, times=["1900"], days=0b0010101, duration_days=0),
    ])

    assert sheet.encode_weekly(plan) == "SC1*W*1:0800.2000-127-030/3:1900-021-000"
    assert sc1.encode_weekly(sc1.decode_weekly(sheet.encode_weekly(plan))) == \
        sheet.encode_weekly(plan)
    assert sc1.encode_schedule(sc1.decode_schedule(sheet.encode_schedule(plan))) == \
        sheet.encode_schedule(plan)

    # And the clock, which both of them write.
    when = datetime(2026, 7, 25, 19, 30)
    assert sheet.encode_clock(when) == sc1.encode_clock(when)
    assert sheet.decode_clock(sc1.encode_clock(when)) == when
