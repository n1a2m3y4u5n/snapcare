"""Score a model on a named split and camera view.

Writes predictions.csv and groundtruth_test.csv in exactly the format
`nutrition5k_dataset/scripts/compute_eval_statistics.py` expects, prints the
per-field MAE / MAE% table, and can compare several checkpoints at once.

Usage (from nutrition_manager/):
    python eval.py                                   # checkpoints/best.pt
    python eval.py --checkpoint checkpoints/v2-base.pt
    python eval.py --compare checkpoints/*.pt        # one table per model
    python eval.py --tta none hflip vflip hvflip     # average over flips
    python eval.py --no-tta                          # single forward pass

    # what the app actually ships, on the view a hand-held phone produces:
    python eval.py --onnx web/model/web.onnx --split val --view side

Two numbers, and they are not interchangeable
---------------------------------------------
`--split test --view overhead` (the default) is the published Nutrition5k
protocol: overhead frames only, one per dish. It is the number to quote when
comparing against other people's work, and nothing else here is.

`--split val --view side` is the number that describes the product. Nobody
holds a phone directly above their dinner, and the same model is around fifteen
points worse off-axis (`runs/history.jsonl`). Reporting only the benchmark
would overstate what a user gets by roughly that much.

The output file records which one it was, because a stats file with no
provenance is how a validation number ends up quoted as a benchmark result.

On the missing dataset
----------------------
The manifest lists overhead frames under `nutrition5k_dataset/`, the original
download. If that directory has been deleted, every overhead row points at a
file that is not there — including the whole official test split, whose dishes
have no side-angle frames to fall back on. That is not recoverable from what
survives in `dataset_processed/`; the benchmark number can only be reproduced
by fetching the dataset again. This script says so plainly instead of dying one
image at a time inside a DataLoader worker.
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
from common import PROJECT, load_config, resolve  # noqa: E402
from data.dataset import Nutrition5kDataset  # noqa: E402
from inference import eval_transform, load_checkpoint, predict_batch, resolve_tta  # noqa: E402
from models.model import build_model  # noqa: E402
from train import split_train_val  # noqa: E402

VIEWS = ("overhead", "side", "both")
SPLITS = ("test", "val")

# Only one combination reproduces a published figure. Everything else is ours.
OFFICIAL = ("test", "overhead")


def load_manifest(cfg: dict) -> pd.DataFrame:
    """The full multi-view frame table, or the overhead-only fallback."""
    manifest = resolve(cfg.get("manifest_csv", "dataset_processed/manifest.csv"))
    if manifest.is_file():
        return pd.read_csv(manifest)
    df = pd.read_csv(resolve(cfg["labels_csv"]))
    df["view"] = "overhead"
    df["image_path"] = cfg["dataset_root"] + "/" + df["rgb_path"]
    return df


def val_frames(df: pd.DataFrame, ckpt: dict | None, cfg: dict) -> pd.DataFrame:
    """The dishes this model held out, re-derived from how it was trained.

    The split parameters are read from the checkpoint rather than from
    config.yaml, because config.yaml is whatever it happens to say today. Score
    a model against a split drawn with a different seed and the "validation"
    set silently contains dishes it trained on, which does not fail — it just
    returns a number that is too good, which is the worst way to be wrong.
    """
    tcfg = (ckpt or {}).get("train_cfg") or {}
    seed, frac = tcfg.get("seed"), tcfg.get("val_frac")
    trusted = seed is not None and frac is not None
    if not trusted:
        seed = cfg["train"]["seed"]
        frac = cfg["train"]["val_frac"]
        print("  ! this checkpoint does not record its split; assuming config.yaml's\n"
              f"  ! seed={seed} val_frac={frac}. If it trained with anything else, the\n"
              "  ! dishes below were training data and the score is meaningless.\n")
    _, df_val = split_train_val(df[df["split"] == "train"], frac, seed)
    return df_val


def stratify(df: pd.DataFrame, per_dish: int | None) -> pd.DataFrame:
    """At most `per_dish` frames each, spread across the cameras.

    A dish's side frames are four cameras sweeping six positions. Taking the
    first N would take one camera and call it the side-angle score, so the
    subsample strides through the sorted frames instead.
    """
    if not per_dish:
        return df
    keep = []
    for _, group in df.sort_values(["dish_id", "camera", "seq"]).groupby("dish_id", sort=False):
        n = len(group)
        idx = np.unique(np.linspace(0, n - 1, min(per_dish, n)).round().astype(int))
        keep.append(group.iloc[idx])
    return pd.concat(keep).reset_index(drop=True)


def select_frames(cfg: dict, split: str, view: str, ckpt: dict | None = None,
                  per_dish: int | None = None) -> pd.DataFrame:
    df = load_manifest(cfg)
    df = df[df["split"] == "test"] if split == "test" else val_frames(df, ckpt, cfg)
    if view != "both":
        df = df[df["view"] == view]
    return stratify(df.reset_index(drop=True), per_dish)


def load_test_frame(cfg: dict) -> pd.DataFrame:
    """The official split. Kept as its own name — export_onnx.py scores on it."""
    return select_frames(cfg, *OFFICIAL)


def require_images(df: pd.DataFrame, split: str, view: str) -> None:
    """Fail before loading a model if the frames are not on disk.

    Checks a sample rather than all 80k paths: the failure this guards against
    is a whole imagery tree being absent, not one corrupt file.
    """
    if df.empty:
        raise SystemExit(
            f"No frames match --split {split} --view {view}.\n"
            "  The official test dishes have overhead frames only, so "
            "`--split test --view side` is always empty."
        )
    sample = df["image_path"].drop_duplicates().head(64)
    missing = [p for p in sample if not (PROJECT / p).is_file()]
    if not missing:
        return
    roots = sorted({Path(p).parts[0] for p in missing})
    raise SystemExit(
        f"{len(missing)} of {len(sample)} sampled frames are missing, under: {', '.join(roots)}\n"
        f"  e.g. {PROJECT / missing[0]}\n\n"
        "  The manifest still lists these frames; the images themselves are gone.\n"
        "  If that root is `nutrition5k_dataset`, the original download was deleted and\n"
        "  the official overhead split cannot be scored without fetching it again —\n"
        "  the test dishes have no side-angle frames in dataset_processed/.\n\n"
        "  What still works:  python eval.py --split val --view side"
    )


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


def score_checkpoint(ckpt_path: Path, df_eval, cfg, device, tta):
    model, codec, ckpt = load_checkpoint(ckpt_path, device)
    ds = Nutrition5kDataset(df_eval, ckpt["targets"], eval_transform(ckpt))
    loader = DataLoader(ds, batch_size=cfg["train"]["batch_size"],
                        num_workers=cfg["train"].get("num_workers", 4))
    ids, preds, gts = predict_split(model, loader, device, codec, tta)
    mae, mae_pct = metrics.per_field(preds, gts)
    return ids, preds, gts, mae, mae_pct, ckpt


def browser_pixels(path, img_size: int) -> np.ndarray:
    """Decode and preprocess one image exactly as the browser will.

    Resize the shorter side to 1.15x, centre crop, scale to [0, 1] — the
    normalization lives inside the exported graph. The rounding is not
    incidental: torchvision's centre crop offsets with int(round(...)), and so
    does the TypeScript. Flooring here would shift the crop by up to half a
    pixel of the resized image, which is exactly the drift this path exists to
    detect, so it must not introduce any of its own.
    """
    from PIL import Image

    resize_to = int(round(img_size * 1.15))
    img = Image.open(path).convert("RGB")
    w, h = img.size
    scale = resize_to / min(w, h)
    img = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.BILINEAR)
    w, h = img.size
    left, top = int(round((w - img_size) / 2.0)), int(round((h - img_size) / 2.0))
    img = img.crop((left, top, left + img_size, top + img_size))
    return np.asarray(img, dtype=np.float32).transpose(2, 0, 1) / 255.0


def score_onnx_frames(onnx_path: Path, df_eval, targets, img_size: int, batch_size: int = 32):
    """Run the exported graph over a frame table.

    Deliberately does not reuse the torch DataLoader path: it feeds the model
    the way the browser does, so what is measured is the artifact that ships
    rather than the checkpoint it came from. TTA is not offered here for the
    same reason — the app runs one forward pass.
    """
    import onnxruntime as ort

    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    ids, preds, gts = [], [], []
    batch, batch_gt = [], []

    def flush():
        if batch:
            preds.append(session.run(["nutrition"], {"pixels": np.stack(batch).astype(np.float32)})[0])
            gts.append(np.array(batch_gt, dtype=np.float64))
            batch.clear()
            batch_gt.clear()

    for _, row in df_eval.iterrows():
        batch.append(browser_pixels(PROJECT / row["image_path"], img_size))
        batch_gt.append([float(row[t]) for t in targets])
        ids.append(row["dish_id"])
        if len(batch) == batch_size:
            flush()
    flush()

    preds, gts = np.concatenate(preds), np.concatenate(gts)
    mae, mae_pct = metrics.per_field(preds, gts)
    return ids, preds, gts, mae, mae_pct


def onnx_metadata(onnx_path: Path) -> tuple[dict, dict | None]:
    """The sidecar manifest, and the checkpoint it was exported from if present.

    The checkpoint is what makes `--split val` trustworthy: it carries the seed
    and val_frac the graph was actually trained under. Without it the split has
    to be guessed, and `val_frames` says so loudly.
    """
    meta_path = onnx_path.with_suffix("").with_suffix(".json")
    if not meta_path.is_file():
        meta_path = onnx_path.parent / f"{onnx_path.name.split('.')[0]}.json"
    if not meta_path.is_file():
        raise SystemExit(
            f"No manifest beside {onnx_path.name}; expected {meta_path.name}.\n"
            "  It carries the targets and input size — the graph alone does not say what\n"
            "  its five outputs mean. Re-export with export_onnx.py to produce one."
        )
    meta = json.loads(meta_path.read_text())
    src = resolve("checkpoints", meta.get("source_checkpoint", ""))
    ckpt = torch.load(src, map_location="cpu", weights_only=False) if src.is_file() else None
    return meta, ckpt


def describe(split: str, view: str) -> str:
    if (split, view) == OFFICIAL:
        return "official Nutrition5k protocol — comparable with published figures"
    if view == "side":
        return "held-out dishes, off-axis frames — closest to how the app is used"
    return "held-out dishes — ours, not comparable with published figures"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", default=None)
    ap.add_argument("--onnx", default=None,
                    help="score an exported graph instead, as the browser runs it")
    ap.add_argument("--split", choices=SPLITS, default="test")
    ap.add_argument("--view", choices=VIEWS, default="overhead")
    ap.add_argument("--frames-per-dish", type=int, default=None,
                    help="subsample side frames, spread across the four cameras")
    ap.add_argument("--compare", nargs="*", default=None,
                    help="score several checkpoints and print a ranking")
    ap.add_argument("--tta", nargs="*", default=None,
                    help="test-time flips to average (default: config `tta`)")
    ap.add_argument("--no-tta", action="store_true", help="single forward pass")
    ap.add_argument("--out", default=None, help="where to write the stats JSON")
    args = ap.parse_args()

    cfg = load_config()
    official = (args.split, args.view) == OFFICIAL

    meta, onnx_ckpt = (None, None)
    if args.onnx:
        meta, onnx_ckpt = onnx_metadata(Path(args.onnx))

    # An exported graph is scored the way the app runs it: onnxruntime on the
    # CPU, one forward pass. Averaging flips here would report an accuracy the
    # browser never achieves.
    device = "cpu" if args.onnx else ("cuda" if torch.cuda.is_available() else "cpu")
    tta = (["none"] if args.onnx else
           resolve_tta(["none"] if args.no_tta else (args.tta or cfg.get("tta", ["none"]))))
    if args.onnx and (args.tta or cfg.get("tta", ["none"]) != ["none"]):
        print("  (--onnx scores a single pass; test-time flips ignored)")

    # Which checkpoint defines the split: the one being scored, or — for a
    # graph — the one it was exported from.
    split_ckpt = onnx_ckpt
    if split_ckpt is None and args.split == "val":
        first = args.checkpoint or (args.compare[0] if args.compare else None)
        if first and Path(first).is_file():
            split_ckpt = torch.load(first, map_location="cpu", weights_only=False)

    df_eval = select_frames(cfg, args.split, args.view, split_ckpt, args.frames_per_dish)
    require_images(df_eval, args.split, args.view)

    print(f"{args.split}/{args.view}: {df_eval['dish_id'].nunique()} dishes, "
          f"{len(df_eval)} frames   device: {device}   tta: {' '.join(tta)}")
    print(f"  {describe(args.split, args.view)}\n")

    if args.compare:
        rows = []
        for path in sorted(args.compare):
            p = Path(path)
            if not p.is_file():
                print(f"  (skipping missing {p})")
                continue
            *_, mae, mae_pct, ckpt = score_checkpoint(p, df_eval, cfg, device, tta)
            rows.append((p.name, ckpt, mae, mae_pct))
            print(metrics.format_table(ckpt["targets"], mae, mae_pct, title=p.name))
            print()

        rows.sort(key=lambda r: r[3].mean())
        header = (f"{'checkpoint':<22}{'backbone':<22}{'px':>5}{'M':>7}"
                  f"{'selected on':>13}{'MAE%':>11}")
        print(header)
        print("-" * len(header))
        for name, ckpt, _, mae_pct in rows:
            # How a checkpoint was chosen changes what its *validation* number
            # meant, but not this one: every row here is scored the same way, on
            # the same frames. Showing it explains why a model selected on
            # `both` may rank lower here and still be the better one to ship.
            selected = (ckpt.get("train_cfg") or {}).get("select_view", "overhead")
            params = sum(p.numel() for p in
                         build_model(ckpt["backbone"], num_outputs=len(ckpt["targets"]),
                                     pretrained=False).parameters()) / 1e6
            print(f"{name:<22}{ckpt['backbone']:<22}{ckpt['img_size']:>5}{params:>7.1f}"
                  f"{selected:>13}{mae_pct.mean():>10.2f}%")
        return

    if args.onnx:
        onnx_path = Path(args.onnx)
        targets = meta.get("targets", cfg["targets"])
        img_size = meta.get("input", {}).get("img_size", cfg["model"]["img_size"])
        ids, preds, gts, mae, mae_pct = score_onnx_frames(
            onnx_path, df_eval, targets, img_size, cfg["train"]["batch_size"]
        )
        title, scored = onnx_path.name, onnx_path.name
        source = meta.get("source_checkpoint", "?")
    else:
        ckpt_path = Path(args.checkpoint) if args.checkpoint else resolve(
            cfg["train"]["checkpoint_dir"], "best.pt"
        )
        if not ckpt_path.is_file():
            raise SystemExit(f"Checkpoint not found: {ckpt_path}")
        ids, preds, gts, mae, mae_pct, ckpt = score_checkpoint(
            ckpt_path, df_eval, cfg, device, tta
        )
        targets = ckpt["targets"]
        title, scored, source = ckpt_path.name, ckpt_path.name, ckpt_path.name

    print(metrics.format_table(targets, mae, mae_pct, title=title))

    # One row per frame, so a repeated dish_id is a real second photograph of
    # the same plate rather than a duplicate. The upstream scorer wants one row
    # per dish, which only the official run satisfies.
    if len(ids) != len(set(ids)):
        ids = [f"{d}#{i}" for i, d in enumerate(ids)]

    # The benchmark run keeps the plain names; everything else is named after
    # what produced it. Two models writing to one eval_stats file is how the
    # last number anybody ran ends up being quoted as the number for the model
    # they meant.
    suffix = "" if official else f"_{Path(scored).name.split('.')[0]}_{args.split}_{args.view}"
    pred_path = resolve(f"predictions{suffix}.csv")
    gt_path = resolve(f"groundtruth_test{suffix}.csv")
    write_csv(pred_path, ids, preds)
    write_csv(gt_path, ids, gts)

    # Provenance sits beside the numbers, not in a commit message. A stats file
    # that does not say which split, which view and which artifact produced it
    # is how a validation score gets quoted as a benchmark result.
    stats = metrics.as_dict(targets, mae, mae_pct)
    stats["_model"] = scored
    stats["_source_checkpoint"] = source
    stats["_runtime"] = "onnxruntime" if args.onnx else "pytorch"
    stats["_split"] = args.split
    stats["_view"] = args.view
    stats["_tta"] = tta
    stats["_n_dishes"] = int(df_eval["dish_id"].nunique())
    stats["_n_frames"] = len(ids)
    stats["_comparable_to_published"] = official
    stats["_note"] = describe(args.split, args.view)

    out_path = Path(args.out) if args.out else resolve(f"eval_stats{suffix}.json")
    out_path.write_text(json.dumps(stats, indent=2))

    print(f"\nWrote {pred_path}\nWrote {gt_path}\nWrote {out_path}")
    if official:
        scorer = resolve(cfg["dataset_root"], "scripts/compute_eval_statistics.py")
        print("\nCross-check with the official scorer:\n"
              f"    python {scorer} {gt_path} {pred_path} /tmp/official_stats.json")
    else:
        print("\nNot the published protocol — do not quote this alongside other "
              "people's\nNutrition5k figures. Re-run with the defaults for that one.")


if __name__ == "__main__":
    main()
