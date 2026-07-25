"""Print runs/history.jsonl as a table, best first.

Every training run appends one row. This turns the pile into something you can
read, which is the difference between having ablations and having used them.
"""
import json
import sys
from pathlib import Path

HISTORY = Path(__file__).resolve().parent / "history.jsonl"

COLUMNS = [
    ("tag", "tag", "{}", 14),
    ("backbone", "backbone", "{}", 16),
    ("img_size", "px", "{}", 5),
    ("target_space", "space", "{}", 9),
    ("overhead_ratio", "over%", "{}", 7),
    ("epochs", "ep", "{}", 4),
    ("params_m", "M", "{}", 7),
    ("minutes", "min", "{}", 6),
    ("val_mean_mae_pct", "val MAE%", "{:.2f}", 9),
]


def main():
    if not HISTORY.is_file():
        sys.exit(f"no runs yet: {HISTORY}")
    rows = [json.loads(line) for line in HISTORY.read_text().splitlines() if line.strip()]
    rows.sort(key=lambda r: r.get("val_mean_mae_pct", float("inf")))

    header = "".join(f"{label:<{w}}" for _, label, _, w in COLUMNS)
    print(header)
    print("-" * len(header))
    for r in rows:
        cells = []
        for key, _, fmt, w in COLUMNS:
            v = r.get(key)
            cells.append(f"{('-' if v is None else fmt.format(v)):<{w}}")
        print("".join(cells))

    best = rows[0]
    print(f"\nbest: {best['tag']}  (epoch {best['epoch']}, {best['checkpoint']})")
    for k, v in best.get("val_fields", {}).items():
        if k.endswith("_%"):
            print(f"  {k:<16}{v:6.1f}%")
    by_view = best.get("val_by_view", {})
    if len(by_view) > 1:
        gap = by_view.get("side", 0) - by_view.get("overhead", 0)
        print(f"  overhead/side gap {gap:+.2f} points "
              f"(overhead {by_view.get('overhead', 0):.2f}, side {by_view.get('side', 0):.2f})")


if __name__ == "__main__":
    main()
