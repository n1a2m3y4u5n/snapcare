"""데모용 처방전 샘플을 그린다.

    python3 scripts/make_prescription_samples.py
    → public/prescription-*.png

왜 코드로 만드나
---------------
기존 샘플은 손으로 만든 이미지였고 전부 한국어였다. 대회 공식 언어가 영어라
데모 내내 한국어 약품명이 화면에 뜨는 건 맞지 않고, 무엇보다 이미지를 고치려면
누군가 다시 그려야 한다. 코드로 만들면 문구를 바꾸고 다시 돌리면 된다.

OCR 자체는 라틴 문자 밖에서도 동작한다(파서도 양쪽 패턴을 다 갖고 있다). 다만 그건
현장 배포에서 증명할 일이지, 데모 화면에 한국어를 띄워 보일 일은 아니다.

문구는 lib/ocr-to-macro.ts 가 뽑아내는 것들을 담는다: 복용 횟수, 시간대,
식전·식후, 1회 용량, 기간, 보관, 금기.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public"

BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
REG = "/System/Library/Fonts/Supplemental/Arial.ttf"

W = 620
INK = (26, 32, 44)
MUTED = (110, 120, 135)
RULE = (222, 226, 232)
HEAD_BG = (31, 63, 105)
WARN_BG = (255, 247, 224)
WARN_INK = (146, 92, 10)


def font(path: str, size: int):
    return ImageFont.truetype(path, size)


def render(name: str, drug: str, generic: str, sig: list[str],
           days: str, storage: str, warnings: str) -> Path:
    h = 470
    img = Image.new("RGB", (W, h), "white")
    d = ImageDraw.Draw(img)

    # 머리말
    d.rectangle([0, 0, W, 74], fill=HEAD_BG)
    d.text((W // 2, 26), "PRESCRIPTION", font=font(BOLD, 22), fill="white", anchor="mm")
    d.text((W // 2, 52), "Riverside Community Health Centre", font=font(REG, 12),
           fill=(198, 214, 236), anchor="mm")

    y = 92
    d.text((28, y), "Patient", font=font(REG, 11), fill=MUTED)
    d.text((28, y + 16), "A. Osei", font=font(BOLD, 15), fill=INK)
    d.text((250, y), "Date of birth", font=font(REG, 11), fill=MUTED)
    d.text((250, y + 16), "1982-03-15", font=font(BOLD, 15), fill=INK)
    d.text((430, y), "Rx no.", font=font(REG, 11), fill=MUTED)
    d.text((430, y + 16), "2026-0519-4821", font=font(BOLD, 15), fill=INK)

    y += 52
    d.line([20, y, W - 20, y], fill=RULE, width=1)

    y += 18
    d.text((28, y), drug, font=font(BOLD, 20), fill=INK)
    d.text((28, y + 26), generic, font=font(REG, 12), fill=MUTED)

    y += 56
    for line in sig:
        d.text((28, y), "•", font=font(BOLD, 13), fill=HEAD_BG)
        d.text((44, y), line, font=font(REG, 13), fill=INK)
        y += 22

    y += 6
    d.text((28, y), days, font=font(BOLD, 14), fill=INK)
    d.text((250, y), storage, font=font(BOLD, 14), fill=HEAD_BG)

    y += 34
    d.rounded_rectangle([20, y, W - 20, y + 52], radius=8, fill=WARN_BG)
    d.text((34, y + 12), "Warnings", font=font(BOLD, 12), fill=WARN_INK)
    d.text((34, y + 30), warnings, font=font(REG, 12), fill=WARN_INK)

    y += 72
    d.line([20, y, W - 20, y], fill=RULE, width=1)
    d.text((28, y + 14), "Prescriber", font=font(REG, 11), fill=MUTED)
    d.text((28, y + 30), "Dr M. Ibrahim  (Lic. 48291)", font=font(BOLD, 13), fill=INK)

    path = OUT / name
    img.save(path)
    return path


SAMPLES = [
    dict(
        name="prescription-antibiotic.png",
        drug="Amoxicillin Capsules 250 mg",
        generic="amoxicillin trihydrate",
        sig=[
            "Take 1 capsule three times a day, 30 minutes after meals.",
            "Morning, noon and evening.",
        ],
        days="For 7 days",
        storage="Keep refrigerated (2-8 C)",
        warnings="Not for use in pregnancy. Caution if breastfeeding. No alcohol.",
    ),
    dict(
        name="prescription-eyedrop.png",
        drug="Chloramphenicol Eye Drops 0.5%",
        generic="chloramphenicol",
        sig=[
            "Instil 2 drops into the affected eye twice a day.",
            "Morning and evening. Wash hands before use.",
        ],
        days="For 5 days",
        storage="Keep refrigerated (2-8 C)",
        warnings="Do not wear contact lenses during treatment. Not for use in pregnancy.",
    ),
    dict(
        # 상호작용 엔진을 실제로 건드리는 샘플. 'ibuprofen' 이 nsaid_bleed 플래그를
        # 만들고, 혈액희석제를 쓰는 구성원에게 회피 판정이 나온다 — 이 경로에는
        # 그동안 샘플이 없어서 데모에서 한 번도 보이지 않았다.
        name="prescription-painkiller.png",
        drug="Ibuprofen Tablets 200 mg",
        generic="ibuprofen",
        sig=[
            "Take 1 tablet twice a day, after meals.",
            "Morning and evening.",
        ],
        days="For 5 days",
        storage="Store at room temperature",
        warnings="Not for use in pregnancy. Do not take with blood thinners.",
    ),
    dict(
        name="prescription-syrup.png",
        drug="Paracetamol Oral Suspension 120 mg/5 mL",
        generic="paracetamol",
        sig=[
            "Take 5 mL four times a day, before meals.",
            "Morning, noon, evening and at night.",
        ],
        days="For 3 days",
        storage="Store at room temperature",
        warnings="Caution if breastfeeding. Do not exceed the stated dose.",
    ),
]


if __name__ == "__main__":
    for s in SAMPLES:
        print("wrote", render(**s).relative_to(ROOT))
