"""SIGIL 형태소의 도형 정의.

각 글리프는 Canvas 를 받아 그리는 함수 하나다. 손그림 시절에는 형태소를 늘리려면
같은 손으로 같은 톤을 다시 내야 했지만, 여기서는 함수를 하나 더 쓰면 된다 —
그것이 '대량화' 가 뜻하는 바다.

그리는 방식은 draw.py 의 주석에 있다. 요점은 둘이다: 유기적인 형태는 smooth() 로
곡선을 쓰고(직선 폴리라인만 갖고 그렸더니 병도 손도 달걀도 각져 손그림만 못했다),
실루엣은 채우고 안쪽은 구멍으로 판다(40px 에서는 얇은 선이 가장 먼저 사라진다).

이름은 assets/{role}/{name}.png 로 그대로 나간다 (engine.py 의 계약).
"""

import math

from draw import Canvas, STROKE, THIN, HAIR

# ─────────────────────────────────────────────────────────────
# HEAD — 문장의 주어. 무엇에 대한 이야기인가.
# ─────────────────────────────────────────────────────────────

# ── 제형 ────────────────────────────────────────────────────


def capsule_strip(c: Canvas) -> None:
    c.rect(0.12, 0.36, 0.88, 0.64, r=0.14, fill=True)
    c.hole_rect(0.47, 0.36, 0.53, 0.64, r=0)             # 두 반쪽의 이음매


def tablet_blister(c: Canvas) -> None:
    c.circle(0.50, 0.50, 0.33, fill=True)
    c.hole_path([(0.50, 0.22), (0.50, 0.78)], w=THIN)    # 분할선


def pill_bottle(c: Canvas) -> None:
    c.rect(0.36, 0.08, 0.64, 0.22, r=0.03, fill=True)    # 뚜껑
    c.rect(0.26, 0.20, 0.74, 0.92, r=0.08, fill=True)
    c.hole_rect(0.36, 0.42, 0.64, 0.72, r=0.02)          # 라벨
    c.circle(0.50, 0.57, 0.09, fill=True)                # 라벨 안의 알약


def liquid_bottle(c: Canvas) -> None:
    c.blob([(0.42, 0.08), (0.58, 0.08), (0.58, 0.26), (0.72, 0.42),
            (0.72, 0.88), (0.28, 0.88), (0.28, 0.42), (0.42, 0.26)])
    c.hole_path([(0.32, 0.60), (0.68, 0.60)], w=THIN)    # 액면


def dropper_bottle(c: Canvas) -> None:
    c.circle(0.50, 0.13, 0.11, fill=True)                # 고무 꼭지
    c.rect(0.44, 0.16, 0.56, 0.42, r=0.02, fill=True)
    c.rect(0.30, 0.40, 0.70, 0.86, r=0.07, fill=True)
    c.hole_rect(0.38, 0.52, 0.62, 0.72, r=0.02)
    c.blob([(0.50, 0.90), (0.545, 0.955), (0.50, 0.99), (0.455, 0.955)])   # 떨어지는 방울


def cream_tube(c: Canvas) -> None:
    c.rect(0.42, 0.06, 0.58, 0.20, r=0.02, fill=True)    # 캡
    c.blob([(0.36, 0.20), (0.64, 0.20), (0.70, 0.86), (0.30, 0.86)])
    c.hole_path([(0.32, 0.76), (0.68, 0.76)], w=HAIR)    # 압착선
    c.hole_path([(0.32, 0.68), (0.68, 0.68)], w=HAIR)


def inhaler(c: Canvas) -> None:
    # L 자를 통째로 곡선 실루엣으로 그렸더니 부츠가 됐다. 캐니스터(세로)와
    # 마우스피스(가로)를 각진 두 덩어리로 분리해야 흡입기로 읽힌다.
    c.rect(0.24, 0.10, 0.52, 0.56, r=0.06, fill=True)    # 캐니스터
    c.rect(0.20, 0.52, 0.56, 0.84, r=0.05, fill=True)    # 본체
    c.rect(0.54, 0.60, 0.84, 0.78, r=0.07, fill=True)    # 마우스피스
    c.hole_path([(0.26, 0.24), (0.50, 0.24)], w=HAIR)
    for i in range(3):                                    # 분사
        c.circle(0.90 + i * 0.03, 0.69 - i * 0.10, 0.028, fill=True)


def sachet(c: Canvas) -> None:
    c.rect(0.24, 0.22, 0.76, 0.90, r=0.03, fill=True)
    c.poly([(0.24, 0.22), (0.76, 0.22), (0.76, 0.10)]
           + [(0.24 + i * 0.065, 0.10 if i % 2 else 0.20) for i in range(8, -1, -1)])
    c.hole_path([(0.24, 0.32), (0.76, 0.32)], w=HAIR)


def suppository(c: Canvas) -> None:
    # 민 탄환 모양은 달걀·기름 방울과 겹쳤다. 알약이 포장 안에 있다는 것이 보여야
    # 좌약으로 읽힌다 — 양끝의 꼬임이 그 표시다.
    c.blob([(0.50, 0.18), (0.66, 0.38), (0.66, 0.70), (0.50, 0.84), (0.34, 0.70), (0.34, 0.38)])
    c.poly([(0.36, 0.20), (0.64, 0.20), (0.70, 0.06), (0.30, 0.06)])
    c.poly([(0.36, 0.82), (0.64, 0.82), (0.70, 0.96), (0.30, 0.96)])
    c.hole_path([(0.34, 0.19), (0.66, 0.19)], w=HAIR)
    c.hole_path([(0.34, 0.83), (0.66, 0.83)], w=HAIR)


def syringe(c: Canvas) -> None:
    c.rect(0.28, 0.36, 0.72, 0.56, r=0.03, fill=True)    # 배럴
    c.path([(0.72, 0.46), (0.94, 0.46)], w=THIN)         # 바늘
    c.path([(0.28, 0.46), (0.16, 0.46)], w=THIN)         # 밀대
    c.rect(0.08, 0.32, 0.17, 0.60, r=0.03, fill=True)    # 손잡이
    c.hole_rect(0.34, 0.40, 0.56, 0.52, r=0.01)          # 눈금창


def patch(c: Canvas) -> None:
    # 구멍 뚫린 사각형은 명함이나 배지로 보였다. 반창고는 가운데 패드가 있어야 한다.
    c.rect(0.08, 0.36, 0.92, 0.64, r=0.13, fill=True)
    c.hole_rect(0.34, 0.36, 0.66, 0.64, r=0.03)           # 가운데 패드
    c.rect(0.36, 0.38, 0.64, 0.62, r=0.02, fill=True)
    for dx in (-0.06, 0, 0.06):
        for dy in (-0.05, 0.05):
            c.hole_circle(0.50 + dx, 0.50 + dy, 0.018)    # 패드의 구멍


def spray(c: Canvas) -> None:
    c.rect(0.34, 0.30, 0.66, 0.90, r=0.06, fill=True)
    c.rect(0.42, 0.16, 0.58, 0.32, r=0.02, fill=True)
    c.rect(0.28, 0.10, 0.52, 0.20, r=0.02, fill=True)    # 노즐
    for a in (-32, 0, 32):
        r = math.radians(a)
        c.circle(0.60 + 0.18 * math.cos(r), 0.15 + 0.18 * math.sin(r), 0.035, fill=True)


# ── 기기 ────────────────────────────────────────────────────


def glucometer(c: Canvas) -> None:
    c.rect(0.28, 0.12, 0.72, 0.86, r=0.08, fill=True)
    c.hole_rect(0.36, 0.22, 0.64, 0.44, r=0.02)          # 표시창
    c.blob([(0.50, 0.26), (0.545, 0.325), (0.50, 0.38), (0.455, 0.325)])   # 창 안의 혈액
    c.hole_circle(0.50, 0.64, 0.055)                     # 버튼 (크면 기기에 구멍이 난 것처럼 보인다)
    c.rect(0.46, 0.84, 0.54, 0.96, r=0.01, fill=True)    # 스트립


def thermometer(c: Canvas) -> None:
    c.rect(0.42, 0.08, 0.58, 0.62, r=0.08, fill=True)
    c.circle(0.50, 0.76, 0.16, fill=True)
    c.hole_circle(0.50, 0.76, 0.07)
    for y in (0.20, 0.30, 0.40):
        c.hole_path([(0.50, y), (0.58, y)], w=HAIR)


def bp_monitor(c: Canvas) -> None:
    # 화면 달린 상자는 TV 로 읽혔다. 팔에 감는 커프가 있어야 혈압계가 된다.
    c.rect(0.16, 0.14, 0.84, 0.52, r=0.07, fill=True)     # 본체
    c.hole_rect(0.24, 0.22, 0.76, 0.42, r=0.02)
    c.blob([(0.50, 0.28), (0.57, 0.25), (0.62, 0.30), (0.50, 0.40), (0.38, 0.30), (0.43, 0.25)])
    c.blob([(0.24, 0.58), (0.76, 0.58), (0.82, 0.76), (0.76, 0.94), (0.24, 0.94), (0.18, 0.76)])
    c.hole_rect(0.30, 0.68, 0.70, 0.84, r=0.03)           # 커프
    c.path([(0.50, 0.52), (0.50, 0.58)], w=THIN)


# ── 행위 ────────────────────────────────────────────────────


def hand_wash(c: Canvas) -> None:
    # 손 전체를 하나의 곡선 덩어리로 그렸더니 불꽃이 됐다. 손가락은 개별 도형으로
    # 세우고 손바닥과 겹쳐야 손으로 읽힌다 — 실루엣의 톱니가 손가락을 만든다.
    c.rect(0.30, 0.52, 0.72, 0.92, r=0.10, fill=True)     # 손바닥
    for i, (x, top) in enumerate(((0.34, 0.36), (0.44, 0.30), (0.54, 0.32), (0.63, 0.40))):
        c.rect(x, top, x + 0.075, 0.62, r=0.038, fill=True)
    c.rect(0.20, 0.56, 0.34, 0.70, r=0.07, fill=True)     # 엄지
    for x, y, r in ((0.40, 0.14, 0.055), (0.62, 0.12, 0.045), (0.52, 0.20, 0.032)):
        c.blob([(x, y - r * 1.8), (x + r, y + r * 0.4), (x, y + r), (x - r, y + r * 0.4)])


# ── 상태·사람 ───────────────────────────────────────────────


def _figure(c: Canvas, hx: float, hy: float, hr: float, body) -> None:
    c.circle(hx, hy, hr, fill=True)
    c.blob(body)


def state_pregnant(c: Canvas) -> None:
    _figure(c, 0.42, 0.14, 0.11, [
        (0.42, 0.26), (0.54, 0.32), (0.64, 0.48), (0.62, 0.62), (0.50, 0.70),
        (0.48, 0.92), (0.34, 0.92), (0.32, 0.60), (0.32, 0.38),
    ])


def state_breastfeeding(c: Canvas) -> None:
    _figure(c, 0.28, 0.14, 0.11, [
        (0.28, 0.26), (0.40, 0.34), (0.42, 0.58), (0.38, 0.92), (0.22, 0.92), (0.20, 0.40),
    ])
    c.circle(0.64, 0.40, 0.13, fill=True)                # 아기 머리
    c.blob([(0.64, 0.52), (0.78, 0.60), (0.74, 0.74), (0.50, 0.72), (0.46, 0.58)])
    c.smooth([(0.30, 0.52), (0.48, 0.80), (0.80, 0.70)], w=STROKE)   # 받친 팔


def state_child(c: Canvas) -> None:
    _figure(c, 0.50, 0.24, 0.16, [
        (0.50, 0.42), (0.68, 0.50), (0.62, 0.66), (0.58, 0.92), (0.42, 0.92), (0.38, 0.66), (0.32, 0.50),
    ])


def state_elderly(c: Canvas) -> None:
    _figure(c, 0.42, 0.16, 0.11, [
        (0.42, 0.28), (0.54, 0.38), (0.52, 0.62), (0.50, 0.92), (0.34, 0.92), (0.32, 0.60), (0.30, 0.38),
    ])
    c.path([(0.70, 0.36), (0.72, 0.92)], w=THIN)         # 지팡이
    c.smooth([(0.52, 0.46), (0.64, 0.40), (0.70, 0.37)], w=THIN)


def state_infant(c: Canvas) -> None:
    c.circle(0.50, 0.32, 0.20, fill=True)
    c.blob([(0.50, 0.54), (0.70, 0.64), (0.66, 0.86), (0.34, 0.86), (0.30, 0.64)])
    c.hole_circle(0.43, 0.30, 0.032)
    c.hole_circle(0.57, 0.30, 0.032)
    c.hole_path([(0.44, 0.40), (0.50, 0.43), (0.56, 0.40)], w=HAIR, smooth=True)


# ── 알레르겐 ────────────────────────────────────────────────
# 음식 그 자체를 크게 그린다. '피하라' 는 사전의 `no` 합성 연산자가 얹는다.
# 처음엔 낱개 글리프마다 금지 원을 그렸는데, 40px 로 줄이면 여덟 개가 전부 같은
# 동그라미에 사선으로 보였다 — 무엇을 피하라는 것인지가 사라지면 뜻이 없다.


def allergen_peanut(c: Canvas) -> None:
    c.blob([(0.50, 0.12), (0.70, 0.24), (0.68, 0.42), (0.58, 0.50), (0.70, 0.60),
            (0.70, 0.80), (0.50, 0.90), (0.30, 0.80), (0.30, 0.60), (0.42, 0.50),
            (0.32, 0.42), (0.30, 0.24)])
    c.hole_circle(0.50, 0.30, 0.055)
    c.hole_circle(0.50, 0.72, 0.055)


def allergen_tree_nut(c: Canvas) -> None:
    # 호두 — 땅콩(잘록한 실루엣)·달걀(민 타원)과 실루엣이 겹치지 않게 속을 갈라 보인다.
    c.circle(0.50, 0.52, 0.34, fill=True)
    c.hole_path([(0.50, 0.20), (0.50, 0.86)], w=THIN)
    c.hole_path([(0.48, 0.32), (0.34, 0.44), (0.36, 0.62), (0.48, 0.74)], w=HAIR, smooth=True)
    c.hole_path([(0.52, 0.32), (0.66, 0.44), (0.64, 0.62), (0.52, 0.74)], w=HAIR, smooth=True)


def allergen_milk(c: Canvas) -> None:
    c.poly([(0.28, 0.34), (0.50, 0.10), (0.72, 0.34), (0.72, 0.90), (0.28, 0.90)])
    c.hole_path([(0.28, 0.34), (0.72, 0.34)], w=HAIR)
    c.hole_rect(0.38, 0.50, 0.62, 0.76, r=0.02)
    c.blob([(0.50, 0.56), (0.575, 0.66), (0.50, 0.73), (0.425, 0.66)])   # 라벨 안 우유 방울


def allergen_egg(c: Canvas) -> None:
    # 민 타원은 기름 방울·건조 표시와 실루엣이 겹쳤다. 금 간 껍데기는 달걀에만 있다.
    c.blob([(0.50, 0.08), (0.68, 0.34), (0.74, 0.62), (0.62, 0.86), (0.38, 0.86),
            (0.26, 0.62), (0.32, 0.34)])
    c.hole_path([(0.26, 0.52), (0.38, 0.46), (0.46, 0.56), (0.56, 0.46),
                 (0.64, 0.56), (0.74, 0.50)], w=THIN)


def allergen_gluten(c: Canvas) -> None:
    c.path([(0.50, 0.26), (0.50, 0.92)], w=THIN)
    for i in range(4):
        y = 0.18 + i * 0.16
        c.blob([(0.50, y + 0.15), (0.36, y + 0.07), (0.26, y - 0.02), (0.42, y + 0.03)])
        c.blob([(0.50, y + 0.15), (0.64, y + 0.07), (0.74, y - 0.02), (0.58, y + 0.03)])


def allergen_shellfish(c: Canvas) -> None:
    # 새우는 갈고리로, 게는 사슴으로 보였다 — 뻗은 다리는 작아지면 그냥 선이다.
    # 가리비는 부채꼴 실루엣 하나로 남는다.
    c.blob([(0.50, 0.16), (0.78, 0.32), (0.90, 0.64), (0.70, 0.82), (0.50, 0.86),
            (0.30, 0.82), (0.10, 0.64), (0.22, 0.32)])
    for a in (-48, -24, 0, 24, 48):
        r = math.radians(a - 90)
        c.hole_path([(0.50 + 0.10 * math.cos(r), 0.84 + 0.10 * math.sin(r)),
                     (0.50 + 0.62 * math.cos(r), 0.84 + 0.62 * math.sin(r))], w=HAIR)


def allergen_soy(c: Canvas) -> None:
    c.blob([(0.14, 0.62), (0.34, 0.30), (0.66, 0.22), (0.88, 0.36), (0.72, 0.70), (0.36, 0.80)])
    for x, y in ((0.32, 0.56), (0.50, 0.48), (0.68, 0.42)):
        c.hole_circle(x, y, 0.075)


def allergen_sesame(c: Canvas) -> None:
    # 제각각 기울인 마름모는 잎사귀로 보였다. 참깨는 낱알 하나로는 알 수 없고
    # '작고 납작한 것이 여럿' 이라는 무리로만 읽힌다 — 방향을 맞추고 촘촘히 둔다.
    for x, y in ((0.30, 0.36), (0.50, 0.30), (0.70, 0.38),
                 (0.36, 0.56), (0.58, 0.54),
                 (0.44, 0.74), (0.66, 0.72)):
        c.oval(x, y, 0.105, 0.062, fill=True)
        c.hole_path([(x - 0.045, y), (x + 0.045, y)], w=HAIR)


def allergen_fish(c: Canvas) -> None:
    c.blob([(0.18, 0.50), (0.40, 0.30), (0.66, 0.34), (0.80, 0.50), (0.66, 0.68), (0.40, 0.72)])
    c.poly([(0.78, 0.50), (0.94, 0.32), (0.94, 0.68)])   # 꼬리
    c.hole_circle(0.32, 0.46, 0.045)


# ── 음식 ────────────────────────────────────────────────────


def food_rice(c: Canvas) -> None:
    # 낟알을 가로 획으로 파냈더니 글씨처럼 보였다. 낟알은 낟알 모양이어야 한다.
    c.wedge(0.50, 0.48, 0.32, 180, 360)
    for x, y, a in ((0.38, 0.34, 25), (0.52, 0.27, -15), (0.63, 0.36, 30),
                    (0.45, 0.42, -20), (0.58, 0.43, 10)):
        r = math.radians(a)
        dx, dy = 0.055 * math.cos(r), 0.055 * math.sin(r)
        nx, ny = -0.026 * math.sin(r), 0.026 * math.cos(r)
        c.hole_blob([(x + dx, y + dy), (x + nx, y + ny), (x - dx, y - dy), (x - nx, y - ny)])
    c.blob([(0.18, 0.50), (0.82, 0.50), (0.68, 0.86), (0.32, 0.86)])   # 그릇
    c.hole_path([(0.24, 0.60), (0.76, 0.60)], w=HAIR)


def food_bread(c: Canvas) -> None:
    # 속을 크게 파냈더니 아치문처럼 보였다. 실루엣은 채운 채로 두고 기공만 뚫는다 —
    # 구멍 뚫린 단면은 빵에만 있는 특징이라 그것만으로 갈린다.
    c.rect(0.14, 0.46, 0.86, 0.88, r=0.07, fill=True)
    c.wedge(0.50, 0.50, 0.36, 180, 360)
    for x, y, r in ((0.34, 0.62, 0.055), (0.55, 0.56, 0.045), (0.66, 0.70, 0.05),
                    (0.44, 0.76, 0.04), (0.50, 0.38, 0.035)):
        c.hole_circle(x, y, r)
    c.hole_path([(0.22, 0.82), (0.78, 0.82)], w=HAIR)                  # 밑동


def food_meat(c: Canvas) -> None:
    # 덩어리에 막대를 붙인 형태는 무엇인지 알 수 없었다. 뼈 끝의 두 혹이 있어야
    # 닭다리로 읽힌다 — 고기 아이콘이 보편적으로 그렇게 그려지는 이유다.
    c.blob([(0.62, 0.14), (0.84, 0.28), (0.86, 0.52), (0.68, 0.66), (0.44, 0.60), (0.42, 0.30)])
    c.path([(0.52, 0.54), (0.26, 0.80)], w=THIN)          # 뼈대
    c.circle(0.20, 0.80, 0.085, fill=True)                # 뼈 끝의 혹 둘
    c.circle(0.27, 0.88, 0.085, fill=True)


def food_vegetable(c: Canvas) -> None:
    c.blob([(0.50, 0.32), (0.76, 0.46), (0.78, 0.70), (0.50, 0.90), (0.22, 0.70), (0.24, 0.46)])
    c.hole_path([(0.50, 0.38), (0.50, 0.86)], w=HAIR)
    c.path([(0.50, 0.32), (0.60, 0.16)], w=THIN)         # 줄기
    c.blob([(0.62, 0.16), (0.86, 0.08), (0.80, 0.24), (0.62, 0.24)])


def food_fruit(c: Canvas) -> None:
    c.circle(0.50, 0.60, 0.31, fill=True)
    c.hole_path([(0.50, 0.34), (0.50, 0.46)], w=THIN)
    c.path([(0.50, 0.30), (0.53, 0.14)], w=THIN)
    c.blob([(0.55, 0.16), (0.78, 0.08), (0.74, 0.24), (0.56, 0.25)])


def food_oil(c: Canvas) -> None:
    c.blob([(0.50, 0.10), (0.68, 0.42), (0.74, 0.66), (0.50, 0.88), (0.26, 0.66), (0.32, 0.42)])
    c.hole_blob([(0.42, 0.54), (0.50, 0.46), (0.57, 0.56), (0.48, 0.64)])


def food_sugar(c: Canvas) -> None:
    for x, y in ((0.30, 0.34), (0.64, 0.28), (0.40, 0.64), (0.72, 0.62)):
        c.rect(x - 0.12, y - 0.10, x + 0.12, y + 0.10, r=0.02, fill=True)
        c.hole_path([(x - 0.06, y), (x + 0.06, y)], w=HAIR)


def food_salt(c: Canvas) -> None:
    c.blob([(0.36, 0.30), (0.64, 0.30), (0.72, 0.90), (0.28, 0.90)])
    c.blob([(0.38, 0.30), (0.41, 0.14), (0.59, 0.14), (0.62, 0.30)])   # 뚜껑
    for x in (0.44, 0.50, 0.56):
        c.hole_circle(x, 0.20, 0.024)


# ── 경고 ────────────────────────────────────────────────────


def no_alcohol(c: Canvas) -> None:
    c.poly([(0.20, 0.16), (0.80, 0.16), (0.55, 0.52), (0.45, 0.52)])   # 잔
    c.path([(0.50, 0.52), (0.50, 0.84)], w=THIN)
    c.rect(0.28, 0.84, 0.72, 0.92, r=0.03, fill=True)


def caffeine(c: Canvas) -> None:
    # 앱의 caffeine 플래그에 대응하는 그림이 없어서, 카페인이 든 음료를 판정해도
    # 픽토그램 자리에는 아무것도 나오지 않았다.
    c.blob([(0.18, 0.34), (0.66, 0.34), (0.62, 0.72), (0.42, 0.84), (0.22, 0.72)])
    c.arc(0.68, 0.48, 0.14, 270, 90, w=STROKE)                # 손잡이
    c.rect(0.12, 0.86, 0.74, 0.94, r=0.03, fill=True)         # 받침
    for x in (0.30, 0.44, 0.56):                              # 김
        c.smooth([(x, 0.28), (x + 0.05, 0.20), (x - 0.02, 0.12)], w=THIN)


def warn_bleeding(c: Canvas) -> None:
    # nsaid_bleed — 출혈 위험. 판정 엔진이 이 플래그로 회피를 내는데 그림이 없었다.
    c.blob([(0.42, 0.10), (0.62, 0.40), (0.68, 0.62), (0.42, 0.80), (0.18, 0.62), (0.24, 0.40)])
    c.hole_blob([(0.36, 0.44), (0.46, 0.36), (0.52, 0.48), (0.40, 0.58)])
    for i, r in enumerate((0.10, 0.17)):                      # 번지는 자국
        c.arc(0.66, 0.80, r, 200, 340, w=THIN)


def call_help(c: Canvas) -> None:
    c.blob([(0.18, 0.20), (0.34, 0.14), (0.46, 0.32), (0.34, 0.44), (0.46, 0.62),
            (0.62, 0.70), (0.70, 0.58), (0.88, 0.66), (0.84, 0.84), (0.62, 0.88),
            (0.34, 0.70), (0.14, 0.40)])                 # 수화기
    for r in (0.11, 0.19):
        c.arc(0.70, 0.24, r, 250, 20, w=THIN)


# ── 증상 ────────────────────────────────────────────────────
# 식이 일지가 되묻는 것들. 부위 글리프(body_*)와 달리 '아프다' 가 실려야 한다.
# head 로 두는 이유: "피부가 가려웠다" 는 문장의 주어이지 무언가를 한정하는 말이 아니고,
# 수식어는 DSL 에서 단독으로 쓸 수 없어 화면의 증상 선택 버튼에 쓸 수가 없었다.


def symptom_skin(c: Canvas) -> None:
    c.rect(0.20, 0.24, 0.80, 0.76, r=0.08, fill=True)
    for x, y in ((0.36, 0.40), (0.58, 0.36), (0.42, 0.62), (0.64, 0.60)):
        c.hole_circle(x, y, 0.07)
        c.circle(x, y, 0.03, fill=True)                  # 부어오른 자리


def symptom_gut(c: Canvas) -> None:
    # 물결을 파낸 타원은 장식된 달걀로 보였다. 배(둥근 몸)와 통증(번개)을 나눠 싣는다.
    c.circle(0.46, 0.60, 0.30, fill=True)
    c.hole_blob([(0.46, 0.32), (0.56, 0.46), (0.48, 0.50), (0.58, 0.60),
                 (0.42, 0.86), (0.46, 0.62), (0.36, 0.58), (0.42, 0.46)])
    for a in (215, 260, 305):
        import math as _m
        r = _m.radians(a)
        c.path([(0.46 + 0.36 * _m.cos(r), 0.60 + 0.36 * _m.sin(r)),
                (0.46 + 0.46 * _m.cos(r), 0.60 + 0.46 * _m.sin(r))], w=THIN)


def symptom_breath(c: Canvas) -> None:
    # 물결에 X 를 얹은 것은 낙서로 보였다. 폐는 그 자체로 '숨' 을 뜻하는 몇 안 되는 형태다.
    c.rect(0.46, 0.10, 0.54, 0.34, r=0.02, fill=True)      # 기관
    c.path([(0.50, 0.30), (0.34, 0.40)], w=THIN)
    c.path([(0.50, 0.30), (0.66, 0.40)], w=THIN)
    c.blob([(0.30, 0.38), (0.44, 0.50), (0.44, 0.78), (0.30, 0.88), (0.18, 0.72), (0.18, 0.48)])
    c.blob([(0.70, 0.38), (0.82, 0.48), (0.82, 0.72), (0.70, 0.88), (0.56, 0.78), (0.56, 0.50)])
    c.cross(0.50, 0.62, 0.16, w=STROKE)                    # 막힘


def symptom_mouth(c: Canvas) -> None:
    c.blob([(0.50, 0.34), (0.78, 0.52), (0.50, 0.78), (0.22, 0.52)])
    c.hole_path([(0.25, 0.53), (0.75, 0.53)], w=THIN)
    for x in (0.34, 0.50, 0.66):
        c.circle(x, 0.20, 0.058, fill=True)              # 부어오름


def symptom_fever(c: Canvas) -> None:
    c.rect(0.38, 0.14, 0.54, 0.62, r=0.08, fill=True)
    c.circle(0.46, 0.76, 0.16, fill=True)
    c.hole_path([(0.46, 0.26), (0.46, 0.52)], w=HAIR)
    for x in (0.70, 0.84):
        c.smooth([(x, 0.52), (x + 0.06, 0.40), (x - 0.02, 0.28), (x + 0.05, 0.14)], w=THIN)


def symptom_dizzy(c: Canvas) -> None:
    c.circle(0.50, 0.60, 0.27, fill=True)
    c.hole_circle(0.41, 0.55, 0.055)
    c.hole_circle(0.59, 0.55, 0.055)
    c.hole_path([(0.39, 0.75), (0.50, 0.70), (0.61, 0.75)], w=HAIR, smooth=True)
    for r in (0.14, 0.22):                               # 도는 표시
        c.arc(0.50, 0.22, r, 200, 340, w=THIN)


#: head 안에서 수식어가 앉는 자리 (그 head 의 캔버스 기준 x0,y0,x1,y1).
#:
#: 그림 옆에 두는 이유: 슬롯은 "이 그림의 어디가 비어 있는가" 이므로 그림이 바뀌면
#: 함께 바뀌어야 한다. 사전에만 적어두었더니 글리프를 다시 그린 뒤에도 옛 좌표가 남아,
#: 흡입기의 수식어가 마우스피스 위에 얹혔다.
SLOTS = {
    # 수식어는 이 사각형 **안에** 들어간다. 좁게 잡으면 안에 무엇이 들었는지 알 수 없고,
    # 넓게 잡으면 그 자리를 뚫을 때 head 의 형태가 사라진다. 글리프마다 '비어도 되는 면' 을 준다.
    "pill_bottle": (0.32, 0.40, 0.68, 0.74),        # 라벨
    "liquid_bottle": (0.32, 0.52, 0.68, 0.84),      # 병 아래쪽 배
    "dropper_bottle": (0.34, 0.48, 0.66, 0.78),
    "cream_tube": (0.34, 0.30, 0.66, 0.62),
    "inhaler": (0.24, 0.14, 0.52, 0.42),            # 캐니스터 면. 마우스피스는 남는다
    "sachet": (0.30, 0.38, 0.70, 0.80),
    # 슬롯이 head 의 가장자리까지 닿으면 그 자리를 뚫을 때 실루엣이 잘려나간다.
    # 정제는 왼쪽 반을 슬롯으로 잡았다가 초승달이 됐고, 캡슐은 한쪽 반이 통째로 사라졌다.
    # 어느 쪽이든 테두리가 남아야 무엇의 안인지 알 수 있다.
    "capsule_strip": (0.18, 0.42, 0.44, 0.58),      # 캡슐 한쪽 반의 안쪽
    "tablet_blister": (0.30, 0.32, 0.70, 0.68),     # 정제 가운데. 바깥에 테두리를 남긴다
    "glucometer": (0.34, 0.20, 0.66, 0.46),         # 표시창
    "thermometer": (0.40, 0.12, 0.60, 0.46),
    "bp_monitor": (0.28, 0.64, 0.72, 0.88),         # 커프
    "syringe": (0.32, 0.38, 0.58, 0.54),            # 눈금창
    "patch": (0.34, 0.36, 0.66, 0.64),              # 가운데 패드
    "spray": (0.36, 0.44, 0.64, 0.82),
    "suppository": (0.36, 0.34, 0.64, 0.68),
}


# ─────────────────────────────────────────────────────────────
# MODIFIER — 주어를 한정한다. 어디에, 언제, 몇 개.
# ─────────────────────────────────────────────────────────────


def _pointed(c: Canvas, part) -> None:
    """신체 부위는 화살표로 '여기에' 를 붙인다. 부위만 그리면 그림일 뿐 지시가 아니다."""
    part(c)
    c.arrow(0.12, 0.92, 0.30, 0.72)


def body_eye(c: Canvas) -> None:
    def part(c: Canvas) -> None:
        c.blob([(0.50, 0.26), (0.78, 0.48), (0.50, 0.70), (0.22, 0.48)])
        c.hole_circle(0.50, 0.48, 0.12)
        c.circle(0.50, 0.48, 0.06, fill=True)
    _pointed(c, part)


def body_ear(c: Canvas) -> None:
    def part(c: Canvas) -> None:
        c.blob([(0.54, 0.18), (0.74, 0.32), (0.72, 0.58), (0.58, 0.76), (0.46, 0.70),
                (0.50, 0.54), (0.40, 0.42), (0.40, 0.28)])
        c.hole_path([(0.60, 0.34), (0.64, 0.48), (0.56, 0.60)], w=THIN, smooth=True)
    _pointed(c, part)


def body_mouth(c: Canvas) -> None:
    def part(c: Canvas) -> None:
        c.blob([(0.50, 0.28), (0.76, 0.44), (0.50, 0.66), (0.24, 0.44)])
        c.hole_path([(0.27, 0.45), (0.73, 0.45)], w=THIN)
    _pointed(c, part)


def body_nose(c: Canvas) -> None:
    def part(c: Canvas) -> None:
        c.blob([(0.50, 0.16), (0.60, 0.44), (0.70, 0.62), (0.50, 0.72), (0.32, 0.62), (0.42, 0.42)])
        c.hole_circle(0.43, 0.62, 0.038)
        c.hole_circle(0.57, 0.62, 0.038)
    _pointed(c, part)


def body_skin(c: Canvas) -> None:
    def part(c: Canvas) -> None:
        c.rect(0.26, 0.26, 0.76, 0.66, r=0.07, fill=True)
        for i in range(3):
            c.hole_path([(0.38 + i * 0.13, 0.34), (0.38 + i * 0.13, 0.58)], w=HAIR)
    _pointed(c, part)


def body_stomach(c: Canvas) -> None:
    def part(c: Canvas) -> None:
        # 위장 모양만 그렸더니 커피콩이 됐다. 몸통 안의 배로 두면 어디인지가 읽힌다.
        c.circle(0.54, 0.20, 0.09, fill=True)
        c.blob([(0.54, 0.30), (0.72, 0.40), (0.74, 0.62), (0.66, 0.80),
                (0.40, 0.80), (0.32, 0.60), (0.36, 0.38)])
        c.hole_circle(0.54, 0.58, 0.13)
    _pointed(c, part)


# ── 식사·보관 ───────────────────────────────────────────────


def food_bowl(c: Canvas) -> None:
    c.blob([(0.14, 0.48), (0.86, 0.48), (0.72, 0.84), (0.28, 0.84)])
    c.hole_path([(0.22, 0.58), (0.78, 0.58)], w=HAIR)
    for x in (0.38, 0.50, 0.62):
        c.circle(x, 0.40, 0.065, fill=True)


def food_empty_bowl(c: Canvas) -> None:
    c.blob([(0.14, 0.48), (0.86, 0.48), (0.72, 0.84), (0.28, 0.84)])
    c.hole_path([(0.22, 0.58), (0.78, 0.58)], w=HAIR)
    c.cross(0.50, 0.26, 0.10, w=THIN)                    # 비어 있음 = 공복


def water_glass(c: Canvas) -> None:
    # 가로선을 둘 그었더니 층이 진 컵으로 보였다. 잔에 필요한 선은 수면 하나다.
    c.poly([(0.30, 0.12), (0.70, 0.12), (0.62, 0.90), (0.38, 0.90)])
    c.hole_path([(0.335, 0.38), (0.665, 0.38)], w=THIN)                # 수면


def storage_fridge(c: Canvas) -> None:
    c.rect(0.28, 0.08, 0.72, 0.92, r=0.06, fill=True)
    c.hole_path([(0.28, 0.38), (0.72, 0.38)], w=HAIR)
    c.hole_path([(0.63, 0.20), (0.63, 0.32)], w=HAIR)
    c.hole_path([(0.63, 0.46), (0.63, 0.60)], w=HAIR)


def storage_dark(c: Canvas) -> None:
    _sun(c, 0.50, rays=True)
    c.cross(0.50, 0.50, 0.42, w=STROKE)


def storage_dry(c: Canvas) -> None:
    c.blob([(0.50, 0.14), (0.72, 0.50), (0.70, 0.76), (0.50, 0.90), (0.30, 0.76), (0.28, 0.50)])
    c.cross(0.50, 0.54, 0.26, w=STROKE)


# ── 때 ──────────────────────────────────────────────────────


def _sun(c: Canvas, cy: float, rays: bool) -> None:
    c.circle(0.50, cy, 0.17, fill=True)
    if rays:
        for i in range(8):
            a = i * math.pi / 4
            c.path([(0.50 + 0.25 * math.cos(a), cy + 0.25 * math.sin(a)),
                    (0.50 + 0.36 * math.cos(a), cy + 0.36 * math.sin(a))], w=THIN)


def time_morning(c: Canvas) -> None:
    # 화살표를 해 한가운데 두었더니 해를 관통해 다른 기호처럼 보였다. 옆으로 뺀다.
    c.wedge(0.50, 0.72, 0.21, 180, 360)
    c.path([(0.06, 0.72), (0.94, 0.72)], w=STROKE)
    for a in (200, 232, 308, 340):
        r = math.radians(a)
        c.path([(0.50 + 0.28 * math.cos(r), 0.72 + 0.28 * math.sin(r)),
                (0.50 + 0.38 * math.cos(r), 0.72 + 0.38 * math.sin(r))], w=THIN)
    c.arrow(0.84, 0.58, 0.84, 0.22)


def time_noon(c: Canvas) -> None:
    _sun(c, 0.50, rays=True)


def time_evening(c: Canvas) -> None:
    c.wedge(0.50, 0.72, 0.21, 180, 360)
    c.path([(0.06, 0.72), (0.94, 0.72)], w=STROKE)
    c.arrow(0.84, 0.22, 0.84, 0.58)


def time_night(c: Canvas) -> None:
    c.circle(0.44, 0.52, 0.33, fill=True)
    c.hole_circle(0.62, 0.42, 0.30)                      # 초승달을 파낸다
    for x, y, r in ((0.82, 0.24, 0.05), (0.88, 0.50, 0.033)):
        c.circle(x, y, r, fill=True)


# ── 개수 ────────────────────────────────────────────────────


def _dots(c: Canvas, n: int) -> None:
    """개수는 숫자가 아니라 점으로 센다. 숫자를 읽을 수 있다면 이 앱이 필요 없다."""
    cols = 2 if n <= 4 else 3
    rows = math.ceil(n / cols)
    r = 0.115 if n <= 4 else 0.095
    for i in range(n):
        cx = 0.5 + ((i % cols) - (cols - 1) / 2) * 0.28
        cy = 0.5 + ((i // cols) - (rows - 1) / 2) * 0.28
        c.circle(cx, cy, r, fill=True)


def qty_one(c: Canvas) -> None: _dots(c, 1)
def qty_two(c: Canvas) -> None: _dots(c, 2)
def qty_three(c: Canvas) -> None: _dots(c, 3)
def qty_four(c: Canvas) -> None: _dots(c, 4)
def qty_five(c: Canvas) -> None: _dots(c, 5)


HEADS = {
    "capsule_strip": capsule_strip, "tablet_blister": tablet_blister, "pill_bottle": pill_bottle,
    "liquid_bottle": liquid_bottle, "dropper_bottle": dropper_bottle, "cream_tube": cream_tube,
    "inhaler": inhaler, "sachet": sachet, "suppository": suppository, "syringe": syringe,
    "patch": patch, "spray": spray,
    "glucometer": glucometer, "thermometer": thermometer, "bp_monitor": bp_monitor,
    "hand_wash": hand_wash,
    "state_pregnant": state_pregnant, "state_breastfeeding": state_breastfeeding,
    "state_child": state_child, "state_elderly": state_elderly, "state_infant": state_infant,
    "allergen_peanut": allergen_peanut, "allergen_tree_nut": allergen_tree_nut,
    "allergen_milk": allergen_milk, "allergen_egg": allergen_egg,
    "allergen_gluten": allergen_gluten, "allergen_shellfish": allergen_shellfish,
    "allergen_soy": allergen_soy, "allergen_sesame": allergen_sesame,
    "allergen_fish": allergen_fish,
    "food_rice": food_rice, "food_bread": food_bread, "food_meat": food_meat,
    "food_vegetable": food_vegetable, "food_fruit": food_fruit, "food_oil": food_oil,
    "food_sugar": food_sugar, "food_salt": food_salt,
    "symptom_skin": symptom_skin, "symptom_gut": symptom_gut, "symptom_breath": symptom_breath,
    "symptom_mouth": symptom_mouth, "symptom_fever": symptom_fever, "symptom_dizzy": symptom_dizzy,
    "no_alcohol": no_alcohol, "caffeine": caffeine,
    "warn_bleeding": warn_bleeding, "call_help": call_help,
}

MODIFIERS = {
    "body_eye": body_eye, "body_ear": body_ear, "body_mouth": body_mouth,
    "body_nose": body_nose, "body_skin": body_skin, "body_stomach": body_stomach,
    "food_bowl": food_bowl, "food_empty_bowl": food_empty_bowl, "water_glass": water_glass,
    "storage_fridge": storage_fridge, "storage_dark": storage_dark, "storage_dry": storage_dry,
    "time_morning": time_morning, "time_noon": time_noon,
    "time_evening": time_evening, "time_night": time_night,
    "qty_one": qty_one, "qty_two": qty_two, "qty_three": qty_three,
    "qty_four": qty_four, "qty_five": qty_five,
}
