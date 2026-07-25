"""Single-image nutrition inference.

    python predict.py meal.jpg
    python predict.py meal.jpg --checkpoint checkpoints/v2-base.pt
    python predict.py a.jpg b.jpg c.jpg --json
    python predict.py meal.jpg --no-tta

The model was trained on overhead frames of a single plated dish, so it expects
a roughly top-down photograph of one plate. It regresses five totals; it does
not identify the food.

The numbers are estimates from a photograph. On the official test split the
calorie error is around 19%, which is useful for "does this fit in today's
budget" and is not a substitute for a label.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import torch
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import load_config, resolve  # noqa: E402
from inference import eval_transform, load_checkpoint, predict_batch, resolve_tta  # noqa: E402

UNITS = {"calories": "kcal", "mass": "g", "fat": "g", "carb": "g", "protein": "g"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("images", nargs="+")
    ap.add_argument("--checkpoint", default=None)
    ap.add_argument("--tta", nargs="*", default=None,
                    help="test-time flips to average (default: config `tta`)")
    ap.add_argument("--no-tta", action="store_true", help="single forward pass")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    cfg = load_config()
    ckpt_path = Path(args.checkpoint) if args.checkpoint else resolve(
        cfg["train"]["checkpoint_dir"], "best.pt"
    )
    if not ckpt_path.is_file():
        raise SystemExit(f"Checkpoint not found: {ckpt_path}")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    tta = resolve_tta(["none"] if args.no_tta else (args.tta or cfg.get("tta", ["none"])))

    # De-normalization goes through the checkpoint's own codec rather than
    # being written out here. A v1 checkpoint standardized raw grams and a
    # log-space one standardized log(1+grams); undoing the wrong one produces
    # numbers that look entirely reasonable and are wrong by a factor.
    model, codec, ckpt = load_checkpoint(ckpt_path, device)
    transform = eval_transform(ckpt)

    batch, kept, failed = [], [], []
    for path in args.images:
        try:
            img = Image.open(path).convert("RGB")
        except (OSError, ValueError) as exc:
            failed.append((path, str(exc)))
            continue
        batch.append(transform(img))
        kept.append(path)

    results = {}
    if batch:
        x = torch.stack(batch).to(device)
        preds = predict_batch(model, x, codec, tta)
        for path, row in zip(kept, preds.tolist()):
            results[path] = dict(zip(ckpt["targets"], row))

    if args.json:
        print(json.dumps({
            "checkpoint": ckpt_path.name,
            "tta": tta,
            "units": UNITS,
            "predictions": results,
            "failed": dict(failed),
        }, indent=2))
    else:
        for path, values in results.items():
            print(f"{path}:")
            for name, value in values.items():
                print(f"  {name:<9}{value:8.1f} {UNITS.get(name, '')}")
        for path, reason in failed:
            print(f"{path}: could not read ({reason})")

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
