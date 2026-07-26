"""Per-dish prediction inspector.

Picks N dishes and, for each, prints the ground-truth nutrition, the model's
prediction for every available photo (top-down overhead + side-angle views),
per-photo inference time, per-view error, and a multi-view ensemble. Side
frames are extracted on the fly, so this works on unseen TEST dishes.

Usage (from nutrition_manager/, snapcare env):
    python inspect_dishes.py --count 5
    python inspect_dishes.py --count 8 --split test --frames-per-cam 1 --seed 0
"""
import argparse
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import PROJECT, load_config, resolve  # noqa: E402
from inference import eval_transform, load_checkpoint  # noqa: E402
import build_dataset as bd  # noqa: E402  (reuse extract_one)

SCRATCH = Path("/tmp/claude-1000/-home-dh-Projects-snapcare/"
               "f81cc4dd-ea89-45fc-a075-7892c8349315/scratchpad/inspect_frames")
UNITS = {"calories": "kcal", "mass": "g", "fat": "g", "carb": "g", "protein": "g"}


@torch.no_grad()
def predict(model, img_path, tf, device, codec):
    """Return (pred_vector_np, elapsed_ms) for one image."""
    x = tf(Image.open(img_path).convert("RGB")).unsqueeze(0).to(device)
    if device == "cuda":
        torch.cuda.synchronize()
    t0 = time.perf_counter()
    out = model(x).float().cpu().squeeze(0)
    if device == "cuda":
        torch.cuda.synchronize()
    ms = (time.perf_counter() - t0) * 1000.0
    # De-normalized through the checkpoint's own codec rather than by hand.
    # Multiplying by std and adding mean is only correct for an identity-space
    # checkpoint; a log-space one would come back wrong by a factor, and look
    # entirely plausible doing it.
    return codec.decode(out).numpy(), ms


def pct_err(pred, gt):
    """Mean absolute percentage error across nutrients (%)."""
    return float(np.mean(np.abs(pred - gt) / np.maximum(gt, 1e-6)) * 100.0)


def side_frames_for(dish_id, frames_per_cam):
    """Extract (idempotently) and return representative side frames for a dish."""
    src = resolve(bd.load_config()["dataset_root"], "imagery/side_angles", dish_id)
    out = []
    for cam in bd.CAMERAS:
        video = src / f"camera_{cam}.h264"
        if not video.is_file():
            continue
        try:
            frames = bd.extract_one(video, SCRATCH / dish_id, cam)
        except Exception:
            continue
        if not frames:
            continue
        # evenly pick `frames_per_cam` representatives across the sweep
        idx = np.linspace(0, len(frames) - 1, min(frames_per_cam, len(frames)))
        for i in np.unique(idx.round().astype(int)):
            out.append((f"side-{cam}", frames[i]))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=5, help="number of dishes to inspect")
    ap.add_argument("--split", default="test", choices=["test", "train"])
    ap.add_argument("--frames-per-cam", type=int, default=1, help="side frames per camera")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--checkpoint", default=str(resolve("checkpoints", "best.pt")))
    args = ap.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    if not Path(args.checkpoint).is_file():
        raise SystemExit(f"Checkpoint not found: {args.checkpoint}")
    model, codec, ckpt = load_checkpoint(args.checkpoint, device)
    targets = ckpt["targets"]
    tf = eval_transform(ckpt)

    cfg = load_config()
    manifest = resolve(cfg.get("manifest_csv", "dataset_processed/manifest.csv"))
    df = pd.read_csv(manifest)
    over = df[(df.split == args.split) & (df.view == "overhead")].drop_duplicates("dish_id")
    if len(over) == 0:
        raise SystemExit(f"No overhead dishes in split '{args.split}'.")
    dishes = over.sample(min(args.count, len(over)), random_state=args.seed)

    print(f"model={ckpt['backbone']}  ckpt={args.checkpoint}  device={device}  "
          f"val_mean_mae%={ckpt.get('val_mean_mae_pct', float('nan')):.2f}")
    print(f"Inspecting {len(dishes)} '{args.split}' dishes "
          f"({args.frames_per_cam} frame(s)/camera)\n")

    # warm up so the first timing is not dominated by lazy CUDA init
    predict(model, PROJECT / dishes.iloc[0].image_path, tf, device, codec)

    all_times, over_errs, ens_errs = [], [], []
    hdr = "  {:<10}" + "".join(f"{t[:4]:>9}" for t in targets) + "{:>10}{:>9}"
    for _, d in dishes.iterrows():
        gt = d[targets].to_numpy(dtype=float)
        views = [("overhead", PROJECT / d.image_path)] + side_frames_for(d.dish_id, args.frames_per_cam)

        print(f"■ {d.dish_id}  [{args.split}, {d.cafe}]")
        print("  ground truth:  " + "  ".join(f"{t}={gt[i]:.1f}{UNITS[t]}"
                                               for i, t in enumerate(targets)))
        print(hdr.format("view", *(["" ] * len(targets)), "time(ms)", "err%"))
        preds = []
        for name, path in views:
            p, ms = predict(model, path, tf, device, codec)
            preds.append(p)
            all_times.append(ms)
            row = "  {:<10}".format(name) + "".join(f"{v:9.1f}" for v in p)
            print(row + f"{ms:10.1f}{pct_err(p, gt):8.1f}%")
            if name == "overhead":
                over_errs.append(pct_err(p, gt))
        ensemble = np.mean(preds, axis=0)
        e = pct_err(ensemble, gt)
        ens_errs.append(e)
        row = "  {:<10}".format("ENSEMBLE") + "".join(f"{v:9.1f}" for v in ensemble)
        print(row + f"{'':>10}{e:8.1f}%")
        print()

    print("── summary ─────────────────────────────────────────────")
    print(f"  photos scored          : {len(all_times)}")
    print(f"  mean inference time    : {np.mean(all_times):.1f} ms "
          f"(min {np.min(all_times):.1f} / max {np.max(all_times):.1f})")
    print(f"  mean overhead-only err : {np.mean(over_errs):.1f}%")
    print(f"  mean ensemble err      : {np.mean(ens_errs):.1f}%  "
          f"(multi-view vs single top-down)")


if __name__ == "__main__":
    main()
