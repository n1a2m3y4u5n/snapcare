#!/usr/bin/env bash
# Train the model that actually ships to the browser.
#
# convnext_tiny is 27.8M parameters — 111MB of float32, 28MB quantized. That is
# not a download to hand someone on the connection this app is designed for, so
# the deployed model is a small backbone trained with the same recipe. The
# question this answers is what that costs in accuracy.
#
# Waits for any training already running, so it can be queued behind an
# ablation chain without babysitting the GPU.
set -euo pipefail
cd "$(dirname "$0")/.."

while pgrep -f "train.py --tag" >/dev/null; do sleep 30; done

python train.py --tag web-b0  --set model.backbone=efficientnet_b0 \
                                   model.img_size=224 train.epochs=14 train.lr=6.0e-4
python train.py --tag web-mnv3 --set model.backbone=mobilenetv3_large_100 \
                                   model.img_size=224 train.epochs=14 train.lr=6.0e-4

python runs/summarize.py
