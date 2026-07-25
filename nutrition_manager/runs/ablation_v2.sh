#!/usr/bin/env bash
# The v2 ablation chain. Each run writes checkpoints/<tag>.pt and one row in
# runs/history.jsonl, so the four numbers can be compared afterwards without
# scrolling back through four training logs.
#
# The question each run answers:
#   v2-base    does the whole v2 recipe beat v1?
#   v2-asis    ... and is the view-balanced sampler the reason, or incidental?
#   v2-log     does regressing log(1+y) help, given the metric rewards
#              absolute error rather than relative?
#   v2-onlyover  are the 80k side-angle frames earning their keep at all?
#
# Run from nutrition_manager/ with the snapcare env active:
#   bash runs/ablation_v2.sh
set -euo pipefail
cd "$(dirname "$0")/.."

python train.py --tag v2-base
python train.py --tag v2-asis     --set train.overhead_ratio=null train.epoch_size=24000
python train.py --tag v2-log      --set train.target_space=log1p
python train.py --tag v2-onlyover --set train.overhead_ratio=1.0

python runs/summarize.py
