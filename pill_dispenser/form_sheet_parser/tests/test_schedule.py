"""Sheets -> schedule -> optical payload.

The `S` payload is a contract with `lib/hardware/protocol.ts`, which has its own
tests on the TypeScript side. Those tests and these have to agree about the
literal bytes, so the vectors below are copied verbatim from
`protocol.test.ts` — if either side changes the grammar, one of the two suites
fails instead of the device quietly ceasing to understand the phone.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from form_sheet_parser.form_sheet_parser import SheetResult  # noqa: E402
from form_sheet_parser.schedule import (  # noqa: E402
    ALL_DAYS,
    EVERY_DAY,
    LayerPlan,
    SchedulePlan,
    decode_weekly,
    encode_schedule,
    encode_weekly,
    payload_notes,
    sheet_to_layer_plan,
    sheets_to_schedule,
)


def sheet(layer="1", days=None, duration="30d", hour="8", problems=()):
    return SheetResult(
        values={
            "layer": layer,
            "days": list(ALL_DAYS) if days is None else days,
            "duration": duration,
            "hour": hour,
        },
        problems=list(problems),
    )


# ── the contract with protocol.ts ───────────────────────────────────────────

def test_s_payload_matches_the_typescript_vector():
    # Copied from protocol.test.ts: '스케줄이 왕복한다'.
    plan = SchedulePlan(layers=[
        LayerPlan(layer=1, times=["0800", "2000"]),
        LayerPlan(layer=2, times=["1800"]),
    ])
    assert encode_schedule(plan) == "SC1*S*1:0800.2000/2:1800"


def test_s_payload_uses_only_qr_alphanumeric_characters():
    # QR alphanumeric mode packs 2 characters into 11 bits; byte mode needs 8
    # bits each. Straying outside this set silently doubles the code's size,
    # which is what stops it fitting on the device's screen.
    allowed = set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:")
    plan = sheets_to_schedule([sheet(layer=str(i), hour=str(i * 3)) for i in range(1, 9)])
    for payload in (encode_schedule(plan), encode_weekly(plan)):
        assert set(payload) <= allowed, f"{payload!r} leaves alphanumeric mode"


def test_full_tray_weekly_payload_fits_a_device_readable_qr():
    # Phone -> device is bounded by the device camera, not the phone screen.
    # An ESP32-CAM at 640x480 reads version 10 comfortably: 395 alphanumeric
    # characters. A full eight-layer, thrice-daily plan must land well inside.
    plan = sheets_to_schedule(
        [sheet(layer=str(i), hour=str(h)) for i in range(1, 9) for h in (8, 13, 20)]
    )
    assert plan.ok, plan.problems
    assert len(encode_weekly(plan)) < 395


# ── sheet -> plan ───────────────────────────────────────────────────────────

def test_a_clean_sheet_becomes_a_layer():
    plan, problems = sheet_to_layer_plan(sheet(layer="3", days=["MON", "WED", "FRI"], hour="8"))
    assert problems == []
    assert plan.layer == 3
    assert plan.times == ["0800"]
    assert plan.day_names == ["MON", "WED", "FRI"]
    assert plan.duration_days == 30
    assert not plan.is_daily


def test_a_sheet_the_reader_doubted_never_becomes_a_schedule():
    # This is the whole safety argument: an unsure reading must reach a human,
    # not a tray of medication.
    plan, problems = sheet_to_layer_plan(sheet(problems=["hour: ambiguous (8=0.51, 9=0.49)"]))
    assert plan is None
    assert problems


def test_two_sheets_for_one_layer_merge_into_two_drop_times():
    plan = sheets_to_schedule([sheet(layer="2", hour="8"), sheet(layer="2", hour="20")])
    assert plan.ok, plan.problems
    assert len(plan.layers) == 1
    assert plan.layers[0].times == ["0800", "2000"]


def test_contradictory_sheets_for_one_layer_are_refused_not_reconciled():
    # Two regimens for the same compartment. Choosing between them is a
    # clinical decision, so the code refuses rather than picking the first.
    plan = sheets_to_schedule([
        sheet(layer="2", days=["MON"], hour="8"),
        sheet(layer="2", days=["TUE"], hour="20"),
    ])
    assert not plan.ok
    assert any("already given days" in p for p in plan.problems)


def test_the_same_sheet_photographed_twice_is_caught():
    plan = sheets_to_schedule([sheet(layer="2", hour="8"), sheet(layer="2", hour="8")])
    assert any("duplicate" in p for p in plan.problems)


@pytest.mark.parametrize("bad,reason", [
    (dict(layer=None), "layer"),
    (dict(hour=None), "time"),
    (dict(days=[]), "days"),
    (dict(layer="9"), "tray"),
    (dict(hour="25"), "time of day"),
])
def test_unusable_sheets_say_which_field_is_unusable(bad, reason):
    plan, problems = sheet_to_layer_plan(sheet(**bad))
    assert plan is None
    assert any(reason in p for p in problems), problems


def test_a_missing_duration_is_a_note_not_a_refusal():
    # Duration is the one field with a safe default: keep dispensing what is in
    # the tray. Refusing the whole sheet over it would be worse than saying so.
    plan, problems = sheet_to_layer_plan(sheet(duration=None))
    assert plan is not None
    assert plan.duration_days == 0
    assert any("duration" in p for p in problems)


# ── the lossy/lossless pair ─────────────────────────────────────────────────

def test_the_strict_payload_is_flagged_when_it_would_drop_information():
    plan = sheets_to_schedule([sheet(layer="1", days=["MON", "WED", "FRI"], duration="30d")])
    assert plan.loses_days and plan.loses_duration
    notes = payload_notes(plan)
    assert any("days of the week" in n for n in notes)
    assert any("duration" in n for n in notes)


def test_an_everyday_ongoing_sheet_loses_nothing():
    plan = sheets_to_schedule([sheet(days=ALL_DAYS, duration="ongoing")])
    assert not plan.loses_days and not plan.loses_duration
    assert payload_notes(plan) == []


def test_the_weekly_payload_round_trips():
    plan = sheets_to_schedule([
        sheet(layer="1", days=["MON", "WED", "FRI"], duration="30d", hour="8"),
        sheet(layer="3", days=ALL_DAYS, duration="ongoing", hour="19"),
    ])
    assert plan.ok, plan.problems
    back = decode_weekly(encode_weekly(plan))
    assert back is not None
    assert [(l.layer, l.times, l.days, l.duration_days) for l in back.layers] == \
           [(l.layer, l.times, l.days, l.duration_days) for l in plan.layers]


def test_the_weekly_payload_has_the_documented_shape():
    plan = SchedulePlan(layers=[
        LayerPlan(layer=1, times=["0800", "2000"], days=EVERY_DAY, duration_days=30),
        LayerPlan(layer=3, times=["1900"], days=0b0010101, duration_days=0),
    ])
    assert encode_weekly(plan) == "SC1*W*1:0800.2000-127-030/3:1900-021-000"


@pytest.mark.parametrize("payload", [
    "",
    "SC1*S*1:0800",             # right protocol, wrong kind
    "SC1*W*1:0800-127",         # a field short
    "SC1*W*1:2599-127-030",     # 25:99
    "SC1*W*0:0800-127-030",     # layers start at 1
    "SC1*W*9:0800-127-030",     # only eight layers exist
    "SC1*W*1:0800-000-030",     # a day mask that never fires
    "https://example.com",      # somebody else's QR
])
def test_broken_weekly_payloads_return_none_rather_than_raising(payload):
    # The camera reads whatever is in frame. A parser that throws would stop
    # the scan loop on the first unrelated QR code it sees.
    assert decode_weekly(payload) is None


# ── setting the device's clock ──────────────────────────────────────────────

def test_a_clock_payload_has_the_documented_shape():
    from datetime import datetime

    from form_sheet_parser.schedule import decode_clock, encode_clock

    # 2026-07-25 is a Saturday; weekday() counts Monday as 0.
    payload = encode_clock(datetime(2026, 7, 25, 19, 30))
    assert payload == "SC1*C*202607251930*5"
    # Exactly the device screen's limit, so a clock code fits both directions.
    assert len(payload) == 20
    assert decode_clock(payload) == datetime(2026, 7, 25, 19, 30)


def test_the_weekday_must_agree_with_the_date():
    # It is carried rather than derived, because computing it costs flash on an
    # AVR and is a classic off-by-one. Carrying it means it can disagree, and a
    # disagreement means one of the two is wrong — so neither is trusted.
    from form_sheet_parser.schedule import decode_clock

    assert decode_clock("SC1*C*202607251930*5") is not None   # Saturday, correct
    assert decode_clock("SC1*C*202607251930*3") is None       # claims Thursday


@pytest.mark.parametrize("payload", [
    "SC1*C*202602301200*4",   # 30 February
    "SC1*C*202513321200*4",   # month 13, day 32
    "SC1*C*202607252500*4",   # 25 o'clock
    "SC1*C*199912311200*5",   # before the DS3231's century
    "SC1*C*210001011200*4",   # after it
    "SC1*C*2026072519305",    # separator missing
    "SC1*C**4",
    "SC1*S*1:0800",           # a schedule is not a clock
    "",
])
def test_no_impossible_moment_can_set_the_clock(payload):
    # A wrong clock is worse than no clock: the tray opens at the wrong hours
    # and nothing about it looks broken.
    from form_sheet_parser.schedule import decode_clock
    assert decode_clock(payload) is None


def test_a_clock_message_is_not_mistaken_for_a_schedule():
    from form_sheet_parser.schedule import decode_weekly
    assert decode_weekly("SC1*C*202607251930*5") is None
