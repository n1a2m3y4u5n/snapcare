"""
구조 도판 — 사용자 흐름과 디스펜서 결선.

charts.py 와 같은 style.py 를 쓴다. 다만 요소가 다르다: 막대는 테두리 없는 단색
이지만 **도식의 영역 상자는 옅은 채움 + 진한 같은 계열 테두리**다. 참고 보고서의
구역별 전략지도가 그렇게 되어 있고, 상자 안에 글이 들어가야 하므로 그 편이 맞다.

도판 안에 그림 번호를 넣지 않는다. 번호는 본문이 매기고, 절을 넣거나 빼면 바뀐다 —
예전 흐름도에 "[그림 11]" 이 박혀 있었는데 그 사이 번호가 12로 밀려 틀린 그림이
되어 있었다.

    python3 docs/proposal/tools/diagrams.py
"""
import matplotlib.patches as mp
import matplotlib.pyplot as plt

from style import BLUE, GREEN, GREY, INK, MUTED, ORANGE, RED, save

# 옅은 채움 + 진한 테두리 (도식 전용)
FILL = {BLUE: '#DCE6F5', GREEN: '#E2EDDB', ORANGE: '#FBE5D2',
        GREY: '#EFEFEF', RED: '#F7DEDE'}


def box(ax, x, y, w, h, head, lines=(), color=GREY, lw=1.6, fs=9.2):
    """상자 하나. 글 간격은 **상자 높이에 비례**해서 잡는다 — 절대 단위로 잡으면
    축 범위가 바뀔 때 전부 겹친다."""
    ax.add_patch(mp.FancyBboxPatch((x, y), w, h, boxstyle='round,pad=0,rounding_size=0.6',
                                   linewidth=lw, edgecolor=color,
                                   facecolor=FILL[color], zorder=2))
    ax.text(x + w / 2, y + h - h * 0.22, head, ha='center', va='center', fontsize=fs,
            fontweight='bold', color=INK, zorder=3)
    for i, t in enumerate(lines):
        ax.text(x + w / 2, y + h * (0.52 - i * 0.22), t, ha='center', va='center',
                fontsize=7.6, color=MUTED, zorder=3)


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
    T = 56.0   # 위쪽 기준선 (ylim = 100*h/w = 58.3)

    ax.text(2, T + 0.4, '최초 1회', fontsize=8, color=MUTED)
    box(ax, 2, T - 8.6, 26, 8.4, '첫 실행 안내',
        ['그림 다섯 장 + 음성', '건너뛸 수 있다'], GREY)
    arrow(ax, 28.6, T - 4.4, 33.4, T - 4.4)
    box(ax, 34, T - 8.6, 26, 8.4, '프로필 설정',
        ['나이대 · 조건을 그림으로', '입력란이 없다'], BLUE)
    ax.text(47, T - 10.0, '나이대를 모르면 판정 기준을 유도할 수 없다',
            ha='center', fontsize=7.4, color=MUTED)

    M = T - 17.5
    ax.text(2, M + 0.4, '매번', fontsize=8, color=MUTED)
    steps = [('홈', ['촬영 버튼 하나'], GREY),
             ('촬영', ['대상을 고르지 않는다'], GREY),
             ('인식', ['OCR · 모델', '진행 상태를 표시'], GREY),
             ('판정', ['물리 검사 통과 후', '개인 기준과 대조'], BLUE),
             ('전달', ['그림 · 음성 · 색'], GREEN)]
    w, gap = 16.4, 3.0
    for i, (h_, ls, c) in enumerate(steps):
        x = 2 + i * (w + gap)
        box(ax, x, M - 9.4, w, 9.2, h_, ls, c, fs=9.0)
        if i:
            arrow(ax, x - gap + 0.4, M - 4.8, x - 0.6, M - 4.8)

    B = M - 15.5
    ax.text(2, B + 0.4, '전달의 세 층 — 서로를 대체하지 않고 겹친다',
            fontsize=8, color=MUTED)
    layers = [('그림', ['무엇을 해야 하는가', 'SIGIL 합성 픽토그램'], BLUE),
              ('음성', ['그 그림이 무슨 뜻인가', 'VOCA 재구성 문장'], ORANGE),
              ('색 + 기호', ['지금 안전한가', '색각이상 대응'], GREEN)]
    w2 = 30.4
    for i, (h_, ls, c) in enumerate(layers):
        box(ax, 2 + i * (w2 + 1.8), B - 10.4, w2, 10.2, h_, ls, c)

    ax.text(2, 8.4, '설계 근거', fontsize=8.4, color=MUTED, fontweight='bold')
    for i, t in enumerate([
            '계층을 두지 않는다 — 비문해 사용자에게 깊은 계층형 65.5초 대 평면 목록형 25초 (Medhi 등, 2013)',
            '인식 과정을 감추지 않는다 — 아무 표시 없이 멈춘 화면은 고장으로 읽힌다 (Medhi, Cutrell & Toyama, 2010)',
            '색만으로 판정하지 않는다 (WCAG 1.4.1)']):
        ax.text(12, 8.4 - i * 2.6, '· ' + t, fontsize=7.4, color=MUTED, va='center')
    save(fig, 'fig11_userflow')


if __name__ == '__main__':
    userflow()
