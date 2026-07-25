import json
import sys
from pathlib import Path

import cv2
import numpy as np

# form_sheet_parser/form_sheet/ -> pill_dispenser/, so the package imports
# whatever directory this is invoked from.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from form_sheet_parser import (  # noqa: E402
    detect_aruco_corners,
    load_config,
    warp_form_sheet,
    SIDE,
)

# The thresholds the reader currently ships with, so re-calibrating the bubble
# positions cannot silently reset them to whatever was hardcoded here.
DEFAULTS = load_config()

GROUPS = [
    ("layer",    "one",  [str(i) for i in range(1, 9)]),
    ("days",     "many", ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]),
    ("duration", "one",  ["7d", "14d", "30d", "90d", "ongoing"]),
    ("hour",     "one",  [str(h) for h in range(24)]),
]

TASKS = [(g, m, k) for g, m, keys in GROUPS for k in keys]


def main(image_path: str, out_path: str = "form_sheet_config.json") -> None:
    img = cv2.imread(image_path)
    if img is None:
        sys.exit(f"cannot read {image_path}")

    warped = warp_form_sheet(img, detect_aruco_corners(img))

    clicks: list[tuple[int, int]] = []

    def on_mouse(event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN and len(clicks) < len(TASKS):
            clicks.append((x, y))
        elif event == cv2.EVENT_RBUTTONDOWN and clicks:
            clicks.pop()

    cv2.namedWindow("calibrate")
    cv2.setMouseCallback("calibrate", on_mouse)

    while True:
        canvas = warped.copy()
        for (g, _, k), (x, y) in zip(TASKS, clicks):
            cv2.circle(canvas, (x, y), 4, (0, 0, 255), -1)
            cv2.putText(canvas, f"{g}.{k}", (x + 6, y - 6),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 0, 255), 1)

        if len(clicks) < len(TASKS):
            g, _, k = TASKS[len(clicks)]
            label = f"click: {g}.{k}   ({len(clicks) + 1}/{len(TASKS)})"
        else:
            label = "done - press s to save, q to quit"

        cv2.rectangle(canvas, (0, 0), (SIDE, 26), (255, 255, 255), -1)
        cv2.putText(canvas, label, (8, 18),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)
        cv2.imshow("calibrate", canvas)

        key = cv2.waitKey(20) & 0xFF
        if key == ord("q"):
            break
        if key == ord("s") and len(clicks) == len(TASKS):
            # Thresholds are copied from the reader's own defaults rather than
            # written out here. They are not free parameters: they were set by
            # measuring where marked and unmarked bubbles actually separate
            # (`python -m form_sheet_parser.synth --sweep`), and a second copy
            # in this script would quietly revert that the next time anyone
            # re-clicked the bubble map.
            cfg = {
                "half_width": DEFAULTS["half_width"],
                "half_height": DEFAULTS["half_height"],
                "normalize": DEFAULTS.get("normalize", True),
                "abs_min": DEFAULTS["abs_min"],
                "margin": DEFAULTS["margin"],
                "groups": {
                    g: {"mode": m, "bubbles": {}} for g, m, _ in GROUPS
                },
            }
            for (g, _, k), (x, y) in zip(TASKS, clicks):
                cfg["groups"][g]["bubbles"][k] = [x, y]

            with open(out_path, "w") as f:
                json.dump(cfg, f, indent=2)
            print(f"wrote {out_path}")
            break

    cv2.destroyAllWindows()


if __name__ == "__main__":
    main(*sys.argv[1:])
