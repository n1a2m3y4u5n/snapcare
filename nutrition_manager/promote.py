"""Choose the model the app ships, and install it.

    python promote.py                    # show the candidates and what would win
    python promote.py --install          # ...and actually replace web/model/

Without this, "use the best model" means reading a table, picking a row,
remembering the right export incantation, and copying two files under the right
names. Every one of those is a step someone gets wrong at 2am, and getting it
wrong is silent — the app keeps working and is just worse.

What "best" means here
----------------------
Ranked by the **mean of the overhead and side-angle validation scores**, not by
the headline test number.

That needs justifying, because it is not the metric the README leads with. The
published Nutrition5k protocol scores overhead frames only — one photograph
taken from directly above the plate — and optimising for it produces a model
that is measurably worse at the thing the app does. The extreme case is in
`runs/history.jsonl`: training on overhead frames alone wins the benchmark by
0.6 points and is 25 points worse off-axis. Nobody holds a phone above their
dinner, so a deployment chooser that ranked on the benchmark would reliably
pick the wrong model.

Both numbers are printed either way, and `--rank overhead` is there for
reproducing a published comparison.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import resolve  # noqa: E402

HISTORY = resolve("runs", "history.jsonl")
MODEL_DIR = resolve("web", "model")


def load_runs() -> list[dict]:
    if not HISTORY.is_file():
        raise SystemExit(f"no runs recorded: {HISTORY}")
    return [json.loads(line) for line in HISTORY.read_text().splitlines() if line.strip()]


def views_of(run: dict) -> tuple[float | None, float | None]:
    by_view = run.get("val_by_view") or {}
    overhead = by_view.get("overhead", run.get("val_mean_mae_pct"))
    return overhead, by_view.get("side")


def score_of(run: dict, rank: str) -> float:
    overhead, side = views_of(run)
    if overhead is None:
        return float("inf")
    if rank == "overhead" or side is None:
        return float(overhead)
    return (float(overhead) + float(side)) / 2.0


def deployable(run: dict, max_params_m: float) -> bool:
    """Is this a model a phone could reasonably download?

    Size is a hard filter rather than part of the ranking, because the two are
    not exchangeable: convnext_tiny is the most accurate thing here and is 111MB
    of float32, which is not a download to hand someone on the connection this
    app exists for. A weighted score would let accuracy buy megabytes without
    limit.
    """
    params = run.get("params_m")
    return params is not None and params <= max_params_m


def latest_per_tag(runs: list[dict]) -> list[dict]:
    """A tag retrained keeps only its most recent result."""
    seen = {}
    for run in runs:
        seen[run.get("tag")] = run
    return list(seen.values())


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    ap.add_argument("--rank", choices=["both", "overhead"], default="both",
                    help="'both' (default) averages the two camera views; "
                         "'overhead' reproduces the published protocol")
    ap.add_argument("--max-params-m", type=float, default=8.0,
                    help="largest model to consider shipping, in millions")
    ap.add_argument("--install", action="store_true",
                    help="export the winner and replace web/model/")
    ap.add_argument("--name", default="web", help="basename for the installed files")
    args = ap.parse_args()

    runs = latest_per_tag(load_runs())
    candidates = [r for r in runs if deployable(r, args.max_params_m)]
    if not candidates:
        raise SystemExit(
            f"no run has <= {args.max_params_m}M parameters. "
            "Train a small backbone, e.g. --set model.backbone=efficientnet_b0"
        )
    candidates.sort(key=lambda r: score_of(r, args.rank))

    print(f"Candidates at most {args.max_params_m:.0f}M parameters, "
          f"ranked by {'mean of both views' if args.rank == 'both' else 'overhead only'}:\n")
    print(f"{'tag':<16}{'backbone':<24}{'M':>6}{'overhead':>10}{'side':>8}{'rank':>8}")
    print("-" * 72)
    for run in candidates:
        overhead, side = views_of(run)
        print(f"{run.get('tag', '?'):<16}{run.get('backbone', '?'):<24}"
              f"{run.get('params_m', 0):>6.1f}"
              f"{overhead:>10.2f}"
              f"{('-' if side is None else f'{side:.2f}'):>8}"
              f"{score_of(run, args.rank):>8.2f}")

    winner = candidates[0]
    checkpoint = resolve("checkpoints", winner.get("checkpoint", f"{winner['tag']}.pt"))
    print(f"\nwinner: {winner['tag']}  ({checkpoint.name})")

    installed = MODEL_DIR / f"{args.name}.json"
    if installed.is_file():
        current = json.loads(installed.read_text())
        print(f"installed: {current.get('source_checkpoint', '?')} "
              f"({current.get('backbone', '?')})")
        if current.get("source_checkpoint") == checkpoint.name:
            print("\nThe installed model is already the winner; nothing to do.")
            return 0

    if not args.install:
        print("\nRe-run with --install to export it and replace web/model/.")
        return 0

    if not checkpoint.is_file():
        raise SystemExit(f"checkpoint missing: {checkpoint}")

    # Export freshly rather than trusting whatever is in export/. The scoring
    # step is the part that matters: it is what caught int8 quantization
    # silently multiplying one backbone's error by two and a half, and a
    # promotion that skipped it could install exactly that.
    print(f"\nExporting and scoring {checkpoint.name}...")
    result = subprocess.run(
        [sys.executable, str(resolve("export_onnx.py")),
         "--checkpoint", str(checkpoint), "--name", args.name, "--quantize", "--score"],
        cwd=str(resolve(".")),
    )
    if result.returncode != 0:
        raise SystemExit("export failed; nothing installed")

    meta_path = resolve("export", f"{args.name}.json")
    meta = json.loads(meta_path.read_text())
    recommended = meta.get("recommended", "float32")
    graph = resolve("export", meta["artifacts"][recommended]["file"])

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    # Clear any previously installed graph: the recommended variant can change
    # between models, and leaving a stale .int8.onnx beside a float32 manifest
    # is exactly the sort of thing someone later "fixes" by pointing at it.
    for stale in MODEL_DIR.glob(f"{args.name}*.onnx"):
        stale.unlink()
    shutil.copy2(graph, MODEL_DIR / graph.name)
    shutil.copy2(meta_path, MODEL_DIR / meta_path.name)

    size_mb = (MODEL_DIR / graph.name).stat().st_size / 1e6
    print(f"\nInstalled {graph.name} ({recommended}, {size_mb:.1f} MB) into {MODEL_DIR}")
    print("Commit it, then copy web/model/* into the app's public/models/.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
