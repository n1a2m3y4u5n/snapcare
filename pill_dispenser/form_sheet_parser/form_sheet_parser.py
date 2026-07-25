"""Read a filled-in pill dispenser schedule sheet from a photograph.

The sheet is the offline half of SnapCare. A caregiver who cannot use the app —
or who is filling trays for someone else — marks a paper form, photographs it,
and the schedule reaches the dispenser without anyone typing anything. Four
ArUco markers pin the page corners, so the photo can be taken by hand at an
angle and still rectify to a fixed 1000x1000 grid where every bubble has a
known coordinate.

Pipeline
--------
    photo -> detect markers -> warp to 1000x1000 -> threshold -> score bubbles

Reading a bubble is the part that is easy to get wrong. The obvious method —
measure the fraction of dark pixels in a box and call it filled above some
threshold — has a flaw that only shows up on real paper: **an empty bubble is
not empty**. Its own printed outline is ink, and it lands inside the box. So
the fixed cutoff is not really measuring "is this filled", it is measuring
"is this darker than the printed outline was on the day we calibrated". Change
the printer, the paper, the camera's exposure or the ambient light, and the
cutoff drifts out from under you.

So each sheet calibrates itself. Every bubble on the page is scored, and a low
percentile of those scores is taken as *this photograph's* idea of what an
unmarked bubble looks like. Scores are then rescaled against that baseline
before any threshold is applied. A sheet shot in shadow and the same sheet shot
in daylight produce the same answer, because both are measured against their
own paper rather than a remembered one.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

DICT = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
SIDE = 1000

HERE = Path(__file__).resolve().parent
DEFAULT_CONFIG = HERE / "form_sheet" / "form_sheet_config.json"

# Variance of the Laplacian, the usual cheap defocus proxy, as a backstop only.
#
# It is deliberately loose, because measurement said it should be. Sweeping
# defocus against synthetic sheets, the gap between a marked bubble and an
# unmarked one barely moves: at four times the nominal blur, marks still score
# 0.39 and up while empty boxes stay under 0.19. Blur does not close that gap —
# what it eventually does is stop the ArUco markers being detectable at all,
# and that failure is caught separately and reported as "could not locate the
# sheet". So the real defence against a bad photograph is the score separation
# itself, and a tight sharpness gate here would only reject sheets that read
# perfectly well.
MIN_SHARPNESS = 15.0
# Below this, the warped page is too dark for the adaptive threshold to mean
# anything and the user should be asked to retake rather than shown a guess.
MIN_MEAN_LUMA = 45.0
# How far the fitted page transform may miss a marker corner, in canonical
# pixels. A bubble is 16x32, so a fit off by half a bubble is already reading
# the wrong box; this refuses well before that.
MAX_FIT_RESIDUAL_PX = 8.0


# ── results ─────────────────────────────────────────────────────────────────

@dataclass
class SheetResult:
    """What one photograph of one sheet says.

    `values` is the answer; everything else exists so a failure can be
    explained to the person holding the camera instead of just refused.
    """

    values: dict
    problems: list[str] = field(default_factory=list)
    scores: dict = field(default_factory=dict)      # group -> {key: normalized score}
    baseline: float = 0.0                           # what an empty bubble scored
    quality: dict = field(default_factory=dict)     # sharpness, luma, markers, residual
    found_page: bool = True                         # were the markers located at all

    @property
    def ok(self) -> bool:
        return self.found_page and not self.problems

    def to_json(self) -> dict:
        return {
            "found_page": self.found_page,
            "values": self.values,
            "problems": self.problems,
            "baseline": round(self.baseline, 4),
            "quality": {k: round(v, 2) if isinstance(v, float) else v
                        for k, v in self.quality.items()},
            "scores": {g: {k: round(v, 3) for k, v in s.items()}
                       for g, s in self.scores.items()},
        }

    @classmethod
    def no_page(cls, reason: str, config_file=None) -> "SheetResult":
        """The result for a photograph the page could not be located in.

        Still shaped like every other result — same keys, all empty — so a
        caller has one code path for "this did not work" instead of a separate
        exception handler that is easy to forget and easy to get wrong.
        """
        groups = load_config(config_file)["groups"]
        return cls(
            values={name: ([] if g["mode"] == "many" else None) for name, g in groups.items()},
            problems=[reason],
            found_page=False,
        )


# ── fiducials ───────────────────────────────────────────────────────────────

# Page geometry, taken from form_sheet/.form_sheet.tex. These are what the
# printer puts on the paper, so they are the ground truth for where a marker's
# corners are; measuring them off the low-resolution preview PNG instead would
# bake that raster's quantization into the model.
PAGE_W_MM, PAGE_H_MM = 148.0, 210.0     # A5 portrait
MARKER_BOX_MM = 9.0                     # \includegraphics[width=9mm]
MARKER_MARGIN_MM = 6.0                  # inset from each page edge
# generate_aruco_corners pads a 600px marker with a 120px white quiet zone on
# every side, so the black pattern is 600/840 of the placed box and starts
# 120/840 of the way in. The quiet zone is what makes the marker findable at
# all, and it means the pattern is smaller than the 9mm it is placed at.
_PATTERN_FRAC = 600.0 / 840.0
_QUIET_FRAC = 120.0 / 840.0
MARKER_PATTERN_MM = MARKER_BOX_MM * _PATTERN_FRAC          # 6.4286
_INSET_MM = MARKER_MARGIN_MM + MARKER_BOX_MM * _QUIET_FRAC  # 7.2857

# The canonical 1000x1000 space is defined by the four outermost pattern
# corners, which is what the original single-quad warp used — so every bubble
# coordinate already calibrated against it stays valid.
_X0, _Y0 = _INSET_MM, _INSET_MM
_X1, _Y1 = PAGE_W_MM - _INSET_MM, PAGE_H_MM - _INSET_MM

MIN_MARKERS = 3


def _mm_to_canonical(x_mm: float, y_mm: float) -> tuple[float, float]:
    return ((x_mm - _X0) / (_X1 - _X0) * (SIDE - 1),
            (y_mm - _Y0) / (_Y1 - _Y0) * (SIDE - 1))


def canonical_marker_corners() -> dict[int, np.ndarray]:
    """Marker id -> its four corners in canonical space, in detector order.

    `detectMarkers` lists a marker's corners starting at its own top-left and
    going clockwise. Because that ordering is relative to the marker's own
    pattern, it rotates with the page — which is exactly what makes a sheet
    photographed upside down still resolve to an upright rectification.
    """
    size = MARKER_PATTERN_MM
    origins = {                       # top-left of each pattern, in mm
        0: (_X0, _Y0),                            # TL
        1: (PAGE_W_MM - _INSET_MM - size, _Y0),   # TR
        2: (PAGE_W_MM - _INSET_MM - size, PAGE_H_MM - _INSET_MM - size),  # BR
        3: (_X0, PAGE_H_MM - _INSET_MM - size),   # BL
    }
    out = {}
    for i, (ox, oy) in origins.items():
        square = [(ox, oy), (ox + size, oy), (ox + size, oy + size), (ox, oy + size)]
        out[i] = np.array([_mm_to_canonical(x, y) for x, y in square], dtype=np.float32)
    return out


CANONICAL_MARKERS = canonical_marker_corners()


def generate_aruco_corners(out_path: str = "") -> None:
    """Write the four corner markers that get printed on the sheet.

    IDs: 0=TL, 1=TR, 2=BR, 3=BL (clockwise). The white border is not decoration:
    without a quiet zone at least one module wide the detector cannot separate
    the pattern from the page.
    """
    for i in range(4):
        m = cv2.aruco.generateImageMarker(DICT, i, 600)
        m = cv2.copyMakeBorder(m, 120, 120, 120, 120, cv2.BORDER_CONSTANT, value=255)
        cv2.imwrite(out_path + f"{i:02}_aruco.png", m)


def _detector() -> cv2.aruco.ArucoDetector:
    params = cv2.aruco.DetectorParameters()
    # Sub-pixel refinement costs almost nothing here and directly buys bubble
    # alignment: an error in a marker corner is multiplied across the page by
    # the homography, so half a pixel at the corner is several at the far edge.
    params.cornerRefinementMethod = cv2.aruco.CORNER_REFINE_SUBPIX
    return cv2.aruco.ArucoDetector(DICT, params)


def find_markers(img: np.ndarray) -> dict[int, np.ndarray]:
    """Detected marker id -> its four corners, keeping only the ids we printed."""
    corners, ids, _ = _detector().detectMarkers(img)
    if ids is None:
        return {}
    return {int(i): c[0].astype(np.float32)
            for i, c in zip(ids.flatten(), corners) if int(i) in CANONICAL_MARKERS}


def estimate_page_homography(img: np.ndarray) -> tuple[np.ndarray, dict]:
    """Fit photo -> canonical using every corner of every marker found.

    Returns (3x3 homography, info).

    Why all sixteen corners rather than the four outermost ones: a hand
    steadying the page covers a marker constantly, and the sheet has to be
    readable when one is gone. The obvious repair — treat the page as a
    parallelogram and infer the fourth corner from the other three — is wrong
    under perspective, and wrong in the worst possible way. It does not fail
    loudly; it shifts the whole bubble map by a fraction of the page, so marks
    land in neighbouring bubbles and the sheet reads as a different, entirely
    plausible schedule. That is a silent misreading feeding a machine that
    dispenses medication.

    Each marker instead contributes four correspondences, so three markers give
    twelve well-spread points — far more than the four a homography needs, and
    fitted under the correct projective model rather than an affine
    approximation of it. Fewer than three is refused, because two markers span
    too little of the page to constrain the far corners.
    """
    found = find_markers(img)
    if not found:
        raise ValueError("no markers detected")
    if len(found) < MIN_MARKERS:
        missing = [i for i in range(4) if i not in found]
        raise ValueError(
            f"only {len(found)} of 4 markers detected (missing {missing}); "
            f"need at least {MIN_MARKERS} to locate the page"
        )

    src = np.concatenate([found[i] for i in sorted(found)])
    dst = np.concatenate([CANONICAL_MARKERS[i] for i in sorted(found)])
    M, inliers = cv2.findHomography(src, dst, method=cv2.RANSAC, ransacReprojThreshold=3.0)
    if M is None:
        raise ValueError("could not fit a page transform to the detected markers")

    # Residual in canonical pixels. A bubble is 16x32, so anything approaching
    # that means the map no longer lines up with the paper.
    projected = cv2.perspectiveTransform(src.reshape(-1, 1, 2), M).reshape(-1, 2)
    residual = float(np.max(np.linalg.norm(projected - dst, axis=1)))
    return M, {
        "markers": len(found),
        "marker_ids": sorted(found),
        "residual_px": residual,
        "inliers": int(inliers.sum()) if inliers is not None else len(src),
    }


def detect_aruco_corners(img: np.ndarray) -> np.ndarray:
    """The page quad in photo coordinates: float32 (4, 2), [TL, TR, BR, BL].

    Kept for callers that want the quad itself (the calibration and
    visualisation scripts do). It is now derived from the fitted homography, so
    it benefits from every marker that was found rather than only the four
    outermost corners.
    """
    M, _ = estimate_page_homography(img)
    canon = np.float32([[0, 0], [SIDE - 1, 0], [SIDE - 1, SIDE - 1], [0, SIDE - 1]])
    return cv2.perspectiveTransform(
        canon.reshape(-1, 1, 2), np.linalg.inv(M)
    ).reshape(-1, 2).astype(np.float32)


def warp_form_sheet(img: np.ndarray, transform: np.ndarray) -> np.ndarray:
    """Rectify the page to the SIDE x SIDE image the bubble map is drawn on.

    Accepts either a (4, 2) page quad or a ready 3x3 homography, so the older
    `warp_form_sheet(img, detect_aruco_corners(img))` call still works.
    """
    transform = np.asarray(transform, dtype=np.float32)
    if transform.shape == (3, 3):
        M = transform
    elif transform.shape == (4, 2):
        dst = np.float32([[0, 0], [SIDE - 1, 0], [SIDE - 1, SIDE - 1], [0, SIDE - 1]])
        M = cv2.getPerspectiveTransform(transform, dst)
    else:
        raise ValueError(f"expected a (4,2) quad or a (3,3) homography, got {transform.shape}")
    return cv2.warpPerspective(img, M, (SIDE, SIDE))


# ── thresholding ────────────────────────────────────────────────────────────

def preprocess_form_sheet(warped: np.ndarray) -> np.ndarray:
    """Grayscale -> blur -> adaptive threshold. Output: ink = 255, paper = 0.

    The threshold is adaptive because a phone photograph of a flat page is
    never evenly lit — there is a bright spot where the lamp is and a shadow
    where the photographer is. A global cutoff turns that gradient into
    "everything on the left is filled".
    """
    gray = warped if warped.ndim == 2 else cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    return cv2.adaptiveThreshold(
        blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV,
        blockSize=51, C=10,
    )


def assess_quality(warped: np.ndarray, info: dict | None = None) -> tuple[dict, list[str]]:
    """Cheap "is this photo worth reading" checks, run before any bubble is scored.

    Refusing a bad photograph is the right answer far more often than reading
    one confidently. The user is standing in front of the sheet and can simply
    take another; a wrong schedule reaches a dispenser full of medication.
    """
    gray = warped if warped.ndim == 2 else cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    luma = float(gray.mean())
    info = info or {}

    problems = []
    if sharpness < MIN_SHARPNESS:
        problems.append(f"photo is out of focus (sharpness {sharpness:.0f} < {MIN_SHARPNESS:.0f})")
    if luma < MIN_MEAN_LUMA:
        problems.append(f"photo is too dark (mean luma {luma:.0f} < {MIN_MEAN_LUMA:.0f})")

    # A large residual means the markers were found but do not agree on where
    # the page is — a crease, a curled sheet, or a marker matched to noise. The
    # bubble map would be laid down in the wrong place, so refuse rather than
    # read whatever happens to fall under it.
    residual = float(info.get("residual_px", 0.0))
    if residual > MAX_FIT_RESIDUAL_PX:
        problems.append(
            f"page does not lie flat (marker fit is off by {residual:.0f}px, "
            f"limit {MAX_FIT_RESIDUAL_PX:.0f}px) — flatten the sheet and retake"
        )

    quality = {"sharpness": sharpness, "mean_luma": luma,
               "markers": int(info.get("markers", 4)), "residual_px": residual}
    return quality, problems


# ── bubble scoring ──────────────────────────────────────────────────────────

def _fill_ratio(binary: np.ndarray, cx: int, cy: int, hw: int, hh: int) -> float:
    """Fraction of ink inside the box centred on (cx, cy).

    Clipped to the image so a bubble calibrated near the page edge cannot
    produce an empty slice — `np.mean` of nothing is NaN, and a NaN score
    silently loses every comparison it takes part in, which would make the
    bubble permanently unselectable instead of noisily wrong.
    """
    h, w = binary.shape[:2]
    y0, y1 = max(0, cy - hh), min(h, cy + hh)
    x0, x1 = max(0, cx - hw), min(w, cx + hw)
    if y0 >= y1 or x0 >= x1:
        return 0.0
    return float(np.mean(binary[y0:y1, x0:x1])) / 255.0


def _baseline(raw_scores: list[float], quantile: float = 0.25) -> float:
    """What an unmarked bubble looks like *in this photograph*.

    The sheet has 44 bubbles and a correctly filled one marks at most about a
    third of them (one layer, up to seven days, one duration, one hour). The
    lower quartile therefore lands comfortably inside the unmarked population
    even on a heavily filled sheet, while still tracking how dark this
    particular print/camera/lighting combination renders an empty outline.
    """
    if not raw_scores:
        return 0.0
    return float(np.quantile(raw_scores, quantile))


def _normalize(raw: float, baseline: float) -> float:
    """Rescale a raw fill so 0 is an empty bubble and 1 is a solid one."""
    denom = max(1e-6, 1.0 - baseline)
    return float(np.clip((raw - baseline) / denom, 0.0, 1.0))


def load_config(config_file: str | Path | None = None) -> dict:
    with open(config_file or DEFAULT_CONFIG) as f:
        return json.load(f)


def read_form_sheet(binary: np.ndarray, config_file: str | Path | None = None,
                    quality: dict | None = None,
                    prior_problems: list[str] | None = None) -> SheetResult:
    """Score every bubble group against the calibrated coordinate map.

    Groups are either `one` (exactly one answer — layer, duration, hour) or
    `many` (any subset — days of the week). Both refuse to guess: `one`
    reports nothing when the top two candidates are too close to separate, and
    `many` flags bubbles that sit in the band between clearly-empty and
    clearly-filled. A named problem sends the user back to the sheet, which is
    recoverable; a confident misreading is not.
    """
    cfg = load_config(config_file)
    hw, hh = cfg["half_width"], cfg["half_height"]
    abs_min, margin = cfg["abs_min"], cfg["margin"]
    # Old configs predate self-calibration; honour them literally so a sheet
    # calibrated against the previous behaviour keeps reading the same way.
    normalize = cfg.get("normalize", True)

    raw = {
        name: {key: _fill_ratio(binary, xy[0], xy[1], hw, hh)
               for key, xy in group["bubbles"].items()}
        for name, group in cfg["groups"].items()
    }

    all_raw = [v for group in raw.values() for v in group.values()]
    baseline = _baseline(all_raw) if normalize else 0.0
    scores = {
        name: {k: (_normalize(v, baseline) if normalize else v) for k, v in group.items()}
        for name, group in raw.items()
    }

    values: dict = {}
    problems: list[str] = list(prior_problems or [])

    for name, group in cfg["groups"].items():
        s = scores[name]

        if group["mode"] == "one":
            ranked = sorted(s.items(), key=lambda kv: -kv[1])
            best, second = ranked[0], ranked[1]
            if best[1] < abs_min:
                values[name] = None
                problems.append(f"{name}: nothing filled")
            elif second[1] >= abs_min:
                # Two bubbles are both properly filled. Comparing only the gap
                # between them would quietly pick whichever the pen happened to
                # cover more of — on a sheet where someone marked a box, changed
                # their mind, and marked another without erasing the first. The
                # sheet is asking two different things; only its author can say
                # which was meant.
                values[name] = None
                problems.append(
                    f"{name}: two boxes filled ({best[0]}={best[1]:.2f}, "
                    f"{second[0]}={second[1]:.2f}) — erase one and retake"
                )
            elif best[1] - second[1] < margin:
                values[name] = None
                problems.append(
                    f"{name}: ambiguous ({best[0]}={best[1]:.2f}, {second[0]}={second[1]:.2f})"
                )
            else:
                values[name] = best[0]
        else:
            # Preserve the order the config declares (MON..SUN), not score order —
            # a caller rendering the days back to a human wants them in week order.
            picked = [k for k in group["bubbles"] if s[k] >= abs_min]
            unclear = [k for k in group["bubbles"] if abs_min - margin <= s[k] < abs_min]
            values[name] = picked
            if not picked:
                problems.append(f"{name}: nothing filled")
            if unclear:
                problems.append(f"{name}: borderline {unclear}")

    return SheetResult(values=values, problems=problems, scores=scores,
                       baseline=baseline, quality=quality or {})


# ── top level ───────────────────────────────────────────────────────────────

def parse_form_sheet(img: np.ndarray, config_file: str | Path | None = None) -> SheetResult:
    """Photograph -> SheetResult. The one call the rest of the system needs.

    Never raises for a bad photograph. Not finding the page is an ordinary
    outcome of pointing a camera at something — the sheet is out of frame, a
    thumb is over a marker, the picture is a blur — and the caller's response
    is the same as for any other problem: tell the user what went wrong and let
    them take another. Making that the one case that arrives as an exception
    would buy nothing and would eventually be the branch nobody handled.
    """
    try:
        M, info = estimate_page_homography(img)
    except ValueError as exc:
        return SheetResult.no_page(f"could not locate the sheet: {exc}", config_file)

    warped = warp_form_sheet(img, M)
    quality, problems = assess_quality(warped, info)
    binary = preprocess_form_sheet(warped)
    return read_form_sheet(binary, config_file, quality=quality, prior_problems=problems)


def parse_form_sheet_file(path: str | Path, config_file: str | Path | None = None) -> SheetResult:
    img = cv2.imread(str(path))
    if img is None:
        raise ValueError(f"cannot read image: {path}")
    return parse_form_sheet(img, config_file)
