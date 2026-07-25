"""픽토그램을 그리는 최소 도구.

왜 손그림을 버렸나
------------------
에셋이 손으로 그린 스케치였다. 선 굵기가 제각각이고 패스가 열려 있고, 앱에서
40px 남짓으로 줄이면 뭉개진다. 더 큰 문제는 늘릴 수가 없다는 것이다 — 형태소를
하나 더하려면 같은 손으로 같은 톤으로 다시 그려야 하고, 그건 재현되지 않는다.

여기서는 도형으로 만든다. 선 굵기·모서리·여백이 상수 하나로 묶이므로 서른 개든
백 개든 같은 그림체가 나오고, 새 형태소는 그림 작업이 아니라 열 줄짜리 함수가 된다.
git 에서 코드로 검토되고, 크기를 바꿔도 다시 그릴 필요가 없다.

그림체 규칙
-----------
- 굵은 외곽선 하나로 실루엣을 만든다. 작게 줄었을 때 남는 것은 실루엣뿐이다.
- 안쪽 디테일은 최소로. 40px 에서 사라질 선은 애초에 긋지 않는다.
- 획 끝과 꺾임은 둥글게. 뾰족한 끝은 작은 크기에서 먼지처럼 보인다.
- 검정 단색, 배경은 투명. 색은 앱이 상황에 따라 입힌다.
"""

from PIL import Image, ImageDraw

SIZE = 512
SS = 4                      # 슈퍼샘플링 배율 — 크게 그려 줄이면 계단이 사라진다
STROKE = 30                 # 기본 획 굵기 (512 기준)
THIN = 20                   # 보조선
INK = (17, 17, 17, 255)


class Canvas:
    """0~1 정규화 좌표로 그린다. 글리프 정의가 캔버스 크기를 몰라도 되게."""

    def __init__(self) -> None:
        self.img = Image.new("RGBA", (SIZE * SS, SIZE * SS), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)

    # ── 좌표 변환 ────────────────────────────────────────────
    def _p(self, x: float, y: float) -> tuple[float, float]:
        return (x * SIZE * SS, y * SIZE * SS)

    def _w(self, w: float) -> int:
        return max(1, round(w * SS))

    # ── 획 ──────────────────────────────────────────────────
    def path(self, pts, w: float = STROKE, closed: bool = False) -> None:
        """둥근 끝·둥근 꺾임을 가진 선. Pillow 에는 round cap 이 없어 관절에 원을 얹는다."""
        px = [self._p(x, y) for x, y in pts]
        if closed:
            px = px + [px[0]]
        self.d.line(px, fill=INK, width=self._w(w), joint="curve")
        r = self._w(w) / 2
        for x, y in px:
            self.d.ellipse([x - r, y - r, x + r, y + r], fill=INK)

    def circle(self, cx: float, cy: float, r: float, w: float = STROKE, fill: bool = False) -> None:
        a, b = self._p(cx - r, cy - r)
        c, e = self._p(cx + r, cy + r)
        if fill:
            self.d.ellipse([a, b, c, e], fill=INK)
        else:
            self.d.ellipse([a, b, c, e], outline=INK, width=self._w(w))

    def rect(self, x0: float, y0: float, x1: float, y1: float,
             r: float = 0.04, w: float = STROKE, fill: bool = False) -> None:
        a, b = self._p(x0, y0)
        c, e = self._p(x1, y1)
        rr = r * SIZE * SS
        if fill:
            self.d.rounded_rectangle([a, b, c, e], radius=rr, fill=INK)
        else:
            self.d.rounded_rectangle([a, b, c, e], radius=rr, outline=INK, width=self._w(w))

    def arc(self, cx: float, cy: float, r: float, start: float, end: float, w: float = STROKE) -> None:
        a, b = self._p(cx - r, cy - r)
        c, e = self._p(cx + r, cy + r)
        self.d.arc([a, b, c, e], start, end, fill=INK, width=self._w(w))

    def poly(self, pts, fill: bool = True, w: float = STROKE) -> None:
        px = [self._p(x, y) for x, y in pts]
        if fill:
            self.d.polygon(px, fill=INK)
        else:
            self.path(pts, w=w, closed=True)

    # ── 자주 쓰는 조합 ───────────────────────────────────────
    def cross(self, cx: float, cy: float, r: float, w: float = STROKE) -> None:
        """금지 표시의 사선. 'no' 합성 연산자와 같은 뜻을 낱개 글리프에서도 쓴다."""
        k = r * 0.707
        self.path([(cx - k, cy - k), (cx + k, cy + k)], w=w)
        self.path([(cx - k, cy + k), (cx + k, cy - k)], w=w)

    def ban(self, cx: float = 0.5, cy: float = 0.5, r: float = 0.42) -> None:
        """금지 원 + 사선. 알레르겐처럼 '이것을 피하라'는 뜻이 실루엣에 드러나야 한다."""
        self.circle(cx, cy, r, w=STROKE)
        k = r * 0.707
        self.path([(cx - k, cy + k), (cx + k, cy - k)], w=STROKE)

    def arrow(self, x0: float, y0: float, x1: float, y1: float, w: float = THIN) -> None:
        """가리키는 화살표. 신체 부위 글리프가 '여기에'를 뜻하게 만든다."""
        self.path([(x0, y0), (x1, y1)], w=w)
        import math
        ang = math.atan2(y1 - y0, x1 - x0)
        for d in (2.6, -2.6):
            self.path([(x1, y1), (x1 + 0.09 * math.cos(ang + d), y1 + 0.09 * math.sin(ang + d))], w=w)

    def save(self, path) -> None:
        self.img.resize((SIZE, SIZE), Image.LANCZOS).save(path)
