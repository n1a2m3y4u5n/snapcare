#!/usr/bin/env bash
# Every remaining training run, in one process, in priority order.
#
# One sequential script rather than several queued ones. Separate scripts each
# waiting for the GPU need a lock, and a lock built on `pgrep` needs to not
# match its own launcher — which is a bug that presents as the GPU sitting idle
# while everything waits politely forever. A single `&&`-free sequence of
# commands in one shell cannot race with itself.
#
# Ordered so that the runs the app depends on come before the ones that only
# answer a question, since the tail may not finish:
#
#   deploy        the model the app ships: small enough for a browser, chosen
#                 on both camera views rather than the flattering one. Exports
#                 and scores at the end, so what lands in export/ is measured.
#   web-b0        what a small backbone costs on the published protocol
#   web-mnv3      ...and whether an even smaller one is usable
#   v3-*          resolution and crop strength, the two open questions
#
# Run:  bash runs/queue.sh          (from anywhere)
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."

# shellcheck source=runs/gpu_lock.sh
source "$HERE/gpu_lock.sh"

# `set -e` is deliberately off: one run failing (an out-of-memory at a larger
# resolution, say) should not throw away the runs after it.
run() {
    local tag="$1"; shift
    echo "════════ $tag ════════  $(date '+%H:%M:%S')"
    gpu_wait
    if python train.py --tag "$tag" "$@"; then
        echo "── $tag finished"
    else
        echo "── $tag FAILED (continuing)" >&2
    fi
}

gpu_wait   # let whatever is already training finish

run deploy    --set model.backbone=efficientnet_b0 train.epochs=16 \
                   train.lr=6.0e-4 train.select_view=both
echo "── exporting the deployment model"
python eval.py --checkpoint checkpoints/deploy.pt || true
python export_onnx.py --checkpoint checkpoints/deploy.pt --name web --quantize --score || true

run web-b0    --set model.backbone=efficientnet_b0 train.epochs=14 train.lr=6.0e-4
run web-mnv3  --set model.backbone=mobilenetv3_large_100 train.epochs=14 train.lr=6.0e-4
run v3-288      --set model.img_size=288 train.batch_size=24
run v3-mildcrop --set train.crop_scale_min=0.85
run v3-288-mild --set model.img_size=288 train.batch_size=24 train.crop_scale_min=0.85

echo
python runs/summarize.py
