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

# ── 판정 기준이 어디서 나오는가 ─────────────────────────────────────
def verdict_flow():
    """§2.4 의 유도를 그림으로. 표에서 가져오지 않는다는 것이 논지다."""
    fig, ax = canvas(6.0, 2.9)
    TOP = 44.0

    ax.text(2, TOP + 1.2, T('사용자가 고른 것'), fontsize=8, color=MUTED)
    box(ax, 2, TOP - 7.4, 22, 7.2, T('나이 구간'), [T('그림 넷 중 하나')], BLUE)
    box(ax, 26, TOP - 7.4, 22, 7.2, T('조건'), [T('그림 카드')], BLUE)

    arrow(ax, 13, TOP - 8.0, 13, TOP - 12.4)
    arrow(ax, 37, TOP - 8.0, 37, TOP - 12.4)

    M = TOP - 12.6
    box(ax, 2, M - 7.2, 22, 7.0, T('대표 나이'), [T('7 · 15 · 35 · 70')], GREY)
    box(ax, 26, M - 7.2, 22, 7.0, T('유발 성분'), [T('조건마다 다름')], GREY)

    arrow(ax, 13, M - 7.8, 13, M - 12.2)
    B = M - 12.4
    box(ax, 2, B - 7.4, 22, 7.2, T('하루 에너지'), [T('1,200~2,400 kcal')], GREY)

    arrow(ax, 24.6, B - 3.8, 51.4, B - 3.8)
    box(ax, 52, B - 7.4, 46, 7.2, T('이 사람의 하루 기준치'),
        [T('유리당 10%E · 포화지방 10%E · 소금 5 g × 비율')], GREEN)

    arrow(ax, 37, M - 7.8, 37, B - 1.2)

    ax.text(2, 6.6, T('WHO 권고가 비율로 쓰여 있으므로 표가 아니라 유도로 푼다 (§2.4)'),
            fontsize=7.6, color=MUTED)
    ax.text(2, 3.4, T('같은 음료 한 캔이 7세에게는 경고, 성인에게는 무해가 되는 이유가 이 경로다'),
            fontsize=7.6, color=MUTED)
    save(fig, 'fig15_verdict_flow')


# ── 조건을 세 갈래로 묻는다 ─────────────────────────────────────────
def condition_branches():
    """§2.5. 진단명을 묻지 않는 이유가 세 상자의 폭 차이에 있다."""
    fig, ax = canvas(6.0, 2.2)
    TOP = 30.0
    ax.text(2, TOP + 1.4, T('"무슨 알레르기가 있습니까" 를 셋으로 나눈다'),
            fontsize=8.4, color=MUTED, fontweight='bold')
    items = [(T('지금 아는 것'), [T('임신 중 · 수유 중'), T('누구나 답할 수 있다')], GREEN),
             (T('겪은 것'), [T('먹고 속이 안 좋았던 적'), T('진단 없이도 답할 수 있다')], BLUE),
             (T('진단받은 것'), [T('당뇨 · 고혈압'), T('검사를 받은 사람만')], GREY)]
    w, gap = 31.0, 2.4
    for i, (h, ls, c) in enumerate(items):
        box(ax, 2 + i * (w + gap), TOP - 11.0, w, 10.8, h, ls, c)
    ax.text(2, 12.0, T('당뇨 성인의 43%, 고혈압 성인의 44% 는 셋째 칸에 답할 수 없다 (§1.5)'),
            fontsize=7.6, color=RED, fontweight='bold')
    ax.text(2, 8.4, T('앞의 두 칸이 있어야 그 사람들이 첫 화면에서 걸러지지 않는다'),
            fontsize=7.6, color=MUTED)
    save(fig, 'fig16_conditions')

# ── 세 경로가 하나의 관문을 지난다 ──────────────────────────────────
def gate_flow():
    """§4.2. 검사를 경로마다 두지 않고 한 곳에 모은 것이 이 그림의 요지다."""
    fig, ax = canvas(6.0, 3.4)
    TOP = 53.0

    ax.text(2, TOP + 1.4, T('영양 정보가 들어오는 세 경로'), fontsize=8.4,
            color=MUTED, fontweight='bold')
    srcs = [(T('영양성분표 OCR'), [T('기기 안')], GREY),
            (T('제품 데이터베이스'), [T('서버 경유')], GREY),
            (T('음식 사진 추정'), [T('기기 안 · 나중에 추가')], ORANGE)]
    w, gap = 30.0, 3.0
    for i, (h, ls, c) in enumerate(srcs):
        x = 2 + i * (w + gap)
        box(ax, x, TOP - 8.6, w, 8.4, h, ls, c)
        arrow(ax, x + w / 2, TOP - 9.2, 50, TOP - 14.0)

    M = TOP - 14.2
    box(ax, 12, M - 12.4, 76, 12.2, T('물리 검사 한 곳'),
        [T('범위 · 부분집합 · 질량 보존 · Atwater 항등식'),
         T('어느 경로로 들어왔는지 묻지 않는다')], BLUE)

    arrow(ax, 50, M - 13.0, 50, M - 17.4)
    box(ax, 24, M - 25.6, 52, 8.0, T('판정'), [T('이 사람의 하루 기준치와 대조')], GREEN)

    ax.text(2, 6.0, T('셋째 경로는 나중에 들어왔고, 그때 새로 쓴 검증 코드는 없다 (§4.2)'),
            fontsize=7.6, color=RED, fontweight='bold')
    ax.text(2, 2.6, T('경로마다 검사를 두면 붙이는 것을 잊은 경로가 검증 없는 통로가 된다'),
            fontsize=7.6, color=MUTED)
    save(fig, 'fig17_gate')

# ── 픽토그램이 배포되기까지 지나는 관문 ────────────────────────────
def gate_pictogram():
    """§5.2. 사다리가 사유에 걸려 있다는 것이 이 그림에서 볼 것이다."""
    fig, ax = canvas(6.0, 2.6)
    TOP = 40.0

    box(ax, 2, TOP - 8.0, 22, 7.8, T('그림 생성'), [T('형태소 하나')], GREY)
    arrow(ax, 24.6, TOP - 4.1, 29.4, TOP - 4.1)
    box(ax, 30, TOP - 8.0, 30, 7.8, T('관문 1. 기계 검사'),
        [T('잉크 비율 · 32px 생존'), T('덩어리 개수')], BLUE)
    arrow(ax, 60.6, TOP - 4.1, 65.4, TOP - 4.1)
    box(ax, 66, TOP - 8.0, 32, 7.8, T('관문 2. 의미 검사'),
        [T('"무엇으로 보이는가"'), T('보기를 주지 않는다')], BLUE)

    ax.text(82, TOP - 9.6, T('통과하면 설치'), ha='center', fontsize=7.6, color=GREEN)

    M = TOP - 13.0
    ax.text(2, M + 0.6, T('떨어지면 사유에 맞춰 다시 그린다'),
            fontsize=8.4, color=MUTED, fontweight='bold')
    rungs = [(T('뭉쳤다'), [T('더 작게 · 구멍을 뚫어')], ORANGE),
             (T('가늘다'), [T('더 두껍게 · 채워')], ORANGE),
             (T('개수가 다르다'), [T('정확히 그 수만큼')], ORANGE),
             (T('뜻이 안 맞는다'), [T('형태를 바꿔 · 무게는 그대로')], RED)]
    w, gap = 23.0, 2.0
    for i, (h, ls, c) in enumerate(rungs):
        box(ax, 2 + i * (w + gap), M - 10.4, w, 10.2, h, ls, c, fs=8.6)

    ax.text(2, 8.0, T('처음에는 시도 횟수로 사다리를 올렸다. 둘째 칸이 "더 두껍게" 였고,'),
            fontsize=7.6, color=MUTED)
    ax.text(2, 5.0, T('뭉쳐서 떨어진 그림에 그 지시를 주면 실패한 방향으로 더 민다.'),
            fontsize=7.6, color=MUTED)
    ax.text(2, 1.8, T('마지막 칸이 중요하다. 뜻이 어긋난 것은 형태의 문제이지 무게의 문제가 아니다.'),
            fontsize=7.6, color=RED, fontweight='bold')
    save(fig, 'fig18_pictogram_gate')

# ── 인식이 두 층으로 갈린다 ─────────────────────────────────────────
def recognition_layers():
    """§3.3. 글자가 있는 것은 기기에서 끝내고 통신이 필요한 것만 내보낸다."""
    fig, ax = canvas(6.0, 2.8)
    TOP = 42.0

    box(ax, 34, TOP - 7.4, 32, 7.2, T('사진 한 장'), [T('무엇을 찍었는지 고르지 않는다')], GREY)
    arrow(ax, 50, TOP - 8.0, 50, TOP - 12.0)

    M = TOP - 12.2
    box(ax, 22, M - 8.6, 56, 8.4, T('층 1. 기기 안에서 글자를 읽는다'),
        [T('표지와 영양소 이름을 센다')], BLUE)

    B = M - 12.8
    arrow(ax, 34, M - 9.2, 20, B - 1.0)
    arrow(ax, 66, M - 9.2, 80, B - 1.0)
    ax.text(15, M - 11.6, T('표지가 맞으면'), ha='center', fontsize=7.6, color=MUTED)
    ax.text(85, M - 11.6, T('글자가 없거나 안 맞으면'), ha='center', fontsize=7.6, color=MUTED)
    box(ax, 2, B - 9.4, 36, 9.2, T('전용 해석기'),
        [T('성분표 · 처방전'), T('서버를 부르지 않는다')], GREEN)
    box(ax, 62, B - 9.4, 36, 9.2, T('서버의 시각 모형'),
        [T('음식 · 음료'), T('인터넷이 필요하다')], ORANGE)

    ax.text(2, 5.0, T('이 순서 덕분에 처방전과 성분표는 인터넷 없이 읽힌다 (§4.5)'),
            fontsize=7.8, color=MUTED, fontweight='bold')
    ax.text(2, 1.8, T('이 앱에서 가장 급한 두 가지가 그 둘이다'),
            fontsize=7.6, color=MUTED)
    save(fig, 'fig19_recognition')

# ── 릴레이는 자기가 나르는 것을 읽지 못한다 ────────────────────────
def relay_keys():
    """§4.3. 인쇄된 열 글자에서 세 값이 갈라지고, 하나만 밖으로 나가지 않는다."""
    fig, ax = canvas(6.0, 2.4)
    TOP = 34.0

    box(ax, 34, TOP - 7.0, 32, 6.8, T('기기에 인쇄된 열 글자'), [T('양쪽이 각자 가지고 있다')], GREY)

    M = TOP - 11.4
    outs = [(T('기기 표'), [T('릴레이의 주소')], GREY),
            (T('접근 토큰'), [T('그 사서함의 권한')], GREY),
            (T('사서함 열쇠'), [T('일정을 연다')], GREEN)]
    w, gap = 30.0, 3.0
    for i, (h, ls, c) in enumerate(outs):
        x = 2 + i * (w + gap)
        box(ax, x, M - 8.6, w, 8.4, h, ls, c)
        arrow(ax, 50, TOP - 7.6, x + w / 2, M - 0.2)
        if i != 1:                      # 가운데는 화살표가 수직이라 글자가 겹친다
            ax.text(x + w / 2 + (-7 if i == 0 else 7), M + 1.4, 'HKDF',
                    ha='center', fontsize=7.4, color=MUTED)
    ax.text(50, TOP - 9.4, 'HKDF', ha='center', fontsize=7.4, color=MUTED,
            bbox=dict(boxstyle='square,pad=0.15', fc='white', ec='none'))

    ax.text(17, M - 10.6, T('릴레이가 본다'), ha='center', fontsize=7.8, color=MUTED)
    ax.text(50, M - 10.6, T('릴레이가 본다'), ha='center', fontsize=7.8, color=MUTED)
    ax.text(83, M - 10.6, T('릴레이가 절대 못 본다'), ha='center', fontsize=7.8,
            color=GREEN, fontweight='bold')

    ax.text(2, 5.0, T('오가는 것은 전부 AES-256-GCM 이고, 여는 열쇠를 어느 쪽도 보내지 않는다'),
            fontsize=7.6, color=MUTED)
    ax.text(2, 1.8, T('릴레이가 멎었든 닿지 않든, 일정은 이미 기기의 SD 카드에 있다 (§4.3)'),
            fontsize=7.6, color=MUTED)
    save(fig, 'fig20_relay_keys')


# ── 서비스워커가 자원마다 다르게 다룬다 ────────────────────────────
def sw_strategy():
    """§4.5. 세 갈래가 각각 다른 판단이라는 것을 나란히 놓는다."""
    fig, ax = canvas(6.0, 2.4)
    TOP = 34.0
    ax.text(2, TOP + 1.4, T('서비스워커가 요청을 가르는 세 갈래'),
            fontsize=8.4, color=MUTED, fontweight='bold')
    items = [(T('판정 API'), [T('가로채지 않는다'),
                              T('오래된 답보다 실패가 낫다')], RED),
             (T('화면 이동'), [T('네트워크 우선'),
                              T('접속되면 늘 최신')], GREY),
             (T('자산 · 모델 · OCR'), [T('캐시 우선'),
                                      T('처음 쓸 때 받는다')], GREEN)]
    w, gap = 31.0, 2.4
    for i, (h, ls, c) in enumerate(items):
        box(ax, 2 + i * (w + gap), TOP - 12.4, w, 12.2, h, ls, c)
    ax.text(2, 15.0, T('실패는 사용자가 알아차리지만 오래된 성공은 알아차리지 못한다'),
            fontsize=7.8, color=RED, fontweight='bold')
    ax.text(2, 11.4, T('16 MB 를 첫 화면에서 요구하면 망이 느린 곳에서는 앱이 안 열린 것처럼 보인다'),
            fontsize=7.6, color=MUTED)
    ax.text(2, 7.8, T('캐시 이름에 자산 지문을 찍는다. 지문이 없으면 고친 그림이 옛 그림으로 계속 나간다'),
            fontsize=7.6, color=MUTED)
    save(fig, 'fig21_sw')


if __name__ == '__main__':
    userflow()
    verdict_flow()
    condition_branches()
    gate_flow()
    gate_pictogram()
    recognition_layers()
    relay_keys()
    sw_strategy()
