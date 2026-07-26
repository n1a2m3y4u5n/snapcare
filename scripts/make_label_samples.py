"""영양성분표 샘플 이미지 생성 (OCR 파이프라인 개발·검증용).

실제 포장지 사진을 구하기 전에 파이프라인을 세우기 위한 합성 라벨이다.
표기 방식이 지역마다 달라서 세 가지를 만들고, 서로 다른 분기를 태우게 골랐다:
  - EU 스타일: "per 100 g", "of which sugars/saturates", Salt(g)
  - US 스타일: "Nutrition Facts", "Serving size", Sodium(mg) — 소금이 아니라 나트륨
  - 땅콩 바:   100g 기준인데 나트륨을 mg 으로 적는 조합 + 원재료의 알레르겐 표기.
               라벨을 읽어 알레르기 회피 판정까지 가는 경로가 이 샘플에만 있다.

Usage: python3 scripts/make_label_samples.py
Output: public/label-*.png
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public"

BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
REG = "/System/Library/Fonts/Supplemental/Arial.ttf"

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

    # ── 땅콩 바 (100g 기준 + Sodium mg + 알레르겐 표기)
    #    나트륨(mg)을 소금(g)으로 환산하는 경로가 US 라벨에만 있었는데, 그건 1회 제공량
    #    기준이었다. 100g 기준에서 같은 환산이 되는지는 이 샘플이 확인한다.
    #    그리고 "Contains: peanuts" 는 라벨만 읽고 회피 판정까지 가는 유일한 경로다.
    render(
        "label-peanut-bar.png",
        "Nutrition Information",
        "Per 100 g",
        [
            ("Energy", "520 kcal", 0, True),
            ("Fat", "30.0 g", 0, True),
            ("of which saturates", "6.0 g", 24, False),
            ("Carbohydrate", "45.0 g", 0, True),
            ("of which sugars", "32.0 g", 24, False),
            ("Fibre", "5.0 g", 0, False),
            ("Protein", "15.0 g", 0, True),
            ("Sodium", "300 mg", 0, True),
        ],
        "INGREDIENTS: PEANUTS, SUGAR, GLUCOSE SYRUP, MILK POWDER. Contains: peanuts, milk.",
        REG,
    )


if __name__ == "__main__":
    main()
