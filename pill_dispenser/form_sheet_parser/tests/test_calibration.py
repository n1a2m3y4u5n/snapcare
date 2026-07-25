"""Does the bubble map still describe the sheet that gets printed?

`form_sheet_config.json` is 44 coordinates produced by clicking on a rectified
photograph. Nothing connects them to `.form_sheet.tex` except that someone did
the clicking after the last edit. Move a row in the LaTeX, re-render the PDF,
and every coordinate silently points at the wrong place — the reader keeps
working, keeps returning schedules, and they are the wrong schedules.

So these tests re-derive the truth from the shipped PDF and check the config
against it. They are the ones that fail when the paper changes and nobody
remembers this file exists.
"""
import sys
from pathlib import Path

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from form_sheet_parser.form_sheet_parser import (  # noqa: E402
    MARKER_PATTERN_MM,
    PAGE_H_MM,
    PAGE_W_MM,
    SIDE,
    estimate_page_homography,
    load_config,
    preprocess_form_sheet,
    warp_form_sheet,
)
from form_sheet_parser.synth import _read_blank, blank_sheet_is_faithful  # noqa: E402

# The mark targets in .form_sheet.tex are `\draw ... (0,0) rectangle (3mm,5.5mm)`.
BUBBLE_W_MM, BUBBLE_H_MM = 3.0, 5.5

pytestmark = pytest.mark.skipif(
    not blank_sheet_is_faithful(),
    reason="no PDF renderer (pdftoppm); the preview PNG is too coarse to calibrate against",
)


def canonical_px_per_mm():
    """Canonical pixels per millimetre, from the geometry the page is built on."""
    inset = (PAGE_W_MM - MARKER_PATTERN_MM * 0) * 0  # noqa: F841  (kept explicit below)
    from form_sheet_parser.form_sheet_parser import _X0, _X1, _Y0, _Y1
    return (SIDE - 1) / (_X1 - _X0), (SIDE - 1) / (_Y1 - _Y0)


def printed_bubbles():
    """Find every printed mark target on the blank sheet, in canonical space.

    Detected rather than assumed: this is the measurement the config is being
    checked against, so deriving it from the config would prove nothing.
    """
    page = _read_blank()
    M, _ = estimate_page_homography(page)
    binary = preprocess_form_sheet(warp_form_sheet(page, M))

    sx, sy = canonical_px_per_mm()
    want_w, want_h = BUBBLE_W_MM * sx, BUBBLE_H_MM * sy

    contours, _ = cv2.findContours(binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    found = []
    for c in contours:
        x, y, w, h = cv2.boundingRect(c)
        if abs(w - want_w) <= 6 and abs(h - want_h) <= 6:
            found.append((x + w / 2.0, y + h / 2.0))
    return found


def test_every_configured_bubble_sits_on_a_printed_one():
    cfg = load_config()
    printed = printed_bubbles()
    assert len(printed) >= 44, f"only found {len(printed)} printed mark targets"

    offsets = []
    for name, group in cfg["groups"].items():
        for key, (x, y) in group["bubbles"].items():
            distances = [np.hypot(px - x, py - y) for px, py in printed]
            nearest = min(distances)
            assert nearest < 8.0, (
                f"{name}.{key} at ({x}, {y}) is {nearest:.1f}px from any printed box — "
                "has .form_sheet.tex changed without re-running the calibration?"
            )
            offsets.append(nearest)

    # Individually close is not enough: a systematic drift would pass the check
    # above while sliding every reading toward its neighbour.
    assert float(np.mean(offsets)) < 4.0, f"mean offset {np.mean(offsets):.2f}px"


def test_the_sampling_window_fits_inside_a_printed_bubble():
    """The margin the reader's accuracy depends on.

    The window must sit inside the printed outline. If it grows to touch the
    outline it starts measuring print darkness instead of the mark, which is
    the bug that made an empty bubble score 0.257. If it shrinks too far it
    stops averaging enough pixels to survive sensor noise.
    """
    cfg = load_config()
    sx, sy = canonical_px_per_mm()
    bubble_hw, bubble_hh = BUBBLE_W_MM * sx / 2, BUBBLE_H_MM * sy / 2

    margin_x = bubble_hw - cfg["half_width"]
    margin_y = bubble_hh - cfg["half_height"]

    # Bigger than the worst observed error in the clicked coordinates (~3.5px),
    # so a slightly-off calibration still samples clean interior.
    assert margin_x >= 4.0, f"only {margin_x:.1f}px of horizontal margin"
    assert margin_y >= 4.0, f"only {margin_y:.1f}px of vertical margin"

    # ...and still enough pixels for the average to mean something.
    area = (2 * cfg["half_width"]) * (2 * cfg["half_height"])
    assert area >= 150, f"sampling only {area} pixels per bubble"


def test_the_sheet_has_the_groups_the_schedule_expects():
    # A LaTeX edit that adds a ninth compartment or drops a duration would
    # otherwise surface as a KeyError deep in the schedule builder.
    cfg = load_config()
    assert set(cfg["groups"]) == {"layer", "days", "duration", "hour"}
    assert len(cfg["groups"]["layer"]["bubbles"]) == 8
    assert len(cfg["groups"]["days"]["bubbles"]) == 7
    assert len(cfg["groups"]["duration"]["bubbles"]) == 5
    assert len(cfg["groups"]["hour"]["bubbles"]) == 24
    assert cfg["groups"]["days"]["mode"] == "many"
    for one_of in ("layer", "duration", "hour"):
        assert cfg["groups"][one_of]["mode"] == "one"


def test_the_bubbles_are_all_inside_the_page():
    cfg = load_config()
    hw, hh = cfg["half_width"], cfg["half_height"]
    for name, group in cfg["groups"].items():
        for key, (x, y) in group["bubbles"].items():
            assert hw <= x < SIDE - hw, f"{name}.{key} runs off the page horizontally"
            assert hh <= y < SIDE - hh, f"{name}.{key} runs off the page vertically"


def test_no_two_bubbles_overlap():
    # Overlapping windows would make one mark register in two places, which for
    # a pick-one group reads as "two boxes filled" on a correctly filled sheet.
    cfg = load_config()
    hw, hh = cfg["half_width"], cfg["half_height"]
    positions = [(f"{n}.{k}", x, y)
                 for n, g in cfg["groups"].items()
                 for k, (x, y) in g["bubbles"].items()]

    for i, (name_a, ax, ay) in enumerate(positions):
        for name_b, bx, by in positions[i + 1:]:
            if abs(ax - bx) < 2 * hw and abs(ay - by) < 2 * hh:
                pytest.fail(f"{name_a} and {name_b} sample overlapping regions")
