#!/usr/bin/env bash
# Two questions the v2 recipe leaves open, both about how much of the plate the
# model gets to see.
#
#   v3-288       Does resolution help? Portion size is the hard part of this
#                task, and at 224px a pea and a grape are a few pixels each.
#
#   v3-mildcrop  Does the augmentation hurt? RandomResizedCrop with
#                scale=(0.7, 1.0) can cut the edge off a plate — and the plate
#                is the only size reference in the frame. When it does, the
#                label still says the mass of the whole dish, so the model is
#                being trained on quiet label noise. A milder crop keeps the
#                rim in frame.
#
#   v3-288-mild  Both, if either helps on its own.
#
# Queued behind whatever is already training, so the GPU is never idle.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."

# shellcheck source=runs/gpu_lock.sh
source "$HERE/gpu_lock.sh"
gpu_wait

python train.py --tag v3-288      --set model.img_size=288 train.batch_size=24
python train.py --tag v3-mildcrop --set train.crop_scale_min=0.85
python train.py --tag v3-288-mild --set model.img_size=288 train.batch_size=24 \
                                       train.crop_scale_min=0.85

python runs/summarize.py
