"""Render synthetic photographs of filled-in schedule sheets.

Testing an optical mark reader normally means printing sheets, filling them in
by hand, photographing them under several lights, and doing it again every time
the code changes. That does not fit in a test suite, so nobody runs it, and the
parser's behaviour under bad conditions stays a matter of opinion.

This module manufactures the photographs instead. It starts from the real
`form_sheet.png`, marks bubbles the way a person does — off-centre, not quite
filled, sometimes overshooting the outline — and then puts the page through the
things a phone camera does to it: perspective from holding it at an angle, a
lighting gradient from standing between the sheet and the window, defocus,
sensor noise and JPEG. The result is an image the parser has never seen, whose
correct answer is known exactly.

That makes two useful things possible: the round-trip test in `tests/`, and
`--sweep`, which walks a degradation up until reading fails and reports where
the limit actually is instead of where it is assumed to be.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np

from .form_sheet_parser import (
    DEFAULT_CONFIG,
    SIDE,
    detect_aruco_corners,
    load_config,
    warp_form_sheet,
)

HERE = Path(__file__).resolve().parent
BLANK_SHEET = HERE / "form_sheet" / "form_sheet.png"


BLANK_PDF = HERE / "form_sheet" / "form_sheet.pdf"

# The sheet is rasterized from the PDF at this resolution — about 1165px across
# an A5 page, which puts ~20px across a bubble and ~60 across a marker.
#
# The PDF matters rather than the PNG beside it. form_sheet.png is a 420px
# preview, and at that size each ArUco marker is 18 pixels wide; anti-aliasing
# pulls its detected corners inward by a fifth of a pixel on each side, which
# reads as a marker 2% smaller than the one that is actually printed. Fitting
# the page against a 2%-wrong model is invisible while all four markers are
# present — the errors are symmetric and cancel — but as soon as one is
# occluded the asymmetry becomes a ~10px translation of the whole bubble map,
# which is more than a bubble's half-width. Testing against the preview would
# therefore have measured the preview's rasterization, not the reader.
RENDER_DPI = 200
# Fallback only: used when the PDF or a renderer is unavailable. Upscaling does
# not undo the bias above, so tests that depend on precise geometry should skip
# rather than quietly measure the wrong thing.
RENDER_SCALE = 3.0

_blank_cache: dict = {}


def _render_pdf(pdf: Path, dpi: int) -> np.ndarray | None:
    """Rasterize the sheet PDF with poppler, or return None if it is not there."""
    import shutil
    import subprocess
    import tempfile

    tool = shutil.which("pdftoppm")
    if not tool or not pdf.is_file():
        return None
    with tempfile.TemporaryDirectory() as tmp:
        stem = Path(tmp) / "sheet"
        try:
            subprocess.run([tool, "-r", str(dpi), "-png", "-singlefile", str(pdf), str(stem)],
                           check=True, capture_output=True, timeout=60)
        except (subprocess.SubprocessError, OSError):
            return None
        return cv2.imread(str(stem.with_suffix(".png")))


def blank_sheet_is_faithful() -> bool:
    """True when the blank comes from the PDF rather than the low-res preview."""
    return _read_blank() is not None and _blank_cache.get("source") == "pdf"


def _read_blank(sheet_png: Path | str | None = None) -> np.ndarray:
    """The printed sheet at working resolution, from the PDF where possible."""
    if sheet_png is not None:
        img = cv2.imread(str(sheet_png))
        if img is None:
            raise FileNotFoundError(f"cannot read blank sheet: {sheet_png}")
        return img

    if "img" not in _blank_cache:
        img = _render_pdf(BLANK_PDF, RENDER_DPI)
        if img is not None:
            _blank_cache.update(img=img, source="pdf")
        else:
            fallback = cv2.imread(str(BLANK_SHEET))
            if fallback is None:
                raise FileNotFoundError(
                    f"no usable blank sheet: neither {BLANK_PDF} (needs pdftoppm) "
                    f"nor {BLANK_SHEET}"
                )
            fallback = cv2.resize(fallback, None, fx=RENDER_SCALE, fy=RENDER_SCALE,
                                  interpolation=cv2.INTER_CUBIC)
            _blank_cache.update(img=fallback, source="png")
    return _blank_cache["img"].copy()


def canonical_blank(sheet_png: Path | str | None = None) -> np.ndarray:
    """The printed sheet rectified into the 1000x1000 space the config uses.

    This is the frame the bubble coordinates are expressed in, so it is what
    you want when inspecting the map or measuring what an unmarked bubble
    scores. It is *not* suitable as a synthetic photograph: the warp puts each
    marker's outer corner exactly on the image boundary, which cuts away the
    white quiet zone ArUco needs, and the markers stop being detectable.
    """
    img = _read_blank(sheet_png)
    return warp_form_sheet(img, detect_aruco_corners(img))


def _page_frame(sheet_png: Path | str | None = None):
    """Return (page image, canonical->page homography).

    Marks are drawn in canonical coordinates and then pushed back onto the
    page, so the page keeps its printed margins and its markers keep the quiet
    zones that make them findable.
    """
    page = _read_blank(sheet_png)
    quad = detect_aruco_corners(page)
    canon = np.float32([[0, 0], [SIDE - 1, 0], [SIDE - 1, SIDE - 1], [0, SIDE - 1]])
    return page, cv2.getPerspectiveTransform(canon, quad)


def fill_bubble(canvas: np.ndarray, cx: int, cy: int, hw: int, hh: int,
                rng: np.random.Generator, coverage: float = 1.0) -> None:
    """Mark one bubble the way a person with a pen does.

    Nobody fills a box exactly. The mark drifts off centre, it does not reach
    the corners, its edges are ragged, and its darkness depends on how hard
    they pressed. `coverage` scales how much of the box gets ink — dropping it
    is how the sweep finds the point where a half-hearted mark stops reading.
    """
    # Off-centre by up to a fifth of the box, which is a realistic miss.
    ox = int(rng.normal(0, hw * 0.18))
    oy = int(rng.normal(0, hh * 0.18))
    # `coverage` is the fraction of the box *area* that gets ink, so it maps to
    # the axes through a square root. Scaling both axes by it directly would
    # mean "coverage=0.6" drew a mark of 36% area, and the sweep would report a
    # tolerance far tighter than the reader actually has.
    linear = coverage ** 0.5
    # A pen fills an oval, not a rectangle, and rarely touches the outline.
    ax = max(1, int(hw * linear * rng.uniform(0.80, 1.05)))
    ay = max(1, int(hh * linear * rng.uniform(0.80, 1.05)))
    darkness = int(rng.uniform(20, 70))          # ballpoint on white paper
    cv2.ellipse(canvas, (cx + ox, cy + oy), (ax, ay), float(rng.uniform(-15, 15)),
                0, 360, (darkness,) * 3, -1, lineType=cv2.LINE_AA)
    # A second, smaller scribble: people go over the mark again.
    cv2.ellipse(canvas, (cx + ox, cy + oy), (int(ax * 0.7), int(ay * 0.7)),
                float(rng.uniform(-15, 15)), 0, 360, (max(0, darkness - 20),) * 3, -1,
                lineType=cv2.LINE_AA)


def render_marked(answers: dict, config_file=None, seed: int = 0,
                  coverage: float = 1.0, sheet_png=None) -> np.ndarray:
    """A filled-in sheet, flat-on and undegraded — the page, not a photo of it.

    `answers` maps group name to the key (or list of keys, for `many` groups)
    that should be marked: {"layer": "3", "days": ["MON","WED"], ...}.

    The marks are drawn in canonical coordinates, where the bubble map lives,
    and then warped onto the printed page. Compositing that way means the marks
    land on exactly the pixels the parser will later measure, so a round-trip
    failure is the reader's fault rather than the generator's.
    """
    cfg = load_config(config_file)
    rng = np.random.default_rng(seed)
    page, canon_to_page = _page_frame(sheet_png)
    hw, hh = cfg["half_width"], cfg["half_height"]

    # White = untouched, darker = ink. Drawn on its own layer so it can be
    # warped and composited without dragging the printed sheet through a
    # second resampling.
    ink = np.full((SIDE, SIDE, 3), 255, dtype=np.uint8)
    marked_any = False

    for name, group in cfg["groups"].items():
        want = answers.get(name)
        if want is None:
            continue
        keys = [want] if isinstance(want, str) else list(want)
        for key in keys:
            if key not in group["bubbles"]:
                raise KeyError(f"{name!r} has no bubble {key!r}")
            cx, cy = group["bubbles"][key]
            fill_bubble(ink, cx, cy, hw, hh, rng, coverage)
            marked_any = True

    if not marked_any:
        return page

    h, w = page.shape[:2]
    warped_ink = cv2.warpPerspective(ink, canon_to_page, (w, h),
                                     flags=cv2.INTER_LINEAR, borderValue=(255, 255, 255))
    # Ink darkens the page; it never lightens it. Taking the minimum keeps the
    # printed outline visible underneath a partial mark, which is what a pen
    # over a printed box actually looks like.
    return np.minimum(page, warped_ink)


def photograph(sheet: np.ndarray, rng: np.random.Generator, *,
               perspective: float = 0.06, rotation: float = 4.0,
               blur: float = 1.0, noise: float = 4.0,
               vignette: float = 0.35, brightness: float = 1.0,
               jpeg_quality: int = 80, canvas_scale: float = 1.25) -> np.ndarray:
    """Put a rectified sheet through what a handheld phone camera does to it.

    Each argument is one physical effect, so a test can isolate the one it
    cares about. The defaults are a decent handheld shot indoors; the sweep
    pushes them one at a time.
    """
    h, w = sheet.shape[:2]
    out_w, out_h = int(w * canvas_scale), int(h * canvas_scale)
    pad_x, pad_y = (out_w - w) / 2, (out_h - h) / 2

    # Corners of the page in the output frame, nudged to fake an off-axis shot.
    src = np.float32([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]])
    jitter = rng.uniform(-perspective, perspective, size=(4, 2)) * np.float32([w, h])
    dst = src + np.float32([[pad_x, pad_y]]) + jitter

    # Roll the camera about the page centre.
    theta = np.deg2rad(rng.uniform(-rotation, rotation))
    c, s = np.cos(theta), np.sin(theta)
    centre = np.float32([out_w / 2, out_h / 2])
    dst = (dst - centre) @ np.float32([[c, -s], [s, c]]).T + centre

    M = cv2.getPerspectiveTransform(src, dst.astype(np.float32))
    # Mid-grey border: a desk, not a void — a white border would merge with the
    # page and hand the marker detector an edge that is not there.
    img = cv2.warpPerspective(sheet, M, (out_w, out_h),
                              flags=cv2.INTER_LINEAR, borderValue=(120, 120, 120))

    img = img.astype(np.float32)

    # Lighting gradient: the photographer's own shadow across the page.
    if vignette > 0:
        yy, xx = np.mgrid[0:out_h, 0:out_w].astype(np.float32)
        ang = rng.uniform(0, 2 * np.pi)
        ramp = (np.cos(ang) * xx / out_w + np.sin(ang) * yy / out_h)
        ramp = (ramp - ramp.min()) / max(1e-6, ramp.max() - ramp.min())
        img *= (1.0 - vignette * ramp)[..., None]

    img *= brightness

    if blur > 0:
        k = max(3, int(blur * 4) | 1)
        img = cv2.GaussianBlur(img, (k, k), blur)
    if noise > 0:
        img += rng.normal(0, noise, img.shape)

    img = np.clip(img, 0, 255).astype(np.uint8)

    if jpeg_quality < 100:
        ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, int(jpeg_quality)])
        if ok:
            img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    return img


def synth_photo(answers: dict, seed: int = 0, coverage: float = 1.0,
                config_file=None, **camera) -> np.ndarray:
    """`answers` -> a photograph of a sheet filled in that way."""
    rng = np.random.default_rng(seed + 1000)
    return photograph(render_marked(answers, config_file, seed, coverage), rng, **camera)


# ── CLI ─────────────────────────────────────────────────────────────────────

EXAMPLE = {"layer": "3", "days": ["MON", "WED", "FRI"], "duration": "30d", "hour": "8"}


def _sweep(config_file=None, trials: int = 24) -> int:
    """Push each degradation until reading breaks, and report where.

    Prints the value at which accuracy falls below 100%, which is a fact about
    the parser rather than a guess about it.
    """
    from .form_sheet_parser import parse_form_sheet

    cfg = load_config(config_file)
    hours = list(cfg["groups"]["hour"]["bubbles"])
    layers = list(cfg["groups"]["layer"]["bubbles"])
    days = list(cfg["groups"]["days"]["bubbles"])
    durations = list(cfg["groups"]["duration"]["bubbles"])

    axes = {
        "blur (px sigma)":     ("blur", [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0]),
        "perspective (frac)":  ("perspective", [0.02, 0.06, 0.10, 0.14, 0.18, 0.22]),
        "noise (sigma)":       ("noise", [2, 6, 10, 16, 24, 32, 48]),
        "shadow (fraction)":   ("vignette", [0.1, 0.3, 0.5, 0.65, 0.8, 0.9]),
        "brightness (scale)":  ("brightness", [1.0, 0.8, 0.6, 0.45, 0.35, 0.25]),
        "jpeg quality":        ("jpeg_quality", [95, 80, 60, 40, 25, 15, 8]),
        "mark coverage":       ("_coverage", [1.0, 0.85, 0.7, 0.55, 0.4, 0.3]),
    }

    print(f"{trials} sheets per point; a point passes only if every sheet reads exactly right.\n")
    worst_ok = {}
    for label, (key, values) in axes.items():
        print(f"{label}")
        last_ok = None
        for v in values:
            rng = np.random.default_rng(hash(label) % 9999)
            good = 0
            for t in range(trials):
                answers = {
                    "layer": layers[rng.integers(len(layers))],
                    "days": sorted(set(days[i] for i in rng.integers(0, len(days), rng.integers(1, 8))),
                                   key=days.index),
                    "duration": durations[rng.integers(len(durations))],
                    "hour": hours[rng.integers(len(hours))],
                }
                cam = {"blur": 1.0, "noise": 4.0, "perspective": 0.06,
                       "vignette": 0.35, "brightness": 1.0, "jpeg_quality": 80}
                coverage = 1.0
                if key == "_coverage":
                    coverage = v
                else:
                    cam[key] = v
                img = synth_photo(answers, seed=t, coverage=coverage,
                                  config_file=config_file, **cam)
                try:
                    res = parse_form_sheet(img, config_file)
                except ValueError:
                    continue
                if res.ok and res.values == answers:
                    good += 1
            pct = 100 * good / trials
            flag = "ok " if good == trials else ("   " if pct > 0 else "XX ")
            print(f"   {flag}{v:>6}  {pct:5.1f}%")
            if good == trials:
                last_ok = v
        worst_ok[label] = last_ok
        print()

    print("last setting that read every sheet correctly:")
    for label, v in worst_ok.items():
        print(f"  {label:<22}{v}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    ap.add_argument("--out", default="synth_sheet.jpg", help="where to write the image")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--coverage", type=float, default=1.0,
                    help="how fully the bubbles are marked (1.0 = solid)")
    ap.add_argument("--clean", action="store_true",
                    help="skip the camera simulation; emit the rectified sheet")
    ap.add_argument("--config", default=str(DEFAULT_CONFIG))
    ap.add_argument("--sweep", action="store_true",
                    help="find where each degradation starts breaking the reader")
    ap.add_argument("--trials", type=int, default=24, help="sheets per sweep point")
    args = ap.parse_args()

    if args.sweep:
        return _sweep(args.config, args.trials)

    if args.clean:
        img = render_marked(EXAMPLE, args.config, args.seed, args.coverage)
    else:
        img = synth_photo(EXAMPLE, args.seed, args.coverage, args.config)
    cv2.imwrite(args.out, img)
    print(f"wrote {args.out}  ({EXAMPLE})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
