"""Target normalization — the one place that decides what the network regresses.

The five targets (calories, mass, fat, carb, protein) are on wildly different
scales and are all right-skewed, so the raw numbers cannot be regressed
directly with a single balanced loss. Every script that touches the model
(train / eval / predict / export) has to apply *exactly* the same
transform+standardization, and the inverse has to be exact too, so it lives
here and the fitted constants ride along inside the checkpoint.

Two spaces are supported:

``identity``
    Standardize the raw physical values. This is what v1 did, and it is the
    space the scoring metric actually lives in: the official MAE% is
    ``sum|err| / sum(gt)``, a ratio of *sums*, so a gram of error on a large
    dish counts exactly as much as a gram on a small one. Absolute error is
    therefore the aligned objective.

``log1p``
    Standardize ``log(1 + y)``. This makes the loss care about *relative*
    error instead, which is not what the metric rewards — but it also stops
    the handful of enormous dishes (carb runs to 845 g against a 99th
    percentile of 68 g) from owning the gradient. Whether the robustness is
    worth the metric mismatch is an empirical question, so it is a config
    switch rather than a decision baked into the training loop.

Outlier clipping is applied when *fitting* the statistics only. Clipping the
targets a sample is trained against would teach the model to under-predict
large dishes; clipping only the mean/std keeps those samples in the loss while
stopping a few mislabeled rows from setting the scale for everything else.
"""
from __future__ import annotations

import numpy as np
import torch

SPACES = ("identity", "log1p")


def to_space(y, space: str):
    """Physical units -> transform space. Works on numpy arrays and tensors."""
    if space == "identity":
        return y
    if space == "log1p":
        if isinstance(y, torch.Tensor):
            return torch.log1p(y.clamp_min(0))
        return np.log1p(np.maximum(y, 0))
    raise ValueError(f"unknown target space: {space!r} (expected one of {SPACES})")


def from_space(z, space: str):
    """Transform space -> physical units. Exact inverse of `to_space`."""
    if space == "identity":
        return z
    if space == "log1p":
        if isinstance(z, torch.Tensor):
            return torch.expm1(z).clamp_min(0)
        return np.maximum(np.expm1(z), 0)
    raise ValueError(f"unknown target space: {space!r} (expected one of {SPACES})")


def fit_stats(y_raw: np.ndarray, space: str, clip_percentile: float | None = None):
    """Fit per-field mean/std in `space`, ignoring outliers when told to.

    `y_raw` is (N, 5) in physical units. Returns (mean, std) as float64 arrays
    in transform space — the two numbers the checkpoint has to carry so eval
    and inference de-normalize identically.
    """
    y = np.asarray(y_raw, dtype=np.float64)
    if clip_percentile:
        # Percentile per field, so a dish that is an outlier in carb does not
        # drag the calorie statistics with it.
        caps = np.percentile(y, clip_percentile, axis=0)
        y = np.minimum(y, caps)
    z = to_space(y, space)
    mean = z.mean(axis=0)
    std = z.std(axis=0)
    std[std < 1e-6] = 1.0
    return mean, std


class TargetCodec:
    """Bundles (space, mean, std) so callers cannot mix up half a transform.

    Encode is used by the training loop; decode by everything that reports a
    number to a human or writes a CSV.
    """

    def __init__(self, space: str, mean, std):
        if space not in SPACES:
            raise ValueError(f"unknown target space: {space!r}")
        self.space = space
        self.mean = np.asarray(mean, dtype=np.float64)
        self.std = np.asarray(std, dtype=np.float64)

    @classmethod
    def from_checkpoint(cls, ckpt: dict) -> "TargetCodec":
        # v1 checkpoints predate the `target_space` key and are always identity.
        return cls(ckpt.get("target_space", "identity"), ckpt["target_mean"], ckpt["target_std"])

    def to_checkpoint(self) -> dict:
        return {
            "target_space": self.space,
            "target_mean": self.mean.tolist(),
            "target_std": self.std.tolist(),
        }

    def torch_stats(self, device=None, dtype=torch.float32):
        mean = torch.as_tensor(self.mean, dtype=dtype)
        std = torch.as_tensor(self.std, dtype=dtype)
        if device is not None:
            mean, std = mean.to(device), std.to(device)
        return mean, std

    def encode(self, y_raw):
        """Physical units -> standardized network target."""
        mean, std = self._like(y_raw)
        return (to_space(y_raw, self.space) - mean) / std

    def decode(self, z_norm):
        """Standardized network output -> physical units, clamped at zero.

        Nothing on the plate can weigh a negative number of grams, and letting
        a negative prediction through would poison the daily accumulation in
        the app, so the clamp is part of the contract rather than a caller's
        responsibility.
        """
        mean, std = self._like(z_norm)
        out = from_space(z_norm * std + mean, self.space)
        if isinstance(out, torch.Tensor):
            return out.clamp_min(0)
        return np.maximum(out, 0)

    def _like(self, x):
        if isinstance(x, torch.Tensor):
            return (
                torch.as_tensor(self.mean, dtype=x.dtype, device=x.device),
                torch.as_tensor(self.std, dtype=x.dtype, device=x.device),
            )
        return self.mean, self.std
