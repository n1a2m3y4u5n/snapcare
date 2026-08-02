"""
제안서 도표. 스타일 규칙은 style.py 에 있다 (참고: 팀 에너지환경탐구 보고서 도판).

수치는 전부 본문 표에 있는 것이고, 그 표의 값은 citations.md 에서 원문과 대조한
것만 쓴다. 대조하지 않은 값으로는 그래프를 그리지 않는다 — 그래프는 표보다 더
단정적으로 보이기 때문이다.

    python3 docs/proposal/tools/charts.py
"""
import matplotlib.pyplot as plt

from style import (BLUE, DARK, GREEN, GREY, INK, LIGHT, MUTED, ORANGE, RED,
                   frame, legend_in, line, note, save, title)
from i18n import T, LANG


# ── 비율은 오르는데 머릿수는 는다 (UNESCO, 2025) ────────────────────
def chart_literacy():
    fig, ax1 = plt.subplots(figsize=(6.0, 3.0))
    title(fig, T('사하라이남 아프리카의 문해율과 비문해 인구'))
    yrs = ['2015', '2024']
    ax1.bar(yrs, [196, 225], width=0.40, color=GREY, zorder=2)
    for x, v in zip(yrs, [196, 225]):
        ax1.text(x, v + 7, T('{v}백만 명').format(v=v), ha='center', fontsize=9,
                 fontweight='bold', color=INK)
    ax1.set_ylabel(T('비문해 성인 (백만 명)'))
    ax1.set_ylim(0, 300)
    frame(ax1, grid='y')

    ax2 = ax1.twinx()
    line(ax2, yrs, [65, 69], BLUE, T('문해율 (%)'))
    for x, v in zip(yrs, [65, 69]):
        ax2.text(x, v - 3.4, f'{v}%', ha='center', fontsize=9,
                 fontweight='bold', color=BLUE)
    ax2.set_ylabel(T('성인 문해율 (%)'), color=BLUE)
    ax2.set_ylim(50, 80)
    ax2.tick_params(axis='y', colors=BLUE)
    ax2.grid(False)
    fig.subplots_adjust(right=0.87)   # 오른쪽 축 이름이 잘리지 않게
    note(ax2, T('비율은 4%p 올랐는데\n사람 수는 2,900만 명 늘었다'),
         xy=(1, 69), xytext=(0.42, 75.5))
    save(fig, 'chart01_literacy')


# ── 제한적 건강 문해력 (표 1) ──────────────────────────────────────
def chart_health_literacy():
    rows = [(T('65세 이상'), 59.7), (T('소득 하위층'), 45.6),
            (T('전체 성인'), 39.6), (T('소득 상위층'), 33.7)]
    fig, ax = plt.subplots(figsize=(6.0, 2.6))
    title(fig, T('건강정보이해능력이 충분하지 않은 비율 (한국)'))
    ys = list(range(len(rows)))
    cols = [DARK, LIGHT, LIGHT, LIGHT]
    ax.barh(ys, [r[1] for r in rows], height=0.6, color=cols, zorder=2)
    for y, (_, v) in zip(ys, rows):
        ax.text(v + 1.2, y, f'{v}%', va='center', fontsize=9,
                fontweight='bold', color=INK)
    ax.set_yticks(ys, [r[0] for r in rows])
    ax.invert_yaxis()
    ax.set_xlabel(T('비율 (%)'))
    ax.set_xlim(0, 70)
    frame(ax, grid='x')
    save(fig, 'chart02_health_literacy')


# ── 복약 오류의 유형별 분포 (표 2) ─────────────────────────────────
def chart_errors():
    rows = [(T('누락'), 32.9, 51), (T('용량 오류'), 28.4, 44),
            (T('시각 오류'), 23.2, 36), (T('나머지'), 15.5, 24)]
    fig, ax = plt.subplots(figsize=(6.0, 2.6))
    title(fig, T('조제 오류의 유형별 분포 (약사가 발견한 155건)'),
          note=T('진한 막대 = 그림으로 옮길 수 있는 지시 (84.5%)'))
    ys = list(range(len(rows)))
    cols = [DARK, DARK, DARK, LIGHT]
    ax.barh(ys, [r[1] for r in rows], height=0.6, color=cols, zorder=2)
    for y, (_, v, n) in zip(ys, rows):
        ax.text(v + 0.9, y, T('{n}건 ({v}%)').format(n=n, v=v), va='center', fontsize=9,
                fontweight='bold', color=INK)
    ax.set_yticks(ys, [r[0] for r in rows])
    ax.invert_yaxis()
    ax.set_xlabel(T('비율 (%)'))
    ax.set_xlim(0, 42)
    frame(ax, grid='x')
    save(fig, 'chart03_error_types')


# ── 연령대별 스마트폰 보유율 (표 3) ────────────────────────────────
def chart_smartphone():
    labels, vals = [T('50세 미만'), T('50~64세'), T('65세 이상')], [97, 90, 78]
    fig, ax = plt.subplots(figsize=(6.0, 2.8))
    title(fig, T('연령대별 스마트폰 보유율 (미국, 2025)'))
    xs = list(range(len(labels)))
    ax.bar(xs, vals, width=0.5, color=[LIGHT, LIGHT, DARK], zorder=2)
    for x, v in zip(xs, vals):
        ax.text(x, v + 2.2, f'{v}%', ha='center', fontsize=9.4,
                fontweight='bold', color=INK)
    ax.set_xticks(xs, labels)
    ax.set_ylabel(T('보유율 (%)'))
    ax.set_ylim(0, 122)
    frame(ax, grid='y')
    note(ax, T('격차 19%p'), xy=(2, 82), xytext=(1.0, 110))
    save(fig, 'chart04_smartphone')


# ── 픽토그램 이해도 기준 통과율 (표 4) ─────────────────────────────
def chart_pictogram():
    """가운데 둘은 같은 연구의 대조군·실험군이다 — 같은 46명에게 두 세트를 보였다."""
    rows = [(T('Gutierrez (2022)\nUSP+FIP 108종 · ANSI 85%'), 15.7, LIGHT),
            (T('Dowse & Ehlers (2001)\nUSP-DI 23종 · ANSI 85%'), 47.8, LIGHT),
            (T('같은 46명 · 현지 제작\n23종 · ANSI 85%'), 87.0, BLUE),
            (T('Dowse (2023)\n현지 제작 10종 · ISO 66.7%'), 80.0, BLUE),
            (T('본 연구 SIGIL\n78종 · 기계 판정'), 69.2, ORANGE)]
    fig, ax = plt.subplots(figsize=(6.0, 3.4))
    title(fig, T('의약 픽토그램이 이해도 기준을 통과한 비율'),
          note=T('파랑 = 현지 제작 · 회색 = 국제 표준 · 주황 = 본 연구'))
    ys = list(range(len(rows)))
    ax.barh(ys, [r[1] for r in rows], height=0.58,
            color=[r[2] for r in rows], zorder=2)
    for y, r in zip(ys, rows):
        ax.text(r[1] + 1.4, y, f'{r[1]:.0f}%', va='center', fontsize=9.2,
                fontweight='bold', color=INK)
    # 두 기준선이 가까워 라벨이 서로를 침범한다. 하나는 선 왼쪽, 하나는 오른쪽.
    for x, lab, ls, ty, ha, dx in [
            (67, 'ISO 67%', (0, (4, 3)), -0.80, 'right', -1.2),
            (85, 'ANSI 85%', (0, (1, 2)), -0.80, 'left', 1.2)]:
        ax.axvline(x, color=RED, linestyle=ls, linewidth=1.2, zorder=1)
        ax.text(x + dx, ty, lab, fontsize=8.0, color=RED, va='center', ha=ha)
    ax.set_yticks(ys, [r[0] for r in rows])
    ax.invert_yaxis()
    fig.subplots_adjust(left=0.36 if LANG == 'en' else 0.30)
    ax.set_xlabel(T('기준을 통과한 픽토그램 비율 (%)'))
    ax.set_xlim(0, 100)
    ax.set_ylim(4.6, -1.15)
    frame(ax, grid='x')
    save(fig, 'chart05_pictogram_pass')


# ── 형성 평가 수정 전후 ────────────────────────────────────────────
def chart_eval():
    fig, ax = plt.subplots(figsize=(6.0, 2.8))
    title(fig, T('형성 평가 — 수정 전후 (28회 시행)'))
    items = [T('여섯 항목 모두 만족'), T('픽토그램 0장으로 끝남')]
    before, after = [0, 8], [27, 0]
    w = 0.32
    xs = list(range(len(items)))
    ax.bar([x - w / 2 for x in xs], before, w, color=LIGHT, label=T('수정 전'), zorder=2)
    ax.bar([x + w / 2 for x in xs], after, w, color=BLUE, label=T('수정 후'), zorder=2)
    for i, (b, a) in enumerate(zip(before, after)):
        ax.text(i - w / 2, b + 0.8, str(b), ha='center', fontsize=9,
                fontweight='bold', color=INK)
        ax.text(i + w / 2, a + 0.8, str(a), ha='center', fontsize=9,
                fontweight='bold', color=INK)
    ax.set_xticks(xs, items)
    ax.set_ylabel(T('시행 수 (n = 28)'))
    ax.set_ylim(0, 34)
    frame(ax, grid='y')
    legend_in(ax, 'upper center')
    save(fig, 'chart06_formative')


# ── 형태소 78종 의미 검사 ──────────────────────────────────────────
def chart_glyphs():
    fig, ax = plt.subplots(figsize=(6.0, 2.2))
    title(fig, T('형태소 78종의 1차 의미 검사'))
    seg = [(T('의도한 대로 읽힘'), 54, BLUE, 0),
           (T('노출되는 것 — 재작업'), 7, ORANGE, 1),
           (T('사전에만 존재 — 앱이 호출하지 않음'), 17, LIGHT, 0)]
    left = 0
    for label, v, c, tier in seg:
        ax.barh(0, v, left=left, height=0.44, color=c, zorder=2)
        ax.text(left + v / 2, 0, str(v), ha='center', va='center', fontsize=9.4,
                fontweight='bold', color='white' if c != LIGHT else INK)
        y = -0.40 if tier == 0 else -0.63
        ax.plot([left + v / 2] * 2, [-0.24, y + 0.04], color=MUTED,
                linewidth=0.7, zorder=1)
        ax.text(left + v / 2, y, label, ha='center', va='top', fontsize=8.2,
                color=INK)
        left += v
    ax.set_xlim(0, 78)
    ax.set_ylim(-1.05, 0.32)
    ax.set_yticks([])
    ax.set_xlabel(T('형태소 수 (전체 78종)'))
    frame(ax, grid='x')
    save(fig, 'chart07_glyph_check')


# ── 영양 추정 모델의 항목별 오차 ───────────────────────────────────
def chart_model():
    rows = [(T('질량'), 16.61), (T('열량'), 22.75), (T('탄수화물'), 30.60),
            (T('단백질'), 30.96), (T('지방'), 32.82)]
    mean = 26.75
    fig, ax = plt.subplots(figsize=(6.0, 2.9))
    title(fig, T('영양 추정 모델의 항목별 오차 (n = 507)'))
    xs = list(range(len(rows)))
    ax.bar(xs, [r[1] for r in rows], width=0.52, color=DARK, zorder=2)
    for x, r in zip(xs, rows):
        ax.text(x, r[1] + 1.1, f'{r[1]:.1f}%', ha='center', fontsize=9,
                fontweight='bold', color=INK)
    ax.axhline(mean, color=RED, linestyle=(0, (4, 3)), linewidth=1.3, zorder=3)
    ax.text(-0.42, mean + 1.2, (f'Mean {mean}%' if LANG == 'en' else f'평균 {mean}%'), fontsize=8.4, color=RED,
            ha='left', fontweight='bold')
    ax.set_xticks(xs, [r[0] for r in rows])
    ax.set_ylabel(T('MAE% (평균 절대 오차)'))
    ax.set_ylim(0, 42)
    frame(ax, grid='y')
    save(fig, 'chart08_model_mae')


# ── 성인 문해율이 낮은 15개국 (표 1) ───────────────────────────────
def chart_country():
    rows = [(T('차드'), 28), (T('남수단'), 35), (T('부르키나파소'), 37), (T('아프가니스탄'), 37),
            (T('니제르'), 38), (T('중앙아프리카공화국'), 38), (T('말리'), 44), (T('기니'), 48),
            (T('라이베리아'), 48), (T('에티오피아'), 51.8), (T('소말리아'), 54),
            (T('기니비사우'), 56), (T('베냉'), 58), (T('파키스탄'), 58), (T('시에라리온'), 60)]
    fig, ax = plt.subplots(figsize=(6.0, 4.0))
    title(fig, T('성인 문해율이 가장 낮은 15개국'))
    ys = list(range(len(rows)))
    ax.barh(ys, [r[1] for r in rows], height=0.66, color=DARK, zorder=2)
    for y, (_, v) in zip(ys, rows):
        ax.text(v + 1.2, y, f'{v}%', va='center', fontsize=8.6,
                fontweight='bold', color=INK)
    ax.axvline(88, color=RED, linestyle=(0, (4, 3)), linewidth=1.3, zorder=3)
    ax.text(86.5, len(rows) - 0.4, T('세계 평균 88%'), fontsize=8.2, color=RED,
            ha='right', fontweight='bold')
    ax.set_yticks(ys, [r[0] for r in rows])
    ax.invert_yaxis()
    ax.set_xlabel(T('성인(15세 이상) 문해율 (%)'))
    ax.set_xlim(0, 100)
    fig.subplots_adjust(left=0.24)
    frame(ax, grid='x')
    save(fig, 'chart09_country_literacy')


# ── 전문가 조사. 판단 문항과 그 불확실성 ────────────────────────────
def chart_survey():
    """비율만 그리면 24명이라는 것이 보이지 않는다. 구간을 함께 그린다."""
    fig, ax = plt.subplots(figsize=(6.0, 2.6))
    title(fig, T('전문가 판단 문항과 95% 신뢰구간 (n = 24)'),
          note=T('점이 비율, 가로선이 95% 신뢰구간이다. 선이 긴 것이 표본이 작다는 뜻이다.'))
    rows = [(T('부분적으로'), 16, 66.7, 46.7, 82.0),
            (T('예, 가능할 것 같다'), 7, 29.2, 14.9, 49.2),
            (T('판단할 근거가 없다'), 1, 4.2, 0.7, 20.2),
            (T('아니오'), 0, 0.0, 0.0, 13.8)]
    ys = range(len(rows))
    for y, (lab, k, v, lo, hi) in zip(ys, rows):
        c = BLUE if k else GREY
        ax.plot([lo, hi], [y, y], color=c, lw=3.0, solid_capstyle='butt', zorder=2)
        ax.plot([v], [y], 'o', color=c, ms=7, zorder=3)
        ax.text(hi + 2.0, y, f'{k}/24', va='center', fontsize=8.6, color=INK)
    ax.set_yticks(list(ys))
    ax.set_yticklabels([r[0] for r in rows])
    ax.invert_yaxis()
    ax.set_xlim(0, 100)
    ax.set_xlabel(T('비율 (%)'))
    frame(ax)
    fig.subplots_adjust(left=0.30 if LANG != 'en' else 0.34)
    save(fig, 'chart10_survey')


if __name__ == '__main__':
    chart_literacy()
    chart_health_literacy()
    chart_errors()
    chart_smartphone()
    chart_pictogram()
    chart_eval()
    chart_glyphs()
    chart_model()
    chart_country()
    chart_survey()
