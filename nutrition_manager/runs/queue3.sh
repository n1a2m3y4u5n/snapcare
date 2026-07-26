#!/usr/bin/env bash
# deploy-mnv3, which queue2.sh skipped.
#
# It was skipped because the script was edited while bash sat in its wait loop.
# Bash reads a script by byte offset, so inserting lines above the point it had
# already reached moved where it resumed. Never edit a running shell script —
# the same rule that kept runs/queue.sh untouched, forgotten one file later.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."
source "$HERE/gpu_lock.sh"
gpu_wait

python train.py --tag deploy-mnv3 --set model.backbone=mobilenetv3_large_100 \
    train.epochs=16 train.lr=6.0e-4 train.select_view=both
python export_onnx.py --checkpoint checkpoints/deploy-mnv3.pt --name deploy-mnv3 \
    --quantize --score || true
python runs/summarize.py
