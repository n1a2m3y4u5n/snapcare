"""도판 공통 스타일.

팀이 앞서 낸 보고서의 도판 틀을 따른다. 그쪽의 규칙은 이렇게 정리된다.

  - 제목을 그림 안에 둔다. 도판이 본문에서 떨어져 나가도 혼자 읽힌다.
  - 상자는 **옅은 채움 + 진한 같은 계열 테두리**의 둥근 사각형. 색이 곧 갈래다.
  - 갈래가 둘 이상이면 아래에 **색 견본 범례**를 한 줄로 둔다.
  - 값은 막대 끝에 붙이고, 기준선에는 이름을 단다.
  - 여백을 넉넉히 둔다. 밀도는 요소를 붙여서가 아니라 정보로 올린다.

학술 관례(제목을 캡션에만 두기)와 어긋나는 지점이 하나 있는데, 이 문서의 도판은
한 쪽을 통째로 차지하는 일이 많아 제목이 캡션에만 있으면 그림과 멀어진다.
"""
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

FIG = Path(__file__).resolve().parent.parent / 'fig'

# 파스텔 채움 + 진한 테두리. 짝을 이뤄 쓴다.
SAGE      = ('#E8F2EA', '#5E8F73')   # 통과·안전·우리 것
AMBER     = ('#FAEEDC', '#C8862F')   # 주의·강조
LAVENDER  = ('#EFEAF6', '#7E6FA6')   # 사람·조건
SLATE     = ('#E9ECF2', '#6B7488')   # 중립·비교 대상
SKY       = ('#E3F0F5', '#4A8FAA')   # 흐름·물·연결
ROSE      = ('#F8E7E7', '#B4585A')   # 실패·경고

INK, MUTED, LINE = '#2C3038', '#6B7280', '#D4D8DF'

plt.rcParams.update({
    'font.family': 'Pretendard',   # 굵기 100~800 이 다 있다. AppleGothic 은 400 뿐이라
                                  # 굵게 지정이 조용히 무시됐다.
    'axes.unicode_minus': False,
    'font.size': 8.4, 'axes.labelsize': 8.4,
    'xtick.labelsize': 8.2, 'ytick.labelsize': 7.8, 'legend.fontsize': 8.0,
    'axes.edgecolor': '#9AA1AC', 'axes.linewidth': 0.8,
    'xtick.major.width': 0.8, 'ytick.major.width': 0.8,
    'xtick.major.size': 3, 'ytick.major.size': 3,
    'xtick.color': '#6B7280', 'ytick.color': '#6B7280',
    'text.color': INK, 'axes.labelcolor': INK,
    'figure.dpi': 300, 'savefig.dpi': 300,
    'savefig.bbox': 'tight', 'savefig.pad_inches': 0.06,
    'figure.facecolor': 'white',
})


def frame(ax, grid_axis='y'):
    for s in ('top', 'right'):
        ax.spines[s].set_visible(False)
    if grid_axis:
        ax.grid(axis=grid_axis, color=LINE, linewidth=0.6, zorder=0)
        ax.set_axisbelow(True)


def title(fig, text, sub=None):
    """그림 안 제목과 부제.

    y 를 0~1 로 고정하면 그림 높이에 따라 실제 간격이 달라져 제목과 부제가 겹친다.
    간격을 **인치로 정하고** 높이로 나눠 비율로 바꾼다 — 어떤 크기의 그림에서도
    같은 여백이 된다.
    """
    h = fig.get_figheight()
    fig.suptitle(text, fontsize=10.4, fontweight='bold', color=INK,
                 y=1 - 0.06 / h)
    if sub:
        fig.text(0.5, 1 - 0.33 / h, sub, ha='center', fontsize=8.2, color=MUTED)
    # 축이 제목 아래로 내려오게 자리를 비운다.
    fig.subplots_adjust(top=1 - (0.58 if sub else 0.34) / h)


def legend_row(fig, items, y=-0.02):
    """하단 색 견본 범례. items = [(라벨, (채움, 테두리)), ...]"""
    handles = [plt.Rectangle((0, 0), 1, 1, facecolor=f, edgecolor=e, linewidth=1.2)
               for _, (f, e) in items]
    fig.legend(handles, [n for n, _ in items], loc='lower center',
               bbox_to_anchor=(0.5, y), ncol=len(items), frameon=False,
               handlelength=1.1, handleheight=0.9, columnspacing=1.6)


def bars(ax, xs, values, palette, width=0.58):
    """옅은 채움 + 진한 테두리 막대."""
    out = []
    for x, v, (fill, edge) in zip(xs, values, palette):
        out.append(ax.bar(x, v, width, facecolor=fill, edgecolor=edge,
                          linewidth=1.4, zorder=2))
    return out


def save(fig, name):
    fig.savefig(FIG / f'{name}.png', facecolor='white')
    plt.close(fig)
    print(f'  {name}.png')
