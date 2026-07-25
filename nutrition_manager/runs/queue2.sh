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

# mobilenetv3 turned out to be the strongest of the small backbones on the
# benchmark (20.52 against efficientnet_b0's 21.22 at the same sampler and
# selection) and the fastest to train, so it gets the same treatment before
# anything is concluded about which one ships.
python train.py --tag deploy-mnv3  --set model.backbone=mobilenetv3_large_100 \
    train.epochs=16 train.lr=6.0e-4 train.select_view=both

python train.py --tag deploy-mix02 --set model.backbone=efficientnet_b0 \
    train.epochs=16 train.lr=6.0e-4 train.select_view=both train.overhead_ratio=0.2
python train.py --tag deploy-warp  --set model.backbone=efficientnet_b0 \
    train.epochs=16 train.lr=6.0e-4 train.select_view=both train.overhead_ratio=0.2 \
    train.perspective=0.35

python runs/summarize.py

# Whichever wins still has to survive export. int8 was catastrophic for
# efficientnet_b0 and mobilenetv3 is built from the same depthwise convolutions,
# so this is a real question and not a formality — --score answers it.
for tag in deploy-mnv3 deploy-mix02 deploy-warp; do
    [ -f "checkpoints/$tag.pt" ] || continue
    python export_onnx.py --checkpoint "checkpoints/$tag.pt" --name "$tag" \
        --quantize --score || true
done
