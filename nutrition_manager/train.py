"""Train the RGB nutrition regression model.

Usage (run from nutrition_manager/, with the `snapcare` env active):
    python data/build_labels.py     # once, to create data/labels.csv
    python build_dataset.py         # once, to add side-angle frames
    python train.py                 # trains, writes checkpoints/best.pt
    python train.py --set model.backbone=efficientnet_b0 train.epochs=8
    python train.py --tag b0-log --set train.target_space=log1p

`--set` overrides any dotted config key from the command line, so an ablation
never needs a second copy of config.yaml. `--tag` names the run, giving it its
own checkpoint and a row in `runs/history.jsonl`.

Two things about this loop are worth knowing before changing it.

**Model selection is by view, and the view is a decision.** The processed
dataset is 97% side-angle frames (79,770 against 2,755), because each dish
contributes one overhead photo and up to 24 video frames. The official test
split is overhead only. Selecting on the mixed validation set therefore selects
for the view that is not scored — side frames outvote overhead ones 29 to 1 —
so `train.select_view` defaults to `overhead` and the published numbers are
comparable to other people's.

But nobody holds a phone perfectly above their dinner, and the gap between the
two views is around fifteen points, so the benchmark setting is not the right
setting for a model that ships. `train.select_view=both` averages the two, and
the side-angle frames — a 45-degree sweep around the plate — are much closer to
how the app is actually used. Both numbers are printed either way, because a
widening gap means the model is specialising to one camera geometry.

**Sampling is view-balanced.** Left alone, an epoch is 97% side frames and the
overhead distribution is seen barely at all. `train.overhead_ratio` sets the
probability of drawing an overhead frame, and an epoch is a fixed
`train.epoch_size` draws with replacement, so "epoch" means a constant amount
of compute no matter how the dataset is composed.
"""
from __future__ import annotations

import argparse
import copy
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, WeightedRandomSampler
from tqdm import tqdm

sys.path.insert(0, str(Path(__file__).resolve().parent))
import metrics  # noqa: E402
from common import load_config, resolve  # noqa: E402
from data.dataset import Nutrition5kDataset, build_transforms  # noqa: E402
from models.model import build_model  # noqa: E402
from targets import TargetCodec, fit_stats  # noqa: E402

# Config keys the loop reads, with the values v1 used, so an old config.yaml
# that predates a knob still runs and still reproduces its original behaviour.
TRAIN_DEFAULTS = {
    "epochs": 12,
    "batch_size": 32,
    "lr": 3.0e-4,
    "weight_decay": 0.05,
    "val_frac": 0.1,
    "seed": 42,
    "num_workers": 12,
    "amp": True,
    "clip_percentile": None,
    "checkpoint_dir": "checkpoints",
    "target_space": "identity",
    "overhead_ratio": None,   # None = sample the dataset as-is (v1 behaviour)
    "epoch_size": None,       # None = one pass over the training rows
    "ema_decay": None,        # None = no exponential moving average
    "warmup_epochs": 0,
    "min_lr_factor": 0.01,    # cosine floor, as a fraction of `lr`
    "loss_beta": 1.0,         # SmoothL1 transition point, in standardized units
    "grad_clip": None,
    "label_noise": 0.0,       # stddev of noise added to standardized targets
    "crop_scale_min": 0.7,    # smallest fraction of the image RandomResizedCrop keeps
    # Which validation view chooses the checkpoint: "overhead" matches the
    # published test protocol, "both" matches how the app is actually used.
    "select_view": "overhead",
}


# ── config plumbing ─────────────────────────────────────────────────────────

def apply_overrides(cfg: dict, overrides: list[str]) -> dict:
    """Apply `a.b=value` strings onto a nested config dict, parsing with YAML.

    Values go through the YAML scalar parser so `8`, `3e-4`, `true` and `null`
    arrive as int, float, bool and None rather than as strings that silently
    compare unequal to everything.
    """
    import yaml

    for item in overrides:
        if "=" not in item:
            raise SystemExit(f"--set expects key=value, got {item!r}")
        dotted, _, raw = item.partition("=")
        node = cfg
        parts = dotted.strip().split(".")
        for part in parts[:-1]:
            node = node.setdefault(part, {})
        node[parts[-1]] = yaml.safe_load(raw)
    return cfg


def resolved_train_cfg(cfg: dict) -> dict:
    return {**TRAIN_DEFAULTS, **cfg.get("train", {})}


# ── data ────────────────────────────────────────────────────────────────────

def load_dataframe(cfg: dict) -> pd.DataFrame:
    """Prefer the multi-view manifest; fall back to overhead-only labels.csv.

    Both are normalized to carry `view` and a project-relative `image_path`.
    """
    manifest = resolve(cfg.get("manifest_csv", "dataset_processed/manifest.csv"))
    if manifest.is_file():
        print(f"Using manifest: {manifest}")
        return pd.read_csv(manifest)
    labels = resolve(cfg["labels_csv"])
    if not labels.is_file():
        raise SystemExit(
            f"Neither {manifest} nor {labels} found. "
            "Run: python data/build_labels.py  (and optionally python build_dataset.py)"
        )
    print(f"Manifest not found; using overhead-only labels: {labels}")
    df = pd.read_csv(labels)
    df["view"] = "overhead"
    df["image_path"] = cfg["dataset_root"] + "/" + df["rgb_path"]
    return df


def split_train_val(df_train_all: pd.DataFrame, val_frac: float, seed: int):
    """Hold out whole dishes, so no dish is on both sides of the split.

    A dish contributes one overhead frame and up to 24 side frames of the same
    plate of food. Splitting by row would put near-duplicates of the same
    physical dish in train and val, and the validation number would measure
    memorisation. Only dishes that own an overhead frame are eligible, because
    validation has to be scorable the way the test split is scored.
    """
    rng = np.random.default_rng(seed)
    overhead_dishes = np.sort(
        df_train_all.loc[df_train_all["view"] == "overhead", "dish_id"].unique()
    )
    rng.shuffle(overhead_dishes)
    n_val = int(round(len(overhead_dishes) * val_frac))
    val_dishes = set(overhead_dishes[:n_val].tolist())

    is_val = df_train_all["dish_id"].isin(val_dishes)
    return (
        df_train_all[~is_val].reset_index(drop=True),
        df_train_all[is_val].reset_index(drop=True),
    )


def build_sampler(df: pd.DataFrame, overhead_ratio: float | None, epoch_size: int | None, seed: int):
    """Choose how an epoch is drawn. Returns (sampler, shuffle, drop_last).

    The two knobs are independent, and both have to be honoured separately or
    an ablation silently stops being an ablation:

    * `overhead_ratio` sets the mix of views. Unset means sample the dataset as
      it lies, which is the v1 behaviour and means 97% side-angle frames.
    * `epoch_size` fixes how many images an epoch is. Unset means one pass.

    Setting only `epoch_size` still has to work. Otherwise the run that exists
    to isolate the sampler's effect would also quietly get 3.2x the compute of
    the run it is being compared against, and the comparison would measure
    both changes at once while appearing to measure one.
    """
    n = len(df)
    generator = torch.Generator().manual_seed(seed)

    if overhead_ratio is None:
        if not epoch_size:
            return None, True, True
        # Uniform over the dataset as it lies, but a fixed number of draws, so
        # epoch cost matches a balanced run exactly.
        weights = torch.ones(n, dtype=torch.double)
    else:
        is_overhead = (df["view"] == "overhead").to_numpy()
        n_over = int(is_overhead.sum())
        n_side = n - n_over
        if n_over == 0 or n_side == 0:
            return None, True, True
        # Uniform within each view, so the two together hit the requested mix.
        weights = torch.as_tensor(
            np.where(is_overhead, overhead_ratio / n_over, (1.0 - overhead_ratio) / n_side),
            dtype=torch.double,
        )

    sampler = WeightedRandomSampler(
        weights=weights,
        num_samples=int(epoch_size or n),
        replacement=True,
        generator=generator,
    )
    return sampler, False, True


# ── evaluation ──────────────────────────────────────────────────────────────

@torch.no_grad()
def collect_predictions(model, loader, device, codec: TargetCodec):
    """Run the model over a loader, returning physical-unit preds and gts."""
    model.eval()
    preds, gts = [], []
    for imgs, y_raw, _ in loader:
        imgs = imgs.to(device, non_blocking=True)
        out = model(imgs).float().cpu()
        preds.append(codec.decode(out).numpy())
        gts.append(y_raw.numpy())
    return np.concatenate(preds), np.concatenate(gts)


def evaluate_by_view(model, loaders: dict, device, codec: TargetCodec):
    """Score each view separately. Returns {view: (mae, mae_pct)}."""
    return {
        view: metrics.per_field(*collect_predictions(model, loader, device, codec))
        for view, loader in loaders.items()
    }


def select_metric(by_view: dict, select_view: str):
    """Turn the per-view scores into the one number that picks a checkpoint.

    Returns (views used, score).

    This is a choice between two different jobs, and it is worth being explicit
    about which one is being done.

    `overhead` reproduces the published Nutrition5k protocol, whose test split
    is one overhead frame per dish. It is the setting to use when the number
    has to be comparable to someone else's.

    `both` averages the overhead and side-angle validation scores. It is the
    setting for a model that ships, because nobody holds a phone perfectly
    above their dinner. The side-angle frames sweep the plate at around 45
    degrees, which is far closer to how the app is actually used — and the gap
    between the two views is large, around fifteen points, so the choice is not
    cosmetic. A model tuned for the benchmark is measurably worse at the job.
    """
    available = [v for v in ("overhead", "side") if v in by_view]
    if not available:
        raise SystemExit("validation produced no scored views")

    if select_view == "both":
        views = available
    elif select_view in by_view:
        views = [select_view]
    else:
        # Asked for a view this dataset does not have — fall back rather than
        # crash after an epoch of training, but do not do it silently.
        print(f"  (no '{select_view}' validation frames; selecting on {available[0]})")
        views = [available[0]]

    return views, float(np.mean([by_view[v][1].mean() for v in views]))


# ── EMA ─────────────────────────────────────────────────────────────────────

class ModelEma:
    """Exponential moving average of the weights, kept on the training device.

    Averaging late-training weights is close to free and reliably beats the
    final iterate when the batch size is small relative to the dataset, which
    is the case here. Buffers (BatchNorm running statistics) are copied rather
    than averaged — they are already running averages, and averaging them twice
    de-syncs them from the weights they normalize.
    """

    def __init__(self, model: nn.Module, decay: float):
        self.module = copy.deepcopy(model).eval()
        for p in self.module.parameters():
            p.requires_grad_(False)
        self.decay = decay

    @torch.no_grad()
    def update(self, model: nn.Module, step: int):
        # Ramp the decay in, so the average is not anchored to the random init
        # for the first few hundred steps.
        d = min(self.decay, (1 + step) / (10 + step))
        for ema_p, p in zip(self.module.parameters(), model.parameters()):
            ema_p.lerp_(p.detach().float(), 1.0 - d)
        for ema_b, b in zip(self.module.buffers(), model.buffers()):
            ema_b.copy_(b)


# ── schedule ────────────────────────────────────────────────────────────────

def lr_lambda_factory(total_epochs: int, warmup_epochs: int, min_factor: float):
    """Linear warmup then cosine decay to `min_factor * lr`, per epoch."""

    def fn(epoch: int) -> float:
        if warmup_epochs and epoch < warmup_epochs:
            return (epoch + 1) / (warmup_epochs + 1)
        progress = (epoch - warmup_epochs) / max(1, total_epochs - warmup_epochs)
        progress = min(max(progress, 0.0), 1.0)
        cosine = 0.5 * (1 + np.cos(np.pi * progress))
        return min_factor + (1 - min_factor) * cosine

    return fn


# ── main ────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="configs/config.yaml")
    ap.add_argument("--set", nargs="*", default=[], metavar="KEY=VALUE",
                    help="override a dotted config key, e.g. train.epochs=8")
    ap.add_argument("--tag", default=None,
                    help="name this run; checkpoint becomes <tag>.pt and the "
                         "result is appended to runs/history.jsonl")
    args = ap.parse_args()

    cfg = apply_overrides(load_config(args.config), args.set)
    tcfg = resolved_train_cfg(cfg)
    mcfg = cfg["model"]
    targets = cfg["targets"]
    tag = args.tag or "best"

    device = "cuda" if torch.cuda.is_available() else "cpu"
    torch.manual_seed(tcfg["seed"])
    np.random.seed(tcfg["seed"])

    df = load_dataframe(cfg)
    df_train_all = df[df["split"] == "train"].reset_index(drop=True)
    df_train, df_val = split_train_val(df_train_all, tcfg["val_frac"], tcfg["seed"])

    def counts(frame):
        n_side = int((frame["view"] == "side").sum())
        return f"{len(frame)} ({len(frame) - n_side} overhead + {n_side} side)"

    print(f"train={counts(df_train)}  val={counts(df_val)}")

    # Statistics come from the training rows only — using val or test rows to
    # set the normalization is a leak, small but free to avoid.
    codec = TargetCodec(
        tcfg["target_space"],
        *fit_stats(df_train[targets].to_numpy(), tcfg["target_space"], tcfg["clip_percentile"]),
    )
    print(f"target space: {codec.space}"
          + (f"  (stats fitted below p{tcfg['clip_percentile']})" if tcfg["clip_percentile"] else ""))
    print("  mean:", dict(zip(targets, codec.mean.round(3))))
    print("  std :", dict(zip(targets, codec.std.round(3))))

    img_size = mcfg["img_size"]
    train_ds = Nutrition5kDataset(
        df_train, targets, build_transforms(img_size, True, tcfg["crop_scale_min"])
    )

    loader_kwargs = dict(
        batch_size=tcfg["batch_size"],
        num_workers=tcfg["num_workers"],
        pin_memory=(device == "cuda"),
        persistent_workers=tcfg["num_workers"] > 0,
    )
    sampler, shuffle, drop_last = build_sampler(
        df_train, tcfg["overhead_ratio"], tcfg["epoch_size"], tcfg["seed"]
    )
    if sampler is not None:
        mix = ("as the dataset lies" if tcfg["overhead_ratio"] is None
               else f"{tcfg['overhead_ratio']:.0%} overhead")
        print(f"sampler: {mix}, {len(sampler)} draws/epoch (with replacement)")
    train_loader = DataLoader(
        train_ds, sampler=sampler, shuffle=shuffle, drop_last=drop_last, **loader_kwargs
    )

    # Validation is scored per view: `overhead` is the selection metric (it is
    # what the test split is), `side` is diagnostic only.
    val_loaders = {}
    for view in ("overhead", "side"):
        sub = df_val[df_val["view"] == view]
        if len(sub) == 0:
            continue
        # The side slice is ~24x the overhead slice and is not selected on, so
        # cap it — scoring all of it every epoch costs more than it informs.
        if view == "side" and len(sub) > 4000:
            sub = sub.sample(4000, random_state=tcfg["seed"])
        ds = Nutrition5kDataset(sub.reset_index(drop=True), targets,
                                build_transforms(img_size, False))
        val_loaders[view] = DataLoader(ds, shuffle=False, **loader_kwargs)

    model = build_model(mcfg["backbone"], num_outputs=len(targets), dropout=mcfg["dropout"]).to(device)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"model: {mcfg['backbone']}  {n_params/1e6:.1f}M params  @{img_size}px")

    opt = torch.optim.AdamW(model.parameters(), lr=tcfg["lr"], weight_decay=tcfg["weight_decay"])
    sched = torch.optim.lr_scheduler.LambdaLR(
        opt, lr_lambda_factory(tcfg["epochs"], tcfg["warmup_epochs"], tcfg["min_lr_factor"])
    )
    loss_fn = nn.SmoothL1Loss(beta=tcfg["loss_beta"])
    use_amp = bool(tcfg["amp"]) and device == "cuda"
    scaler = torch.amp.GradScaler("cuda", enabled=use_amp)
    ema = ModelEma(model, tcfg["ema_decay"]) if tcfg["ema_decay"] else None

    ckpt_dir = resolve(tcfg["checkpoint_dir"])
    ckpt_dir.mkdir(parents=True, exist_ok=True)
    ckpt_path = ckpt_dir / f"{tag}.pt"
    best_metric = float("inf")
    best_record = None
    step = 0
    started = time.time()

    for epoch in range(1, tcfg["epochs"] + 1):
        model.train()
        running, n_batches = 0.0, 0
        pbar = tqdm(train_loader, desc=f"epoch {epoch}/{tcfg['epochs']}")
        for imgs, y_raw, _ in pbar:
            imgs = imgs.to(device, non_blocking=True)
            y_norm = codec.encode(y_raw.to(device))
            if tcfg["label_noise"]:
                # Nutrition5k's own labels carry weighing error; a little noise
                # on the target stops the model fitting that error exactly.
                y_norm = y_norm + torch.randn_like(y_norm) * tcfg["label_noise"]

            opt.zero_grad(set_to_none=True)
            with torch.amp.autocast("cuda", enabled=use_amp):
                loss = loss_fn(model(imgs), y_norm)
            scaler.scale(loss).backward()
            if tcfg["grad_clip"]:
                scaler.unscale_(opt)
                nn.utils.clip_grad_norm_(model.parameters(), tcfg["grad_clip"])
            scaler.step(opt)
            scaler.update()
            if ema is not None:
                ema.update(model, step)
            step += 1
            running += loss.item()
            n_batches += 1
            pbar.set_postfix(loss=f"{loss.item():.4f}")
        sched.step()

        scored = ema.module if ema is not None else model
        by_view = evaluate_by_view(scored, val_loaders, device, codec)
        train_loss = running / max(n_batches, 1)

        # Which view chooses the checkpoint. See the note in TRAIN_DEFAULTS:
        # the benchmark is overhead-only, the app is not.
        sel_view, sel = select_metric(by_view, tcfg["select_view"])

        print(f"  train loss {train_loss:.4f}   lr {sched.get_last_lr()[0]:.2e}")
        for view, (mae, mae_pct) in by_view.items():
            marker = "*" if view in sel_view else " "
            detail = "  ".join(f"{t}={p:.1f}%" for t, p in zip(targets, mae_pct))
            print(f" {marker}val[{view:8s}] mean MAE% {mae_pct.mean():5.2f}   {detail}")

        if sel < best_metric:
            best_metric = sel
            best_record = {
                "tag": tag,
                "epoch": epoch,
                "select_view": tcfg["select_view"],
                "val_mean_mae_pct": sel,
                "val_by_view": {v: float(p.mean()) for v, (_, p) in by_view.items()},
                "val_fields": metrics.as_dict(
                    targets, *by_view["overhead" if "overhead" in by_view else sel_view[0]]),
            }
            torch.save(
                {
                    "model_state": scored.state_dict(),
                    "backbone": mcfg["backbone"],
                    "img_size": img_size,
                    "targets": targets,
                    **codec.to_checkpoint(),
                    "val_mean_mae_pct": sel,
                    "epoch": epoch,
                    "train_cfg": tcfg,
                    "model_cfg": mcfg,
                    "ema": ema is not None,
                },
                ckpt_path,
            )
            print(f"  ** saved {ckpt_path.name} "
                  f"(val {'+'.join(sel_view)} mean MAE% {sel:.2f})")

    elapsed = time.time() - started
    print(f"Done in {elapsed/60:.1f} min. "
          f"Best val {tcfg['select_view']} mean MAE% = {best_metric:.2f}")

    # One line per run, so ablations accumulate into something comparable
    # instead of scrolling out of a terminal.
    if best_record is not None:
        best_record.update(
            backbone=mcfg["backbone"], img_size=img_size,
            target_space=codec.space, overhead_ratio=tcfg["overhead_ratio"],
            epoch_size=tcfg["epoch_size"], epochs=tcfg["epochs"],
            ema_decay=tcfg["ema_decay"], clip_percentile=tcfg["clip_percentile"],
            lr=tcfg["lr"], batch_size=tcfg["batch_size"],
            params_m=round(n_params / 1e6, 2), minutes=round(elapsed / 60, 1),
            checkpoint=ckpt_path.name,
        )
        runs_dir = resolve("runs")
        runs_dir.mkdir(exist_ok=True)
        with open(runs_dir / "history.jsonl", "a") as f:
            f.write(json.dumps(best_record) + "\n")
        print(f"Logged to {runs_dir / 'history.jsonl'}")


if __name__ == "__main__":
    main()
