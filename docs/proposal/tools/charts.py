"""
제안서 도표. 스타일 규칙은 style.py 에 있다.

수치는 전부 본문 표에 있는 것이고, 그 표의 값은 citations.md 에서 원문과 대조한
것만 쓴다. 대조하지 않은 값으로는 그래프를 그리지 않는다 — 그래프는 표보다 더
단정적으로 보이기 때문이다.

    python3 docs/proposal/tools/charts.py
"""
import matplotlib.pyplot as plt

from style import (AMBER, INK, MUTED, ROSE, SAGE, SLATE,
                   bars, frame, legend_row, save, title)


# ── 비율은 오르는데 머릿수는 는다 (UNESCO, 2025) ────────────────────
def chart_literacy():
    fig, ax1 = plt.subplots(figsize=(4.9, 2.7))
    title(fig, '문해율은 오르고, 비문해 인구는 는다',
          '사하라이남 아프리카 · UNESCO, 2025')
    yrs = ['2015', '2024']
    bars(ax1, yrs, [196, 225], [SLATE, SLATE], width=0.42)
    for x, v in zip(yrs, [196, 225]):
        ax1.text(x, v + 6, f'{v}M', ha='center', fontsize=8.6,
                 fontweight='bold', color=SLATE[1])
    ax1.set_ylabel('비문해 성인 (백만 명)')
    ax1.set_ylim(0, 290)
    frame(ax1)

    ax2 = ax1.twinx()
    ax2.plot(yrs, [65, 69], color=AMBER[1], marker='o', markersize=6,
             markerfacecolor='white', markeredgewidth=1.8, linewidth=2.0, zorder=4)
    for x, v in zip(yrs, [65, 69]):
        ax2.text(x, v - 3.8, f'{v}%', ha='center', fontsize=8.6,
                 fontweight='bold', color=AMBER[1])
    ax2.set_ylabel('성인 문해율 (%)', color=AMBER[1])
    ax2.set_ylim(50, 80)
    ax2.tick_params(axis='y', colors=AMBER[1])
    for s in ('top', 'left'):
        ax2.spines[s].set_visible(False)
    ax2.spines['right'].set_color(AMBER[1])
    legend_row(fig, [('비문해 성인 수', SLATE), ('문해율', AMBER)], y=-0.06)
    save(fig, 'chart01_literacy')


# ── 제한적 건강 문해력 (표 1) ──────────────────────────────────────
def chart_health_literacy():
    rows = [('65세 이상', 59.7, AMBER), ('소득 하위층', 45.6, SLATE),
            ('전체 성인', 39.6, SLATE), ('소득 상위층', 33.7, SAGE)]
    fig, ax = plt.subplots(figsize=(4.9, 2.4))
    title(fig, '건강정보이해능력이 충분하지 않은 비율',
          '한국 성인 · 국민건강영양조사, 2023')
    ys = list(range(len(rows)))
    for y, (_, v, (fill, edge)) in zip(ys, rows):
        ax.barh(y, v, height=0.58, facecolor=fill, edgecolor=edge,
                linewidth=1.4, zorder=2)
        ax.text(v + 1.4, y, f'{v}%', va='center', fontsize=8.6,
                fontweight='bold', color=edge)
    ax.set_yticks(ys, [r[0] for r in rows])
    ax.invert_yaxis()
    ax.set_xlabel('비율 (%)')
    ax.set_xlim(0, 72)
    frame(ax, grid_axis='x')
    save(fig, 'chart02_health_literacy')


# ── 복약 오류의 유형별 분포 (표 2) ─────────────────────────────────
def chart_errors():
    kinds = ['누락', '용량 오류', '시각 오류', '나머지']
    vals, hits = [32.9, 28.4, 23.2, 15.5], [51, 44, 36, 24]
    pal = [SAGE, SAGE, SAGE, SLATE]
    fig, ax = plt.subplots(figsize=(4.7, 2.5))
    title(fig, '조제 오류의 유형별 분포',
          '약사가 발견한 155건 · Anacleto 등, 2007')
    xs = list(range(len(kinds)))
    bars(ax, xs, vals, pal)
    for x, v, n in zip(xs, vals, hits):
        ax.text(x, v + 1.0, f'{v}%', ha='center', fontsize=8.6,
                fontweight='bold', color=INK)
        ax.text(x, v / 2, f'n={n}', ha='center', fontsize=7.4, color=MUTED)
    ax.set_xticks(xs, kinds)
    ax.set_ylabel('비율 (%)')
    ax.set_ylim(0, 40)
    frame(ax)
    legend_row(fig, [('그림으로 옮길 수 있는 지시', SAGE), ('그 밖', SLATE)], y=-0.09)
    save(fig, 'chart03_error_types')


# ── 연령대별 스마트폰 보유율 (표 3) ────────────────────────────────
def chart_smartphone():
    labels, vals = ['50세 미만', '50~64세', '65세 이상'], [97, 90, 78]
    pal = [SLATE, SLATE, AMBER]
    fig, ax = plt.subplots(figsize=(4.2, 2.5))
    title(fig, '연령대별 스마트폰 보유율', '미국 · Pew Research Center, 2025')
    xs = list(range(len(labels)))
    bars(ax, xs, vals, pal, width=0.5)
    for x, v, (_, e) in zip(xs, vals, pal):
        ax.text(x, v + 2.0, f'{v}%', ha='center', fontsize=8.8,
                fontweight='bold', color=e)
    ax.annotate('', xy=(2, 78), xytext=(0, 97),
                arrowprops=dict(arrowstyle='<->', color=MUTED, lw=0.9,
                                shrinkA=8, shrinkB=8))
    ax.text(1.0, 106, '격차 19%p', ha='center', fontsize=7.8, color=MUTED)
    ax.set_xticks(xs, labels)
    ax.set_ylabel('보유율 (%)')
    ax.set_ylim(0, 120)
    frame(ax)
    save(fig, 'chart04_smartphone')


# ── 픽토그램 이해도 기준 통과율 (표 4) ─────────────────────────────
def chart_pictogram():
    """가운데 둘은 같은 연구의 대조군·실험군이다 — 같은 46명에게 두 세트를 보였다."""
    rows = [('Gutierrez (2022)\nUSP+FIP 108종\nANSI 85%', 15.7, SLATE),
            ('Dowse & Ehlers (2001)\nUSP-DI 23종\nANSI 85%', 47.8, SLATE),
            ('같은 46명 · 현지 제작\n23종\nANSI 85%', 87.0, SAGE),
            ('Dowse (2023)\n현지 제작 10종\nISO 66.7%', 80.0, SAGE),
            ('본 연구 SIGIL\n78종 · 기계 판정', 69.2, AMBER)]
    fig, ax = plt.subplots(figsize=(6.4, 3.1))
    title(fig, '의약 픽토그램이 이해도 기준을 통과한 비율',
          '막대마다 적용된 기준이 다르다 — 같은 자로 잰 값이 아니다')
    xs = list(range(len(rows)))
    bars(ax, xs, [r[1] for r in rows], [r[2] for r in rows], width=0.6)
    for x, r in zip(xs, rows):
        ax.text(x, r[1] + 2.4, f'{r[1]:.0f}%', ha='center', fontsize=9,
                fontweight='bold', color=r[2][1])
    for y, lab, ls in [(67, 'ISO 9186-1  67%', '--'), (85, 'ANSI Z535.3  85%', ':')]:
        ax.axhline(y, color=ROSE[1], linestyle=ls, linewidth=1.0, zorder=1)
        ax.text(-0.46, y + 1.6, lab, fontsize=7.4, color=ROSE[1], ha='left')
    ax.set_xticks(xs, [r[0] for r in rows], fontsize=7.0)
    ax.set_ylabel('기준을 통과한 픽토그램 비율 (%)')
    ax.set_ylim(0, 100)
    frame(ax)
    legend_row(fig, [('국제 표준 세트', SLATE), ('현지 제작 세트', SAGE),
                     ('본 연구', AMBER)], y=-0.11)
    save(fig, 'chart05_pictogram_pass')


# ── 형성 평가 수정 전후 ────────────────────────────────────────────
def chart_eval():
    fig, ax = plt.subplots(figsize=(4.7, 2.5))
    title(fig, '형성 평가 — 수정 전후', '표본 처방전 × 사용자 조건 28회 시행')
    items = ['여섯 항목\n모두 만족', '픽토그램 0장으로\n끝난 시행']
    before, after = [0, 8], [27, 0]
    w = 0.34
    for i, (b, a) in enumerate(zip(before, after)):
        ax.bar(i - w / 2, b, w, facecolor=SLATE[0], edgecolor=SLATE[1],
               linewidth=1.4, zorder=2)
        ax.bar(i + w / 2, a, w, facecolor=SAGE[0], edgecolor=SAGE[1],
               linewidth=1.4, zorder=2)
        ax.text(i - w / 2, b + 0.7, str(b), ha='center', fontsize=8.4,
                fontweight='bold', color=SLATE[1])
        ax.text(i + w / 2, a + 0.7, str(a), ha='center', fontsize=8.4,
                fontweight='bold', color=SAGE[1])
    ax.set_xticks(range(len(items)), items)
    ax.set_ylabel('시행 수 (n = 28)')
    ax.set_ylim(0, 33)
    frame(ax)
    legend_row(fig, [('수정 전', SLATE), ('수정 후', SAGE)], y=-0.10)
    save(fig, 'chart06_formative')


# ── 형태소 78종 의미 검사 ──────────────────────────────────────────
def chart_glyphs():
    fig, ax = plt.subplots(figsize=(5.6, 2.0))
    title(fig, '형태소 78종의 1차 의미 검사', '오독 24종의 내역을 함께 나눈다')
    seg = [('의도한 대로 읽힘', 54, SAGE, 0),
           ('노출되는 것 — 재작업', 7, AMBER, 1),
           ('사전에만 존재 — 앱이 호출하지 않음', 17, SLATE, 0)]
    left = 0
    for label, v, (fill, edge), tier in seg:
        ax.barh(0, v, left=left, height=0.46, facecolor=fill, edgecolor=edge,
                linewidth=1.4, zorder=2)
        ax.text(left + v / 2, 0, str(v), ha='center', va='center',
                fontsize=9, fontweight='bold', color=edge)
        y = -0.38 if tier == 0 else -0.60
        ax.plot([left + v / 2] * 2, [-0.24, y + 0.04], color=MUTED,
                linewidth=0.6, zorder=1)
        ax.text(left + v / 2, y, label, ha='center', va='top',
                fontsize=7.4, color=MUTED)
        left += v
    ax.set_xlim(0, 78)
    ax.set_ylim(-1.05, 0.35)
    ax.set_yticks([])
    ax.set_xlabel('형태소 수 (전체 78종)')
    for s in ('top', 'right', 'left'):
        ax.spines[s].set_visible(False)
    save(fig, 'chart07_glyph_check')


# ── 영양 추정 모델의 항목별 오차 ───────────────────────────────────
def chart_model():
    rows = [('질량', 16.61), ('열량', 22.75), ('탄수화물', 30.60),
            ('단백질', 30.96), ('지방', 32.82)]
    mean = 26.75
    fig, ax = plt.subplots(figsize=(4.9, 2.6))
    title(fig, '영양 추정 모델의 항목별 오차',
          'Nutrition5k 공식 테스트 507접시 · 직접 채점')
    xs = list(range(len(rows)))
    pal = [SAGE if r[1] < mean else AMBER for r in rows]
    bars(ax, xs, [r[1] for r in rows], pal)
    for x, r, (_, e) in zip(xs, rows, pal):
        ax.text(x, r[1] + 1.1, f'{r[1]:.1f}%', ha='center', fontsize=8.6,
                fontweight='bold', color=e)
    ax.axhline(mean, color=MUTED, linestyle='--', linewidth=1.0, zorder=3)
    ax.text(len(rows) - 0.44, mean + 1.4, f'평균 {mean}%', fontsize=7.6,
            color=MUTED, ha='right')
    ax.set_xticks(xs, [r[0] for r in rows])
    ax.set_ylabel('MAE% (n = 507)')
    ax.set_ylim(0, 42)
    frame(ax)
    legend_row(fig, [('평균보다 나음', SAGE), ('평균보다 나쁨', AMBER)], y=-0.10)
    save(fig, 'chart08_model_mae')


if __name__ == '__main__':
    chart_literacy()
    chart_health_literacy()
    chart_errors()
    chart_smartphone()
    chart_pictogram()
    chart_eval()
    chart_glyphs()
    chart_model()
