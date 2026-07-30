"""합성 폼시트 사진을 만들어 회색조 원본으로 떨군다 — TypeScript 판독기 검증용.

`lib/formsheet` 는 파이썬 파서를 옮긴 것이고, 옮긴 것이 같은 답을 내는지 확인할
방법이 있어야 한다. 여기서 만드는 것은 그 대조표다:

    .gray  — 회색조 화소 그대로 (폭·높이는 .json 에). PNG 디코더 없이 node 에서 읽는다.
    .json  — {w, h, answers, python} — 정답과, 파이썬 파서가 같은 사진에서 읽은 값.

이미지는 저장소에 넣지 않는다. 필요할 때 이 스크립트로 다시 만든다.

    .venv-cv/bin/python tools/formsheet_fixtures.py <출력디렉터리> [--n 12]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from pill_dispenser.form_sheet_parser.form_sheet_parser import (  # noqa: E402
    find_markers, load_config, parse_form_sheet,
)
from pill_dispenser.form_sheet_parser.synth import synth_photo  # noqa: E402

# 카메라 조건을 하나씩 밀어 본다. 이름은 결과 표에 그대로 찍힌다.
#
# occluded 와 upside_down 이 특히 중요하다. 앞의 것은 종이를 붙잡은 손이 마커 하나를
# 가린 경우로, 세 개로 종이를 맞추는 갈래를 태운다. 뒤의 것은 마커의 방향 판정이
# 맞는지를 본다 — 방향을 잘못 잡으면 실패하지 않고 버블 지도가 통째로 돌아간다.
CAMERAS = {
    "clean":      dict(perspective=0.0,  rotation=0.0, blur=0.0, noise=0.0,
                       vignette=0.0, jpeg_quality=100),
    "handheld":   dict(),                                    # synth 의 기본값
    "steep":      dict(perspective=0.12, rotation=12.0),
    "dim":        dict(brightness=0.55, vignette=0.5),
    "blurry":     dict(blur=2.5),
    "noisy":      dict(noise=12.0, jpeg_quality=55),
    "occluded":   dict(_occlude=1),
    "upside_down": dict(_flip=True),
}


def _thumb_over(img: np.ndarray, marker_id: int) -> np.ndarray:
    """마커 하나를 손가락처럼 덮는다 — 위치는 검출기에게 물어서 정확히 덮는다."""
    found = find_markers(img)
    if marker_id not in found:
        return img
    quad = found[marker_id].astype(np.float32)
    centre = quad.mean(axis=0)
    grown = (centre + (quad - centre) * 1.6).astype(np.int32)
    out = img.copy()
    cv2.fillConvexPoly(out, grown, (105, 95, 90))
    return out


def answers_for(i: int, cfg: dict) -> dict:
    keys = {g: list(v["bubbles"]) for g, v in cfg["groups"].items()}
    rng = np.random.default_rng(i)
    n_days = int(rng.integers(1, 5))
    return {
        "layer": keys["layer"][i % len(keys["layer"])],
        "days": sorted(
            (keys["days"][d] for d in rng.choice(len(keys["days"]), n_days, replace=False)),
            key=keys["days"].index,
        ),
        "duration": keys["duration"][i % len(keys["duration"])],
        "hour": keys["hour"][(i * 5) % len(keys["hour"])],
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--n", type=int, default=len(CAMERAS) * 2)
    args = ap.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    cfg = load_config()
    names = list(CAMERAS)

    for i in range(args.n):
        cam_name = names[i % len(names)]
        camera = dict(CAMERAS[cam_name])
        occlude = camera.pop("_occlude", None)
        flip = camera.pop("_flip", False)

        answers = answers_for(i, cfg)
        img = synth_photo(answers, seed=i, **camera)
        if flip:
            img = cv2.rotate(img, cv2.ROTATE_180)
        if occlude is not None:
            img = _thumb_over(img, occlude)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        result = parse_form_sheet(img)

        stem = f"{i:02d}_{cam_name}"
        (out / f"{stem}.gray").write_bytes(gray.tobytes())
        (out / f"{stem}.json").write_text(json.dumps({
            "camera": cam_name,
            "w": int(gray.shape[1]),
            "h": int(gray.shape[0]),
            "answers": answers,
            "python": result.to_json(),
        }, indent=1))
        print(f"{stem}: python={'ok' if result.ok else result.problems}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
