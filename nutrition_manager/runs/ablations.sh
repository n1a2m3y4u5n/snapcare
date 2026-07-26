#!/usr/bin/env bash
# Every run behind the tables in the README, in order, in one shell.
#
#     bash runs/ablations.sh          # about three hours on an RTX 3060
#     python promote.py --all         # read the results afterwards
#
# Each run appends one row to runs/history.jsonl, so this is re-runnable and
# the results survive the terminal. Nothing here is needed to *use* the model —
# the trained graph is committed under web/model/. This is how the numbers were
# produced, for anyone who wants to check them or try a variation.
#
# One shell running commands in order, deliberately: separate scripts each
# waiting for the GPU need a lock, and a lock built on `pgrep` matches its own
# launcher, which deadlocks silently while the card sits idle. It happened
# twice here before this file looked like this.
set -uo pipefail
cd "$(dirname "$0")/.."

# `set -e` is off: one run failing (an out-of-memory at a larger resolution,
# say) should not throw away the runs after it.
run() { echo "════ $1 ════ $(date '+%H:%M:%S')"; python train.py --tag "$@" || echo "── $1 FAILED" >&2; }

# --- what the training recipe is worth (convnext_tiny, too big to ship) ---
run v2-base                                                     # the recipe
run v2-asis      --set train.overhead_ratio=null                # sample as the data lies
run v2-onlyover  --set train.overhead_ratio=1.0                 # overhead only
run v2-log       --set train.target_space=log1p                 # regress log(1+y)
run v3-288       --set model.img_size=288 train.batch_size=24   # resolution
run v3-mildcrop  --set train.crop_scale_min=0.85                # gentler crop

# --- candidates small enough to ship ---
SMALL="train.epochs=16 train.lr=6.0e-4"
run web-b0       --set model.backbone=efficientnet_b0 $SMALL
run web-mnv3     --set model.backbone=mobilenetv3_large_100 $SMALL
run deploy       --set model.backbone=efficientnet_b0 $SMALL train.select_view=both
run deploy-mnv3  --set model.backbone=mobilenetv3_large_100 $SMALL train.select_view=both
run deploy-mix02 --set model.backbone=efficientnet_b0 $SMALL train.select_view=both \
                       train.overhead_ratio=0.2
run deploy-warp  --set model.backbone=efficientnet_b0 $SMALL train.select_view=both \
                       train.overhead_ratio=0.2 train.perspective=0.35

echo
python promote.py
