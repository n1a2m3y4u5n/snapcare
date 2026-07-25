"""영양성분표 샘플 이미지 생성 (OCR 파이프라인 개발·검증용).

실제 포장지 사진을 구하기 전에 파이프라인을 세우기 위한 합성 라벨이다.
표기 방식이 지역마다 달라서 세 가지 유형을 만든다:
  - EU 스타일: "per 100 g", "of which sugars/saturates", Salt(g)
  - US 스타일: "Nutrition Facts", "Serving size", Sodium(mg) — 소금이 아니라 나트륨
  - KR 스타일: 한글 표기, "1회 제공량", 나트륨(mg)

Usage: python3 scripts/make_label_samples.py
Output: public/label-*.png
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public"

BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
REG = "/System/Library/Fonts/Supplemental/Arial.ttf"
# 한글은 시스템 기본 산돌고딕 계열을 쓴다
KR = "/System/Library/Fonts/AppleSDGothicNeo.ttc"

W = 620
PAD = 28


def font(path: str, size: int):
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def render(name: str, title: str, subtitle: str, rows, footer: str, font_path: str):
    """rows = [(label, value, indent, bold)]"""
    h = PAD * 2 + 96 + len(rows) * 34 + 40
    img = Image.new("RGB", (W, h), "white")
    d = ImageDraw.Draw(img)

    f_title = font(font_path if font_path != REG else BOLD, 34)
    f_sub = font(font_path, 18)
    f_row = font(font_path, 20)
    f_bold = font(font_path if font_path != REG else BOLD, 20)
    f_foot = font(font_path, 15)

    y = PAD
    d.text((PAD, y), title, fill="black", font=f_title)
    y += 42
    d.text((PAD, y), subtitle, fill="black", font=f_sub)
    y += 28
    d.line([(PAD, y), (W - PAD, y)], fill="black", width=4)
    y += 14

    for label, value, indent, bold in rows:
        f = f_bold if bold else f_row
        d.text((PAD + indent, y), label, fill="black", font=f)
        d.text((W - PAD - d.textlength(value, font=f), y), value, fill="black", font=f)
        y += 30
        d.line([(PAD, y - 4), (W - PAD, y - 4)], fill="#999", width=1)
        y += 4

    y += 8
    d.text((PAD, y), footer, fill="#444", font=f_foot)
    img.save(OUT / name)
    print(f"  {name}  ({W}x{h})")


def main():
    OUT.mkdir(exist_ok=True)
    print("생성:")

    # ── EU 스타일 (per 100 g) — 비스킷
    render(
        "label-eu-biscuit.png",
        "Nutrition Information",
        "Typical values per 100 g",
        [
            ("Energy", "2010 kJ / 480 kcal", 0, True),
            ("Fat", "22.4 g", 0, True),
            ("of which saturates", "11.8 g", 24, False),
            ("Carbohydrate", "62.0 g", 0, True),
            ("of which sugars", "34.5 g", 24, False),
            ("Fibre", "2.8 g", 0, False),
            ("Protein", "6.1 g", 0, True),
            ("Salt", "0.85 g", 0, True),
        ],
        "Contains wheat, milk, egg. May contain traces of nuts.",
        REG,
    )

    # ── US 스타일 (serving + Sodium mg) — 시리얼
    render(
        "label-us-cereal.png",
        "Nutrition Facts",
        "Serving size 40 g   |   Amount per serving",
        [
            ("Calories", "150", 0, True),
            ("Total Fat", "1.5 g", 0, True),
            ("Saturated Fat", "0.3 g", 24, False),
            ("Sodium", "190 mg", 0, True),
            ("Total Carbohydrate", "32 g", 0, True),
            ("Dietary Fiber", "3 g", 24, False),
            ("Total Sugars", "12 g", 24, False),
            ("Protein", "4 g", 0, True),
        ],
        "INGREDIENTS: WHOLE GRAIN OAT FLOUR, SUGAR, SALT.",
        REG,
    )

    # ── KR 스타일 (1회 제공량 + 나트륨 mg)
    render(
        "label-kr-snack.png",
        "영양정보",
        "1회 제공량 30g   |   총 2회 제공량",
        [
            ("열량", "160 kcal", 0, True),
            ("탄수화물", "18 g", 0, True),
            ("당류", "9 g", 24, False),
            ("지방", "8.5 g", 0, True),
            ("포화지방", "3.2 g", 24, False),
            ("단백질", "2.4 g", 0, True),
            ("나트륨", "230 mg", 0, True),
            ("식이섬유", "1.1 g", 0, False),
        ],
        "원재료: 밀가루, 팜유, 설탕, 우유. 땅콩 함유 제품과 같은 시설에서 제조.",
        KR,
    )


if __name__ == "__main__":
    main()
