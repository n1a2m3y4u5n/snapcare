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


def _overlay_cross(img: Image.Image, stroke_ratio: float = 0.075) -> None:
    """금지 — 테두리 원과 사선 하나.

    예전에는 굵은 X 두 획을 판 전체에 그었다. 주어가 하나일 때는 읽혔지만 알레르겐처럼
    안쪽 형태가 촘촘한 그림 위에서는 밑그림을 통째로 덮어, 세 장을 나란히 놓으면 전부
    같은 X 로 보였다 — 무엇을 피하라는 것인지가 사라지면 이 기호는 뜻이 없다.

    금지 표지가 세계 어디서나 원 + 사선 하나인 데는 이유가 있다. 획이 하나면 가려지는
    면적이 절반이고, 원이 '금지' 를 맡아주므로 사선을 더 굵게 그릴 필요도 없다.
    사선 양옆에 투명한 틈을 둬서 밑그림과 겹쳐도 서로 뭉개지지 않게 한다.
    """
    w, h = img.size
    side = min(w, h)
    s = max(4, int(side * stroke_ratio))
    gap = max(2, int(s * 0.45))
    cx, cy = w // 2, h // 2
    r = int(side * 0.40)

    d = ImageDraw.Draw(img)
    # ① 사선이 지나갈 자리를 먼저 비운다 (밑그림과 붙어 읽히지 않게)
    for shape in (
        lambda dd, wdt: dd.ellipse((cx - r, cy - r, cx + r, cy + r), outline=BG, width=wdt),
        lambda dd, wdt: dd.line((cx - r * 0.72, cy + r * 0.72, cx + r * 0.72, cy - r * 0.72),
                                fill=BG, width=wdt),
    ):
        shape(d, s + gap * 2)
    # ② 그 위에 기호를 그린다
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=INK, width=s)
    d.line((cx - r * 0.72, cy + r * 0.72, cx + r * 0.72, cy - r * 0.72), fill=INK, width=s)


def _overlay_half(img: Image.Image) -> None:
    """'절반' — 가운데를 가르는 절개선.

    예전에는 오른쪽 절반을 통째로 지웠다. 그러면 남는 것이 온전한 형태가 아니라
    잘린 조각이라 무엇의 절반인지 알 수 없고, 잉크에 맞춰 자르는 단계가 그 조각에
    다시 맞춰지면서 확대돼 화면 밖으로 밀려났다. 형태는 남기고 갈라진 자리를 보인다.
    """
    w, h = img.size
    d = ImageDraw.Draw(img)
    # 절개선은 테두리 안에서 끝나야 한다. 패널 높이 전체에 그으면 프레임을 뚫고 나가
    # 그림이 아니라 종이가 잘린 것처럼 보인다.
    y0 = int(h * HALF_INSET)
    y1 = h - y0
    gap = max(2, int(w * 0.045))
    d.rectangle((w // 2 - gap // 2, y0, w // 2 + gap // 2, y1), fill=(0, 0, 0, 0))
    dash = max(2, int(h * 0.055))
    for y in range(y0, y1, dash * 2):
        d.rectangle((w // 2 - gap // 6, y, w // 2 + gap // 6, min(y + dash, y1)), fill=INK)


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


#: 수식어의 하한 (패널 대비).
#: 예전에는 0.30 이었는데, 그 하한이 슬롯보다 커지면 수식어를 앉히려고 뚫는 창이
#: head 자체를 먹어버렸다 — 흡입기의 캐니스터와 좌약이 통째로 사라졌다.
#: 수식어는 슬롯 안에 들어가야 하고, 작아서 안 보인다면 고칠 것은 슬롯 쪽이다.
MIN_MOD_RATIO = 0.14

#: 잉크를 잘라낸 뒤 사방에 남기는 여백 (잘린 변의 비율)
TRIM_MARGIN = 0.05

#: 절반 절개선이 위아래로 물러나는 비율 (프레임 안에서 끝나게)
HALF_INSET = 0.13

#: 프레임 안에서 head 를 들여 놓는 비율.
#: 잉크에 맞춰 자르기 시작하면서 글리프가 테두리에 닿을 만큼 커졌다 — 예전에는
#: 512 캔버스에 그려둔 여백이 그 역할을 했다. 그 여백을 여기서 명시적으로 준다.
HEAD_INSET = 0.10


def _trim(img: Image.Image, slot=None):
    """글리프 PNG 의 빈 여백을 잘라내고, 슬롯 좌표를 잘린 좌표계로 옮긴다.

    글리프는 512 정사각 캔버스에 그려지지만 잉크는 그 일부만 차지한다. 캔버스를 그대로
    칸에 맞추면 여백까지 함께 맞춰지므로, 납작한 글리프(캡슐 등)는 칸 안에서 얇은 띠가
    되고 반복 칸처럼 작은 자리에서는 무엇인지 알아볼 수 없게 된다. 잉크에 맞춰 자르면
    글리프의 원래 비례와 무관하게 칸을 채운다.

    슬롯은 캔버스 기준 비율이라 함께 옮겨주지 않으면 수식어가 엉뚱한 곳에 붙는다.
    """
    box = img.getbbox()
    if box is None:
        return img, slot
    bx0, by0, bx1, by1 = box
    w, h = img.size
    m = int(max(bx1 - bx0, by1 - by0) * TRIM_MARGIN)
    cropped = img.crop(box)
    out = Image.new("RGBA", (cropped.size[0] + 2 * m, cropped.size[1] + 2 * m), (0, 0, 0, 0))
    out.alpha_composite(cropped, (m, m))

    if slot is None:
        return out, None
    rx0, ry0, rx1, ry1 = slot
    ow, oh = out.size
    remap = (
        (rx0 * w - bx0 + m) / ow, (ry0 * h - by0 + m) / oh,
        (rx1 * w - bx0 + m) / ow, (ry1 * h - by0 + m) / oh,
    )
    return out, remap


def _load(manifest: Manifest, c: Component, size: int) -> Image.Image:
    if manifest.asset_exists(c):
        return Image.open(manifest.asset_path(c)).convert("RGBA")
    return _placeholder(size, c.name, c.description)


def _render_head(manifest: Manifest, node: Node, size: int, framed: bool = True) -> Image.Image:
    """
    Layout:
        - 1st modifier  -> inside head's `slot`, centered on the slot,
                           sized to panel_size * modifier_scale (default 0.67)
        - 2nd+ modifiers -> horizontal row in the top strip ABOVE the head
                            (head is shrunk vertically to make room)
    """
    panel = _blank(size)
    fk = manifest.frame_kwargs()
    if framed:
        _draw_frame(panel, **fk)
    cx0, cy0, cx1, cy1 = _content_box(size, fk["pad_ratio"] if framed else 0.0)

    first_mod = node.children[0] if node.children else None
    extras = node.children[1:]

    above_h = int((cy1 - cy0) * ABOVE_STRIP) if extras else 0
    inset = int(min(cx1 - cx0, cy1 - cy0) * HEAD_INSET) if framed else 0
    head_box = (cx0 + inset, cy0 + above_h + inset, cx1 - inset, cy1 - inset)

    head = manifest.get(node.name)
    head_img, head_slot = _trim(_load(manifest, head, size), head.slot)
    resized, origin = _fit(head_img, head_box)
    panel.alpha_composite(resized, origin)

    if first_mod:
        # 수식어 크기는 **슬롯**에서 나온다. 예전에는 패널 크기의 modifier_scale 만큼
        # 그렸는데, 사전이 head 마다 정의해둔 slot 사각형의 중심만 쓰고 크기는 버린 셈이라
        # 납작한 head(캡슐 등)는 수식어에 통째로 덮여 십자 모양으로 뭉쳤다.
        rx0, ry0, rx1, ry1 = head_slot or (0.25, 0.30, 0.75, 0.70)
        slot_cx = origin[0] + int(((rx0 + rx1) / 2) * resized.size[0])
        slot_cy = origin[1] + int(((ry0 + ry1) / 2) * resized.size[1])
        slot_side = min((rx1 - rx0) * resized.size[0], (ry1 - ry0) * resized.size[1])
        # 너무 작아지면 안에 무엇이 들었는지 알 수 없으므로 패널 대비 하한을 둔다.
        mod_side = max(int(slot_side * manifest.modifier_scale), int(size * MIN_MOD_RATIO))
        mod_box = (slot_cx - mod_side // 2, slot_cy - mod_side // 2,
                   slot_cx + mod_side // 2, slot_cy + mod_side // 2)
        # 슬롯 자리를 먼저 뚫는다.
        # 글리프가 채운 실루엣이라 검은 바탕에 검은 수식어를 얹으면 그대로 사라진다 —
        # 좌약 안의 달이 보이지 않던 이유다. pill_bottle 만 라벨 구멍이 있어 우연히 동작했다.
        # 뚫는 것은 합성할 때만 한다. 낱개 글리프는 제 모습을 유지해야 하기 때문이다.
        sx0 = origin[0] + int(rx0 * resized.size[0])
        sy0 = origin[1] + int(ry0 * resized.size[1])
        sx1 = origin[0] + int(rx1 * resized.size[0])
        sy1 = origin[1] + int(ry1 * resized.size[1])
        # 창은 슬롯 그대로다. 수식어에 맞춰 넓히면 head 를 파먹는다.
        pad = int(mod_side * 0.08)
        win = (sx0 - pad, sy0 - pad, sx1 + pad, sy1 + pad)
        # 모서리를 넉넉히 둥글린다. 각진 창은 둥근 head(정제 등)를 베어낸 것처럼 보인다.
        ImageDraw.Draw(panel).rounded_rectangle(
            win, radius=int(min(win[2] - win[0], win[3] - win[1]) * 0.22), fill=(0, 0, 0, 0))

        mod = manifest.get(first_mod.name)
        m_img, _ = _trim(_load(manifest, mod, mod_side))
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
            m_img, _ = _trim(_load(manifest, mod, ext_side))
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

    # 반복을 가로로 늘어놓을지 세로로 쌓을지는 글리프의 비례가 정한다.
    # 예전에는 늘 가로로 늘어놓고 칸을 정사각형으로 잡았는데, 그러면 세로 공간이
    # 통째로 남고 납작한 글리프(캡슐 등)는 칸 폭에 갇혀 얇은 띠가 됐다.
    # 넓은 것은 위아래로 쌓아야 폭을 다 쓴다.
    stacked = _is_wide(manifest, child)
    if stacked:
        cell_w = cx1 - cx0
        cell_h = (cy1 - cy0 - gap * (n - 1)) // n
    else:
        cell_w = (cx1 - cx0 - gap * (n - 1)) // n
        cell_h = cy1 - cy0

    for i in range(n):
        # 안쪽 칸은 프레임을 그리지 않는다. 바깥 프레임 안에 또 테두리가 생기면
        # 상자 속 상자로 보이고, 작은 칸에서는 그 테두리가 내용을 먹는다.
        cell = render_pictogram(child, manifest, size=max(cell_w, cell_h), framed=False)
        # 렌더 결과도 정사각 캔버스라, 그대로 칸에 맞추면 남은 여백까지 함께 맞춰져
        # 다시 칸 비율만큼 줄어든다. 잉크에 맞춰 자른 뒤에 넣는다.
        trimmed, _ = _trim(cell)
        fitted, off = _fit(trimmed, (0, 0, cell_w, cell_h))
        x = cx0 + (0 if stacked else i * (cell_w + gap)) + off[0]
        y = cy0 + (i * (cell_h + gap) if stacked else 0) + off[1]
        outer.alpha_composite(fitted, (x, y))
    return outer


def _is_wide(manifest: Manifest, node: Node) -> bool:
    """이 글리프가 세로보다 가로로 긴가. 잉크 기준으로 본다."""
    if node.kind != NodeKind.HEAD:
        return False
    img, _ = _trim(_load(manifest, manifest.get(node.name), DEFAULT_CANVAS))
    return img.size[0] > img.size[1] * 1.25


def render_pictogram(node: Node, manifest: Manifest,
                     size: int = DEFAULT_CANVAS,
                     gap: int = DEFAULT_GAP,
                     framed: bool = True) -> Image.Image:
    if node.kind == NodeKind.HEAD:
        return _render_head(manifest, node, size, framed=framed)
    op = manifest.operators[node.name]
    if op.kind == "cadence":
        return _render_cadence(manifest, op, node.children[0], size, gap)
    panel = render_pictogram(node.children[0], manifest, size=size, gap=gap, framed=framed)
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
