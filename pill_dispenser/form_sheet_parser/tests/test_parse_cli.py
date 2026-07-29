"""The CLI contract, exercised the way the web app exercises it.

The parser itself was well covered and the route that calls it was written
correctly, but nothing ran the script in between. It crashed on every
successful read — `**result` on a dataclass — and the route reported that as
`parser_unavailable` (501), which reads like a missing interpreter rather than
a bug. The feature had never worked end to end and the tests all passed.

So these tests run the real script in a subprocess and check the stdout
contract, because that string is the only thing the route ever sees.
"""
import json
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from form_sheet_parser.synth import synth_photo  # noqa: E402

SCRIPT = Path(__file__).resolve().parents[1] / "parse_cli.py"
ANSWERS = {"layer": "3", "days": ["MON", "WED", "FRI"], "duration": "30d", "hour": "8"}


def run(*args) -> tuple[int, dict]:
    p = subprocess.run([sys.executable, str(SCRIPT), *args],
                       capture_output=True, text=True)
    return p.returncode, json.loads(p.stdout)


def test_reads_a_photographed_sheet(tmp_path):
    img = tmp_path / "sheet.png"
    cv2.imwrite(str(img), synth_photo(ANSWERS, seed=7, coverage=0.85))

    code, out = run(str(img))

    assert code == 0
    assert out["ok"] is True
    assert out["values"] == ANSWERS
    assert out["problems"] == []


def test_missing_image_is_reported_as_json_not_a_traceback(tmp_path):
    code, out = run(str(tmp_path / "nope.png"))

    assert code == 1
    assert out["ok"] is False
    assert "could not read" in out["error"]


def test_a_sheet_with_no_markers_says_so(tmp_path):
    img = tmp_path / "blank.png"
    cv2.imwrite(str(img), np.full((900, 700, 3), 255, np.uint8))

    code, out = run(str(img))

    assert code == 1
    assert out["ok"] is False
    assert "markers not found" in out["error"]
