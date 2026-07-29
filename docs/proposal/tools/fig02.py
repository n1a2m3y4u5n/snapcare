"""
[그림 2] SIGIL 형태소 78종 전체 시트.

머리 57종을 먼저, 수식어 21종을 그 다음에 놓는다. 각 형태소 아래에 34px 축소본을
함께 싣는 것이 요점이다 — 이 그림들이 실제로 쓰이는 크기가 그쪽이기 때문이다.

도판 안에 제목을 넣지 않는다(캡션은 문서 쪽). diagrams.py 와 같은 규칙이다.
"""
from pathlib import Path

HERE = Path(__file__).resolve().parent
FIG = HERE.parent / 'fig'          # docs/proposal/fig
PARTS = FIG / 'parts'              # 도판 조립에 쓰는 중간 재료
ROOT = HERE.parents[2]             # 레포 루트

from PIL import Image, ImageDraw, ImageFont

ASSETS = ROOT / 'engine' / 'assets'

S = 2                 # 2배 렌더 후 축소
COLS = 10
BIG, SMALL = 62, 34   # 원본 표시 크기와 축소본 크기
CELL_W, CELL_H = 106, 122
PAD_X, PAD_Y = 18, 14
MUTE = (120, 120, 128)


def font(sz):
    return ImageFont.truetype('/System/Library/Fonts/AppleSDGothicNeo.ttc', sz * S, index=1)


def on_white(path: Path, size: int) -> Image.Image:
    im = Image.open(path).convert('RGBA').resize((size * S, size * S), Image.LANCZOS)
    bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
    return Image.alpha_composite(bg, im).convert('RGB')


names = ([('head', p) for p in sorted(ASSETS.glob('head/*.png'))]
         + [('modifier', p) for p in sorted(ASSETS.glob('modifier/*.png'))])
rows = (len(names) + COLS - 1) // COLS

W = PAD_X * 2 + CELL_W * COLS
H = PAD_Y * 2 + CELL_H * rows
img = Image.new('RGB', (W * S, H * S), 'white')
d = ImageDraw.Draw(img)
f = font(8)

for i, (_, path) in enumerate(names):
    cx = PAD_X + (i % COLS) * CELL_W + CELL_W // 2
    cy = PAD_Y + (i // COLS) * CELL_H

    img.paste(on_white(path, BIG), ((cx - BIG // 2) * S, cy * S))
    img.paste(on_white(path, SMALL), ((cx - SMALL // 2) * S, (cy + BIG + 6) * S))

    label = path.stem
    if len(label) > 17:
        label = label[:16] + '…'
    w = d.textlength(label, font=f)
    d.text((cx * S - w / 2, (cy + BIG + SMALL + 12) * S), label, font=f, fill=MUTE)

img.resize((W, H), Image.LANCZOS).save(FIG / 'fig02_sigil_sheet.png')
print(f'fig02_sigil_sheet.png  {len(names)}종 ({rows}행)')
