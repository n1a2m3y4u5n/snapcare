"""슬롯이 실제로 맞는지 합성해서 본다.

왜 따로 필요한가: gen_glyphs.py 의 검사는 글리프 **하나**가 작은 크기에서 살아남는지만
본다. 그런데 head 15개는 안쪽에 수식어를 끼우는 자리가 있고, 그 자리는 그림에서
뽑아낸 좌표다. 좌표가 어긋나면 각각은 전부 통과하면서 합성만 깨진다 — 수식어가 병
밖 허공에 뜨거나, 뚫린 창이 윤곽을 잘라 무엇을 그린 것인지 사라진다.

    python3 engine/check_slots.py out.png
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from PIL import Image, ImageDraw, ImageFont  # noqa: E402

from engine import Manifest, parse, render_label  # noqa: E402
from glyphs import SLOTS  # noqa: E402

#: 슬롯을 가진 head 마다, 실제로 앱에서 그 안에 들어가는 수식어 하나씩.
PAIRS = [
    ('pill_bottle', 'qty_two'), ('liquid_bottle', 'water_glass'),
    ('dropper_bottle', 'body_eye'), ('cream_tube', 'body_skin'),
    ('inhaler', 'body_mouth'), ('sachet', 'water_glass'),
    ('capsule_strip', 'qty_one'), ('tablet_blister', 'qty_two'),
    ('glucometer', 'time_morning'), ('thermometer', 'time_evening'),
    ('bp_monitor', 'time_noon'), ('syringe', 'qty_one'),
    ('patch', 'body_skin'), ('spray', 'body_nose'),
    ('suppository', 'qty_one'),
]


def _font(sz: int):
    for p in ('/System/Library/Fonts/AppleSDGothicNeo.ttc',
              '/System/Library/Fonts/Supplemental/AppleGothic.ttf'):
        if Path(p).exists():
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()


def main() -> int:
    out = Path(sys.argv[1] if len(sys.argv) > 1 else 'slots.png')
    manifest = Manifest.load(Path(__file__).parent / 'dictionary.json')
    F = _font(11)

    CELL, BIG, TINY, PER = 128, 88, 34, 5
    rows = (len(PAIRS) + PER - 1) // PER
    sheet = Image.new('RGB', (PER * CELL + 32, rows * (CELL + 34) + 40), 'white')
    d = ImageDraw.Draw(sheet)
    d.text((16, 12), '합성 확인 — 수식어가 head 몸통 안에 앉는가 (아래는 34px)',
           fill=(90, 90, 90), font=F)

    bad = []
    for i, (head, mod) in enumerate(PAIRS):
        cx = 16 + (i % PER) * CELL
        cy = 40 + (i // PER) * (CELL + 34)
        dsl = f'\\{head}{{\\{mod}}}'
        try:
            img = render_label(parse(dsl, manifest), manifest, BIG)
        except Exception as e:                      # noqa: BLE001
            bad.append((dsl, str(e)))
            d.text((cx + 2, cy + 8), f'{head}\n실패', fill=(200, 30, 30), font=F)
            continue
        img = img.convert('RGBA')
        sheet.paste(img, (cx + 6, cy), img)
        t = img.resize((TINY, TINY), Image.LANCZOS)
        sheet.paste(t, (cx + 6, cy + BIG + 4), t)
        d.text((cx + 46, cy + BIG + 10), f'{head}\n  +{mod}', fill=(20, 20, 20), font=F)
        d.text((cx + 46, cy + BIG + 34), str(SLOTS.get(head, '—')), fill=(140, 140, 140), font=F)

    sheet.save(out)
    print(f'합성 {len(PAIRS) - len(bad)}/{len(PAIRS)} · → {out}')
    for dsl, err in bad:
        print(f'  실패 {dsl}: {err}')
    return 1 if bad else 0


if __name__ == '__main__':
    raise SystemExit(main())
