"""Loading a checkpoint and running it — shared by eval, predict and export.

Keeping this in one place is not tidiness. A regression model is only correct
if the image is preprocessed and the output de-normalized exactly as at
training time, and there are four callers that must agree: the test scorer, the
single-image CLI, the ONNX exporter, and the parity check that compares the
exporter's output against PyTorch's. When that logic was duplicated, "the
exported model gives different numbers" was indistinguishable from "the export
is broken".
"""
from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from data.dataset import build_transforms  # noqa: E402
from models.model import build_model  # noqa: E402
from targets import TargetCodec  # noqa: E402

# Test-time augmentations. Each is a tensor->tensor flip of an already
# preprocessed batch, so no image is decoded or resized twice.
TTA_TRANSFORMS = {
    "none": lambda x: x,
    "hflip": lambda x: torch.flip(x, dims=[3]),
    "vflip": lambda x: torch.flip(x, dims=[2]),
    "hvflip": lambda x: torch.flip(x, dims=[2, 3]),
}


def load_checkpoint(path, device="cpu"):
    """Return (model in eval mode, codec, ckpt dict)."""
    ckpt = torch.load(path, map_location=device, weights_only=False)
    model = build_model(ckpt["backbone"], num_outputs=len(ckpt["targets"]), pretrained=False)
    model.load_state_dict(ckpt["model_state"])
    model.to(device).eval()
    return model, TargetCodec.from_checkpoint(ckpt), ckpt


def eval_transform(ckpt: dict):
    return build_transforms(ckpt["img_size"], train=False)


def resolve_tta(names) -> list[str]:
    """Validate a TTA list, defaulting to the identity."""
    names = list(names or ["none"])
    unknown = [n for n in names if n not in TTA_TRANSFORMS]
    if unknown:
        raise SystemExit(f"unknown tta: {unknown}; choose from {sorted(TTA_TRANSFORMS)}")
    return names


@torch.no_grad()
def predict_batch(model, x: torch.Tensor, codec: TargetCodec, tta=("none",)) -> torch.Tensor:
    """Physical-unit predictions for a preprocessed batch.

    Averaging happens in *physical* units rather than in the network's output
    space. For an identity-space model the two are the same, but under a log
    target they are not: averaging log-space outputs is a geometric mean, which
    would quietly bias every prediction downward. Averaging what the model
    actually claims about grams is the thing that is meaningful either way.

    Flips are the only augmentations offered because they are the only ones
    that are free of resampling — a dish's nutrition is unchanged by mirroring
    it, and the model already saw flips during training.
    """
    total = None
    for name in tta:
        out = model(TTA_TRANSFORMS[name](x)).float().cpu()
        physical = codec.decode(out)
        total = physical if total is None else total + physical
    return total / len(tta)
