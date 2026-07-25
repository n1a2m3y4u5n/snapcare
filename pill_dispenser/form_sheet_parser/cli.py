"""Read schedule sheets from photographs, from the command line.

    python -m form_sheet_parser.cli sheet1.jpg sheet2.jpg
    python -m form_sheet_parser.cli sheets/*.jpg --emit weekly
    python -m form_sheet_parser.cli sheet.jpg --json
    python -m form_sheet_parser.cli sheet.jpg --debug out.png

One photograph is one tray compartment. Give it the whole stack and it merges
them into a plan for the dispenser and prints the payload the device reads.

Exit status is 0 only when every sheet read cleanly and the merged plan is
usable, so this can sit in a script without anyone reading the output.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import cv2

from .form_sheet_parser import DEFAULT_CONFIG, load_config, parse_form_sheet_file
from .schedule import encode_schedule, encode_weekly, payload_notes, sheets_to_schedule


def _annotate(image_path: Path, out_path: Path, config_file) -> None:
    """Write the rectified sheet with the bubble map and its scores drawn on.

    When a sheet reads wrongly the question is always the same — did the page
    rectify badly, or did someone's pen miss the box? This answers it in one
    picture: green boxes are where the reader looked, and each carries the score
    it measured there.
    """
    from .form_sheet_parser import (
        estimate_page_homography,
        preprocess_form_sheet,
        read_form_sheet,
        warp_form_sheet,
    )

    img = cv2.imread(str(image_path))
    if img is None:
        raise SystemExit(f"cannot read image: {image_path}")

    M, info = estimate_page_homography(img)
    warped = warp_form_sheet(img, M)
    result = read_form_sheet(preprocess_form_sheet(warped), config_file)

    cfg = load_config(config_file)
    hw, hh = cfg["half_width"], cfg["half_height"]
    for name, group in cfg["groups"].items():
        for key, (x, y) in group["bubbles"].items():
            score = result.scores[name][key]
            hot = score >= cfg["abs_min"]
            colour = (0, 0, 255) if hot else (0, 200, 0)
            cv2.rectangle(warped, (x - hw, y - hh), (x + hw, y + hh), colour, 1)
            cv2.putText(warped, f"{score:.2f}", (x - hw, y - hh - 3),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.3, colour, 1)

    cv2.putText(warped, f"markers={info['markers']} residual={info['residual_px']:.2f}px "
                        f"baseline={result.baseline:.2f}",
                (8, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 255), 1)
    cv2.imwrite(str(out_path), warped)
    print(f"wrote {out_path}")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    ap.add_argument("images", nargs="+", help="one photograph per tray compartment")
    ap.add_argument("--config", default=str(DEFAULT_CONFIG))
    ap.add_argument("--emit", choices=["weekly", "strict", "both"], default="both",
                    help="which payload to print (default: both)")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    ap.add_argument("--lenient", action="store_true",
                    help="build a plan even from sheets the reader was unsure about "
                         "(for review on screen — never for sending to hardware)")
    ap.add_argument("--debug", metavar="PNG",
                    help="write an annotated rectification of the FIRST image")
    args = ap.parse_args(argv)

    if args.debug:
        _annotate(Path(args.images[0]), Path(args.debug), args.config)

    sheets, read_errors = [], []
    for path in args.images:
        try:
            result = parse_form_sheet_file(path, args.config)
        except ValueError as exc:            # unreadable file, not a bad photo
            read_errors.append(f"{path}: {exc}")
            continue
        sheets.append((path, result))

    plan = sheets_to_schedule([r for _, r in sheets], strict=not args.lenient)

    if args.json:
        print(json.dumps({
            "sheets": [{"image": p, **r.to_json()} for p, r in sheets],
            "read_errors": read_errors,
            "plan": {
                "ok": plan.ok,
                "problems": plan.problems,
                "layers": [{
                    "layer": l.layer, "times": l.times,
                    "days": l.day_names, "duration_days": l.duration_days,
                } for l in plan.layers],
                "notes": payload_notes(plan),
                "schedule_payload": encode_schedule(plan),
                "weekly_payload": encode_weekly(plan),
            },
        }, indent=2))
        return 0 if plan.ok and not read_errors else 1

    for path, result in sheets:
        status = "ok" if result.ok else "PROBLEM"
        print(f"{Path(path).name}: {status}")
        if result.quality:
            q = result.quality
            print(f"    markers={q.get('markers')} fit={q.get('residual_px', 0):.2f}px "
                  f"sharpness={q.get('sharpness', 0):.0f} baseline={result.baseline:.2f}")
        for key, value in result.values.items():
            print(f"    {key:<9}{value}")
        for problem in result.problems:
            print(f"    ! {problem}")
    for err in read_errors:
        print(f"! {err}")

    print()
    if plan.layers:
        print(plan.describe())
    for problem in plan.problems:
        print(f"! {problem}")

    if plan.layers:
        print()
        for note in payload_notes(plan):
            print(f"note: {note}")
        if args.emit in ("weekly", "both"):
            payload = encode_weekly(plan)
            print(f"weekly ({len(payload)} chars, lossless):")
            print(f"  {payload}")
        if args.emit in ("strict", "both"):
            payload = encode_schedule(plan)
            lossy = " — LOSES days/duration" if (plan.loses_days or plan.loses_duration) else ""
            print(f"strict SC1*S* ({len(payload)} chars, app-compatible){lossy}:")
            print(f"  {payload}")

    return 0 if plan.ok and not read_errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
