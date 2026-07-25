"""Print runs/history.jsonl as a table.

Every training run appends one row. This turns the pile into something you can
read, which is the difference between having ablations and having used them.

Ranked by the **overhead** score rather than by each run's own selection
metric. Those are not the same number once `train.select_view` exists: a run
selected on `both` reports the average of two views, and sorting a mixed table
by that column would rank a model against a different measurement and call it
better. The overhead column is the one every run has and the one the published
protocol uses, so it is the only fair ordering — and the side column is printed
beside it, because the gap between them is the difference between the benchmark
and the way the app is actually held.
"""
import json
import sys
from pathlib import Path

HISTORY = Path(__file__).resolve().parent / "history.jsonl"


def overhead_of(row: dict) -> float:
    """The overhead validation score, whatever the run was selected on."""
    by_view = row.get("val_by_view") or {}
    if "overhead" in by_view:
        return float(by_view["overhead"])
    # Runs that predate per-view reporting only have the single number, and it
    # was overhead by definition.
    return float(row.get("val_mean_mae_pct", float("inf")))


def side_of(row: dict):
    by_view = row.get("val_by_view") or {}
    return by_view.get("side")


def main():
    if not HISTORY.is_file():
        sys.exit(f"no runs yet: {HISTORY}")
    rows = [json.loads(line) for line in HISTORY.read_text().splitlines() if line.strip()]
    if not rows:
        sys.exit(f"no runs recorded in {HISTORY}")
    rows.sort(key=overhead_of)

    header = (f"{'tag':<14}{'backbone':<22}{'px':>5}{'over%':>7}{'crop':>6}"
              f"{'sel':>9}{'M':>7}{'min':>7}{'overhead':>10}{'side':>8}")
    print(header)
    print("-" * len(header))
    for r in rows:
        side = side_of(r)
        print(
            f"{r.get('tag', '?'):<14}"
            f"{r.get('backbone', '?'):<22}"
            f"{r.get('img_size', '-'):>5}"
            f"{('-' if r.get('overhead_ratio') is None else r['overhead_ratio']):>7}"
            f"{r.get('crop_scale_min', '-'):>6}"
            f"{r.get('select_view', 'overhead'):>9}"
            f"{r.get('params_m', '-'):>7}"
            f"{r.get('minutes', '-'):>7}"
            f"{overhead_of(r):>10.2f}"
            f"{('-' if side is None else f'{side:.2f}'):>8}"
        )

    best = rows[0]
    print(f"\nbest on overhead: {best['tag']}  "
          f"(epoch {best.get('epoch', '?')}, {best.get('checkpoint', '?')})")
    for key, value in (best.get("val_fields") or {}).items():
        if key.endswith("_%"):
            print(f"  {key:<16}{value:6.1f}%")

    side = side_of(best)
    if side is not None:
        gap = side - overhead_of(best)
        print(f"  overhead {overhead_of(best):.2f}   side {side:.2f}   gap {gap:+.2f} points")
        print("  (the benchmark scores overhead only; the app is not held that way)")


if __name__ == "__main__":
    main()
