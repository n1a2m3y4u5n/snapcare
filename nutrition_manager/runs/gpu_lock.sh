# Serialize training runs on the one GPU.  Source this, then call `gpu_wait`.
#
# The naive version of this — poll until no `train.py` is running, then start —
# has a race that is easy to miss and guaranteed to bite: two queued scripts
# both see the gap between one run ending and the next beginning, and both
# launch. Two trainings then share a 12GB card, each slower than one would have
# been, and if they collide on memory one dies halfway through.
#
# So there are two mechanisms, because they cover different cases:
#
#   gpu_wait_for_pattern  waits for scripts that were started *before* this
#                         mechanism existed and do not take the lock
#   flock                 makes every script that does take it mutually
#                         exclusive, with no polling gap to lose
#
# Use it as:
#     source "$(dirname "$0")/gpu_lock.sh"
#     gpu_wait                       # blocks until the GPU is ours
#     python train.py --tag ...      # ...and stays ours until the script exits

GPU_LOCK_FILE="${GPU_LOCK_FILE:-/tmp/snapcare-gpu.lock}"

gpu_wait_for_pattern() {
    local pattern="$1"
    while pgrep -f "$pattern" >/dev/null; do sleep 30; done
}

gpu_wait() {
    # Anything already running, lock-aware or not.
    for pattern in "train.py --tag" "ablation_v2.sh" "train_web.sh"; do
        gpu_wait_for_pattern "$pattern"
    done
    # Then hold the lock for the rest of this script's life. Descriptor 9 stays
    # open until the shell exits, which is exactly the lifetime we want.
    exec 9>"$GPU_LOCK_FILE"
    flock 9
}
