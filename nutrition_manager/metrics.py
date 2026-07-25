"""The scoring metric, defined once so train/eval cannot drift apart.

Mirrors ``nutrition5k_dataset/scripts/compute_eval_statistics.py`` exactly:

    field_MAE   = mean(|pred - gt|)
    field_MAE_% = 100 * mean(|pred - gt|) / mean(gt)

Note what that second line is *not*: it is not the mean of per-dish percentage
errors. The denominator is the mean of the ground truth over the whole split,
so it is a constant — which makes MAE% nothing more than MAE in rescaled
units, and means a gram of error on a 900 kcal dish counts exactly as much as
a gram on a 30 kcal one. Anything that claims to optimize "percentage error"
per dish is optimizing a different objective than the one being reported.
"""
from __future__ import annotations

import numpy as np

FIELD_ORDER = ["calories", "mass", "fat", "carb", "protein"]


def per_field(preds: np.ndarray, gts: np.ndarray):
    """Return (mae, mae_pct) as (5,) arrays, in the official definition."""
    preds = np.asarray(preds, dtype=np.float64)
    gts = np.asarray(gts, dtype=np.float64)
    abs_err = np.abs(preds - gts)
    mae = abs_err.mean(axis=0)
    mae_pct = 100.0 * mae / np.maximum(gts.mean(axis=0), 1e-6)
    return mae, mae_pct


def as_dict(targets, mae, mae_pct) -> dict:
    """Same key layout the official scorer writes to its JSON output."""
    out = {}
    for name, m, p in zip(targets, mae, mae_pct):
        out[f"{name}_MAE"] = float(m)
        out[f"{name}_MAE_%"] = float(p)
    return out


def format_table(targets, mae, mae_pct, title: str = "") -> str:
    lines = []
    if title:
        lines.append(title)
    lines.append(f"{'field':<10}{'MAE':>12}{'MAE %':>10}")
    for name, m, p in zip(targets, mae, mae_pct):
        lines.append(f"{name:<10}{m:>12.2f}{p:>9.1f}%")
    lines.append(f"{'mean':<10}{np.mean(mae):>12.2f}{np.mean(mae_pct):>9.1f}%")
    return "\n".join(lines)
