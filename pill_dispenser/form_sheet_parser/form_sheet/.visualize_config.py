"""Draw the bubble map over a rectified sheet, to check a calibration by eye.

`python -m form_sheet_parser.cli photo.jpg --debug out.png` does more — it also
writes the measured score at each position, which is what tells you whether a
misread was a bad rectification or a pen that missed the box — and it writes a
file instead of needing a window. This is kept for a quick look during
calibration, when there are no marks to score yet.
"""
import json
import sys
from pathlib import Path

import cv2

# form_sheet_parser/form_sheet/ -> pill_dispenser/, so the package imports
# whatever directory this is invoked from.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from form_sheet_parser import detect_aruco_corners, warp_form_sheet  # noqa: E402


def main(image_path: str, config_file: str = "form_sheet_config.json") -> None:
    img = cv2.imread(image_path)
    warped = warp_form_sheet(img, detect_aruco_corners(img))

    with open(config_file) as f:
        cfg = json.load(f)

    hw, hh = cfg["half_width"], cfg["half_height"]
    for group in cfg["groups"].values():
        for x, y in group["bubbles"].values():
            cv2.rectangle(warped, (x - hw, y - hh), (x + hw, y + hh),
                          (0, 255, 0), 1)

    cv2.imshow("verify", warped)
    cv2.waitKey(0)
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main(*sys.argv[1:])
