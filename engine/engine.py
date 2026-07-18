"""eicon pictogram engine: parse head-modifier macros, render label strips."""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from PIL import Image, ImageDraw, ImageFont


# --------------------------------------------------------------------- manifest

@dataclass(frozen=True)
class Component:
    name: str
    role: str
    category: str
    description: str
    slot: Optional[Tuple[float, float, float, float]] = None


@dataclass(frozen=True)
class Operator:
    name: str
    kind: str                       # "overlay" | "half" | "cadence"
    panels: int = 1
    description: str = ""


class Manifest:
    def __init__(self, data: dict, base_dir: Path):
        self.base_dir = base_dir
        self.canvas = int(data.get("canvas", 512))
        self.frame = data.get("frame", {})
        self.modifier_scale = float(self.frame.get("modifier_scale", 0.67))
        self.components: Dict[str, Component] = {}
        for spec in data.get("heads", []):
            self._add(spec, role="head")
        for spec in data.get("modifiers", []):
            self._add(spec, role="modifier")
        self.operators: Dict[str, Operator] = {
            name: Operator(name=name, kind=op["kind"],
                           panels=int(op.get("panels", 1)),
                           description=op.get("description", ""))
            for name, op in data.get("composition_operators", {}).items()
        }

    def _add(self, spec: dict, role: str) -> None:
        slot = spec.get("slot")
        if slot is not None:
            slot = tuple(float(x) for x in slot)
        c = Component(name=spec["name"], role=role,
                      category=spec["category"],
                      description=spec.get("description", ""),
                      slot=slot)
        if c.name in self.components:
            raise ValueError(f"duplicate component: {c.name}")
        self.components[c.name] = c

    @classmethod
    def load(cls, path: str | Path) -> "Manifest":
        p = Path(path)
        return cls(json.loads(p.read_text("utf-8")), base_dir=p.resolve().parent)

    def get(self, name: str) -> Component:
        if name not in self.components:
            raise KeyError(f"unknown component \\{name}")
        return self.components[name]

    def is_head(self, name: str) -> bool:
        return name in self.components and self.components[name].role == "head"

    def is_modifier(self, name: str) -> bool:
        return name in self.components and self.components[name].role == "modifier"

    def is_operator(self, name: str) -> bool:
        return name in self.operators

    def asset_path(self, c: Component) -> Path:
        return self.base_dir / "assets" / c.role / f"{c.name}.png"

    def asset_exists(self, c: Component) -> bool:
        return self.asset_path(c).is_file()

    def frame_kwargs(self) -> dict:
        return {
            "stroke_ratio": float(self.frame.get("stroke_ratio", 0.025)),
            "corner_ratio": float(self.frame.get("corner_radius_ratio", 0.08)),
            "pad_ratio":    float(self.frame.get("padding_ratio", 0.06)),
        }


# ----------------------------------------------------------------------- parser

class NodeKind:
    HEAD = "head"
    MODIFIER = "modifier"
    OPERATOR = "operator"


@dataclass
class Node:
    name: str
    kind: str
    children: List["Node"] = field(default_factory=list)

    def __repr__(self) -> str:
        if not self.children:
            return f"\\{self.name}"
        return f"\\{self.name}" + "".join(f"{{{c!r}}}" for c in self.children)


class ParseError(ValueError):
    pass


_NAME_RE = re.compile(r"[A-Za-z][A-Za-z0-9_]*")


class _Parser:
    def __init__(self, src: str, manifest: Manifest):
        self.src, self.i, self.n = src, 0, len(src)
        self.m = manifest

    def _ws(self) -> None:
        while self.i < self.n:
            c = self.src[self.i]
            if c.isspace():
                self.i += 1
            elif c == "%":
                while self.i < self.n and self.src[self.i] != "\n":
                    self.i += 1
            else:
                return

    def _peek(self) -> str:
        return self.src[self.i] if self.i < self.n else ""

    def _name(self) -> str:
        m = _NAME_RE.match(self.src, self.i)
        if not m:
            raise ParseError(f"expected macro name at position {self.i}")
        self.i = m.end()
        return m.group(0)

    def _slots(self) -> List[Node]:
        out: List[Node] = []
        while self._peek() == "{":
            self.i += 1
            self._ws()
            out.append(self._pictogram(in_slot=True))
            self._ws()
            if self._peek() != "}":
                raise ParseError(f"expected '}}' at position {self.i}")
            self.i += 1
        return out

    def _pictogram(self, in_slot: bool = False) -> Node:
        if self._peek() != "\\":
            raise ParseError(f"expected '\\' at position {self.i}")
        self.i += 1
        name = self._name()

        if self.m.is_operator(name):
            if self._peek() != "{":
                raise ParseError(f"\\{name} requires a child: \\{name}{{...}}")
            self.i += 1
            self._ws()
            child = self._pictogram()
            self._ws()
            if self._peek() != "}":
                raise ParseError(f"expected '}}' to close \\{name}")
            self.i += 1
            return Node(name=name, kind=NodeKind.OPERATOR, children=[child])

        if self.m.is_head(name):
            children = self._slots()
            for c in children:
                if c.kind != NodeKind.MODIFIER:
                    raise ParseError(
                        f"\\{name} slots only accept modifiers; got \\{c.name}"
                    )
            return Node(name=name, kind=NodeKind.HEAD, children=children)

        if self.m.is_modifier(name):
            if not in_slot:
                raise ParseError(
                    f"\\{name} is a modifier; must appear inside a head's slot"
                )
            return Node(name=name, kind=NodeKind.MODIFIER)

        raise ParseError(f"unknown macro \\{name}")

    def parse(self) -> List[Node]:
        out: List[Node] = []
        self._ws()
        while self.i < self.n:
            out.append(self._pictogram())
            self._ws()
        return out


def parse(source: str, manifest: Manifest) -> List[Node]:
    return _Parser(source, manifest).parse()


# ------------------------------------------------------------------- rendering

DEFAULT_CANVAS = 512
DEFAULT_GAP = 32
BG = (0, 0, 0, 0)
INK = (0, 0, 0, 255)
ABOVE_STRIP = 0.22                  # fraction of head area reserved for the
                                    # row of "extra" modifiers above the head


_FONT_CACHE: dict = {}


def _font(px: int) -> ImageFont.ImageFont:
    if px in _FONT_CACHE:
        return _FONT_CACHE[px]
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
              "C:/Windows/Fonts/arial.ttf"):
        if os.path.isfile(p):
            _FONT_CACHE[px] = ImageFont.truetype(p, px)
            return _FONT_CACHE[px]
    _FONT_CACHE[px] = ImageFont.load_default()
    return _FONT_CACHE[px]


def _blank(size: int) -> Image.Image:
    return Image.new("RGBA", (size, size), BG)


def _draw_frame(img: Image.Image, **kw) -> None:
    w, h = img.size
    s = max(2, int(min(w, h) * kw["stroke_ratio"]))
    pad = int(min(w, h) * kw["pad_ratio"] * 0.4)
    r = int(min(w, h) * kw["corner_ratio"])
    ImageDraw.Draw(img).rounded_rectangle(
        (pad, pad, w - pad - 1, h - pad - 1),
        radius=r, outline=INK, width=s,
    )


def _content_box(size: int, pad_ratio: float) -> Tuple[int, int, int, int]:
    pad = int(size * (pad_ratio + 0.05))
    return (pad, pad, size - pad, size - pad)


def _fit(asset: Image.Image, box: Tuple[int, int, int, int]
         ) -> Tuple[Image.Image, Tuple[int, int]]:
    x0, y0, x1, y1 = box
    bw, bh = max(1, x1 - x0), max(1, y1 - y0)
    aw, ah = asset.size
    scale = min(bw / aw, bh / ah)
    nw, nh = max(1, int(aw * scale)), max(1, int(ah * scale))
    resized = asset.resize((nw, nh), Image.LANCZOS)
    return resized, (x0 + (bw - nw) // 2, y0 + (bh - nh) // 2)


def _overlay_cross(img: Image.Image, stroke_ratio: float = 0.06) -> None:
    w, h = img.size
    s = max(4, int(min(w, h) * stroke_ratio))
    inset = int(min(w, h) * 0.12)
    d = ImageDraw.Draw(img)
    d.line((inset, inset, w - inset, h - inset), fill=INK, width=s)
    d.line((inset, h - inset, w - inset, inset), fill=INK, width=s)


def _overlay_half(img: Image.Image) -> None:
    """Make the right half of the panel transparent — visual 'half a dose'."""
    w, h = img.size
    img.paste(Image.new("RGBA", (w - w // 2, h), (0, 0, 0, 0)), (w // 2, 0))


def _placeholder(size: int, macro: str, label: str = "") -> Image.Image:
    img = _blank(size)
    d = ImageDraw.Draw(img)
    pad = int(size * 0.12)
    for x in range(-size, size * 2, 18):
        d.line((x, 0, x + size, size), fill=(0, 0, 0, 50), width=1)
    d.rectangle((pad, pad, size - pad, size - pad),
                outline=INK, width=max(2, size // 80))
    d.text((size / 2, size * 0.40), "MISSING ASSET",
           fill=INK, font=_font(int(size * 0.08)), anchor="mm")
    d.text((size / 2, size * 0.52), f"\\{macro}",
           fill=INK, font=_font(int(size * 0.05)), anchor="mm")
    if label:
        d.text((size / 2, size * 0.62), label[:32],
               fill=INK, font=_font(int(size * 0.05)), anchor="mm")
    return img


def _load(manifest: Manifest, c: Component, size: int) -> Image.Image:
    if manifest.asset_exists(c):
        return Image.open(manifest.asset_path(c)).convert("RGBA")
    return _placeholder(size, c.name, c.description)


def _render_head(manifest: Manifest, node: Node, size: int) -> Image.Image:
    """
    Layout:
        - 1st modifier  -> inside head's `slot`, centered on the slot,
                           sized to panel_size * modifier_scale (default 0.67)
        - 2nd+ modifiers -> horizontal row in the top strip ABOVE the head
                            (head is shrunk vertically to make room)
    """
    panel = _blank(size)
    fk = manifest.frame_kwargs()
    _draw_frame(panel, **fk)
    cx0, cy0, cx1, cy1 = _content_box(size, fk["pad_ratio"])

    first_mod = node.children[0] if node.children else None
    extras = node.children[1:]

    above_h = int((cy1 - cy0) * ABOVE_STRIP) if extras else 0
    head_box = (cx0, cy0 + above_h, cx1, cy1)

    head = manifest.get(node.name)
    resized, origin = _fit(_load(manifest, head, size), head_box)
    panel.alpha_composite(resized, origin)

    if first_mod:
        rx0, ry0, rx1, ry1 = head.slot or (0.25, 0.30, 0.75, 0.70)
        slot_cx = origin[0] + int(((rx0 + rx1) / 2) * resized.size[0])
        slot_cy = origin[1] + int(((ry0 + ry1) / 2) * resized.size[1])
        mod_side = int(size * manifest.modifier_scale)
        mod_box = (slot_cx - mod_side // 2, slot_cy - mod_side // 2,
                   slot_cx + mod_side // 2, slot_cy + mod_side // 2)
        mod = manifest.get(first_mod.name)
        m_img = _load(manifest, mod, mod_side)
        m_resized, m_origin = _fit(m_img, mod_box)
        panel.alpha_composite(m_resized, m_origin)

    if extras:
        n = len(extras)
        gap = max(2, int(size * 0.01))
        avail_w = cx1 - cx0
        ext_side = max(32, min(above_h - 4,
                               (avail_w - gap * (n - 1)) // n))
        row_w = n * ext_side + (n - 1) * gap
        x = cx0 + (avail_w - row_w) // 2
        y = cy0 + (above_h - ext_side) // 2
        for child in extras:
            mod = manifest.get(child.name)
            m_img = _load(manifest, mod, ext_side)
            m_resized, m_origin = _fit(m_img, (x, y, x + ext_side, y + ext_side))
            panel.alpha_composite(m_resized, m_origin)
            x += ext_side + gap

    return panel


def _render_cadence(manifest: Manifest, op: Operator, child: Node,
                    size: int, gap: int) -> Image.Image:
    n = max(1, op.panels)
    outer = _blank(size)
    fk = manifest.frame_kwargs()
    _draw_frame(outer, **fk)
    cx0, cy0, cx1, cy1 = _content_box(size, fk["pad_ratio"])
    inner_w = (cx1 - cx0 - gap * (n - 1)) // n
    inner_h = cy1 - cy0
    side = min(inner_w, inner_h)
    base_y = cy0 + (inner_h - side) // 2
    for i in range(n):
        outer.alpha_composite(
            render_pictogram(child, manifest, size=side),
            (cx0 + i * (side + gap), base_y),
        )
    return outer


def render_pictogram(node: Node, manifest: Manifest,
                     size: int = DEFAULT_CANVAS,
                     gap: int = DEFAULT_GAP) -> Image.Image:
    if node.kind == NodeKind.HEAD:
        return _render_head(manifest, node, size)
    op = manifest.operators[node.name]
    if op.kind == "cadence":
        return _render_cadence(manifest, op, node.children[0], size, gap)
    panel = render_pictogram(node.children[0], manifest, size=size, gap=gap)
    if op.kind == "overlay":
        _overlay_cross(panel)
    elif op.kind == "half":
        _overlay_half(panel)
    return panel


def render_label(nodes: List[Node], manifest: Manifest,
                 panel_size: int = DEFAULT_CANVAS,
                 gap: int = DEFAULT_GAP) -> Image.Image:
    """A label is a horizontal row of pictogram panels. Step order is
    conveyed by left-to-right placement; no numeric or textual captions
    appear in the output, because the target audience is illiterate."""
    if not nodes:
        return _blank(panel_size)
    n = len(nodes)
    total_w = n * panel_size + (n - 1) * gap
    strip = Image.new("RGBA", (total_w, panel_size), BG)
    for i, node in enumerate(nodes):
        panel = render_pictogram(node, manifest, size=panel_size, gap=gap)
        strip.paste(panel, (i * (panel_size + gap), 0), panel)
    return strip
