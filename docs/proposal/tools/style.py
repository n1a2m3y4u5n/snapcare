"""도판 공통 스타일.

팀이 앞서 낸 에너지환경탐구 보고서의 도판에서 색과 규칙을 그대로 뽑았다.
그 도판의 픽셀을 세어 보면 #4472C4 · #ED7D31 · #A5A5A5 · #C00000 이 나오는데,
Microsoft Office 기본 테마 색이다. 익숙한 질감이 거기서 온다.

규칙:
  - 그림판 **네 변을 모두 옅은 회색 선으로 두른다.** 축선을 지우지 않는다.
  - 격자는 두 축 모두에 옅은 점선.
  - 제목은 그림 안, 검정 굵은 글씨. 부제는 두지 않는다 — 필요한 단서는 축 이름과
    캡션이 맡는다.
  - 선에는 원형 표지를 찍고 굵게 긋는다. 범례는 그림 안, 테두리 없이.
  - 값은 굵은 검정으로 막대 끝 바깥에.
  - 강조는 색이 아니라 **주석과 화살표**로 한다.
"""
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

from i18n import FIG, LANG    # 언어에 따라 fig/ 또는 fig_en/

# 영어 눈금 라벨은 한국어보다 길다. 캔버스를 고정해 두었으므로
# 여백을 넓히지 않으면 왼쪽에서 잘린다.
LEFT = 0.17 if LANG == 'en' else 0.13

# Office 기본 테마 색 — 참고 도판에서 추출
BLUE   = '#4472C4'
ORANGE = '#ED7D31'
GREY   = '#A5A5A5'
GOLD   = '#FFC000'
GREEN  = '#548235'
RED    = '#C00000'
DARK   = '#3A3A3A'      # 자기 시나리오를 강조할 때 (참고 도판의 막대색)
LIGHT  = '#D9D9D9'      # 비교 대상 막대

INK, MUTED, GRIDC, SPINE = '#000000', '#595959', '#D9D9D9', '#BFBFBF'

plt.rcParams.update({
    # 학술 도판의 첫 규칙은 **문서 본문과 같은 글꼴을 쓰는 것**이다. 본문이
    # 바탕 + Times New Roman 인데 도판만 고딕이면, 아무리 잘 그려도 문서에
    # 붙여넣은 남의 그림처럼 보인다. 라틴은 Times, 한글은 명조로 떨어지게
    # 목록으로 준다.
    #
    # 한글 자리를 바탕에서 나눔명조로 옮겼다. 바탕에는 굵은 자족이 없어서
    # `fontweight='bold'` 가 조용히 400 으로 떨어지는데, 그러면 한 라벨
    # 안에서 숫자와 영문만 굵고 한글만 보통 굵기로 나온다. 강조가 사라지는
    # 것보다 그 뒤섞임이 더 나쁘다 — 설계가 아니라 고장으로 읽힌다. 나눔명조는
    # 같은 명조 계열이라 본문과의 거리가 크지 않고 700·800 을 갖고 있다.
    # 바탕은 마지막 대비로 남겨 둔다.
    'font.family': ['Times New Roman', 'NanumMyeongjo', 'Batang'],
    'axes.unicode_minus': False,
    'font.size': 10.0, 'axes.labelsize': 10.4,
    'xtick.labelsize': 9.6, 'ytick.labelsize': 9.6, 'legend.fontsize': 9.6,
    'axes.edgecolor': SPINE, 'axes.linewidth': 0.9,
    'xtick.direction': 'out', 'ytick.direction': 'out',
    'xtick.major.width': 0.9, 'ytick.major.width': 0.9,
    'xtick.major.size': 3.5, 'ytick.major.size': 3.5,
    'xtick.color': MUTED, 'ytick.color': MUTED,
    'text.color': INK, 'axes.labelcolor': INK,
    'figure.dpi': 300, 'savefig.dpi': 300,
    # bbox='tight' 를 쓰지 않는다. 내용에 맞춰 잘라 내면 그림마다 폭이 달라지고,
    # 문서가 모든 그림을 6인치로 맞추므로 그만큼 확대·축소되어 **글자 크기가
    # 그림마다 달라진다.** 캔버스를 고정하고 여백은 subplots_adjust 로 잡는다.
    'savefig.bbox': None,
    'figure.facecolor': 'white',
})


def frame(ax, grid='both'):
    """네 변을 다 두르고 옅은 점선 격자를 깐다 — 참고 도판의 기본 틀."""
    for s in ax.spines.values():
        s.set_visible(True)
        s.set_color(SPINE)
        s.set_linewidth(0.9)
    if grid:
        ax.grid(axis=grid, color=GRIDC, linewidth=0.8, linestyle=(0, (3, 3)),
                zorder=0)
        ax.set_axisbelow(True)


def title(fig, text, note=None):
    """그림 안 제목. 굵은 검정 한 줄. note 는 그림 맨 아래 오른쪽 단서."""
    h = fig.get_figheight()
    fig.suptitle(text, fontsize=11.5, fontweight='bold', color=INK, y=1 - 0.06 / h)
    bottom = 0.86 / h if note else 0.52 / h
    fig.subplots_adjust(top=1 - 0.46 / h, bottom=bottom, left=LEFT, right=0.97)
    if note:
        fig.text(0.97, 0.055 / h, note, ha='right', fontsize=8.2, color=MUTED)


def line(ax, x, y, color, label, marker='o', lw=2.4, ms=6.0):
    return ax.plot(x, y, color=color, label=label, marker=marker, linewidth=lw,
                   markersize=ms, markeredgecolor='white', markeredgewidth=1.0,
                   zorder=3)


def legend_in(ax, loc='upper left'):
    ax.legend(loc=loc, frameon=False, handlelength=1.9, borderpad=0.2,
              labelspacing=0.45)


def note(ax, text, xy, xytext, color=RED):
    """강조는 색을 더하는 대신 화살표 주석으로."""
    ax.annotate(text, xy=xy, xytext=xytext, color=color, fontsize=8.6,
                fontweight='bold', ha='center',
                arrowprops=dict(arrowstyle='->', color=color, lw=1.4))


def save(fig, name):
    fig.savefig(FIG / f'{name}.png', facecolor='white')
    plt.close(fig)
    print(f'  {name}.png')
