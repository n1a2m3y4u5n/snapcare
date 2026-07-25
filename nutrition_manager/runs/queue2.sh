#!/usr/bin/env bash
# Measure the recommendation the sampler sweep produced.
#
# The sweep says the overhead/side mean improves as the sampler sees fewer
# overhead frames — 24.7 at ~3% against 25.2 at 50% — so the deployment model,
# which is judged on both views, is probably sampling too much overhead at the
# config's 0.5. These two runs put a number on that instead of leaving it as a
# note in the README.
#
# Waits for runs/queue.sh to finish entirely rather than for the GPU to look
# idle: waiting on the GPU would let this start in the gap between two of that
# script's runs, and then two trainings would share the card.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."

while pgrep -f "bash runs/queue\.sh" >/dev/null; do sleep 60; done
source "$HERE/gpu_lock.sh"
gpu_wait

python train.py --tag deploy-mix02 --set model.backbone=efficientnet_b0 \
    train.epochs=16 train.lr=6.0e-4 train.select_view=both train.overhead_ratio=0.2
python train.py --tag deploy-warp  --set model.backbone=efficientnet_b0 \
    train.epochs=16 train.lr=6.0e-4 train.select_view=both train.overhead_ratio=0.2 \
    train.perspective=0.35

python runs/summarize.py
