# Wait for the GPU to be free.  Source this, then call `gpu_wait`.
#
# The obvious spelling of this is a bug, and it deadlocks rather than racing.
#
#     while pgrep -f "train.py --tag" >/dev/null; do sleep 30; done
#
# `pgrep -f` matches the *whole command line* of every process, and the shell
# that launched this script has the text of this script — including that very
# pattern — somewhere in its own arguments. So the loop matches its own
# launcher, the launcher never exits, and the wait never ends. Nothing appears
# to be wrong: the GPU sits idle and the script waits politely forever.
#
# Two rules avoid it. Anchor the pattern to what a real training process
# actually looks like (`^python train.py`, which a bash wrapper can never
# match), and never wait on a string that appears in the waiting script.
#
#     source "$(dirname "$0")/gpu_lock.sh"
#     gpu_wait
#     python train.py --tag ...

# Anchored so it matches the interpreter and its dataloader workers, and
# nothing that merely mentions them.
GPU_BUSY_PATTERN='^python train\.py'

gpu_wait() {
    while pgrep -f "$GPU_BUSY_PATTERN" >/dev/null; do sleep 20; done
    # A moment for the previous process to release its CUDA context before the
    # next one asks for memory.
    sleep 5
}

# Sanity check: this must not match the shell running it. If it ever does, the
# wait would be an infinite loop rather than a slow one, so fail loudly instead.
if pgrep -f "$GPU_BUSY_PATTERN" | grep -qx "$$"; then
    echo "gpu_lock.sh: the busy pattern matches this shell; it would deadlock" >&2
    exit 1
fi
