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


class _Calibration:
    """Feeds real photographs to the quantizer so it can measure activations.

    Deliberately the *training* images rather than the test ones: calibration
    reads the data, and reading the test split to build the model that is then
    scored on it would make the score meaningless.
    """

    def __init__(self, cfg, ckpt, limit=128):
        import pandas as pd

        manifest = resolve(cfg.get("manifest_csv", "dataset_processed/manifest.csv"))
        if manifest.is_file():
            df = pd.read_csv(manifest)
            df = df[(df["split"] == "train") & (df["view"] == "overhead")]
        else:
            df = pd.read_csv(resolve(cfg["labels_csv"]))
            df = df[df["split"] == "train"]
            df["image_path"] = cfg["dataset_root"] + "/" + df["rgb_path"]
        self.paths = df["image_path"].tolist()[:limit]
        self.ckpt = ckpt
        self.iter = None

    def get_next(self):
        if self.iter is None:
            self.iter = iter(self.paths)
        path = next(self.iter, None)
        if path is None:
            return None
        return {"pixels": _load_pixels(resolve(path), self.ckpt["img_size"])[None]}

    def rewind(self):
        self.iter = None


def quantize(src: Path, dst: Path, cfg=None, ckpt=None) -> str:
    """Write an int8 graph, calibrated when there is data to calibrate with.

    Returns which method was used, because it matters and is not visible from
    the file.

    Dynamic quantization is the tempting default — no calibration set, nothing
    to get wrong — and on this project it silently destroyed a model. It leaves
    activation ranges to be guessed at runtime, which is fine for the MatMul-
    heavy graphs it was designed for and is not fine for a convolutional net:
    efficientnet_b0's depthwise convolutions went from 25.7% error to 70.5%,
    while convnext_tiny through the same code path lost 0.1. A backbone made of
    1x1 convolutions survives it and one made of depthwise convolutions does
    not, so "it worked last time" is not evidence.

    Static quantization measures those ranges on real images instead. It needs
    the dataset, so it falls back to dynamic when there is none — and `--score`
    is what tells you whether the result is usable either way.
    """
    from onnxruntime.quantization import CalibrationMethod, QuantType, quantize_dynamic, quantize_static
    from onnxruntime.quantization.preprocess import quant_pre_process

    if cfg is None or ckpt is None:
        quantize_dynamic(str(src), str(dst), weight_type=QuantType.QInt8)
        return "dynamic"

    reader = _Calibration(cfg, ckpt)
    if not reader.paths:
        quantize_dynamic(str(src), str(dst), weight_type=QuantType.QInt8)
        return "dynamic (no calibration images found)"

    prepared = dst.with_suffix(".prep.onnx")
    try:
        quant_pre_process(str(src), str(prepared), skip_symbolic_shape=True)
        quantize_static(
            str(prepared), str(dst), reader,
            quant_format=__import__("onnxruntime.quantization", fromlist=["QuantFormat"]).QuantFormat.QDQ,
            activation_type=QuantType.QUInt8,
            weight_type=QuantType.QInt8,
            per_channel=True,               # depthwise convs need it
            calibrate_method=CalibrationMethod.MinMax,
        )
        return f"static, calibrated on {len(reader.paths)} training images"
    finally:
        prepared.unlink(missing_ok=True)


def _load_pixels(path, img_size: int):
    """Decode and preprocess one image exactly as the browser will."""
    from eval import browser_pixels

    return browser_pixels(path, img_size)


def score_onnx(onnx_path: Path, ckpt: dict, cfg: dict) -> tuple:
    """Run the exported graph over the official test split.

    Both the preprocessing and the scoring loop live in eval.py, so the
    exporter's number and `eval.py --onnx` cannot disagree. That matters more
    than it sounds: this path deliberately does not reuse the torch DataLoader,
    because it has to feed the model the way the browser will, and a second
    hand-written copy of "resize, centre crop, divide by 255" is precisely the
    kind of thing that drifts by half a pixel and is never noticed.
    """
    from eval import OFFICIAL, load_test_frame, require_images, score_onnx_frames

    df = load_test_frame(cfg)
    require_images(df, *OFFICIAL)
    *_, mae, mae_pct = score_onnx_frames(onnx_path, df, ckpt["targets"], ckpt["img_size"])
    return mae, mae_pct


# How much accuracy a 4x smaller download is worth. Below this the quantized
# graph is the better deal on a slow connection; above it, it is a worse app.
# One point of mean MAE% is roughly 2.5 kcal on a typical dish.
MAX_QUANTIZATION_COST = 1.0


def _recommend(artifacts: dict) -> str:
    """Which artifact to serve, given what each one actually scored."""
    fp32 = artifacts.get("float32", {}).get("test_mean_mae_pct")
    int8 = artifacts.get("int8", {}).get("test_mean_mae_pct")
    if int8 is None or fp32 is None:
        return "float32"
    return "int8" if int8 - fp32 <= MAX_QUANTIZATION_COST else "float32"


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
        method = quantize(fp32_path, int8_path, cfg, ckpt)
        int8_mb = int8_path.stat().st_size / 1e6
        print(f"  wrote {int8_path.name}  ({int8_mb:.1f} MB, "
              f"{size_mb / max(int8_mb, 1e-9):.1f}x smaller)  [{method}]")
        artifacts["int8"] = {"file": int8_path.name, "size_mb": round(int8_mb, 2),
                             "method": method}

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

        # Decide which graph should actually be served, and say why.
        #
        # This is the point of scoring at all. Quantization is normally a free
        # 4x on download size, and on one backbone here it was — while on
        # another it multiplied the error by two and a half. Nothing about the
        # file says which happened, so leaving the choice to whoever reads the
        # directory listing means eventually shipping the broken one.
        meta["recommended"] = _recommend(meta["artifacts"])
        chosen = meta["artifacts"][meta["recommended"]]
        print(f"\nServe **{meta['recommended']}** ({chosen['file']}, {chosen['size_mb']} MB, "
              f"{chosen['test_mean_mae_pct']}% mean MAE).")
        if meta["recommended"] == "float32" and "int8" in meta["artifacts"]:
            cost = (meta["artifacts"]["int8"]["test_mean_mae_pct"]
                    - meta["artifacts"]["float32"]["test_mean_mae_pct"])
            print(f"  The int8 graph is smaller but {cost:.1f} points worse — do not ship it.")

    meta_path = out_dir / f"{name}.json"
    with open(meta_path, "w") as f:
        json.dump(meta, f, indent=2)
    print(f"\nWrote {meta_path}")


if __name__ == "__main__":
    main()
