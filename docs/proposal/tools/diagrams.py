from i18n import T, LANG, FIG as FIG_OUT
"""
구조 도판 — 사용자 흐름과 디스펜서 결선.

charts.py 와 같은 style.py 를 쓴다. 다만 요소가 다르다: 막대는 테두리 없는 단색
이지만 **도식의 영역 상자는 옅은 채움 + 진한 같은 계열 테두리**다. 참고 보고서의
구역별 전략지도가 그렇게 되어 있고, 상자 안에 글이 들어가야 하므로 그 편이 맞다.

도판 안에 그림 번호를 넣지 않는다. 번호는 본문이 매기고, 절을 넣거나 빼면 바뀐다 —
예전 흐름도에 T("[그림 11]") 이 박혀 있었는데 그 사이 번호가 12로 밀려 틀린 그림이
되어 있었다.

    python3 docs/proposal/tools/diagrams.py
"""
import matplotlib.patches as mp
import matplotlib.pyplot as plt

from style import BLUE, GREEN, GREY, INK, MUTED, ORANGE, RED, save

# 옅은 채움 + 진한 테두리 (도식 전용)
FILL = {BLUE: '#DCE6F5', GREEN: '#E2EDDB', ORANGE: '#FBE5D2',
        GREY: '#EFEFEF', RED: '#F7DEDE'}


def _em(s: str) -> float:
    """글자열의 대략적인 폭을 em 단위로. 한글 한 자는 라틴 두 자 폭이다."""
    return sum(1.0 if '가' <= c <= '힣' else 0.5 for c in s)


def _wrap(s: str, em_budget: float) -> list:
    """상자 폭에 맞춰 접는다. 영어는 한국어보다 길어서 접지 않으면 넘친다.

    한국어판은 이미 검토를 마친 도판이므로 접지 않고 그대로 둔다. 여기서
    줄을 바꾸면 확정된 그림이 조용히 달라진다."""
    if LANG != 'en' or _em(s) <= em_budget:
        return [s]
    out, cur = [], ''
    for word in s.split(' '):
        cand = f'{cur} {word}'.strip()
        if cur and _em(cand) > em_budget:
            out.append(cur)
            cur = word
        else:
            cur = cand
    if cur:
        out.append(cur)
    return out


def box(ax, x, y, w, h, head, lines=(), color=GREY, lw=1.6, fs=9.2):
    """상자 하나. 글 간격은 **상자 높이에 비례**해서 잡는다 — 절대 단위로 잡으면
    축 범위가 바뀔 때 전부 겹친다."""
    ax.add_patch(mp.FancyBboxPatch((x, y), w, h, boxstyle='round,pad=0,rounding_size=0.6',
                                   linewidth=lw, edgecolor=color,
                                   facecolor=FILL[color], zorder=2))
    ax.text(x + w / 2, y + h - h * 0.22, head, ha='center', va='center', fontsize=fs,
            fontweight='bold', color=INK, zorder=3)

    # 축 100 단위 = 그림 폭 6.0 인치. 7.6pt 글자의 1em 은 7.6/72 인치.
    sub = 7.6
    budget = (w - 1.6) / 100 * 6.0 / (sub / 72)
    wrapped = [ln for t in lines for ln in _wrap(t, budget)]
    step = 0.22 if len(wrapped) <= 2 else 0.19
    for i, t in enumerate(wrapped):
        ax.text(x + w / 2, y + h * (0.52 - i * step), t, ha='center', va='center',
                fontsize=sub, color=MUTED, zorder=3)


def arrow(ax, x1, y1, x2, y2, label=None, color=MUTED):
    ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
                arrowprops=dict(arrowstyle='-|>', color=color, lw=1.5,
                                shrinkA=2, shrinkB=2), zorder=4)
    if label:
        ax.text((x1 + x2) / 2, (y1 + y2) / 2 + 0.16, label, ha='center',
                fontsize=7.6, color=MUTED, zorder=4)


def canvas(w, h):
    fig, ax = plt.subplots(figsize=(w, h))
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 100 * h / w)
    ax.axis('off')
    fig.subplots_adjust(left=0.01, right=0.99, top=0.99, bottom=0.01)
    return fig, ax


# ── 사용자 흐름 ────────────────────────────────────────────────────
def userflow():
    fig, ax = canvas(6.0, 3.5)
    TOP = 56.0   # 위쪽 기준선 (ylim = 100*h/w = 58.3)

    ax.text(2, TOP + 0.4, T('최초 1회'), fontsize=8, color=MUTED)
    box(ax, 2, TOP - 8.6, 26, 8.4, T('첫 실행 안내'),
        [T('그림 다섯 장 + 음성'), T('건너뛸 수 있다')], GREY)
    arrow(ax, 28.6, TOP - 4.4, 33.4, TOP - 4.4)
    box(ax, 34, TOP - 8.6, 26, 8.4, T('프로필 설정'),
        [T('나이대 · 조건을 그림으로'), T('입력란이 없다')], BLUE)
    ax.text(47, TOP - 10.0, T('나이대를 모르면 판정 기준을 유도할 수 없다'),
            ha='center', fontsize=7.4, color=MUTED)

    M = TOP - 17.5
    ax.text(2, M + 0.4, T('매번'), fontsize=8, color=MUTED)
    steps = [(T('홈'), [T('촬영 버튼 하나')], GREY),
             (T('촬영'), [T('대상을 고르지 않는다')], GREY),
             (T('인식'), [T('OCR · 모델'), T('진행 상태를 표시')], GREY),
             (T('판정'), [T('물리 검사 통과 후'), T('개인 기준과 대조')], BLUE),
             (T('전달'), [T('그림 · 음성 · 색')], GREEN)]
    w, gap = 16.4, 3.0
    for i, (h_, ls, c) in enumerate(steps):
        x = 2 + i * (w + gap)
        box(ax, x, M - 9.4, w, 9.2, h_, ls, c, fs=9.0)
        if i:
            arrow(ax, x - gap + 0.4, M - 4.8, x - 0.6, M - 4.8)

    B = M - 15.5
    ax.text(2, B + 0.4, T('전달의 세 층 — 서로를 대체하지 않고 겹친다'),
            fontsize=8, color=MUTED)
    layers = [(T('그림'), [T('무엇을 해야 하는가'), T('SIGIL 합성 픽토그램')], BLUE),
              (T('음성'), [T('그 그림이 무슨 뜻인가'), T('VOCA 재구성 문장')], ORANGE),
              (T('색 + 기호'), [T('지금 안전한가'), T('색각이상 대응')], GREEN)]
    w2 = 30.4
    for i, (h_, ls, c) in enumerate(layers):
        box(ax, 2 + i * (w2 + 1.8), B - 10.4, w2, 10.2, h_, ls, c)

    ax.text(2, 8.4, T('설계 근거'), fontsize=8.4, color=MUTED, fontweight='bold')
    for i, t in enumerate([
            T('계층을 두지 않는다 — 비문해 사용자에게 깊은 계층형 65.5초 대 평면 목록형 25초 (Medhi 등, 2013)'),
            T('인식 과정을 감추지 않는다 — 아무 표시 없이 멈춘 화면은 고장으로 읽힌다 (Medhi, Cutrell & Toyama, 2010)'),
            T('색만으로 판정하지 않는다 (WCAG 1.4.1)')]):
        ax.text(12, 8.4 - i * 2.6, '· ' + t, fontsize=7.4, color=MUTED, va='center')
    save(fig, 'fig11_userflow')


if __name__ == '__main__':
    userflow()
