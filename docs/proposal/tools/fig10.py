"""
[그림 10] 디스펜서 — 결선 구조와 기기 자신의 콘솔.

실물 사진 대신 두 가지를 나란히 둔다. 왼쪽은 ASSEMBLY.md 와 config.py 의 핀 맵에서
그린 결선 구조이고, 오른쪽은 그 펌웨어를 노트북에서 그대로 띄워(서보만 모의) 얻은
기기 자신의 콘솔이다. 사진 한 장으로는 보이지 않는 것 — 어떤 핀에 무엇이 붙는지,
전원 레일이 왜 둘인지, 놓친 복용이 어떻게 남는지 — 이 두 장에는 남는다.

도판 안에 제목을 넣지 않는다(캡션은 문서 쪽).
"""
from pathlib import Path
from i18n import T, LANG, FIG as FIG_OUT, FIG_SRC

HERE = Path(__file__).resolve().parent
FIG = FIG_OUT          # docs/proposal/fig
PARTS = FIG_SRC / 'parts'              # 도판 조립에 쓰는 중간 재료
ROOT = HERE.parents[2]             # 레포 루트

from PIL import Image, ImageDraw, ImageFont
S = 2

# 색은 charts.py 와 같은 Office 팔레트를 쓴다 (참고 보고서에서 뽑은 값).
INK, SUB, MUTE = (0, 0, 0), (89, 89, 89), (140, 140, 148)
LINE, FILL = (191, 191, 191), (245, 245, 245)
BLUE, GREEN, ORANGE = (68, 114, 196), (84, 130, 53), (237, 125, 49)
RED = (192, 0, 0)


def F(sz, bold=False):
    return ImageFont.truetype('/System/Library/Fonts/AppleSDGothicNeo.ttc', sz * S,
                              index=(3 if bold else 1))


def MONO(sz):
    return ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', sz * S)


W, H = 1000, 520
img = Image.new('RGB', (W * S, H * S), 'white')
d = ImageDraw.Draw(img)


def box(x, y, w, h, label, sub=None, color=LINE, fill=FILL):
    d.rounded_rectangle([x * S, y * S, (x + w) * S, (y + h) * S], radius=6 * S,
                        outline=color, width=2, fill=fill)
    d.text((x * S + 9 * S, y * S + 7 * S), label, font=F(10, True), fill=INK)
    if sub:
        d.text((x * S + 9 * S, y * S + 22 * S), sub, font=F(8), fill=MUTE)


def wire(x1, y1, x2, y2, color=LINE):
    d.line([x1 * S, y1 * S, x2 * S, y2 * S], fill=color, width=2)


def pin(x, y, text, color=SUB):
    d.text((x * S, y * S), text, font=MONO(7), fill=color)


# ── 왼쪽: 결선 구조 ────────────────────────────────────────────────
PX, PY, PW, PH = 152, 232, 128, 96
box(PX, PY, PW, PH, 'Raspberry Pi 3B', T('40핀 헤더 · BCM 번호'), color=BLUE, fill=(220, 230, 245))

PERIPH = [
    (24, 40, 'DS3231 RTC', 'GPIO 2/3 (I²C) · 3.3 V', T('전원이 끊겨도 시각을 안다')),
    (24, 108, T('WS2812 링 12px'), 'GPIO 18 · 330 Ω', T('초록/파랑/호박/보라')),
    (24, 352, T('피에조 버저'), 'GPIO 23 · 100 Ω', T('2.7 kHz — 난청이 덜 미치는 대역')),
    (24, 420, T('확인 버튼'), 'GPIO 24 → GND', T('20 ms 글리치 필터')),
]
for x, y, name, gp, note in PERIPH:
    box(x, y, 116, 46, name, gp)
    d.text((x * S, (y + 50) * S), note, font=F(7), fill=MUTE)
    wire(x + 116, y + 23, PX, PY + (10 if y < PY else PH - 10))

# 서보 3개
for i, (tray, gpio) in enumerate([(1, 17), (2, 27), (3, 22)]):
    sy = 196 + i * 58
    box(322, sy, 106, 44, T('SG90 트레이 {tray}').format(tray=tray),
        T('GPIO {gpio} · 신호만').format(gpio=gpio))
    wire(PX + PW, PY + 20 + i * 28, 322, sy + 22)
d.text((322 * S, (196 + 3 * 58 + 4) * S), T('트레이 4–8은 핀만 예약되어 있다'), font=F(7), fill=MUTE)

# 전원 두 갈래 — 이 도판에서 가장 중요한 부분
box(152, 400, 276, 86, T('전원 레일이 둘인 이유'), None, color=ORANGE, fill=(251, 229, 210))
d.text((161 * S, 424 * S), T('Pi 전용 5 V 2.5 A  ·  서보·링 전용 5 V 2 A+'), font=F(9), fill=INK)
d.text((161 * S, 440 * S),
       T('SG90 한 개가 걸리면 약 700 mA 를 끈다. 같은 레일에서 뽑으면 Pi 가'),
       font=F(8), fill=SUB)
d.text((161 * S, 453 * S),
       T('브라운아웃으로 내려앉고, 그 순간 쓰이던 파일이 "이 복용을 이미 줬는가"'),
       font=F(8), fill=SUB)
d.text((161 * S, 466 * S),
       T('를 적는 파일이다. 접지는 공통으로 묶는다.'), font=F(8), fill=SUB)

# ── 오른쪽: 기기 자신의 콘솔 ───────────────────────────────────────
RX = 470
for name, y, h in [('_c_status.png', 40, 210), ('_c_log.png', 286, 140)]:
    im = Image.open(PARTS / name).convert('RGB')
    w = round(im.width * h / im.height)
    im = im.resize((w * S, h * S), Image.LANCZOS)
    img.paste(im, (RX * S, y * S))

d.text((RX * S, 262 * S), T('기기 상태 — 시각·서보 백엔드·트레이별 GPIO·다음 복용'), font=F(8), fill=MUTE)
d.text((RX * S, 434 * S), T('복용 기록 — 손으로 내린 것 한 건과 놓친 복용 두 건'), font=F(8), fill=MUTE)
d.text((RX * S, 466 * S),
       T('노트북에서 같은 펌웨어를 그대로 띄운 것이다. 서보 드라이버만 기록용으로'),
       font=F(8), fill=SUB)
d.text((RX * S, 479 * S),
       T('바꿨고 API·스케줄러·저장은 기기에서 도는 것과 같은 코드다.'),
       font=F(8), fill=SUB)

img.resize((W, H), Image.LANCZOS).save(FIG / 'fig10_dispenser.png')
print('fig10_dispenser.png')
