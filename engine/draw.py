"""픽토그램을 그리는 도구.

왜 손그림을 버렸나
------------------
에셋이 손으로 그린 스케치였다. 선 굵기가 제각각이고 패스가 열려 있고, 앱에서
40px 남짓으로 줄이면 뭉개진다. 더 큰 문제는 늘릴 수가 없다는 것이다 — 형태소를
하나 더하려면 같은 손으로 같은 톤을 다시 그려야 하고, 그건 재현되지 않는다.

첫 판이 손그림보다 못했던 이유
------------------------------
직선 폴리라인 하나만 갖고 그렸다. 그래서 모든 형태가 다각형이 됐고, 병도 손도
달걀도 각져 보였다. 손그림이 흔들려도 나아 보였던 건 그것들이 곡선이었기 때문이다.
그래서 여기에는 두 가지가 들어간다:

  ① smooth() — 점을 지나는 곡선(Catmull-Rom). 좌표 몇 개로 유기적인 형태가 나온다.
  ② 채운 실루엣 + punch() — 40px 에서 외곽선은 속이 뭉개지지만 채운 형태는 버틴다.
     실제 픽토그램 세트가 쓰는 방식이다. 안쪽 디테일은 구멍으로 낸다.

그림체 규칙
-----------
- 채운 실루엣이 기본. 외곽선은 속이 비어야 뜻이 사는 것(용기, 그릇)에만.
- 안쪽 디테일은 구멍(punch)으로. 얇은 선을 얹으면 작아질 때 먼저 사라진다.
- 획 끝과 꺾임은 둥글게. 뾰족한 끝은 작은 크기에서 먼지처럼 보인다.
- 검정 단색, 배경은 투명. 색은 앱이 상황에 따라 입힌다.
"""

import math

from PIL import Image, ImageDraw

SIZE = 512
SS = 4                      # 슈퍼샘플링 배율 — 크게 그려 줄이면 계단이 사라진다
STROKE = 34                 # 기본 획 굵기 (512 기준). 작게 줄여도 남을 만큼 굵게.
THIN = 22
HAIR = 14
INK = (17, 17, 17, 255)
HOLE = (0, 0, 0, 0)         # ImageDraw 는 픽셀을 덮어쓰므로 투명으로 그리면 구멍이 난다


def catmull(pts, closed: bool, per: int = 24):
    """점들을 지나는 부드러운 곡선. 저작할 때는 점만 찍고 곡선은 여기서 만든다."""
    p = list(pts)
    if closed:
        p = [p[-1]] + p + [p[0], p[1]]
    else:
        p = [p[0]] + p + [p[-1]]

    out = []
    for i in range(len(p) - 3):
        p0, p1, p2, p3 = p[i], p[i + 1], p[i + 2], p[i + 3]
        for j in range(per):
            t = j / per
            t2, t3 = t * t, t * t * t
            out.append((
                0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t
                       + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2
                       + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
                0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t
                       + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2
                       + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
            ))
    if not closed:
        out.append(tuple(p[-1]))
    return out


class Canvas:
    """0~1 정규화 좌표로 그린다. 글리프 정의가 캔버스 크기를 몰라도 되게."""

    def __init__(self) -> None:
        self.img = Image.new("RGBA", (SIZE * SS, SIZE * SS), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)

    def _p(self, x: float, y: float):
        return (x * SIZE * SS, y * SIZE * SS)

    def _w(self, w: float) -> int:
        return max(1, round(w * SS))

    # ── 획 ──────────────────────────────────────────────────
    def _stroke(self, px, w: float, color=INK) -> None:
        self.d.line(px, fill=color, width=self._w(w), joint="curve")
        r = self._w(w) / 2
        for x, y in (px[0], px[-1]):
            self.d.ellipse([x - r, y - r, x + r, y + r], fill=color)

    def path(self, pts, w: float = STROKE, closed: bool = False, color=INK) -> None:
        """직선 폴리라인. 각이 뜻을 갖는 것(상자, 기기)에만 쓴다."""
        px = [self._p(x, y) for x, y in pts]
        if closed:
            px = px + [px[0]]
        self._stroke(px, w, color)

    def smooth(self, pts, w: float = STROKE, closed: bool = False, color=INK) -> None:
        """점을 지나는 곡선 획. 유기적인 형태는 전부 이쪽."""
        px = [self._p(x, y) for x, y in catmull(pts, closed)]
        if closed:
            px = px + [px[0]]
        self._stroke(px, w, color)

    # ── 면 ──────────────────────────────────────────────────
    def blob(self, pts, color=INK) -> None:
        """점을 지나는 곡선으로 닫힌 면. 실루엣의 기본 도구."""
        px = [self._p(x, y) for x, y in catmull(pts, True)]
        self.d.polygon(px, fill=color)

    def poly(self, pts, color=INK) -> None:
        px = [self._p(x, y) for x, y in pts]
        self.d.polygon(px, fill=color)

    def circle(self, cx: float, cy: float, r: float, w: float = STROKE,
               fill: bool = False, color=INK) -> None:
        a, b = self._p(cx - r, cy - r)
        c, e = self._p(cx + r, cy + r)
        if fill:
            self.d.ellipse([a, b, c, e], fill=color)
        else:
            self.d.ellipse([a, b, c, e], outline=color, width=self._w(w))

    def oval(self, cx: float, cy: float, rx: float, ry: float,
             w: float = STROKE, fill: bool = False, color=INK) -> None:
        a, b = self._p(cx - rx, cy - ry)
        c, e = self._p(cx + rx, cy + ry)
        if fill:
            self.d.ellipse([a, b, c, e], fill=color)
        else:
            self.d.ellipse([a, b, c, e], outline=color, width=self._w(w))

    def rect(self, x0: float, y0: float, x1: float, y1: float,
             r: float = 0.04, w: float = STROKE, fill: bool = False, color=INK) -> None:
        a, b = self._p(x0, y0)
        c, e = self._p(x1, y1)
        rr = r * SIZE * SS
        if fill:
            self.d.rounded_rectangle([a, b, c, e], radius=rr, fill=color)
        else:
            self.d.rounded_rectangle([a, b, c, e], radius=rr, outline=color, width=self._w(w))

    def arc(self, cx: float, cy: float, r: float, start: float, end: float,
            w: float = STROKE, color=INK) -> None:
        a, b = self._p(cx - r, cy - r)
        c, e = self._p(cx + r, cy + r)
        self.d.arc([a, b, c, e], start, end, fill=color, width=self._w(w))

    def wedge(self, cx: float, cy: float, r: float, start: float, end: float, color=INK) -> None:
        a, b = self._p(cx - r, cy - r)
        c, e = self._p(cx + r, cy + r)
        self.d.pieslice([a, b, c, e], start, end, fill=color)

    # ── 구멍 ────────────────────────────────────────────────
    # 채운 실루엣에서 속을 파낸다. 얇은 선을 위에 얹는 것보다 작은 크기에서 훨씬 잘 버틴다.
    def hole_circle(self, cx: float, cy: float, r: float) -> None:
        self.circle(cx, cy, r, fill=True, color=HOLE)

    def hole_rect(self, x0: float, y0: float, x1: float, y1: float, r: float = 0.02) -> None:
        self.rect(x0, y0, x1, y1, r=r, fill=True, color=HOLE)

    def hole_path(self, pts, w: float = THIN, smooth: bool = False, closed: bool = False) -> None:
        (self.smooth if smooth else self.path)(pts, w=w, closed=closed, color=HOLE)

    def hole_blob(self, pts) -> None:
        self.blob(pts, color=HOLE)

    # ── 자주 쓰는 조합 ───────────────────────────────────────
    def cross(self, cx: float, cy: float, r: float, w: float = STROKE, color=INK) -> None:
        k = r * 0.707
        self.path([(cx - k, cy - k), (cx + k, cy + k)], w=w, color=color)
        self.path([(cx - k, cy + k), (cx + k, cy - k)], w=w, color=color)

    def arrow(self, x0: float, y0: float, x1: float, y1: float, w: float = STROKE) -> None:
        """가리키는 화살표. 촉은 채운 삼각형이라 작아져도 방향이 남는다."""
        ang = math.atan2(y1 - y0, x1 - x0)
        back = 0.11
        bx, by = x1 - back * 0.8 * math.cos(ang), y1 - back * 0.8 * math.sin(ang)
        self.path([(x0, y0), (bx, by)], w=w)
        self.poly([
            (x1, y1),
            (x1 - back * math.cos(ang - 0.45), y1 - back * math.sin(ang - 0.45)),
            (x1 - back * math.cos(ang + 0.45), y1 - back * math.sin(ang + 0.45)),
        ])

    def save(self, path) -> None:
        self.img.resize((SIZE, SIZE), Image.LANCZOS).save(path)
