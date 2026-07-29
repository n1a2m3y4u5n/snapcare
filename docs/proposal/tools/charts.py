"""
제안서 도표. 학술지 도판 관례를 따른다.

  - data-ink 를 최대화한다: 위·오른쪽 축선 제거, 격자는 값 축에만 옅게.
  - 색은 의미를 지는 곳에만 쓴다. 단일 계열은 무채색 하나로 충분하다.
  - 제목을 도판 안에 넣지 않는다 — 캡션은 문서 쪽에 붙는다.
  - 축 단위를 축 이름에 명시한다.

수치는 전부 본문 표에 있는 것이고, 그 표의 값은 citations.md 에서 원문과 대조한
것만 쓴다. 대조하지 않은 값으로는 그래프를 그리지 않는다 — 그래프는 표보다 더
단정적으로 보이기 때문이다.

    python3 docs/proposal/tools/charts.py
"""
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

HERE = Path(__file__).resolve().parent
FIG = HERE.parent / 'fig'

plt.rcParams.update({
    'font.family': 'AppleGothic',
    'axes.unicode_minus': False,      # 한글 글꼴에 U+2212 가 없어 마이너스가 깨진다
    'font.size': 8.2, 'axes.labelsize': 8.2,
    'xtick.labelsize': 8.0, 'ytick.labelsize': 7.6, 'legend.fontsize': 7.8,
    'axes.edgecolor': '#4a4a52', 'axes.linewidth': 0.7,
    'xtick.major.width': 0.7, 'ytick.major.width': 0.7,
    'xtick.major.size': 3, 'ytick.major.size': 3,
    'xtick.color': '#4a4a52', 'ytick.color': '#4a4a52',
    'text.color': '#18181b', 'axes.labelcolor': '#18181b',
    'figure.dpi': 300, 'savefig.dpi': 300,
    'savefig.bbox': 'tight', 'savefig.pad_inches': 0.02,
})

BLUE, ORANGE = '#2a78d6', '#eb6834'
INK, SUB, MUTE = '#18181b', '#52514e', '#8c8c94'
CRIT, GREY = '#d03b3b', '#5b6270'


def frame(ax, grid_axis='y'):
    for s in ('top', 'right'):
        ax.spines[s].set_visible(False)
    if grid_axis:
        ax.grid(axis=grid_axis, color='#dcdce2', linewidth=0.55, zorder=0)
        ax.set_axisbelow(True)


def save(fig, name):
    fig.savefig(FIG / f'{name}.png', facecolor='white')
    plt.close(fig)
    print(f'  {name}.png')


# ── 비율은 오르는데 머릿수는 는다 (UNESCO, 2025) ────────────────────
def chart_literacy():
    fig, ax1 = plt.subplots(figsize=(4.6, 2.5))
    yrs = ['2015', '2024']
    ax1.bar(yrs, [196, 225], width=0.45, color=GREY, zorder=2)
    for x, v in zip(yrs, [196, 225]):
        ax1.text(x, v + 4, f'{v}M', ha='center', fontsize=8, color=INK)
    ax1.set_ylabel('비문해 성인 (백만 명)')
    ax1.set_ylim(0, 275)
    frame(ax1)

    ax2 = ax1.twinx()
    ax2.plot(yrs, [65, 69], color=ORANGE, marker='o', markersize=4, linewidth=1.4, zorder=3)
    for x, v in zip(yrs, [65, 69]):
        ax2.text(x, v - 3.2, f'{v}%', ha='center', fontsize=8, color=ORANGE)
    ax2.set_ylabel('성인 문해율 (%)', color=ORANGE)
    ax2.set_ylim(50, 80)
    ax2.tick_params(axis='y', colors=ORANGE)
    for s in ('top', 'left'):
        ax2.spines[s].set_visible(False)
    ax2.spines['right'].set_color(ORANGE)
    save(fig, 'chart01_literacy')


# ── 제한적 건강 문해력 (표 1) ──────────────────────────────────────
def chart_health_literacy():
    rows = [('한국 65세 이상', 59.7, True), ('덴마크', 47.0, False),
            ('유럽 17개국', 46.0, False), ('노르웨이', 46.0, False),
            ('한국 19~64세', 34.1, False)]
    fig, ax = plt.subplots(figsize=(4.6, 2.2))
    ys = range(len(rows))
    ax.barh(list(ys), [r[1] for r in rows], height=0.6,
            color=[ORANGE if r[2] else GREY for r in rows], zorder=2)
    for y, r in zip(ys, rows):
        ax.text(r[1] + 1.2, y, f'{r[1]}%', va='center', fontsize=8, color=INK)
    ax.set_yticks(list(ys), [r[0] for r in rows])
    ax.invert_yaxis()
    ax.set_xlabel('제한적 건강 문해력 비율 (%)')
    ax.set_xlim(0, 72)
    frame(ax, grid_axis='x')
    save(fig, 'chart02_health_literacy')


# ── 복약 오류의 유형별 분포 (표 2) ─────────────────────────────────
def chart_errors():
    kinds = ['누락', '용량 오류', '시각 오류', '중복 처방']
    disp = [32.9, 28.4, 23.2, None]
    harm = [None, 30.7, 17.1, 14.4]
    x = range(len(kinds))
    fig, ax = plt.subplots(figsize=(4.8, 2.4))
    w = 0.38
    for i, (v, h) in enumerate(zip(disp, harm)):
        if v is not None:
            ax.bar(i - w / 2, v, w, color=GREY, zorder=2)
            ax.text(i - w / 2, v + 0.8, f'{v}', ha='center', fontsize=7.6, color=INK)
        if h is not None:
            ax.bar(i + w / 2, h, w, color=BLUE, zorder=2)
            ax.text(i + w / 2, h + 0.8, f'{h}', ha='center', fontsize=7.6, color=INK)
    ax.set_xticks(list(x), kinds)
    ax.set_ylabel('비율 (%)')
    ax.set_ylim(0, 40)
    ax.legend(handles=[plt.Rectangle((0, 0), 1, 1, color=GREY),
                       plt.Rectangle((0, 0), 1, 1, color=BLUE)],
              labels=['조제 단계 오류 중', '심각 위해 가능 오류 중'],
              frameon=False, ncol=2, loc='upper right', bbox_to_anchor=(1.0, 1.16))
    frame(ax)
    save(fig, 'chart03_error_types')


# ── 연령대별 스마트폰 보유율 (표 3) ────────────────────────────────
def chart_smartphone():
    labels = ['50세 미만', '50~64세', '65세 이상']
    vals = [97, 90, 77]
    fig, ax = plt.subplots(figsize=(3.9, 2.2))
    ax.bar(labels, vals, width=0.5, color=[GREY, GREY, ORANGE], zorder=2)
    for x, v in zip(labels, vals):
        ax.text(x, v + 1.5, f'{v}%', ha='center', fontsize=8, color=INK)
    ax.set_ylabel('스마트폰 보유율 (%)')
    ax.set_ylim(0, 112)
    frame(ax)
    save(fig, 'chart04_smartphone')


# ── 픽토그램 이해도 기준 통과율 (표 4) ─────────────────────────────
def chart_pictogram():
    """분자와 분모가 모두 확인된 연구만 넣는다.

    Dowse & Ehlers 의 20 대 11 은 분모를 확인하지 못해 뺐고, 이란 연구의
    0~68% 는 통과율이 아니라 문항별 정답률이라 같은 축에 놓을 수 없다.
    """
    rows = [('Gutierrez 등 (2022)\nUSP+FIP 108종', 15.7, False),
            ('Dowse 등 (2012)\n9종', 33.3, False),
            ('본 연구 SIGIL\n78종 · 기계 판정', 69.2, True)]
    fig, ax = plt.subplots(figsize=(4.6, 2.6))
    xs = range(len(rows))
    ax.bar(list(xs), [r[1] for r in rows], width=0.5,
           color=[ORANGE if r[2] else GREY for r in rows], zorder=2)
    for x, r in zip(xs, rows):
        ax.text(x, r[1] + 2, f'{r[1]}%', ha='center', fontsize=8, color=INK)
    ax.axhline(67, color=CRIT, linestyle='--', linewidth=0.9, zorder=1)
    ax.text(-0.44, 68.5, 'ISO 9186-1  67%', fontsize=7.2, color=CRIT, ha='left')
    ax.axhline(85, color=CRIT, linestyle=':', linewidth=0.9, zorder=1)
    ax.text(-0.44, 86.5, 'ANSI Z535.3  85%', fontsize=7.2, color=CRIT, ha='left')
    ax.set_xticks(list(xs), [r[0] for r in rows])
    ax.set_ylabel('기준을 통과한 픽토그램 비율 (%)')
    ax.set_ylim(0, 100)
    frame(ax)
    save(fig, 'chart05_pictogram_pass')


# ── 형성 평가 수정 전후 (표 14) ────────────────────────────────────
def chart_eval():
    fig, ax = plt.subplots(figsize=(4.4, 2.2))
    items = ['여섯 항목\n모두 만족', '픽토그램 0장으로\n끝난 시행']
    before, after = [0, 8], [27, 0]
    x = range(len(items))
    w = 0.36
    for i, (b, a) in enumerate(zip(before, after)):
        ax.bar(i - w / 2, b, w, color=GREY, zorder=2)
        ax.bar(i + w / 2, a, w, color=BLUE, zorder=2)
        ax.text(i - w / 2, b + 0.5, str(b), ha='center', fontsize=7.8, color=INK)
        ax.text(i + w / 2, a + 0.5, str(a), ha='center', fontsize=7.8, color=INK)
    ax.set_xticks(list(x), items)
    ax.set_ylabel('시행 수 (n = 28)')
    ax.set_ylim(0, 32)
    ax.legend(handles=[plt.Rectangle((0, 0), 1, 1, color=GREY),
                       plt.Rectangle((0, 0), 1, 1, color=BLUE)],
              labels=['수정 전', '수정 후'], frameon=False, ncol=2,
              loc='upper center', bbox_to_anchor=(0.5, 1.18))
    frame(ax)
    save(fig, 'chart06_formative')


# ── 형태소 78종 의미 검사 (표 16~18) ───────────────────────────────
def chart_glyphs():
    """78종의 1차 판정과, 오독 24종의 내역.

    라벨을 두 단으로 엇갈려 놓는다 — 좁은 구간에 나란히 쓰면 글자가 겹친다.
    """
    fig, ax = plt.subplots(figsize=(5.0, 1.6))
    seg = [('의도한 대로 읽힘', 54, BLUE, 0),
           ('노출되는 것 — 재작업', 7, ORANGE, 1),
           ('사전에만 존재 — 앱이 호출하지 않음', 17, '#b9c6d6', 0)]
    left = 0
    for label, v, c, tier in seg:
        ax.barh(0, v, left=left, height=0.5, color=c, zorder=2)
        ax.text(left + v / 2, 0, str(v), ha='center', va='center',
                fontsize=8, color='white' if v > 6 else INK)
        y = -0.40 if tier == 0 else -0.66
        ax.plot([left + v / 2, left + v / 2], [-0.26, y + 0.04],
                color=MUTE, linewidth=0.5, zorder=1)
        ax.text(left + v / 2, y, label, ha='center', va='top',
                fontsize=7.2, color=SUB)
        left += v
    ax.set_xlim(0, 78)
    ax.set_ylim(-1.15, 0.4)
    ax.set_yticks([])
    ax.set_xlabel('형태소 수 (전체 78종)')
    for s in ('top', 'right', 'left'):
        ax.spines[s].set_visible(False)
    save(fig, 'chart07_glyph_check')


if __name__ == '__main__':
    chart_literacy()
    chart_health_literacy()
    chart_errors()
    chart_smartphone()
    chart_pictogram()
    chart_eval()
    chart_glyphs()
