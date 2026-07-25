"""음식 사진 한 장 → 영양 총량 JSON (웹앱이 호출하는 진입점).

추론 자체는 predict.py 의 것을 그대로 쓴다. 여기서는 사람이 읽는 표 대신 표준출력
JSON 계약만 담당한다 — Next 의 API 라우트가 이 스크립트를 실행한다
(폼시트 parse_cli.py, SIGIL 픽토그램 라우트와 같은 방식).

Usage:  python predict_cli.py <image> [--checkpoint path]
Out  :  {"ok": true, "totals": {"calories": .., "mass": .., "fat": .., "carb": .., "protein": ..},
         "backbone": "convnext_tiny"}
        {"ok": false, "error": "..."}

가중치(checkpoints/best.pt)는 레포에 없다(.gitignore). 없거나 torch 가 안 깔린
환경에서는 ok:false 로 알리고 웹앱이 Vision 경로로 넘어간다 — 이 스크립트가
없다고 앱이 멈추지는 않는다.
"""

import argparse
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument(
        "--checkpoint",
        default=os.environ.get("SNAPCARE_MEAL_CHECKPOINT") or str(HERE / "checkpoints" / "best.pt"),
    )
    args = ap.parse_args()

    if not Path(args.checkpoint).is_file():
        print(json.dumps({"ok": False, "error": f"checkpoint not found: {args.checkpoint}"}))
        return 1

    try:
        import torch  # noqa: PLC0415 — 없을 때 JSON 으로 알리려고 여기서 들인다
        from PIL import Image  # noqa: PLC0415
        from data.dataset import build_transforms  # noqa: PLC0415
        from predict import load_model  # noqa: PLC0415
    except ImportError as e:
        print(json.dumps({"ok": False, "error": f"torch unavailable: {e}"}))
        return 1

    try:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model, ckpt = load_model(args.checkpoint, device)
        tf = build_transforms(ckpt["img_size"], train=False)
        img = Image.open(args.image).convert("RGB")
        x = tf(img).unsqueeze(0).to(device)
        with torch.no_grad():
            mean = torch.tensor(ckpt["target_mean"])
            std = torch.tensor(ckpt["target_std"])
            pred = (model(x).float().cpu().squeeze(0) * std + mean).clamp_min(0)
    except Exception as e:  # noqa: BLE001 — 어떤 실패든 앱은 폴백으로 넘어가야 한다
        print(json.dumps({"ok": False, "error": f"inference failed: {e}"}))
        return 1

    totals = {name: round(float(v), 1) for name, v in zip(ckpt["targets"], pred.tolist())}
    print(json.dumps({"ok": True, "totals": totals, "backbone": ckpt["backbone"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
