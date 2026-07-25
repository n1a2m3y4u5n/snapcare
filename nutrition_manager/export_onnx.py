"""Export a checkpoint to ONNX for the web app, and prove it still works.

    python export_onnx.py                                   # checkpoints/best.pt
    python export_onnx.py --checkpoint checkpoints/web.pt --quantize
    python export_onnx.py --checkpoint checkpoints/web.pt --score

Writes into `export/`:

    <name>.onnx            float32 graph
    <name>.int8.onnx       dynamically quantized, with --quantize
    <name>.json            everything the JavaScript side needs to call it

What goes in the graph, and why
-------------------------------
The exported model takes **RGB in [0, 1]** and returns **grams and kilocalories**.
ImageNet normalization and the target de-standardization are both inside the
graph rather than in the caller.

That is not convenience. A regression model is only correct if its input is
preprocessed and its output de-normalized exactly as at training time, and those
constants would otherwise have to be copied into TypeScript and kept in step by
hand. A wrong mean there does not throw; it returns plausible numbers that are
quietly wrong, on a screen that tells someone whether their meal was within
their daily limit. Baking them in makes the contract "pixels in, grams out",
which cannot drift.

What the caller still owes the model is the resize: shorter side to
`resize_to`, centre crop to `img_size`, RGB order, values divided by 255. That
is written into the JSON beside the graph so it does not have to be remembered.

Verification
------------
Export is not finished when the file exists. `--score` runs the ONNX graph over
the real test split and prints the same MAE table `eval.py` prints, so a
quantized model that lost accuracy is visible as a number rather than as a
worse app. Parity against PyTorch is checked on every export.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

sys.path.insert(0, str(Path(__file__).resolve().parent))
import metrics  # noqa: E402
from common import load_config, resolve  # noqa: E402
from data.dataset import IMAGENET_MEAN, IMAGENET_STD  # noqa: E402
from inference import load_checkpoint  # noqa: E402
from targets import TargetCodec  # noqa: E402


class DeployableModel(nn.Module):
    """The trained network wrapped in the two transforms that surround it.

    Input : float32 [N, 3, H, W], RGB, already resized and cropped, in [0, 1]
    Output: float32 [N, 5], physical units, never negative

    Keeping both ends inside the graph means the browser cannot get them
    subtly wrong, and means the ONNX file is self-describing enough to test
    against PyTorch end to end rather than layer by layer.
    """

    def __init__(self, backbone: nn.Module, codec: TargetCodec):
        super().__init__()
        self.backbone = backbone
        self.register_buffer("pix_mean", torch.tensor(IMAGENET_MEAN).view(1, 3, 1, 1))
        self.register_buffer("pix_std", torch.tensor(IMAGENET_STD).view(1, 3, 1, 1))
        self.register_buffer("t_mean", torch.tensor(codec.mean, dtype=torch.float32))
        self.register_buffer("t_std", torch.tensor(codec.std, dtype=torch.float32))
        self.log_space = codec.space == "log1p"

    def forward(self, pixels: torch.Tensor) -> torch.Tensor:
        x = (pixels - self.pix_mean) / self.pix_std
        z = self.backbone(x) * self.t_std + self.t_mean
        if self.log_space:
            # `torch.expm1` is what targets.py uses and is the numerically
            # better spelling, but the ONNX exporter has no lowering for
            # aten::expm1 at opset 17 — a log-space checkpoint simply could not
            # be exported. exp(z) - 1 loses precision only as z approaches
            # zero, where the two differ by a fraction of a gram, so the
            # trade is worth making to have a graph at all.
            z = torch.exp(z) - 1.0
        # Nothing on a plate weighs a negative number of grams, and a negative
        # value would corrupt the day's running total in the app rather than
        # showing up as an obviously wrong single reading.
        return torch.clamp(z, min=0.0)


def export(model: nn.Module, img_size: int, out_path: Path, opset: int = 17) -> None:
    dummy = torch.zeros(1, 3, img_size, img_size, dtype=torch.float32)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        model,
        dummy,
        str(out_path),
        input_names=["pixels"],
        output_names=["nutrition"],
        # A dynamic batch axis lets the app score several photographs — or
        # several crops of one — in a single call. The spatial dims stay fixed:
        # the model was trained at one resolution and feeding another silently
        # changes what "a portion" looks like to it.
        dynamic_axes={"pixels": {0: "batch"}, "nutrition": {0: "batch"}},
        opset_version=opset,
        do_constant_folding=True,
        # The TorchScript exporter, deliberately, though it is now the older of
        # the two. The dynamo path emits the weights as external data, so the
        # model becomes an .onnx file plus a sidecar the caller has to fetch
        # and locate itself. For a page that has to load over a bad connection
        # a single self-contained file is worth more than being on the newer
        # code path. Revisit if dynamo grows a single-file mode.
        dynamo=False,
    )


def check_parity(torch_model: nn.Module, onnx_path: Path, img_size: int,
                 n: int = 8, seed: int = 0) -> float:
    """Largest disagreement between PyTorch and onnxruntime, in physical units.

    Random pixels rather than photographs on purpose: real images occupy a
    narrow, well-behaved part of the input space, and an export bug that only
    shows on unusual activations would hide there.
    """
    import onnxruntime as ort

    rng = np.random.default_rng(seed)
    x = rng.random((n, 3, img_size, img_size), dtype=np.float32)

    with torch.no_grad():
        expected = torch_model(torch.from_numpy(x)).numpy()

    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    got = session.run(["nutrition"], {"pixels": x})[0]
    return float(np.abs(expected - got).max())


def quantize(src: Path, dst: Path) -> None:
    """Dynamic int8 quantization — weights int8, activations measured at runtime.

    Chosen over static quantization because it needs no calibration dataset and
    cannot be silently miscalibrated. The whole point here is a smaller
    download for a phone on a slow connection, and `--score` says what it cost.
    """
    from onnxruntime.quantization import QuantType, quantize_dynamic

    quantize_dynamic(str(src), str(dst), weight_type=QuantType.QInt8)


def score_onnx(onnx_path: Path, ckpt: dict, cfg: dict) -> tuple:
    """Run the exported graph over the official test split.

    Deliberately does not reuse the torch DataLoader path: this feeds the model
    the way the browser will — decode, resize, crop, scale to [0, 1] — so what
    is measured is the thing that ships.
    """
    import onnxruntime as ort
    import pandas as pd
    from PIL import Image

    from eval import load_test_frame

    df = load_test_frame(cfg)
    img_size = ckpt["img_size"]
    resize_to = int(round(img_size * 1.15))
    session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])

    preds, gts = [], []
    batch, batch_gt = [], []

    def flush():
        if not batch:
            return
        x = np.stack(batch).astype(np.float32)
        preds.append(session.run(["nutrition"], {"pixels": x})[0])
        gts.append(np.array(batch_gt, dtype=np.float64))
        batch.clear()
        batch_gt.clear()

    for _, row in df.iterrows():
        img = Image.open(resolve(row["image_path"])).convert("RGB")
        # Shorter side to resize_to, then centre crop — matching build_transforms.
        # The rounding matters and is easy to get subtly wrong: torchvision's
        # center_crop computes its offset with int(round(...)), not floor, and
        # so does the TypeScript. Flooring here would shift the crop by up to
        # half a pixel of the resized image — a few source pixels on a phone
        # photograph — and this function exists precisely to detect that kind of
        # drift between the three implementations, so it must not introduce any.
        w, h = img.size
        scale = resize_to / min(w, h)
        img = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.BILINEAR)
        w, h = img.size
        left, top = int(round((w - img_size) / 2.0)), int(round((h - img_size) / 2.0))
        img = img.crop((left, top, left + img_size, top + img_size))

        arr = np.asarray(img, dtype=np.float32).transpose(2, 0, 1) / 255.0
        batch.append(arr)
        batch_gt.append([float(row[t]) for t in ckpt["targets"]])
        if len(batch) == 32:
            flush()
    flush()

    return metrics.per_field(np.concatenate(preds), np.concatenate(gts))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", default=None)
    ap.add_argument("--out-dir", default="export")
    ap.add_argument("--name", default=None, help="basename for the exported files")
    ap.add_argument("--opset", type=int, default=17)
    ap.add_argument("--quantize", action="store_true", help="also write an int8 graph")
    ap.add_argument("--score", action="store_true",
                    help="run the exported graph over the test split and report MAE")
    args = ap.parse_args()

    cfg = load_config()
    ckpt_path = Path(args.checkpoint) if args.checkpoint else resolve(
        cfg["train"]["checkpoint_dir"], "best.pt"
    )
    if not ckpt_path.is_file():
        raise SystemExit(f"Checkpoint not found: {ckpt_path}")

    backbone, codec, ckpt = load_checkpoint(ckpt_path, "cpu")
    model = DeployableModel(backbone, codec).eval()
    img_size = ckpt["img_size"]

    out_dir = resolve(args.out_dir)
    name = args.name or ckpt_path.stem
    fp32_path = out_dir / f"{name}.onnx"

    print(f"Exporting {ckpt_path.name}  ({ckpt['backbone']} @{img_size}px, "
          f"targets in {codec.space} space)")
    export(model, img_size, fp32_path, args.opset)
    size_mb = fp32_path.stat().st_size / 1e6
    print(f"  wrote {fp32_path.name}  ({size_mb:.1f} MB)")

    drift = check_parity(model, fp32_path, img_size)
    # The targets run to hundreds of kcal, so a disagreement of this scale is
    # float arithmetic, not a broken graph.
    status = "ok" if drift < 1e-2 else "SUSPECT"
    print(f"  parity vs PyTorch: max |diff| = {drift:.2e}  [{status}]")
    if drift >= 1e-2:
        raise SystemExit("exported graph disagrees with PyTorch; not writing metadata")

    artifacts = {"float32": {"file": fp32_path.name, "size_mb": round(size_mb, 2)}}

    if args.quantize:
        int8_path = out_dir / f"{name}.int8.onnx"
        quantize(fp32_path, int8_path)
        int8_mb = int8_path.stat().st_size / 1e6
        print(f"  wrote {int8_path.name}  ({int8_mb:.1f} MB, "
              f"{size_mb / max(int8_mb, 1e-9):.1f}x smaller)")
        artifacts["int8"] = {"file": int8_path.name, "size_mb": round(int8_mb, 2)}

    meta = {
        "name": name,
        "source_checkpoint": ckpt_path.name,
        "backbone": ckpt["backbone"],
        "targets": ckpt["targets"],
        "units": {"calories": "kcal", "mass": "g", "fat": "g", "carb": "g", "protein": "g"},
        "input": {
            "name": "pixels",
            "layout": "NCHW",
            "colour": "RGB",
            "range": [0, 1],
            "img_size": img_size,
            # The caller's whole job, spelled out: everything else is in the graph.
            "resize_shorter_side_to": int(round(img_size * 1.15)),
            "then": "centre crop to img_size, divide by 255",
        },
        "output": {
            "name": "nutrition",
            "shape": ["batch", len(ckpt["targets"])],
            "note": "physical units, clamped at zero; normalization is inside the graph",
        },
        "opset": args.opset,
        "artifacts": artifacts,
        "val_mean_mae_pct": ckpt.get("val_mean_mae_pct"),
        "parity_max_abs_diff": drift,
    }

    if args.score:
        print("\nScoring the exported graph on the official test split "
              "(preprocessing as the browser will do it)...")
        for label, path in [("float32", fp32_path)] + (
            [("int8", out_dir / f"{name}.int8.onnx")] if args.quantize else []
        ):
            mae, mae_pct = score_onnx(path, ckpt, cfg)
            print()
            print(metrics.format_table(ckpt["targets"], mae, mae_pct, title=f"{name} [{label}]"))
            meta["artifacts"][label]["test_mean_mae_pct"] = round(float(mae_pct.mean()), 3)
            meta["artifacts"][label]["test_fields"] = metrics.as_dict(ckpt["targets"], mae, mae_pct)

    meta_path = out_dir / f"{name}.json"
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)
    print(f"\nWrote {meta_path}")


if __name__ == "__main__":
    main()
