"""
제안서 도표. 스타일 규칙은 style.py 에 있다 (참고: 팀 에너지환경탐구 보고서 도판).

수치는 전부 본문 표에 있는 것이고, 그 표의 값은 citations.md 에서 원문과 대조한
것만 쓴다. 대조하지 않은 값으로는 그래프를 그리지 않는다 — 그래프는 표보다 더
단정적으로 보이기 때문이다.

    python3 docs/proposal/tools/charts.py
"""
import matplotlib.pyplot as plt

import pathlib

from survey_data import field_answers, judgement, survey_who
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


def _wilson(k: int, n: int, z: float = 1.959963985):
    """Wilson 95% 신뢰구간. 표본이 작을 때 정규근사는 0 아래로 내려간다."""
    if not n:
        return 0.0, 0.0
    ph = k / n
    d = 1 + z * z / n
    c = ph + z * z / (2 * n)
    r = z * ((ph * (1 - ph) / n + z * z / (4 * n * n)) ** 0.5)
    return max(0.0, (c - r) / d), min(1.0, (c + r) / d)


# ── 고정 목록과 문법이 늘어나는 방식 ───────────────────────────────
def chart_expressive():
    """§1.9. 개수의 차이가 아니라 종류의 차이라는 주장을 수로 잰다.

    수는 engine/dictionary.json 에서 그대로 나온다. 머리 57 종에 슬롯이
    하나씩 있고 어느 수식어가 들어갈지 제한하는 목록이 없으므로,
    머리 하나를 더 만들면 수식어 21 종과 짝지을 자리가 함께 생긴다."""
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(6.0, 2.5))
    title(fig, T('고정 목록과 문법은 다른 속도로 늘어난다'),
          note=T('연산자(금지 · 하루 횟수 · 반쪽)를 적용하기 전의 수'))
    # 판이 둘이라 title() 의 기본 여백으로는 오른쪽 판의 눈금 이름이
    # 왼쪽 판의 막대 위에 얹힌다.
    fig.subplots_adjust(left=0.155, right=0.975, wspace=0.62)

    rows = [(T('USP 세트'), 81, LIGHT), (T('SIGIL 문법'), 1258, DARK)]
    for i, (lab, v, c) in enumerate(rows):
        a1.barh(i, v, height=0.5, color=c, zorder=2)
        a1.text(v + 30, i, f'{v:,}', va='center', fontsize=9.4,
                fontweight='bold', color=INK)
    a1.set_yticks(range(len(rows)))
    a1.set_yticklabels([r[0] for r in rows])
    a1.set_xlim(0, 1560)
    a1.set_ylim(-0.6, 1.6)
    a1.set_xlabel(T('지금 낼 수 있는 칸 수'))
    frame(a1, grid='x')

    rows2 = [(T('USP 심볼'), 1, LIGHT),
             (T('SIGIL 머리'), 21, BLUE),
             (T('SIGIL 수식어'), 57, DARK)]
    for i, (lab, v, c) in enumerate(rows2):
        a2.barh(i, v, height=0.5, color=c, zorder=2)
        a2.text(v + 1.4, i, f'+{v}', va='center', fontsize=9.4,
                fontweight='bold', color=INK)
    a2.set_yticks(range(len(rows2)))
    a2.set_yticklabels([r[0] for r in rows2])
    a2.set_xlim(0, 72)
    a2.set_ylim(-0.6, 2.6)
    a2.set_xlabel(T('하나를 더 만들 때 늘어나는 칸 수'))
    frame(a2, grid='x')
    save(fig, 'chart19_expressive')


# ── 고령 인구가 어디서 늘어나는가 ───────────────────────────────────
def chart_ageing():
    """§1.7. 규모와 지리적 이동, 그리고 그 사람들이 처한 자리.

    왼쪽 값은 WHO Ageing and health 자료 그대로다. 2050 년의 저·중소득국
    3분의 2 만 출처가 밝힌 분포이므로 그 해에만 갈라 그린다. 앞의 두 해를
    같은 비율로 갈라 그리면 자료에 없는 것을 그리게 된다."""
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(6.0, 2.6))
    title(fig, T('고령 인구는 늘면서 저·중소득국으로 옮겨간다'),
          note=T('왼쪽 WHO, 2024 · 오른쪽 65세 이상 · 질병관리청 2023, Lee 등 2021'))
    fig.subplots_adjust(left=0.132, right=0.975, wspace=0.16)

    yrs = [T('2020년'), T('2030년'), T('2050년')]
    tot = [1.0, 1.4, 2.1]
    a1.bar(range(3), tot, width=0.56, color=LIGHT, zorder=2)
    a1.bar([2], [1.4], width=0.56, color=DARK, zorder=3)
    for i, v in enumerate(tot):
        a1.text(i, v + 0.06, f'{v:.1f}', ha='center', fontsize=9.4,
                fontweight='bold', color=INK)
    # 막대 폭이 이 글보다 좁아 안에 넣으면 양쪽이 잘린다. 옆에 두고 선으로 잇는다.
    a1.plot([2.3, 2.52], [0.7, 0.7], color=MUTED, lw=0.7, zorder=4)
    a1.text(2.56, 0.7, T('저·중소득국\n3분의 2'), ha='left', va='center',
            fontsize=8.0, color=INK, fontweight='bold', zorder=4)
    a1.set_xticks(range(3))
    a1.set_xticklabels(yrs)
    a1.set_xlim(-0.62, 3.4)
    a1.set_ylim(0, 2.5)
    a1.set_ylabel(T('60세 이상 인구 (십억 명)'))
    frame(a1, grid='y')

    rows = [(T('스스로 약을 먹는다'), 79.4, DARK),
            (T('건강정보이해능력 적절'), 40.3, LIGHT),
            (T('복약 안전 교육 받음'), 28.2, LIGHT)]
    # 이름을 눈금에 두면 왼쪽 판의 막대 위에 얹힌다. 막대 위로 올린다.
    for i, (lab, v, c) in enumerate(rows):
        a2.barh(i, v, height=0.34, color=c, zorder=2)
        a2.text(v + 1.8, i, f'{v}%', va='center', fontsize=9.4,
                fontweight='bold', color=INK)
        a2.text(0.8, i - 0.36, lab, va='bottom', fontsize=8.2, color=INK)
    a2.set_yticks([])
    a2.invert_yaxis()
    a2.set_xlim(0, 100)
    a2.set_ylim(2.6, -0.75)
    a2.set_xlabel(T('한국 고령자에서의 비율 (%)'))
    frame(a2, grid='x')
    save(fig, 'chart20_ageing')


# ── 근거가 어느 쪽을 가리키는가 ─────────────────────────────────────
def chart_evidence():
    """§1.11. 받치는 근거와 깎는 근거를 나란히.

    수치를 세지 않고 항목을 적는다. 어느 인용이 어느 쪽인지는 문장의
    뜻이라 기계가 가릴 수 없다. 대신 §번호를 달아 확인할 수 있게 한다."""
    fig, ax = plt.subplots(figsize=(6.0, 3.1))
    title(fig, T('이 접근을 받치는 근거와 깎는 근거'),
          note=T('각 항목 끝의 절 번호에서 원문 서지와 함께 확인할 수 있다'))
    fig.subplots_adjust(left=0.02, right=0.98, top=0.86, bottom=0.06)
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 100)
    ax.axis('off')

    FOR = [T('그림은 문자보다 잘 기억된다 (§1.8)'),
           T('그림을 곁들이면 물약 용량 오류가 47.8%에서 5.4%로 (§1.8)'),
           T('RCT 54편 메타분석. 저건강문해력에서 특히 크다 (§1.8)'),
           T('그림에 음성을 더한 쪽이 셋 중 가장 나았다 (§1.8)'),
           T('현지에서 만든 세트가 통과율을 두 배로 (§1.8)')]
    AGAINST = [T('만들었다고 읽히지는 않는다. 108종 중 17종 (§1.8)'),
               T('같은 기호가 나라를 옮기면 94%에서 8%로 (§1.8)'),
               T('나이가 많을수록 그림으로 얻는 이득이 작다 (§1.8)'),
               T('문해력과 순응도의 상관은 유의하나 약하다 (§1.4)'),
               T('난이도를 낮추고 음성을 붙여도 순응도는 그대로 (§1.4)'),
               T('위해의 무게중심은 환자가 아니라 처방 단계 (§1.4)')]

    for col, (head, items, edge) in enumerate((
            (T('받친다'), FOR, DARK), (T('깎는다'), AGAINST, RED))):
        x = 2 + col * 50
        ax.text(x, 95, head, fontsize=9.6, fontweight='bold', color=INK)
        ax.plot([x, x + 46], [92.5, 92.5], color=edge, lw=1.2)
        for i, t in enumerate(items):
            y = 86 - i * 13.5
            ax.plot([x + 0.6, x + 0.6], [y - 8.4, y + 3.0], color=edge, lw=2.2,
                    solid_capstyle='butt')
            for j, ln in enumerate(_wrap_txt(t, 44)):
                ax.text(x + 3.2, y - j * 5.2, ln, fontsize=7.6, color=MUTED,
                        va='top')

    ax.text(2, 4, T('불리한 쪽이 더 길다. 그것을 줄이지 않는 것이 이 장의 방식이다'),
            fontsize=7.8, color=INK, fontweight='bold')
    save(fig, 'chart23_evidence')


def _wrap_txt(s, n):
    """글자 수로 접는다. 한글 한 자를 라틴 두 자로 센다."""
    out, cur, w = [], '', 0
    for word in s.split(' '):
        ww = sum(2 if '가' <= c <= '힣' else 1 for c in word) + 1
        if cur and w + ww > n:
            out.append(cur)
            cur, w = word, ww
        else:
            cur = f'{cur} {word}'.strip()
            w += ww
    if cur:
        out.append(cur)
    return out


# ── 손글씨 약 이름 200장 ────────────────────────────────────────────
def chart_handwriting():
    """§5.7. 낱말 단위 성적과, 확신도로 걸러낼 수 없다는 것.

    오른쪽 판이 설계 근거다. 남는 비율과 남은 것의 정확도가 반대로
    움직여 둘을 함께 만족하는 문턱이 없다."""
    import json
    ev = json.loads((pathlib.Path(__file__).resolve().parents[3]
                     / 'scripts' / 'handwriting-eval.json').read_text())
    sm, th = ev['summary'], ev['confidenceThresholds']
    n = sm['sampled']

    fig, (a1, a2) = plt.subplots(1, 2, figsize=(6.0, 2.6))
    title(fig, T('손글씨 약 이름 {n}장을 읽힌 결과').format(n=n),
          note=T('RxHandBD (Zenodo 18478741) · 방글라데시 실제 처방전에서 잘라낸 낱말'))
    fig.subplots_adjust(left=0.09, right=0.965, wspace=0.34)

    rows = [(T('정확히 읽음'), sm['exact'], BLUE),
            (T('한두 글자 어긋남'), sm['nearMiss'], RED),
            (T('전혀 다르게 읽음'), sm['wrong'], GREY)]
    # 축을 자료에서 잡는다. 상한을 고정해 두었더니 표본이 200에서 500으로
    # 커졌을 때 막대가 축을 넘고 숫자가 제목까지 올라갔다.
    top = max(v for _, v, _ in rows) * 1.34
    for i, (k, v, c) in enumerate(rows):
        a1.bar(i, v, 0.56, color=c, zorder=2)
        a1.text(i, v + top * 0.022, f'{v}', ha='center', fontsize=9.4,
                fontweight='bold', color=INK)
    a1.set_xticks(range(3))
    a1.set_xticklabels([r[0] for r in rows], fontsize=7.2)
    a1.set_ylim(0, top)
    a1.set_ylabel(T('장수'))
    a1.text(1, top * 0.93, T('붉은 칸이 더 위험하다'), ha='center',
            fontsize=7.4, color=RED)
    frame(a1, grid='y')

    xs = [t['threshold'] for t in th]
    a2.plot(xs, [t['keptPct'] for t in th], 'o-', color=GREY, lw=2.2, ms=5,
            label=T('남는 비율'), zorder=3)
    a2.plot(xs, [t['exactPctOfKept'] for t in th], 'o-', color=BLUE, lw=2.2, ms=5,
            label=T('남은 것의 정확도'), zorder=3)
    a2.set_xlabel(T('확신도 문턱'))
    a2.set_ylabel('%')
    a2.set_ylim(0, 112)
    a2.legend(fontsize=7.4, frameon=False, loc='lower left')
    a2.text(0.79, 26, T('문턱을 올려도\n정확해지지 않는다'), fontsize=7.4,
            color=RED, fontweight='bold', ha='right')
    frame(a2, grid='both')
    save(fig, 'chart21_handwriting')


# ── 처방전 전장 60장. 고치기 전과 뒤 ────────────────────────────────
def chart_pageeval():
    """§5.7. max_tokens 를 고치기 전과 뒤. 같은 60장이다.

    고치기 전 값 둘은 고친 뒤에 만들어진 JSON 에 없으므로 MEASUREMENTS.md
    §2 에서 옮겼다."""
    import json
    sm = json.loads((pathlib.Path(__file__).resolve().parents[3]
                     / 'scripts' / 'prescription-page-eval.json').read_text())['summary']
    # 고치기 전 값은 고친 뒤에 만들어진 JSON 에 없으므로 MEASUREMENTS.md §2
    # 에서 옮긴다. 표본이 60장에서 200장 전수로 바뀌었을 때 이 상수만
    # 옛 값으로 남아, 재현율이 오른 것이 떨어진 것처럼 보였다.
    BEFORE = {'seen': 95.5, 'recall': 83.2}          # MEASUREMENTS.md §2

    fig, ax = plt.subplots(figsize=(6.0, 2.3))
    title(fig, T('처방전 전장 {n}장. 답이 잘리던 것을 고치기 전과 뒤').format(n=sm['sampled']),
          note=T('Mendeley k62rfd23kz · 약 이름 영역 개수가 주석된 방글라데시 처방전'))

    pairs = [(T('처방전으로 알아본 비율'), BEFORE['seen'], sm['seenAsPrescriptionPct']),
             (T('약 가짓수 재현율'), BEFORE['recall'], sm['recallPct'])]
    w = 0.34
    for i, (k, b, a) in enumerate(pairs):
        ax.bar(i - w / 2, b, w, color=LIGHT, zorder=2)
        ax.bar(i + w / 2, a, w, color=DARK, zorder=2)
        ax.text(i - w / 2, b + 1.4, f'{b}%', ha='center', fontsize=9.0,
                fontweight='bold', color=MUTED)
        ax.text(i + w / 2, a + 1.4, f'{a}%', ha='center', fontsize=9.0,
                fontweight='bold', color=INK)
    ax.set_xticks(range(2))
    ax.set_xticklabels([p[0] for p in pairs], fontsize=8.4)
    ax.set_ylim(0, 132)
    ax.set_ylabel('%')
    ax.text(0.5, 116, T('통째로 실패하던 장은 무작위가 아니었다.\n전부 약이 가장 많은 처방전이다'),
            ha='center', fontsize=7.6, color=RED, fontweight='bold')
    frame(ax, grid='y')
    save(fig, 'chart22_pageeval')


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
    """비율만 그리면 분모가 작다는 것이 보이지 않는다. 구간을 함께 그린다.

    수치와 구간을 엑셀에서 읽고 Wilson 으로 다시 센다. 표 43 과 같은
    자료·같은 방법이어야 하므로 손으로 옮겨 적지 않는다."""
    n, counts = judgement()
    LAB = {'Partly — some of it, not all': '부분적으로',
           'Yes, probably': '예, 가능할 것 같다',
           'I have no basis to judge': '판단할 근거가 없다',
           'No': '아니오'}
    rows = []
    for key, k in counts:
        lo, hi = _wilson(k, n)
        rows.append((T(LAB[key]), k, 100 * k / n, 100 * lo, 100 * hi))
    fig, ax = plt.subplots(figsize=(6.0, 2.6))
    title(fig, T('전문가 판단 문항과 95% 신뢰구간 (n = {n})').format(n=n),
          note=T('점이 비율, 가로선이 95% 신뢰구간이다. 선이 긴 것이 표본이 작다는 뜻이다.'))
    ys = range(len(rows))
    for y, (lab, k, v, lo, hi) in zip(ys, rows):
        c = BLUE if k else GREY
        ax.plot([lo, hi], [y, y], color=c, lw=3.0, solid_capstyle='butt', zorder=2)
        ax.plot([v], [y], 'o', color=c, ms=7, zorder=3)
        ax.text(hi + 2.0, y, f'{k}/{n}', va='center', fontsize=8.6, color=INK)
    ax.set_yticks(list(ys))
    ax.set_yticklabels([r[0] for r in rows])
    ax.invert_yaxis()
    ax.set_xlim(0, 100)
    ax.set_xlabel(T('비율 (%)'))
    frame(ax)
    fig.subplots_adjust(left=0.30 if LANG != 'en' else 0.34)
    save(fig, 'chart10_survey')

# ── 예방 가능한 약물 위해가 어느 단계에서 생기는가 ──────────────────
def chart_harm_stage():
    """우리 논지를 깎는 자료라 오히려 크게 그린다. 무게중심은 처방 쪽이다."""
    fig, ax = plt.subplots(figsize=(6.0, 2.7))
    title(fig, T('예방 가능한 약물 위해가 생기는 단계 (WHO, 2024)'),
          note=T('저·중소득국에서 처방 단계로 더 쏠린다. 이 앱은 처방 단계에 개입하지 않는다.'))
    labs = [T('처방·지시'), T('모니터링·보고'), T('그 밖')]
    world = [53, 36, 11]
    h = 0.36
    for i, v in enumerate(world):
        ax.barh(i - h / 2, v, h, color=GREY, zorder=2,
                label=T('전 세계') if i == 0 else None)
        ax.text(v + 1.5, i - h / 2, f'{v}%', va='center', fontsize=9,
                fontweight='bold', color=INK)
    ax.barh(h / 2, 80, h, color=RED, zorder=2, label=T('저·중소득국'))
    ax.text(81.5, h / 2, '80%', va='center', fontsize=9, fontweight='bold', color=RED)
    ax.set_yticks(range(len(labs)))
    ax.set_yticklabels(labs)
    ax.invert_yaxis()
    ax.set_xlim(0, 100)
    ax.set_xlabel(T('예방 가능한 위해 중 비율 (%)'))
    legend_in(ax, 'lower right')
    frame(ax)
    fig.subplots_adjust(left=0.24 if LANG != 'en' else 0.27)
    save(fig, 'chart11_harm_stage')


# ── 정책이 어디까지 내려와 있는가 ───────────────────────────────────
def chart_policy_depth():
    """승인에서 조직으로 갈수록 줄어드는 것이 이 그림의 논지다."""
    fig, ax = plt.subplots(figsize=(6.0, 2.4))
    title(fig, T('Medication Without Harm 이 국가 단위로 내려온 정도 (WHO, 2024)'),
          note=T('받아들인 나라와 실제로 조직을 둔 나라 사이가 세 배 벌어진다.'))
    labs = [T('과제를 승인하고 이행 중'), T('국가 전문가 조직을 둠'), T('감축 목표를 수로 세움')]
    vals = [74, 24, 18]
    cols = [GREY, ORANGE, RED]
    for i, (v, c) in enumerate(zip(vals, cols)):
        ax.barh(i, v, 0.55, color=c, zorder=2)
        ax.text(v + 1.5, i, f'{v}%', va='center', fontsize=9.4,
                fontweight='bold', color=c if c != GREY else INK)
    ax.set_yticks(range(len(labs)))
    ax.set_yticklabels(labs)
    ax.invert_yaxis()
    ax.set_xlim(0, 100)
    ax.set_xlabel(T('WHO 회원국 중 비율 (%)'))
    frame(ax)
    fig.subplots_adjust(left=0.30 if LANG != 'en' else 0.33)
    save(fig, 'chart12_policy_depth')

# ── "읽지 못한다" 는 세 갈래로 갈린다 ───────────────────────────────
def chart_three_layers():
    """세 수치는 서로 겹치고 분모도 다르다. 그림에 그대로 적는다."""
    fig, ax = plt.subplots(figsize=(6.0, 2.5))
    title(fig, T('처방전을 읽지 못하는 세 갈래'),
          note=T('셋은 서로 겹치며 출처와 분모가 다르다. 크기를 견주려고 놓은 것이 아니다.'))
    labs = [T('시력 손상 (WHO)'), T('비문해 성인 (UNESCO)'), T('선진국 최저 문해 수준 (PIAAC)')]
    vals = [2200, 739, None]
    cols = [ORANGE, DARK, GREY]
    for i, (v, c) in enumerate(zip(vals[:2], cols[:2])):
        ax.barh(i, v, 0.5, color=c, zorder=2)
        ax.text(v + 45, i, T('{v}억 명').format(v=f'{v/100:.0f}'),
                va='center', fontsize=9.4, fontweight='bold', color=c)
    ax.text(45, 2, T('31개국 성인의 18% · 분모가 달라 막대로 그리지 않는다'),
            va='center', fontsize=8.4, color=MUTED, zorder=4,
            bbox=dict(boxstyle='square,pad=0.25', fc='white', ec='none'))
    ax.set_yticks(range(3))
    ax.set_yticklabels(labs)
    ax.invert_yaxis()
    ax.set_xlim(0, 2600)
    ax.set_xlabel(T('사람 수 (백만 명)'))
    frame(ax)
    fig.subplots_adjust(left=0.32 if LANG != 'en' else 0.36)
    save(fig, 'chart13_three_layers')

# ── 항생제 내성이 지역별로 어디에 몰리는가 ─────────────────────────
def chart_amr_region():
    """§1.1 의 문해율이 가장 낮은 지역과 겹친다는 것이 이 그림의 논지다."""
    fig, ax = plt.subplots(figsize=(6.0, 2.6))
    title(fig, T('보고된 세균 감염 중 항생제 내성 비율 (WHO GLASS, 2025)'),
          note=T('세계 평균은 여섯 중 하나다. 값이 높은 두 지역에 문해율이 가장 낮은 나라들이 있다.'))
    labs = [T('동남아시아 · 동지중해'), T('아프리카'), T('세계 평균'), T('아메리카')]
    vals = [33.3, 20.0, 16.7, 14.3]
    frac = [T('셋 중 하나'), T('다섯 중 하나'), T('여섯 중 하나'), T('일곱 중 하나')]
    cols = [RED, ORANGE, DARK, GREY]
    for i, (v, c, f) in enumerate(zip(vals, cols, frac)):
        ax.barh(i, v, 0.55, color=c, zorder=2)
        ax.text(v + 0.7, i, f, va='center', fontsize=9, fontweight='bold',
                color=c if c != GREY else INK)
    ax.set_yticks(range(len(labs)))
    ax.set_yticklabels(labs)
    ax.invert_yaxis()
    ax.set_xlim(0, 45)
    ax.set_xlabel(T('내성을 보인 감염의 비율 (%)'))
    frame(ax)
    fig.subplots_adjust(left=0.29 if LANG != 'en' else 0.32)
    save(fig, 'chart14_amr_region')

# ── 조사 응답자가 어디서 왔는가 ─────────────────────────────────────
def chart_survey_who():
    """직군과 대륙을 나란히. 누가 답했는지가 이 조사의 무게다.

    수치는 엑셀에서 읽는다. 손으로 박아 두면 응답이 늘었을 때 charts.py 를
    돌려도 그림이 그대로이고, 돌렸으니 됐다고 넘어가게 된다."""
    total, raw_fields, raw_conts = survey_who()
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(6.0, 2.6))
    title(fig, T('전문가 조사 응답자 {n}명의 구성').format(n=total),
          note=T('왼쪽은 응답자가 고른 분야, 오른쪽은 일한다고 적은 지역이다.'))

    fields = [(T(k), v) for k, v in raw_fields]
    cols = [BLUE, GREEN, GREY, ORANGE, LIGHT]
    a1.pie([v for _, v in fields], labels=[f'{k}\n{v}' for k, v in fields],
           colors=cols, startangle=90, counterclock=False,
           wedgeprops=dict(width=0.42, edgecolor='white', linewidth=1.4),
           textprops=dict(fontsize=7.8, color=INK))
    a1.set_title(T('분야'), fontsize=9, color=MUTED, pad=2)

    conts = [(T(k), v) for k, v in raw_conts]
    y = range(len(conts))
    for i, (k, v) in enumerate(conts):
        a2.barh(i, v, 0.6, color=DARK if i == 0 else GREY, zorder=2)
        a2.text(v + 0.5, i, str(v), va='center', fontsize=8.6,
                fontweight='bold', color=INK)
    a2.set_yticks(list(y))
    a2.set_yticklabels([k for k, _ in conts], fontsize=8)
    a2.invert_yaxis()
    a2.set_xlim(0, 30)
    a2.set_title(T('대륙'), fontsize=9, color=MUTED, pad=2)
    frame(a2)
    fig.subplots_adjust(left=0.02, right=0.97, wspace=0.55)
    save(fig, 'chart15_survey_who')

# ── 같은 기호가 나라를 옮기면 ───────────────────────────────────────
def chart_symbol_country():
    """94%와 8%. 국제 표준이라는 이름이 이해도를 보장하지 않는다."""
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(6.0, 2.5))
    title(fig, T('같은 국제 표준 기호를 네 나라에 시험한 결과 (Hermans 등, 2011)'),
          note=T('왼쪽은 18종 중 ISO 기준을 넘긴 수, 오른쪽은 생물학적 위험 기호 하나의 정답률.'))

    labs = [T('벨기에'), T('쿠바'), T('콩고민주공화국'), T('캄보디아')]
    passed = [6, 6, 2, 1]
    for i, v in enumerate(passed):
        a1.barh(i, v, 0.58, color=GREY if v >= 6 else RED, zorder=2)
        a1.text(v + 0.25, i, str(v), va='center', fontsize=9, fontweight='bold', color=INK)
    a1.set_yticks(range(4)); a1.set_yticklabels(labs, fontsize=8)
    a1.invert_yaxis(); a1.set_xlim(0, 9)
    a1.set_xlabel(T('18종 중 통과한 수'), fontsize=8.4)
    frame(a1)

    two = [(T('쿠바'), 94.1, GREY), (T('콩고민주공화국'), 8.0, RED)]
    for i, (k, v, c) in enumerate(two):
        a2.bar(i, v, 0.5, color=c, zorder=2)
        a2.text(i, v + 4, f'{v}%', ha='center', fontsize=10, fontweight='bold', color=c)
    a2.set_xticks(range(2)); a2.set_xticklabels([k for k, _, _ in two], fontsize=8)
    a2.set_ylim(0, 125)
    a2.set_ylabel(T('정답률 (%)'), fontsize=8.4)
    frame(a2)
    fig.subplots_adjust(left=0.17, right=0.97, wspace=0.5)
    save(fig, 'chart16_symbol_country')

# ── 형태소를 오류 분포에서 거꾸로 내려왔다 ─────────────────────────
def chart_morpheme_map():
    """왼쪽이 §1.3 의 오류, 오른쪽이 §2.2 의 형태소. 두 축이 이어져 있다."""
    fig, ax = plt.subplots(figsize=(6.0, 3.0))
    title(fig, T('형태소 78종의 갈래와 복약 오류 분포의 대응'),
          note=T('진한 막대가 표 4 의 상위 세 오류에 곧바로 대응하는 갈래다.'))
    rows = [(T('제형·기기·행위'), 26, False, T('무엇을')),
            (T('음식'), 10, False, T('무엇을')),
            (T('알레르겐'), 9, False, T('무엇을 피하나')),
            (T('증상'), 8, False, T('무엇을 겪었나')),
            (T('상태'), 7, False, T('누구인가')),
            (T('부위'), 6, False, T('어디에')),
            (T('개수'), 5, True, T('얼마나 · 용량 오류 28.4%')),
            (T('시각'), 4, True, T('언제 · 시각 오류 23.2%')),
            (T('보관'), 3, False, T('어떻게'))]
    for i, (lab, v, hot, note_) in enumerate(rows):
        ax.barh(i, v, 0.62, color=RED if hot else GREY, zorder=2)
        ax.text(v + 0.6, i, f'{v}', va='center', fontsize=9, fontweight='bold',
                color=RED if hot else INK)
        ax.text(v + 2.6, i, note_, va='center', fontsize=7.8,
                color=RED if hot else MUTED)
    ax.set_yticks(range(len(rows)))
    ax.set_yticklabels([r[0] for r in rows], fontsize=8.4)
    ax.invert_yaxis()
    ax.set_xlim(0, 34)
    ax.set_xlabel(T('형태소 수 (합계 78)'))
    frame(ax)
    fig.subplots_adjust(left=0.22 if LANG != 'en' else 0.26)
    save(fig, 'chart17_morpheme_map')

# ── 약국과 간호가 무엇을 답했는가 ───────────────────────────────────
def chart_field_answers():
    """분모가 작으므로 백분율 대신 사람 수로 그린다. 수치는 엑셀에서 읽는다."""
    PH, NU = 'Pharmacy / medication counselling', 'Nursing / public health'

    def one(field, q, want):
        return sum(v for a, v in field_answers(field, q) if want(a))

    n_ph = sum(v for _, v in field_answers(PH, 'b_field'))
    n_nu = sum(v for _, v in field_answers(NU, 'b_field'))
    ph = [(T('약사가 매번 검토'), one(PH, 'ph2_review', lambda a: a.startswith('Yes, every'))),
          (T('조제하면서 권할 수 있다'), one(PH, 'ph8_workflow', lambda a: a.startswith('Yes, while'))),
          (T('그림·음성만으로 안 되는 것이 있다'), one(PH, 'ph5_boundary', lambda a: a.startswith('Yes'))),
          (T('용량·횟수가 가장 중요'), one(PH, 'ph4_medical', lambda a: a.startswith('Dose')))]
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(6.0, 2.2))
    title(fig, T('약국 {p}명과 간호·보건 {n}명이 답한 것').format(p=n_ph, n=n_nu),
          note=T('분모가 작아 백분율 대신 사람 수로 적었다. 한 사람이 8%p 를 움직인다.'))
    for i, (k, v) in enumerate(ph):
        a1.barh(i, v, 0.58, color=BLUE, zorder=2)
        a1.text(v + 0.2, i, f'{v}/{n_ph}', va='center', fontsize=8.6,
                fontweight='bold', color=INK)
    a1.set_yticks(range(len(ph)))
    a1.set_yticklabels([k for k, _ in ph], fontsize=7.4)
    a1.invert_yaxis(); a1.set_xlim(0, 13)
    a1.set_title(T('약국·복약지도 ({n}명)').format(n=n_ph), fontsize=9, color=MUTED, pad=3)
    frame(a1)

    nu = [(T('조건이 갖춰지면 결과를 바꾼다'), 8),
          (T('그런 환자를 본 적이 있다'), 8),
          (T('환자와 보호자를 각각 다르게'), 6),
          (T('복약순응도 도구로 재야 한다'), 6)]
    for i, (k, v) in enumerate(nu):
        a2.barh(i, v, 0.58, color=GREEN, zorder=2)
        a2.text(v + 0.2, i, f'{v}/9', va='center', fontsize=8.6,
                fontweight='bold', color=INK)
    a2.set_yticks(range(len(nu)))
    a2.set_yticklabels([k for k, _ in nu], fontsize=7.4)
    a2.invert_yaxis(); a2.set_xlim(0, 11)
    a2.set_title(T('간호·보건 ({n}명)').format(n=n_nu), fontsize=9, color=MUTED, pad=3)
    frame(a2)
    fig.subplots_adjust(left=0.29, right=0.98, wspace=1.25)
    save(fig, 'chart18_field_answers')


if __name__ == '__main__':
    chart_literacy()
    chart_health_literacy()
    chart_errors()
    chart_smartphone()
    chart_pictogram()
    chart_eval()
    chart_glyphs()
    chart_expressive()
    chart_ageing()
    chart_evidence()
    chart_handwriting()
    chart_pageeval()
    chart_model()
    chart_country()
    chart_survey()
    chart_harm_stage()
    chart_policy_depth()
    chart_three_layers()
    chart_amr_region()
    chart_survey_who()
    chart_symbol_country()
    chart_morpheme_map()
    chart_field_answers()
