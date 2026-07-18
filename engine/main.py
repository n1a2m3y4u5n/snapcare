"""eicon: compile a .p source file into pictogram PNGs + a combined PDF.

Usage:
    python main.py <source.p>                # compile into <source-stem>/
    python main.py <source.p> --out DIR      # custom output directory
    python main.py <source.p> --no-pdf       # skip the combined PDF
    python main.py --list                    # list available macros
    python main.py --info                    # manifest summary

Source file format
------------------
Each non-blank line of <source.p> is one pictogram label. Lines starting
with '%' or '#' are comments; '%' anywhere on a line starts an inline
comment to end-of-line.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from PIL import Image

from engine import (   # noqa: E402
    Manifest, parse, render_label, DEFAULT_CANVAS, ParseError,
)

ROOT = Path(__file__).resolve().parent
DICT = ROOT / "dictionary.json"

_SAFE = re.compile(r"[^a-zA-Z0-9_]+")


def _slug(source: str, n: int = 50) -> str:
    s = _SAFE.sub("_", source).strip("_")
    return s[:n] or "label"


def _strip_comments(line: str) -> str:
    for marker in ("%", "#"):
        idx = line.find(marker)
        if idx >= 0:
            line = line[:idx]
    return line.strip()


def _read_labels(src: Path) -> list:
    """Return a list of (line_number, raw_text, parsed_nodes_unset) tuples."""
    out = []
    for lineno, raw in enumerate(src.read_text("utf-8").splitlines(), start=1):
        line = _strip_comments(raw)
        if not line:
            continue
        out.append((lineno, line))
    return out


def _to_rgb_on_white(img: Image.Image) -> Image.Image:
    rgb = Image.new("RGB", img.size, (255, 255, 255))
    rgb.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
    return rgb


def cmd_compile(args, manifest: Manifest) -> int:
    src = Path(args.source)
    if not src.is_file():
        print(f"source not found: {src}", file=sys.stderr)
        return 2

    out = Path(args.out) if args.out else (src.resolve().parent / src.stem)
    out.mkdir(parents=True, exist_ok=True)

    raw_labels = _read_labels(src)
    if not raw_labels:
        print(f"{src}: no label lines found", file=sys.stderr)
        return 1

    rendered = []
    for idx, (lineno, line) in enumerate(raw_labels, start=1):
        try:
            nodes = parse(line, manifest)
        except ParseError as e:
            print(f"{src}:{lineno}: parse error: {e}", file=sys.stderr)
            return 1
        img = render_label(nodes, manifest, panel_size=args.size)
        path = out / f"{idx:02d}_{_slug(line)}.png"
        img.save(path, "PNG")
        rendered.append((path, img))
        print(f"  {path}")

    if not args.no_pdf and rendered:
        pdf = out / f"{src.stem}.pdf"
        pages = [_to_rgb_on_white(img) for _, img in rendered]
        pages[0].save(pdf, "PDF", save_all=True, append_images=pages[1:],
                      resolution=150.0)
        print(f"  {pdf}")

    print(f"\nCompiled {len(rendered)} label(s) from {src} -> {out}")
    return 0


def cmd_list(manifest: Manifest) -> int:
    print(f"Operators ({len(manifest.operators)}):")
    for name, op in sorted(manifest.operators.items()):
        tag = f"cadence x{op.panels}" if op.kind == "cadence" else op.kind
        print(f"  \\{name:<22}  {tag}")
    heads = sorted([c for c in manifest.components.values() if c.role == "head"],
                   key=lambda c: c.name)
    mods = sorted([c for c in manifest.components.values() if c.role == "modifier"],
                  key=lambda c: c.name)
    print(f"\nHeads ({len(heads)}):")
    for c in heads:
        ok = "OK  " if manifest.asset_exists(c) else "MISS"
        print(f"  \\{c.name:<22}  {ok}  {c.description}")
    print(f"\nModifiers ({len(mods)}):")
    for c in mods:
        ok = "OK  " if manifest.asset_exists(c) else "MISS"
        print(f"  \\{c.name:<22}  {ok}  {c.description}")
    return 0


def cmd_info(manifest: Manifest) -> int:
    heads = sum(1 for c in manifest.components.values() if c.role == "head")
    mods = sum(1 for c in manifest.components.values() if c.role == "modifier")
    present = sum(1 for c in manifest.components.values()
                  if manifest.asset_exists(c))
    print(f"canvas:          {manifest.canvas}x{manifest.canvas}")
    print(f"modifier_scale:  {manifest.modifier_scale}")
    print(f"heads:           {heads}")
    print(f"modifiers:       {mods}")
    print(f"operators:       {', '.join(sorted(manifest.operators))}")
    print(f"assets present:  {present}/{len(manifest.components)}")
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(
        prog="eicon",
        description="Compile a .p source file into pictogram PNGs + a combined PDF.",
    )
    p.add_argument("source", nargs="?",
                   help="path to .p source file")
    p.add_argument("--out", help="output directory (default: <source-stem>/)")
    p.add_argument("--size", type=int, default=DEFAULT_CANVAS,
                   help=f"panel size in px (default {DEFAULT_CANVAS})")
    p.add_argument("--no-pdf", action="store_true",
                   help="skip the combined PDF")
    p.add_argument("--dictionary", default=str(DICT),
                   help="path to dictionary.json")
    p.add_argument("--list", action="store_true",
                   help="list available macros and exit")
    p.add_argument("--info", action="store_true",
                   help="print manifest summary and exit")
    args = p.parse_args(argv)

    manifest = Manifest.load(args.dictionary)
    if args.list:
        return cmd_list(manifest)
    if args.info:
        return cmd_info(manifest)
    if not args.source:
        p.error("source file required (or use --list / --info)")
    return cmd_compile(args, manifest)


if __name__ == "__main__":
    raise SystemExit(main())
