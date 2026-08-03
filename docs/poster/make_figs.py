"""포스터용 도판을 제안서와 같은 코드로, 다른 색으로 다시 뽑는다.

제안서 도판은 Office 기본 테마 색(파랑·주황·회색)이다. 포스터는 세이지와
테라코타를 쓰므로 그대로 갖다 붙이면 남의 그림처럼 뜬다. 도판을 다시 그리지
않고 style 의 색 상수와 글꼴만 갈아 끼운 뒤 charts.py 를 그대로 부른다.
숫자를 건드리지 않으니 제안서와 포스터가 다른 것을 말할 일이 없다.

    python3 docs/poster/make_figs.py      → docs/poster/fig/
"""
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TOOLS = HERE.parent / 'proposal' / 'tools'
OUT = HERE / 'fig'
OUT.mkdir(exist_ok=True)

os.environ['SNAPCARE_LANG'] = 'en'
sys.path.insert(0, str(TOOLS))

import style                                    # noqa: E402

# ── 포스터 색 ──
style.BLUE   = '#6f8f74'      # 현지 제작 / 수정 후
style.ORANGE = '#b0603f'      # 본 연구
style.GREY   = '#c9c2b2'
style.LIGHT  = '#ddd7c8'      # 비교 대상
style.DARK   = '#46554a'
style.GREEN  = '#6f8f74'
style.RED    = '#a8635f'
style.GOLD   = '#b08d3f'
style.INK, style.MUTED = '#2f3a33', '#6d7a70'
style.GRIDC, style.SPINE = '#ded8cb', '#c3bcac'
style.FIG = OUT

style.plt.rcParams.update({
    'font.family': ['Helvetica Neue', 'Helvetica', 'Arial'],
    'text.color': style.INK, 'axes.labelcolor': style.INK,
    'axes.edgecolor': style.SPINE,
    'xtick.color': style.MUTED, 'ytick.color': style.MUTED,
})

import i18n                                     # noqa: E402
# 색을 바꿨으니 색을 부르는 범례 문구도 바꾼다.
i18n.EN['파랑 = 현지 제작 · 회색 = 국제 표준 · 주황 = 본 연구'] = \
    'green = locally made · grey = international standard · terracotta = this work'

import charts                                   # noqa: E402

# charts 는 style 에서 이름을 끌어다 자기 전역에 두므로 거기도 갈아 끼운다.
for k in ('BLUE', 'ORANGE', 'GREY', 'LIGHT', 'DARK', 'GREEN', 'RED', 'GOLD',
          'INK', 'MUTED', 'GRIDC', 'SPINE', 'FIG'):
    if hasattr(charts, k):
        setattr(charts, k, getattr(style, k))

for fn in (charts.chart_pictogram, charts.chart_eval, charts.chart_glyphs):
    fn()
    print('  그림', fn.__name__)

print('완료 →', OUT)
