"""The optical mark reader, exercised on manufactured photographs.

`synth` renders the real sheet with known marks and then degrades it the way a
handheld phone camera does. That makes the correct answer knowable, so these
tests assert on the reading itself rather than on intermediate shapes.

The interesting cases are the ones where the answer should be *no answer*: a
blank sheet, a blurred sheet, two bubbles filled in a pick-one group. An OMR
that reads those confidently is worse than one that refuses, because the output
ends up in a machine that dispenses medication.
"""
import sys
from pathlib import Path

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from form_sheet_parser.form_sheet_parser import (  # noqa: E402
    CANONICAL_MARKERS,
    detect_aruco_corners,
    estimate_page_homography,
    find_markers,
    parse_form_sheet,
    preprocess_form_sheet,
    read_form_sheet,
    warp_form_sheet,
)
from form_sheet_parser.synth import (  # noqa: E402
    canonical_blank,
    photograph,
    render_marked,
    synth_photo,
)

ANSWERS = {"layer": "3", "days": ["MON", "WED", "FRI"], "duration": "30d", "hour": "8"}


# ── the happy path ──────────────────────────────────────────────────────────

def test_a_clean_render_reads_back_exactly():
    img = render_marked(ANSWERS, seed=1)
    result = parse_form_sheet(img)
    assert result.ok, result.problems
    assert result.values == ANSWERS


@pytest.mark.parametrize("seed", range(12))
def test_handheld_photographs_read_back_exactly(seed):
    # Every seed is a different angle, a different shadow direction and a
    # different set of pen strokes.
    img = synth_photo(ANSWERS, seed=seed)
    result = parse_form_sheet(img)
    assert result.ok, result.problems
    assert result.values == ANSWERS


@pytest.mark.parametrize("seed", range(8))
def test_every_group_is_read_independently(seed):
    rng = np.random.default_rng(seed)
    answers = {
        "layer": str(rng.integers(1, 9)),
        "days": sorted(
            set(np.array(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"])[
                rng.choice(7, size=rng.integers(1, 8), replace=False)].tolist()),
            key=["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].index,
        ),
        "duration": str(rng.choice(["7d", "14d", "30d", "90d", "ongoing"])),
        "hour": str(rng.integers(0, 24)),
    }
    result = parse_form_sheet(synth_photo(answers, seed=seed))
    assert result.ok, result.problems
    assert result.values == answers


# ── self-calibration ────────────────────────────────────────────────────────

def test_an_unmarked_sheet_reads_as_almost_no_ink():
    """The measurement the sampling window was sized around.

    An earlier version sampled a 16x32 window, which is wider than the printed
    box is tall and straddles its outline. That put a quarter of a bubble's ink
    into every reading before anyone touched the page, so the threshold was
    really encoding how dark the print was that day. The window now sits inside
    the outline with ~5px of margin, and an untouched sheet reads as paper.
    """
    binary = preprocess_form_sheet(canonical_blank())
    result = read_form_sheet(binary)
    assert result.baseline < 0.10, f"unmarked baseline is {result.baseline:.3f}"

    every = [v for group in result.scores.values() for v in group.values()]
    assert max(every) < 0.15, f"an unmarked bubble scored {max(every):.2f}"


def test_the_reader_still_normalizes_even_though_the_baseline_is_now_small():
    # Sizing the window well made self-calibration nearly free rather than
    # unnecessary — a heavier print, a grey scan or a darker paper still shifts
    # every bubble together, and subtracting that shift costs nothing.
    marked = render_marked(ANSWERS, seed=11)
    greyed = np.clip(marked.astype(np.float32) * 0.75 + 40, 0, 255).astype(np.uint8)
    result = parse_form_sheet(greyed)
    assert result.ok, result.problems
    assert result.values == ANSWERS


def test_the_reading_survives_a_change_in_print_darkness():
    # Same marks, page printed faint and printed heavy. A reader calibrated
    # against one and run on the other is the failure this defends against.
    marked = render_marked(ANSWERS, seed=3)
    faint = np.clip(marked.astype(np.float32) * 0.35 + 165, 0, 255).astype(np.uint8)
    heavy = np.clip(marked.astype(np.float32) * 1.15 - 30, 0, 255).astype(np.uint8)
    for name, variant in (("faint", faint), ("heavy", heavy)):
        result = parse_form_sheet(variant)
        assert result.ok, f"{name}: {result.problems}"
        assert result.values == ANSWERS, name


# ── refusing to guess ───────────────────────────────────────────────────────

def test_a_blank_sheet_answers_nothing_rather_than_something():
    result = parse_form_sheet(synth_photo({}, seed=2))
    assert not result.ok
    assert result.values == {"layer": None, "days": [], "duration": None, "hour": None}
    assert len(result.problems) == 4


def test_two_marks_in_a_pick_one_group_are_never_resolved_by_darkness():
    # Both boxes are properly filled. Comparing only the gap between them would
    # pick whichever the pen covered more of, which is not a reading — it is a
    # coin toss dressed up as one.
    img = synth_photo({**ANSWERS, "layer": ["3", "4"]}, seed=5)
    result = parse_form_sheet(img)
    assert result.values["layer"] is None
    assert any("layer" in p and "two boxes filled" in p for p in result.problems)
    # The groups that were filled properly still read — one bad group does not
    # cost the caregiver the rest of the sheet.
    assert result.values["hour"] == "8"
    assert result.values["days"] == ANSWERS["days"]


@pytest.mark.parametrize("blur", [1.5, 2.0, 2.5, 3.0])
def test_defocus_does_not_degrade_the_reading_before_it_hides_the_page(blur):
    """Records a measured fact that is easy to assume the other way round.

    Blurring the photograph does not gradually erode the difference between a
    marked bubble and an empty one — a mark is a large dark blob and stays one.
    What blur eventually destroys is the ArUco markers, which are fine
    structure, and at that point the page cannot be located at all and the
    reader says so.

    So there is no band where the sheet is locatable but its bubbles are
    untrustworthy, which is why the sharpness check is a loose backstop rather
    than the main defence. If this test starts failing, that reasoning has
    changed and MIN_SHARPNESS needs revisiting.
    """
    for seed in range(4):
        result = parse_form_sheet(synth_photo(ANSWERS, seed=seed, blur=blur))
        if not result.found_page:
            continue          # blur won by hiding the markers; that is the real limit
        assert result.ok, result.problems
        assert result.values == ANSWERS


def test_a_hopelessly_blurred_photograph_reports_rather_than_raises():
    # Past a point the page cannot be located at all. That is an ordinary
    # outcome of pointing a camera at something, so it arrives as a result
    # with a reason — not as an exception the caller has to remember to catch.
    result = parse_form_sheet(synth_photo(ANSWERS, seed=6, blur=9.0))
    assert not result.ok
    assert not result.found_page
    assert any("locate the sheet" in p for p in result.problems)
    # Still shaped like every other result, so one code path handles both.
    assert set(result.values) == {"layer", "days", "duration", "hour"}


def test_a_photograph_taken_in_the_dark_is_refused():
    img = synth_photo(ANSWERS, seed=7, brightness=0.12, vignette=0.1)
    result = parse_form_sheet(img)
    assert not result.ok
    assert any("dark" in p for p in result.problems)


# ── fiducials ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("seed", range(6))
def test_a_thumb_over_one_marker_costs_nothing(seed):
    # A hand steadying the page covers a corner marker constantly. The other
    # three still carry twelve correspondences, which over-determines the
    # transform — so the sheet reads exactly as it would have.
    img = synth_photo(ANSWERS, seed=seed)
    covered = img.copy()
    h, w = covered.shape[:2]
    covered[: h // 5, : w // 5] = 90

    assert sorted(find_markers(covered)) == [1, 2, 3]
    result = parse_form_sheet(covered)
    assert result.ok, result.problems
    assert result.values == ANSWERS
    assert result.quality["markers"] == 3


def test_losing_a_marker_barely_moves_the_bubble_map():
    # The number that matters is how far the map slides, because a slide is
    # what turns "one bubble" into "the bubble next to it". A bubble is 16px
    # wide in canonical space, so single-digit-fraction movement is nothing.
    img = synth_photo(ANSWERS, seed=8)
    h, w = img.shape[:2]
    covered = img.copy()
    covered[: h // 5, : w // 5] = 90

    m_full, _ = estimate_page_homography(img)
    m_part, info = estimate_page_homography(covered)

    probes = np.float32([[169, 628], [421, 401], [860, 401], [500, 900]]).reshape(-1, 1, 2)
    in_photo = cv2.perspectiveTransform(probes, np.linalg.inv(m_full))
    back = cv2.perspectiveTransform(in_photo, m_part).reshape(-1, 2)
    shift = np.linalg.norm(back - probes.reshape(-1, 2), axis=1).max()

    assert shift < 4.0, f"map moved {shift:.1f}px with one marker gone"
    assert info["residual_px"] < 2.0


def test_two_covered_corners_are_refused():
    img = synth_photo(ANSWERS, seed=9)
    covered = img.copy()
    h, w = covered.shape[:2]
    covered[: h // 5, :] = 90                 # both top markers
    with pytest.raises(ValueError, match="at least 3"):
        estimate_page_homography(covered)
    # ...and the top-level call turns that into a reason, not a traceback.
    assert not parse_form_sheet(covered).found_page


def test_an_upside_down_photograph_reads_the_same():
    # The markers are id-coded, so page orientation is recoverable and the
    # caregiver never has to be told which way up to hold the sheet.
    img = synth_photo(ANSWERS, seed=10)
    flipped = cv2.rotate(img, cv2.ROTATE_180)
    result = parse_form_sheet(flipped)
    assert result.ok, result.problems
    assert result.values == ANSWERS


def test_a_photograph_with_no_sheet_in_it_raises_clearly():
    noise = np.random.default_rng(0).integers(0, 255, (480, 640, 3), dtype=np.uint8)
    with pytest.raises(ValueError, match="marker"):
        detect_aruco_corners(noise)


def test_the_marker_geometry_model_matches_the_printed_sheet():
    """The one assumption the whole rectification rests on.

    `CANONICAL_MARKERS` is computed from the millimetre geometry in
    .form_sheet.tex, never measured from an image. If someone edits the LaTeX —
    moves a marker, resizes it, changes the paper — the constants here go stale
    and every bubble coordinate silently shifts. This re-derives them from the
    shipped PDF and fails when the two stop agreeing.

    It is also the check that caught the 420px preview being 2% off, which is
    why the synthetic sheets are rendered from the PDF.
    """
    from form_sheet_parser.synth import _read_blank, blank_sheet_is_faithful

    if not blank_sheet_is_faithful():
        pytest.skip("no PDF renderer (pdftoppm); the preview PNG is too coarse to check against")

    page = _read_blank()
    found = find_markers(page)
    assert sorted(found) == [0, 1, 2, 3]

    # Rectify using only the four outer corners — the definition the bubble
    # coordinates were calibrated against — then ask where the other corners land.
    outer = np.float32([found[i][i] for i in range(4)])
    measured = cv2.getPerspectiveTransform(
        outer, np.float32([[0, 0], [999, 0], [999, 999], [0, 999]])
    )
    for i in range(4):
        got = cv2.perspectiveTransform(found[i].reshape(-1, 1, 2), measured).reshape(-1, 2)
        err = np.abs(got - CANONICAL_MARKERS[i]).max()
        assert err < 1.5, f"marker {i} model is off by {err:.2f}px — has .form_sheet.tex changed?"


# ── robustness surface ──────────────────────────────────────────────────────

@pytest.mark.parametrize("effect,value", [
    ("blur", 2.0),
    ("noise", 16.0),
    ("perspective", 0.14),
    ("vignette", 0.65),
    ("jpeg_quality", 25),
])
def test_reading_holds_up_under_one_bad_condition_at_a_time(effect, value):
    # Each of these is a condition a real photograph plausibly has. Passing
    # here is the claim that the reader tolerates it; the exact limits are
    # mapped by `python -m form_sheet_parser.synth --sweep`.
    failures = []
    for seed in range(6):
        result = parse_form_sheet(synth_photo(ANSWERS, seed=seed, **{effect: value}))
        if not (result.ok and result.values == ANSWERS):
            failures.append((seed, result.problems or result.values))
    assert not failures, f"{effect}={value}: {failures}"


def test_a_partly_filled_mark_still_counts():
    # People do not fill boxes solid however clearly the sheet asks them to.
    # The sheet says "fill boxes solid" and the reader wants roughly three
    # quarters of the box; `--sweep` reports the exact floor. Below it a mark
    # stops being separable from the printed outline by any useful margin, and
    # the reader asks for a better sheet rather than guessing at a faint one.
    for seed in range(8):
        result = parse_form_sheet(synth_photo(ANSWERS, seed=seed, coverage=0.85))
        assert result.ok, result.problems
        assert result.values == ANSWERS


def test_a_mark_too_faint_to_separate_is_reported_not_guessed():
    # The other side of the same threshold. A barely-there mark must not become
    # a confident reading; it must become a request to fill the box in.
    flagged = 0
    for seed in range(8):
        result = parse_form_sheet(synth_photo(ANSWERS, seed=seed, coverage=0.25))
        assert not (result.ok and result.values != ANSWERS), "silently misread a faint sheet"
        flagged += not result.ok
    assert flagged >= 6, f"only {flagged}/8 faint sheets were flagged"
