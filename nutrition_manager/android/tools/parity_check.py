"""Does the phone's preprocessing cost the model anything?

    python android/tools/parity_check.py
    python android/tools/parity_check.py --phone-scale     # exercise the subsample path
    python android/tools/parity_check.py --limit 50        # quick

The Android app cannot use torchvision, so `Preprocess.kt` re-implements
`build_transforms(train=False)` on Android's own graphics stack: Skia's bilinear
filter, `Bitmap.createScaledBitmap`, `getPixels`. Every one of those is a
plausible-looking substitution for a torchvision operator that is not quite the
same function, and the failure mode is silent — a slightly different crop or a
missing antialias returns five believable numbers that are simply worse.

So this scores it. The Kotlin path is re-implemented here in numpy, step for
step and including the uint8 requantisation between steps, and both tensors are
pushed through the *same* ONNX graph on the real test split. What comes out is
two rows of the official metric, and the only number that matters is the gap
between them.

What this does and does not establish
-------------------------------------
It validates the *algorithm* in `Preprocess.kt` — the geometry, the rounding,
the resampling order. It does not execute the compiled Kotlin, so it cannot
catch a typo in the Android source; only running the APK on a device does that.
It is the difference between "the plan is sound" and "the build is correct", and
it is the half that can be checked without a phone.
"""
from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
import pandas as pd
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from metrics import FIELD_ORDER, format_table, per_field  # noqa: E402

MODEL_DIR = ROOT / "web" / "model"

# Mirrors MainActivity.FLOOR_SHORTER_SIDE.
FLOOR_SHORTER_SIDE = 1024


# --------------------------------------------------------------------------
# The Android graphics stack, in numpy.
# --------------------------------------------------------------------------

def kotlin_round(x: float) -> int:
    """`kotlin.math.round`, which is `Math.rint`, which is Python's `round`.

    All three break ties towards the even integer. `roundToInt` and
    `math.floor(x + 0.5)` do not, and torchvision's `CenterCrop` uses Python's
    `round` — so a half-up rounding here would shift the crop by a pixel on any
    odd resized dimension.
    """
    return round(x)


def precompute_coeffs(in_size: int, in0: float, in1: float, out_size: int):
    """`Resample.precompute` — and Pillow's `precompute_coeffs`, which it copies.

    Support widens by the reduction factor, which is the entire reason this
    exists rather than a call to Android's own scaler: point-sampled bilinear
    keeps a fixed 2x2 footprint and drops source pixels on the way down.
    """
    scale = (in1 - in0) / out_size
    filter_scale = max(1.0, scale)
    support = 1.0 * filter_scale
    taps = math.ceil(support) * 2 + 1

    bounds = np.zeros((out_size, 2), dtype=np.int64)
    weights = np.zeros((out_size, taps), dtype=np.float32)
    inverse = 1.0 / filter_scale

    for out in range(out_size):
        center = in0 + (out + 0.5) * scale
        xmin = max(0, math.floor(center - support + 0.5))
        xmax = min(in_size, math.floor(center + support + 0.5)) - xmin
        total = 0.0
        for t in range(xmax):
            x = abs((t + xmin - center + 0.5) * inverse)
            w = 1.0 - x if x < 1.0 else 0.0
            weights[out, t] = w
            total += w
        if total != 0.0:
            weights[out, :xmax] /= total
        bounds[out] = (xmin, xmax)
    return bounds, weights


def resample_box(img: np.ndarray, left: float, top: float, box_w: float, box_h: float,
                 out_size: int) -> np.ndarray:
    """`Resample.boxToPlanarRgb`, including the 8-bit rounding at the end."""
    src_h, src_w = img.shape[:2]
    hb, hw = precompute_coeffs(src_w, left, left + box_w, out_size)
    vb, vw = precompute_coeffs(src_h, top, top + box_h, out_size)

    src = img.astype(np.float32)

    strip = np.zeros((src_h, out_size, 3), dtype=np.float32)
    for out in range(out_size):
        xmin, count = hb[out]
        if count <= 0:
            continue
        k = hw[out, :count][None, :, None]
        strip[:, out, :] = (src[:, xmin:xmin + count, :] * k).sum(axis=1)

    result = np.zeros((out_size, out_size, 3), dtype=np.float32)
    for out in range(out_size):
        ymin, count = vb[out]
        if count <= 0:
            continue
        k = vw[out, :count][:, None, None]
        result[out] = (strip[ymin:ymin + count, :, :] * k).sum(axis=0)

    result = np.clip(np.floor(result + 0.5), 0, 255)
    return np.transpose(result / 255.0, (2, 0, 1))[None].astype(np.float32)


def to_u8(img: np.ndarray) -> np.ndarray:
    """Every intermediate is a Bitmap, and a Bitmap is 8 bits per channel."""
    return np.clip(np.rint(img), 0, 255).astype(np.uint8)


def decode_subsampled(img: np.ndarray, floor_shorter_side: int) -> np.ndarray:
    """`BitmapFactory` with `inSampleSize`, as a box average over NxN blocks.

    libjpeg reaches this by scaling the DCT rather than by averaging pixels, so
    the emulation is close rather than bit-exact. It only engages on captures
    far larger than the dataset's frames, which is why `--phone-scale` exists.
    """
    src_h, src_w = img.shape[:2]
    sample = 1
    while min(src_w, src_h) // (sample * 2) >= floor_shorter_side:
        sample *= 2
    if sample == 1:
        return img

    out_h, out_w = math.ceil(src_h / sample), math.ceil(src_w / sample)
    # Edge-replicate up to a whole number of blocks so the average can be taken
    # by reshape. Only the final partial block is affected, and only by repeating
    # the pixels it already contains.
    src = np.pad(
        img.astype(np.float32),
        ((0, out_h * sample - src_h), (0, out_w * sample - src_w), (0, 0)),
        mode="edge",
    )
    blocks = src.reshape(out_h, sample, out_w, sample, 3)
    return to_u8(blocks.mean(axis=(1, 3)))


def android_tensor(img_u8: np.ndarray, size: int, resize_to: int) -> np.ndarray:
    """`Preprocess.decodeCapture` + `Preprocess.toTensor`, step for step."""
    img_u8 = decode_subsampled(img_u8, FLOOR_SHORTER_SIDE)

    sh, sw = img_u8.shape[:2]
    if sw <= sh:
        resized_w, resized_h = resize_to, int(resize_to * sh / sw)
    else:
        resized_h, resized_w = resize_to, int(resize_to * sw / sh)

    scale_x = sw / resized_w
    scale_y = sh / resized_h
    off_x = kotlin_round((resized_w - size) / 2)
    off_y = kotlin_round((resized_h - size) / 2)

    return resample_box(
        img_u8,
        left=off_x * scale_x,
        top=off_y * scale_y,
        box_w=size * scale_x,
        box_h=size * scale_y,
        out_size=size,
    )


# --------------------------------------------------------------------------
# The reference: what eval.py feeds the graph.
# --------------------------------------------------------------------------

def reference_tensor(image: Image.Image, size: int, resize_to: int) -> np.ndarray:
    """`transforms.Resize(258) -> CenterCrop(224) -> ToTensor`.

    Normalize is deliberately absent: it lives inside the ONNX graph, so the
    graph's input is the [0,1] tensor, not the standardized one.
    """
    w, h = image.size
    # torchvision's `Resize(int)` truncates the long side rather than rounding
    # it, and PIL's bilinear is antialiased on the way down. Both are part of
    # what the model was validated against.
    if w <= h:
        new_w, new_h = resize_to, int(resize_to * h / w)
    else:
        new_h, new_w = resize_to, int(resize_to * w / h)

    resized = image.resize((new_w, new_h), Image.BILINEAR)
    left = int(round((new_w - size) / 2.0))
    top = int(round((new_h - size) / 2.0))
    cropped = resized.crop((left, top, left + size, top + size))

    arr = np.asarray(cropped, dtype=np.float32) / 255.0
    return np.transpose(arr, (2, 0, 1))[None]


def compare_tensors(frames: pd.DataFrame, size: int, resize_to: int, limit: int) -> int:
    """Compare the tensors directly, which is a sharper instrument than the score.

    Scoring the split answers "does this cost accuracy"; it cannot distinguish a
    correct pipeline from one whose errors happen to cancel. Differencing the
    tensors answers "is this the same function", and the answer should be that
    the only gap is the last bit of the 8-bit intermediate — 1/255.

    Odd source dimensions are included deliberately. They are the only case where
    `CenterCrop`'s tie-breaking rounding is observable, no camera produces them,
    and a pipeline that is wrong there is wrong in a way no amount of testing on
    640x480 frames would reveal.
    """
    lsb = 1.0 / 255.0
    print(f"{'source':>14}{'max |diff|':>14}{'in LSBs':>10}{'mean |diff|':>14}")
    worst = 0.0
    for _, row in frames.head(limit).iterrows():
        path = ROOT / row["image_path"]
        if not path.is_file():
            continue
        base = Image.open(path).convert("RGB")
        w, h = base.size
        for box in ((w, h), (w - 1, h - 1), (w - 3, h - 1)):
            image = base.crop((0, 0, box[0], box[1]))
            ref = reference_tensor(image, size, resize_to)
            apk = android_tensor(np.asarray(image, dtype=np.uint8), size, resize_to)
            diff = np.abs(ref - apk)
            worst = max(worst, float(diff.max()))
            print(f"{str(image.size):>14}{diff.max():>14.5f}{diff.max() / lsb:>10.2f}{diff.mean():>14.6f}")

    print()
    if worst > lsb * 1.01:
        print(f"FAIL: tensors differ by more than one 8-bit level ({worst:.5f} > {lsb:.5f}).")
        return 1
    print(f"OK: tensors agree to within one 8-bit level ({lsb:.5f}); the geometry is exact.")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None, help="score only the first N dishes")
    ap.add_argument("--phone-scale", action="store_true",
                    help="upsample each frame to a phone-sized capture first, so the "
                         "inSampleSize and pyramid branches are exercised")
    ap.add_argument("--phone-shorter-side", type=int, default=3024)
    ap.add_argument("--tensors", action="store_true",
                    help="compare the tensors themselves, including odd source "
                         "dimensions, instead of scoring the split")
    args = ap.parse_args()

    manifest_path = MODEL_DIR / "web.json"
    if not manifest_path.is_file():
        raise SystemExit(f"no promoted model at {MODEL_DIR}; run `python promote.py --install`")

    import json
    manifest = json.loads(manifest_path.read_text())
    size = manifest["input"]["img_size"]
    resize_to = manifest["input"]["resize_shorter_side_to"]
    variant = manifest.get("recommended", "float32")
    graph = MODEL_DIR / manifest["artifacts"][variant]["file"]
    in_name = manifest["input"]["name"]
    out_name = manifest["output"]["name"]

    frames = pd.read_csv(ROOT / "dataset_processed" / "manifest.csv")
    frames = frames[(frames["split"] == "test") & (frames["view"] == "overhead")]
    truth = pd.read_csv(ROOT / "groundtruth_test.csv", header=None,
                        names=["dish_id"] + FIELD_ORDER).set_index("dish_id")
    frames = frames[frames["dish_id"].isin(truth.index)].drop_duplicates("dish_id")
    if args.limit:
        frames = frames.head(args.limit)

    if args.tensors:
        return compare_tensors(frames, size, resize_to, args.limit or 8)

    session = ort.InferenceSession(str(graph), providers=["CPUExecutionProvider"])
    print(f"graph      {graph.name} ({variant}, {manifest['backbone']})")
    print(f"dishes     {len(frames)} test overhead frames")
    print(f"capture    {'upsampled to shorter side ' + str(args.phone_shorter_side) if args.phone_scale else 'native frame resolution'}")
    print()

    ref_preds, apk_preds, gts = [], [], []
    for n, (_, row) in enumerate(frames.iterrows(), 1):
        path = ROOT / row["image_path"]
        if not path.is_file():
            continue
        image = Image.open(path).convert("RGB")

        if args.phone_scale:
            w, h = image.size
            factor = args.phone_shorter_side / min(w, h)
            image = image.resize((int(w * factor), int(h * factor)), Image.LANCZOS)

        ref = reference_tensor(image, size, resize_to)
        apk = android_tensor(np.asarray(image, dtype=np.uint8), size, resize_to)

        ref_preds.append(session.run([out_name], {in_name: ref})[0][0])
        apk_preds.append(session.run([out_name], {in_name: apk})[0][0])
        gts.append(truth.loc[row["dish_id"], FIELD_ORDER].to_numpy(dtype=np.float64))

        if n % 50 == 0:
            print(f"  ...{n}/{len(frames)}", flush=True)

    ref_preds = np.asarray(ref_preds)
    apk_preds = np.asarray(apk_preds)
    gts = np.asarray(gts)

    ref_mae, ref_pct = per_field(ref_preds, gts)
    apk_mae, apk_pct = per_field(apk_preds, gts)

    print()
    print(format_table(FIELD_ORDER, ref_mae, ref_pct, "reference (torchvision, what eval.py scores)"))
    print()
    print(format_table(FIELD_ORDER, apk_mae, apk_pct, "android  (Preprocess.kt, emulated)"))
    print()

    drift = np.abs(apk_preds - ref_preds).mean(axis=0)
    print(f"{'field':<10}{'mean |apk-ref|':>16}{'as % of MAE':>14}")
    for name, d, m in zip(FIELD_ORDER, drift, ref_mae):
        print(f"{name:<10}{d:>16.3f}{100 * d / m:>13.1f}%")
    print()
    delta = float(np.mean(apk_pct) - np.mean(ref_pct))
    print(f"mean MAE%: reference {np.mean(ref_pct):.3f}  android {np.mean(apk_pct):.3f}  "
          f"delta {delta:+.3f} points")

    # A tenth of a point is the threshold the exporter already uses to decide
    # whether a quantized graph is shippable; holding preprocessing to the same
    # bar keeps "which change cost us accuracy" answerable.
    if abs(delta) > 0.1:
        print("\nFAIL: preprocessing moves the score by more than 0.1 points.")
        return 1
    print("\nOK: preprocessing is within 0.1 points of the reference.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
