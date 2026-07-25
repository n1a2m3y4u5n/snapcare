"""Score a checkpoint on the official Nutrition5k RGB test split.

Writes predictions.csv and groundtruth_test.csv in exactly the format
`nutrition5k_dataset/scripts/compute_eval_statistics.py` expects, prints the
per-field MAE / MAE% table, and can compare several checkpoints at once.

Usage (from nutrition_manager/):
    python eval.py                                   # checkpoints/best.pt
    python eval.py --checkpoint checkpoints/v2-base.pt
    python eval.py --compare checkpoints/*.pt        # one table per model
    python eval.py --tta none hflip vflip hvflip     # average over flips
    python eval.py --no-tta                          # single forward pass

The test split is overhead frames only, one per dish, which is what the
published Nutrition5k numbers are computed on. Scoring the side-angle frames
too would produce a different — and quietly incomparable — number, so the view
filter is not optional here.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from torch.utils.data import DataLoader

sys.path.insert(0, str(Path(__file__).resolve().parent))
import metrics  # noqa: E402
from common import load_config, resolve  # noqa: E402
from data.dataset import Nutrition5kDataset  # noqa: E402
from inference import eval_transform, load_checkpoint, predict_batch, resolve_tta  # noqa: E402


def load_test_frame(cfg: dict) -> pd.DataFrame:
    manifest = resolve(cfg.get("manifest_csv", "dataset_processed/manifest.csv"))
    if manifest.is_file():
        df = pd.read_csv(manifest)
    else:
        df = pd.read_csv(resolve(cfg["labels_csv"]))
        df["view"] = "overhead"
        df["image_path"] = cfg["dataset_root"] + "/" + df["rgb_path"]
    return df[(df["split"] == "test") & (df["view"] == "overhead")].reset_index(drop=True)


@torch.no_grad()
def predict_split(model, loader, device, codec, tta):
    ids, preds, gts = [], [], []
    for imgs, y_raw, dish_ids in loader:
        imgs = imgs.to(device, non_blocking=True)
        preds.append(predict_batch(model, imgs, codec, tta).numpy())
        gts.append(y_raw.numpy())
        ids.extend(list(dish_ids))
    return ids, np.concatenate(preds), np.concatenate(gts)


def write_csv(path, ids, values):
    """The upstream scorer reads headerless `dish_id, then five floats` rows."""
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        for dish_id, row in zip(ids, values):
            w.writerow([dish_id, *[f"{v:.6f}" for v in row]])


def score_checkpoint(ckpt_path: Path, df_test, cfg, device, tta):
    model, codec, ckpt = load_checkpoint(ckpt_path, device)
    ds = Nutrition5kDataset(df_test, ckpt["targets"], eval_transform(ckpt))
    loader = DataLoader(ds, batch_size=cfg["train"]["batch_size"],
                        num_workers=cfg["train"].get("num_workers", 4))
    ids, preds, gts = predict_split(model, loader, device, codec, tta)
    mae, mae_pct = metrics.per_field(preds, gts)
    return ids, preds, gts, mae, mae_pct, ckpt


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", default=None)
    ap.add_argument("--compare", nargs="*", default=None,
                    help="score several checkpoints and print a ranking")
    ap.add_argument("--tta", nargs="*", default=None,
                    help="test-time flips to average (default: config `tta`)")
    ap.add_argument("--no-tta", action="store_true", help="single forward pass")
    args = ap.parse_args()

    cfg = load_config()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    tta = resolve_tta(["none"] if args.no_tta else (args.tta or cfg.get("tta", ["none"])))

    df_test = load_test_frame(cfg)
    print(f"Test dishes: {len(df_test)}   device: {device}   tta: {' '.join(tta)}\n")

    if args.compare:
        rows = []
        for path in sorted(args.compare):
            p = Path(path)
            if not p.is_file():
                print(f"  (skipping missing {p})")
                continue
            *_, mae, mae_pct, ckpt = score_checkpoint(p, df_test, cfg, device, tta)
            rows.append((p.name, ckpt, mae, mae_pct))
            print(metrics.format_table(ckpt["targets"], mae, mae_pct, title=p.name))
            print()

        rows.sort(key=lambda r: r[3].mean())
        print(f"{'checkpoint':<24}{'backbone':<16}{'px':>5}{'mean MAE%':>11}")
        print("-" * 56)
        for name, ckpt, _, mae_pct in rows:
            print(f"{name:<24}{ckpt['backbone']:<16}{ckpt['img_size']:>5}{mae_pct.mean():>10.2f}%")
        return

    ckpt_path = Path(args.checkpoint) if args.checkpoint else resolve(
        cfg["train"]["checkpoint_dir"], "best.pt"
    )
    if not ckpt_path.is_file():
        raise SystemExit(f"Checkpoint not found: {ckpt_path}")

    ids, preds, gts, mae, mae_pct, ckpt = score_checkpoint(ckpt_path, df_test, cfg, device, tta)
    print(metrics.format_table(ckpt["targets"], mae, mae_pct, title=str(ckpt_path.name)))

    pred_path = resolve("predictions.csv")
    gt_path = resolve("groundtruth_test.csv")
    write_csv(pred_path, ids, preds)
    write_csv(gt_path, ids, gts)

    # Write our own copy of the stats too, so a result can be quoted without
    # re-running the model.
    stats = metrics.as_dict(ckpt["targets"], mae, mae_pct)
    stats["_checkpoint"] = ckpt_path.name
    stats["_tta"] = tta
    stats["_n_dishes"] = len(ids)
    with open(resolve("eval_stats.json"), "w") as f:
        json.dump(stats, f, indent=2)

    print(f"\nWrote {pred_path}\nWrote {gt_path}\nWrote {resolve('eval_stats.json')}")
    official = resolve(cfg["dataset_root"], "scripts/compute_eval_statistics.py")
    print("\nCross-check with the official scorer:\n"
          f"    python {official} {gt_path} {pred_path} /tmp/official_stats.json")


if __name__ == "__main__":
    main()
