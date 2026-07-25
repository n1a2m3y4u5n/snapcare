"""SIGIL 형태소의 도형 정의.

각 글리프는 Canvas 를 받아 그리는 함수 하나다. 손그림 시절에는 형태소를 늘리려면
같은 손으로 같은 톤을 다시 내야 했지만, 여기서는 함수를 하나 더 쓰면 된다 —
그것이 '대량화' 가 뜻하는 바다.

이름은 assets/{role}/{name}.png 로 그대로 나간다 (engine.py 의 계약).
"""

import math

from draw import Canvas, STROKE, THIN

# ─────────────────────────────────────────────────────────────
# HEAD — 문장의 주어. 무엇에 대한 이야기인가.
# ─────────────────────────────────────────────────────────────


def hand_wash(c: Canvas) -> None:
    # 손가락을 하나씩 그렸더니 작게 줄었을 때 빗처럼 보였다. 손은 실루엣 하나로 두고,
    # 손가락은 윗변의 완만한 굴곡으로만 암시한다.
    c.path([(0.30, 0.86), (0.30, 0.44), (0.34, 0.34), (0.44, 0.32), (0.50, 0.38),
            (0.56, 0.30), (0.66, 0.32), (0.70, 0.44), (0.70, 0.86)], closed=True)
    c.path([(0.30, 0.56), (0.18, 0.50), (0.16, 0.62), (0.30, 0.70)], w=STROKE)   # 엄지
    for x, y in ((0.42, 0.16), (0.58, 0.12), (0.50, 0.06)):                      # 물
        c.circle(x, y, 0.05, fill=True)


def glucometer(c: Canvas) -> None:
    c.rect(0.30, 0.16, 0.70, 0.84, r=0.06)
    c.rect(0.38, 0.26, 0.62, 0.44, r=0.02, w=THIN)          # 표시창
    c.circle(0.50, 0.62, 0.07, w=THIN)                       # 버튼
    c.path([(0.50, 0.84), (0.50, 0.92)], w=THIN)             # 스트립


def thermometer(c: Canvas) -> None:
    c.rect(0.43, 0.12, 0.57, 0.66, r=0.07)
    c.circle(0.50, 0.76, 0.12)
    c.circle(0.50, 0.76, 0.05, fill=True)
    for y in (0.24, 0.34, 0.44):
        c.path([(0.60, y), (0.68, y)], w=THIN)


def capsule_strip(c: Canvas) -> None:
    # 캡슐 하나. 두 색이 아니라 가운데 이음선으로 캡슐임을 알린다 (단색이므로).
    c.rect(0.18, 0.38, 0.82, 0.62, r=0.12)
    c.path([(0.50, 0.38), (0.50, 0.62)], w=STROKE)


def tablet_blister(c: Canvas) -> None:
    c.circle(0.50, 0.50, 0.30)
    c.path([(0.50, 0.24), (0.50, 0.76)], w=STROKE)           # 분할선


def pill_bottle(c: Canvas) -> None:
    c.rect(0.40, 0.12, 0.60, 0.24, r=0.02)                   # 뚜껑
    c.rect(0.28, 0.24, 0.72, 0.88, r=0.06)
    c.rect(0.38, 0.44, 0.62, 0.68, r=0.02, w=THIN)           # 라벨


def liquid_bottle(c: Canvas) -> None:
    c.path([(0.42, 0.10), (0.42, 0.28), (0.30, 0.42), (0.30, 0.86),
            (0.70, 0.86), (0.70, 0.42), (0.58, 0.28), (0.58, 0.10)], closed=True)
    c.path([(0.30, 0.62), (0.70, 0.62)], w=THIN)             # 액면


def dropper_bottle(c: Canvas) -> None:
    c.rect(0.34, 0.40, 0.66, 0.88, r=0.06)
    c.rect(0.44, 0.16, 0.56, 0.40, r=0.04)                   # 스포이트 관
    c.circle(0.50, 0.12, 0.09)                               # 고무 꼭지
    c.circle(0.50, 0.96, 0.03, fill=True)                    # 떨어지는 방울


def cream_tube(c: Canvas) -> None:
    c.path([(0.36, 0.24), (0.32, 0.86), (0.68, 0.86), (0.64, 0.24)], closed=True)
    c.rect(0.42, 0.10, 0.58, 0.24, r=0.02)                   # 캡
    c.path([(0.32, 0.78), (0.68, 0.78)], w=THIN)             # 압착선


def inhaler(c: Canvas) -> None:
    c.rect(0.34, 0.14, 0.62, 0.56, r=0.05)                   # 캐니스터
    c.path([(0.34, 0.56), (0.34, 0.80), (0.72, 0.80), (0.72, 0.64)], closed=True)   # 마우스피스
    for i in range(3):                                        # 분사
        c.path([(0.76 + i * 0.04, 0.66 - i * 0.03), (0.82 + i * 0.04, 0.60 - i * 0.03)], w=THIN)


def sachet(c: Canvas) -> None:
    c.rect(0.26, 0.24, 0.74, 0.84, r=0.03)
    zig = []
    for i in range(9):
        zig.append((0.26 + i * 0.06, 0.24 if i % 2 == 0 else 0.16))
    c.path(zig, w=THIN)                                       # 톱니 개봉선


def suppository(c: Canvas) -> None:
    c.path([(0.50, 0.12), (0.66, 0.36), (0.66, 0.76), (0.50, 0.88),
            (0.34, 0.76), (0.34, 0.36)], closed=True)


def syringe(c: Canvas) -> None:
    c.rect(0.30, 0.34, 0.70, 0.58, r=0.02)                    # 배럴
    c.path([(0.70, 0.46), (0.90, 0.46)], w=THIN)              # 바늘
    c.path([(0.30, 0.46), (0.14, 0.46)], w=THIN)              # 밀대
    c.path([(0.14, 0.36), (0.14, 0.56)], w=STROKE)            # 손잡이
    c.path([(0.44, 0.34), (0.44, 0.58)], w=THIN)              # 눈금


def state_pregnant(c: Canvas) -> None:
    # 배를 호(arc)로 그렸더니 몸에서 떨어진 선처럼 보였다. 원으로 겹쳐 붙인다.
    c.circle(0.42, 0.16, 0.11)
    c.path([(0.42, 0.27), (0.40, 0.44)], w=STROKE)
    c.circle(0.52, 0.56, 0.19)                                # 배
    c.path([(0.38, 0.44), (0.34, 0.62)], w=STROKE)            # 등
    c.path([(0.36, 0.72), (0.34, 0.92)], w=STROKE)            # 다리
    c.path([(0.50, 0.75), (0.54, 0.92)], w=STROKE)


def state_breastfeeding(c: Canvas) -> None:
    # 팔을 호로 두르니 아기 머리와 겹쳐 뭉쳤다. 팔은 아래를 받치는 선 하나로 줄이고
    # 아기는 머리+몸을 붙여 하나의 덩어리로 보이게 한다.
    c.circle(0.30, 0.18, 0.11)                                 # 어른 머리
    c.path([(0.30, 0.29), (0.28, 0.92)], w=STROKE)             # 어른 몸
    c.circle(0.62, 0.42, 0.13)                                 # 아기 머리
    c.path([(0.62, 0.55), (0.62, 0.70), (0.44, 0.70)], w=STROKE)   # 아기 몸
    c.path([(0.29, 0.56), (0.44, 0.78), (0.72, 0.74)], w=STROKE)   # 받친 팔


# ── 알레르겐: 음식 그 자체를 크게. '피하라' 는 사전의 `no` 합성 연산자가 얹는다.
#    처음엔 낱개 글리프마다 금지 원을 그렸는데, 40px 로 줄이면 여덟 개가 전부 같은
#    동그라미에 사선으로 보였다 — 무엇을 피하라는 것인지가 사라지면 뜻이 없다.
#    실루엣은 음식이 차지하고, 금지는 조합이 맡는 편이 옳다.


def allergen_peanut(c: Canvas) -> None:
    c.circle(0.50, 0.32, 0.19)
    c.circle(0.50, 0.68, 0.19)
    c.path([(0.34, 0.44), (0.40, 0.50), (0.34, 0.56)], w=THIN)
    c.path([(0.66, 0.44), (0.60, 0.50), (0.66, 0.56)], w=THIN)


def allergen_tree_nut(c: Canvas) -> None:
    # 도토리는 갓이 넓어 깔때기처럼 보였다. 호두로 바꾼다 — 땅콩(원 두 개)·달걀(타원)과
    # 실루엣이 겹치지 않아야 작게 줄었을 때 구별된다.
    c.circle(0.50, 0.52, 0.32)
    c.path([(0.50, 0.20), (0.50, 0.84)], w=STROKE)
    c.arc(0.36, 0.52, 0.16, 270, 90)
    c.arc(0.64, 0.52, 0.16, 90, 270)


def allergen_milk(c: Canvas) -> None:
    c.path([(0.28, 0.36), (0.28, 0.88), (0.72, 0.88), (0.72, 0.36)], w=STROKE)
    c.path([(0.28, 0.36), (0.50, 0.14), (0.72, 0.36)], closed=True)
    c.path([(0.28, 0.62), (0.72, 0.62)], w=THIN)


def allergen_egg(c: Canvas) -> None:
    # 위아래 폭이 같아 잎사귀처럼 보였다. 아래를 넓혀 달걀 비례로.
    c.path([(0.50, 0.12), (0.66, 0.34), (0.74, 0.60), (0.66, 0.82), (0.50, 0.90),
            (0.34, 0.82), (0.26, 0.60), (0.34, 0.34)], closed=True)


def allergen_gluten(c: Canvas) -> None:
    c.path([(0.50, 0.20), (0.50, 0.90)], w=STROKE)
    for i in range(4):
        y = 0.24 + i * 0.16
        c.path([(0.50, y + 0.10), (0.24, y)], w=STROKE)
        c.path([(0.50, y + 0.10), (0.76, y)], w=STROKE)


def allergen_shellfish(c: Canvas) -> None:
    # 새우는 갈고리로, 게는 사슴으로 보였다 — 다리와 집게가 작게 줄면 그냥 뻗은 선이다.
    # 가리비 껍데기는 부채꼴 실루엣 하나로 남고 방사선이 그것을 조개로 못박는다.
    c.path([(0.14, 0.68), (0.22, 0.40), (0.50, 0.22), (0.78, 0.40), (0.86, 0.68)], w=STROKE)
    c.path([(0.14, 0.68), (0.30, 0.80), (0.50, 0.84), (0.70, 0.80), (0.86, 0.68)], w=STROKE)
    for a in (-52, -26, 0, 26, 52):
        r = math.radians(a - 90)
        c.path([(0.50 + 0.16 * math.cos(r), 0.80 + 0.16 * math.sin(r)),
                (0.50 + 0.52 * math.cos(r), 0.80 + 0.52 * math.sin(r))], w=THIN)
    c.circle(0.50, 0.82, 0.05, fill=True)                      # 경첩


def allergen_soy(c: Canvas) -> None:
    # 콩을 채워 그렸더니 꼬투리 선과 붙어 검은 덩어리가 됐다. 꼬투리를 닫힌 도형으로 두고
    # 콩은 속을 비워 그린다 — 안이 비어야 '안에 들어 있다'로 읽힌다.
    c.path([(0.12, 0.62), (0.34, 0.30), (0.66, 0.24), (0.88, 0.38),
            (0.70, 0.70), (0.36, 0.78)], closed=True)
    for x, y in ((0.32, 0.56), (0.50, 0.48), (0.68, 0.44)):
        c.circle(x, y, 0.085, w=THIN)


def allergen_sesame(c: Canvas) -> None:
    for x, y in ((0.34, 0.36), (0.66, 0.42), (0.44, 0.68)):
        c.path([(x, y - 0.14), (x + 0.11, y), (x, y + 0.14), (x - 0.11, y)], closed=True)


# ─────────────────────────────────────────────────────────────
# MODIFIER — 주어를 한정한다. 어디에, 언제, 몇 개.
# ─────────────────────────────────────────────────────────────


def _pointed(c: Canvas, draw_part) -> None:
    """신체 부위는 화살표로 '여기에' 를 붙인다. 부위만 그리면 그림일 뿐 지시가 아니다."""
    draw_part(c)
    c.arrow(0.16, 0.86, 0.34, 0.66)


def body_eye(c: Canvas) -> None:
    def part(c: Canvas) -> None:
        c.path([(0.28, 0.48), (0.50, 0.32), (0.72, 0.48), (0.50, 0.64)], closed=True)
        c.circle(0.50, 0.48, 0.08, fill=True)
    _pointed(c, part)


def body_ear(c: Canvas) -> None:
    def part(c: Canvas) -> None:
        c.arc(0.52, 0.46, 0.20, 100, 340)
        c.arc(0.54, 0.46, 0.09, 120, 320)
        c.path([(0.52, 0.66), (0.50, 0.74)], w=THIN)
    _pointed(c, part)


def body_mouth(c: Canvas) -> None:
    def part(c: Canvas) -> None:
        c.path([(0.28, 0.46), (0.50, 0.36), (0.72, 0.46), (0.50, 0.62)], closed=True)
        c.path([(0.28, 0.46), (0.72, 0.46)], w=THIN)
    _pointed(c, part)


def body_skin(c: Canvas) -> None:
    def part(c: Canvas) -> None:
        c.rect(0.30, 0.30, 0.72, 0.64, r=0.05)
        for i in range(3):
            c.path([(0.38 + i * 0.12, 0.38), (0.38 + i * 0.12, 0.56)], w=THIN)
    _pointed(c, part)


def food_bowl(c: Canvas) -> None:
    c.arc(0.50, 0.48, 0.28, 0, 180)
    c.path([(0.22, 0.48), (0.78, 0.48)], w=STROKE)
    for x in (0.40, 0.50, 0.60):                              # 담긴 것
        c.circle(x, 0.40, 0.05, fill=True)


def food_empty_bowl(c: Canvas) -> None:
    c.arc(0.50, 0.48, 0.28, 0, 180)
    c.path([(0.22, 0.48), (0.78, 0.48)], w=STROKE)
    c.cross(0.50, 0.30, 0.08, w=THIN)                         # 비어 있음 = 공복


def water_glass(c: Canvas) -> None:
    c.path([(0.34, 0.22), (0.40, 0.84), (0.60, 0.84), (0.66, 0.22)], closed=True)
    c.path([(0.37, 0.46), (0.63, 0.46)], w=THIN)              # 수면


def storage_fridge(c: Canvas) -> None:
    c.rect(0.30, 0.12, 0.70, 0.88, r=0.05)
    c.path([(0.30, 0.40), (0.70, 0.40)], w=THIN)              # 칸 구분
    c.path([(0.62, 0.24), (0.62, 0.34)], w=THIN)              # 손잡이
    c.path([(0.62, 0.48), (0.62, 0.60)], w=THIN)


def _sun(c: Canvas, cy: float, rays: bool) -> None:
    c.circle(0.50, cy, 0.14)
    if rays:
        for i in range(8):
            a = i * math.pi / 4
            c.path([(0.50 + 0.20 * math.cos(a), cy + 0.20 * math.sin(a)),
                    (0.50 + 0.28 * math.cos(a), cy + 0.28 * math.sin(a))], w=THIN)


def time_morning(c: Canvas) -> None:
    # 화살표를 해 한가운데 두었더니 해를 관통해 다른 기호처럼 보였다. 옆으로 뺀다.
    _sun(c, 0.52, rays=False)
    c.path([(0.10, 0.74), (0.90, 0.74)], w=STROKE)            # 지평선
    c.arrow(0.82, 0.60, 0.82, 0.30)


def time_noon(c: Canvas) -> None:
    _sun(c, 0.50, rays=True)


def time_evening(c: Canvas) -> None:
    _sun(c, 0.52, rays=False)
    c.path([(0.10, 0.74), (0.90, 0.74)], w=STROKE)
    c.arrow(0.82, 0.30, 0.82, 0.60)


def time_night(c: Canvas) -> None:
    c.arc(0.46, 0.50, 0.28, 40, 320)                          # 초승달
    c.arc(0.60, 0.50, 0.26, 55, 305)
    for x, y in ((0.78, 0.26), (0.86, 0.44)):
        c.circle(x, y, 0.035, fill=True)


def _dots(c: Canvas, n: int) -> None:
    """개수는 숫자가 아니라 점으로 센다. 숫자를 읽을 수 있다면 이 앱이 필요 없다."""
    cols = 2 if n <= 4 else 3
    rows = math.ceil(n / cols)
    r = 0.10 if n <= 4 else 0.085
    for i in range(n):
        cx = 0.5 + ((i % cols) - (cols - 1) / 2) * 0.26
        cy = 0.5 + ((i // cols) - (rows - 1) / 2) * 0.26
        c.circle(cx, cy, r, fill=True)


def qty_one(c: Canvas) -> None:
    _dots(c, 1)


def qty_two(c: Canvas) -> None:
    _dots(c, 2)


def qty_three(c: Canvas) -> None:
    _dots(c, 3)


def qty_four(c: Canvas) -> None:
    _dots(c, 4)


def qty_five(c: Canvas) -> None:
    _dots(c, 5)


# ── 증상: 식이 일지가 되묻는 네 가지. 부위 글리프와 달리 '아프다' 가 실려야 한다.
def symptom_skin(c: Canvas) -> None:
    c.rect(0.26, 0.30, 0.74, 0.70, r=0.06)
    for x, y in ((0.40, 0.44), (0.56, 0.42), (0.48, 0.58), (0.62, 0.60)):
        c.circle(x, y, 0.045, fill=True)                      # 두드러기


def symptom_gut(c: Canvas) -> None:
    c.circle(0.50, 0.54, 0.26)
    c.path([(0.38, 0.58), (0.46, 0.50), (0.54, 0.58), (0.62, 0.50)], w=THIN)   # 뒤틀림
    c.path([(0.38, 0.44), (0.62, 0.44)], w=THIN)


def symptom_breath(c: Canvas) -> None:
    # 기도를 그렸더니 무슨 그림인지 알 수 없었다. 흐르는 공기와 그것이 막힌 표시로 바꾼다.
    for i, y in enumerate((0.28, 0.44, 0.60)):
        w = 0.30 - i * 0.04
        c.path([(0.50 - w, y), (0.50 + w, y)], w=STROKE)
    c.cross(0.50, 0.44, 0.20, w=STROKE)


def symptom_mouth(c: Canvas) -> None:
    c.path([(0.24, 0.50), (0.50, 0.34), (0.76, 0.50), (0.50, 0.68)], closed=True)
    c.path([(0.24, 0.50), (0.76, 0.50)], w=THIN)
    for x in (0.34, 0.50, 0.66):                              # 부어오름
        c.circle(x, 0.28, 0.045, fill=True)


HEADS = {
    "hand_wash": hand_wash, "glucometer": glucometer, "thermometer": thermometer,
    "capsule_strip": capsule_strip, "tablet_blister": tablet_blister, "pill_bottle": pill_bottle,
    "liquid_bottle": liquid_bottle, "dropper_bottle": dropper_bottle, "cream_tube": cream_tube,
    "inhaler": inhaler, "sachet": sachet, "suppository": suppository, "syringe": syringe,
    "state_pregnant": state_pregnant, "state_breastfeeding": state_breastfeeding,
    "allergen_peanut": allergen_peanut, "allergen_tree_nut": allergen_tree_nut,
    "allergen_milk": allergen_milk, "allergen_egg": allergen_egg,
    "allergen_gluten": allergen_gluten, "allergen_shellfish": allergen_shellfish,
    "allergen_soy": allergen_soy, "allergen_sesame": allergen_sesame,
}

MODIFIERS = {
    "body_eye": body_eye, "body_ear": body_ear, "body_mouth": body_mouth, "body_skin": body_skin,
    "food_bowl": food_bowl, "food_empty_bowl": food_empty_bowl, "water_glass": water_glass,
    "storage_fridge": storage_fridge,
    "time_morning": time_morning, "time_noon": time_noon,
    "time_evening": time_evening, "time_night": time_night,
    "qty_one": qty_one, "qty_two": qty_two, "qty_three": qty_three,
    "qty_four": qty_four, "qty_five": qty_five,
    "symptom_skin": symptom_skin, "symptom_gut": symptom_gut,
    "symptom_breath": symptom_breath, "symptom_mouth": symptom_mouth,
}
