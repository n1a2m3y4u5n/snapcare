#!/usr/bin/env bash
# The model the app actually ships, and its ONNX export.
#
# Two things separate it from the runs that produce the headline number:
#
#   a small backbone      convnext_tiny is 27.8M parameters — 111MB of float32
#                         and 28MB quantized. That is not a download to hand
#                         someone on the connection this app exists for.
#
#   select_view=both      the published protocol scores overhead frames only,
#                         and the model is fifteen points worse on side-angle
#                         ones. Nobody holds a phone above their dinner, so the
#                         checkpoint is chosen on both views rather than the
#                         flattering one.
#
# Ends by exporting and scoring, so what lands in export/ is measured rather
# than assumed.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."

# shellcheck source=runs/gpu_lock.sh
source "$HERE/gpu_lock.sh"
gpu_wait

python train.py --tag deploy --set model.backbone=efficientnet_b0 \
                                  train.epochs=16 train.lr=6.0e-4 \
                                  train.select_view=both

python eval.py --checkpoint checkpoints/deploy.pt
python export_onnx.py --checkpoint checkpoints/deploy.pt --name web --quantize --score
