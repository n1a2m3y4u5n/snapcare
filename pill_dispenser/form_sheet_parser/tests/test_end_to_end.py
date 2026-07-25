"""Paper to hardware, in one piece.

The other two suites test the reader and the protocol separately, which leaves
the join between them untested — and the join is where a schedule stops being
what the caregiver marked. These tests photograph a sheet, read it, encode it,
and check what comes out the far end, including through the C++ that actually
runs on the dispenser when a compiler is available.
"""
import shutil
import subprocess
import sys
from pathlib import Path

import cv2
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from form_sheet_parser import parse_form_sheet  # noqa: E402
from form_sheet_parser.schedule import (  # noqa: E402
    ALL_DAYS,
    decode_weekly,
    encode_schedule,
    encode_weekly,
    payload_notes,
    sheets_to_schedule,
)
from form_sheet_parser.synth import synth_photo  # noqa: E402

FIRMWARE_TEST = Path(__file__).resolve().parents[2] / "firmware" / "test"


def read(answers, seed=0, **camera):
    result = parse_form_sheet(synth_photo(answers, seed=seed, **camera))
    assert result.ok, result.problems
    return result


# ── the whole path ──────────────────────────────────────────────────────────

def test_a_stack_of_sheets_becomes_one_payload():
    # Three compartments, three different regimens — the realistic case, since
    # one sheet is filled in per compartment and they arrive as a pile.
    sheets = [
        read({"layer": "1", "days": ALL_DAYS, "duration": "30d", "hour": "8"}, seed=1),
        read({"layer": "2", "days": ["MON", "WED", "FRI"], "duration": "90d", "hour": "13"}, seed=2),
        read({"layer": "5", "days": ["SAT", "SUN"], "duration": "ongoing", "hour": "20"}, seed=3),
    ]
    plan = sheets_to_schedule(sheets)
    assert plan.ok, plan.problems
    assert [l.layer for l in plan.layers] == [1, 2, 5]

    payload = encode_weekly(plan)
    assert payload == "SC1*W*1:0800-127-030/2:1300-021-090/5:2000-096-000"

    # 96 = SAT|SUN, and it survives the round trip rather than being folded away.
    back = decode_weekly(payload)
    assert [l.day_names for l in back.layers] == [
        ALL_DAYS, ["MON", "WED", "FRI"], ["SAT", "SUN"],
    ]
    assert [l.duration_days for l in back.layers] == [30, 90, 0]


def test_what_the_paper_says_survives_to_the_payload():
    # A property check across many sheets rather than one hand-picked case:
    # whatever was marked has to come out the other end unchanged.
    for seed in range(10):
        answers = {
            "layer": str(seed % 8 + 1),
            "days": [ALL_DAYS[(seed + i) % 7] for i in range(1 + seed % 4)],
            "duration": ["7d", "14d", "30d", "90d", "ongoing"][seed % 5],
            "hour": str((seed * 3) % 24),
        }
        answers["days"] = sorted(set(answers["days"]), key=ALL_DAYS.index)

        plan = sheets_to_schedule([read(answers, seed=seed)])
        assert plan.ok, plan.problems
        layer = decode_weekly(encode_weekly(plan)).layers[0]

        assert layer.layer == int(answers["layer"])
        assert layer.day_names == answers["days"]
        assert layer.times == [f"{int(answers['hour']):02d}00"]


def test_the_strict_payload_says_when_it_is_lying():
    # An app that only speaks SC1*S* gets a schedule that has quietly lost the
    # days and the end date. That has to be surfaced, not discovered later.
    plan = sheets_to_schedule([
        read({"layer": "4", "days": ["TUE", "THU"], "duration": "14d", "hour": "9"}, seed=7),
    ])
    assert encode_schedule(plan) == "SC1*S*4:0900"
    assert encode_weekly(plan) == "SC1*W*4:0900-010-014"      # 10 = TUE|THU

    notes = payload_notes(plan)
    assert any("days of the week" in n and "TUE THU" in n for n in notes)
    assert any("duration" in n for n in notes)


def test_a_bad_photograph_never_reaches_a_payload():
    # The safety property of the whole chain, stated once: an unreadable sheet
    # produces a refusal, never a schedule that happens to parse.
    unreadable = parse_form_sheet(synth_photo({"layer": "3"}, seed=4))   # only one group marked
    plan = sheets_to_schedule([unreadable])
    assert not plan.ok
    assert plan.layers == []
    assert encode_weekly(plan) == "SC1*W*"


# ── across the language boundary ────────────────────────────────────────────

@pytest.mark.skipif(shutil.which("make") is None or shutil.which("g++") is None,
                    reason="no C++ toolchain; the firmware cross-check needs one")
def test_the_firmware_parser_agrees_with_what_we_emit():
    """The payload is handed to the C++ that ships on the dispenser.

    Three implementations of SC1 — TypeScript in the app, Python here, C++ on
    the device — share no code. Their common test vectors are what keeps them
    speaking the same language, and this checks the Python end against the C++
    one with a payload that came from an actual photograph rather than from a
    constant someone copied.
    """
    build = subprocess.run(["make", "-C", str(FIRMWARE_TEST), "tools"],
                           capture_output=True, text=True)
    if build.returncode != 0:
        pytest.skip(f"could not build the firmware tool:\n{build.stderr}")

    sheets = [
        read({"layer": "1", "days": ALL_DAYS, "duration": "30d", "hour": "8"}, seed=11),
        read({"layer": "3", "days": ["MON", "WED", "FRI"], "duration": "ongoing", "hour": "19"},
             seed=12),
    ]
    plan = sheets_to_schedule(sheets)
    payload = encode_weekly(plan)

    tool = FIRMWARE_TEST / "build" / "sc1_decode"
    proc = subprocess.run([str(tool)], input=payload + "\n", capture_output=True, text=True)
    assert proc.returncode == 0, proc.stdout + proc.stderr

    out = proc.stdout
    assert "schedule, 2 compartment(s)" in out
    assert "compartment 1 at 08:00  on every day  for 30 days" in out
    assert "compartment 3 at 19:00  on MON WED FRI  ongoing" in out


@pytest.mark.skipif(shutil.which("make") is None or shutil.which("g++") is None,
                    reason="no C++ toolchain")
def test_the_firmware_refuses_what_we_refuse():
    build = subprocess.run(["make", "-C", str(FIRMWARE_TEST), "tools"],
                           capture_output=True, text=True)
    if build.returncode != 0:
        pytest.skip("could not build the firmware tool")

    tool = FIRMWARE_TEST / "build" / "sc1_decode"
    for payload in ["SC1*W*9:0800-127-030", "SC1*W*1:0800-000-030", "SC1*W*1:2599-127-030"]:
        assert decode_weekly(payload) is None, f"python accepted {payload}"
        proc = subprocess.run([str(tool)], input=payload + "\n", capture_output=True, text=True)
        assert proc.returncode != 0, f"C++ accepted {payload}"
        assert "REJECTED" in proc.stdout


# ── the code the device actually reads ──────────────────────────────────────

def test_the_payload_renders_as_a_qr_that_reads_back(tmp_path):
    # Closes the loop for hardware bring-up: without this, testing the device
    # needs the phone app, the app needs a schedule, and the schedule is the
    # thing being tested.
    from form_sheet_parser.cli import write_qr

    plan = sheets_to_schedule([
        read({"layer": "1", "days": ALL_DAYS, "duration": "30d", "hour": "8"}, seed=21),
        read({"layer": "3", "days": ["MON", "WED", "FRI"], "duration": "ongoing", "hour": "19"},
             seed=22),
    ])
    payload = encode_weekly(plan)
    out = tmp_path / "schedule.png"
    write_qr(payload, out)          # raises if it does not decode back

    assert out.is_file()
    img = cv2.imread(str(out))
    decoded, _, _ = cv2.QRCodeDetector().detectAndDecode(img)
    assert decoded == payload


def test_a_full_tray_still_fits_one_readable_code(tmp_path):
    # The capacity claim, exercised rather than asserted: eight compartments
    # dosed three times a day is the worst case the sheet can express, and it
    # has to survive as a single code the device camera can resolve.
    from form_sheet_parser.cli import write_qr

    sheets = [
        read({"layer": str(layer), "days": ALL_DAYS, "duration": "90d", "hour": str(hour)},
             seed=layer * 3 + i)
        for layer in range(1, 9)
        for i, hour in enumerate((8, 13, 20))
    ]
    plan = sheets_to_schedule(sheets)
    assert plan.ok, plan.problems
    assert len(plan.layers) == 8

    payload = encode_weekly(plan)
    assert len(payload) < 395, f"{len(payload)} chars exceeds version 10 at 640x480"

    out = tmp_path / "full_tray.png"
    write_qr(payload, out)
    decoded, _, _ = cv2.QRCodeDetector().detectAndDecode(cv2.imread(str(out)))
    assert decoded == payload
