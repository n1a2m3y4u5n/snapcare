"""
[그림 15] 종이 서식과 판독 결과.

왼쪽은 실제로 파서에 넣은 사진, 오른쪽은 그 사진에서 읽어낸 값이다. 두 장을 나란히
두는 것이 요점이다 — 서식만 보이면 "읽을 수 있다" 는 주장이 그림 밖에 남는다.

각 항목 옆의 막대는 채움 점수다. 고른 칸과 나머지 칸의 간격이 보여야 판독이
아슬아슬하게 맞은 것이 아니라는 것이 드러난다.
"""
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
FIG = HERE.parent / 'fig'
PARTS = FIG / 'parts'
REPO = HERE.parents[2]
S = 3

INK, SUB, MUTE = (24, 24, 27), (82, 81, 78), (140, 140, 148)
LINE, FILL = (196, 200, 210), (247, 249, 252)
GREEN, BLUE = (22, 130, 90), (42, 120, 214)


def F(sz, bold=False):
    return ImageFont.truetype('/System/Library/Fonts/AppleSDGothicNeo.ttc',
                              sz * S, index=(3 if bold else 1))


def MONO(sz):
    return ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', sz * S)


photo_path = PARTS / '_sheet_photo.png'
out = subprocess.run(
    [str(REPO / '.venv-cv/bin/python'),
     str(REPO / 'pill_dispenser/form_sheet_parser/parse_cli.py'), str(photo_path)],
    capture_output=True, text=True, check=True)
r = json.loads(out.stdout)
if not r['ok']:
    sys.exit(f'파서가 읽지 못했다: {r}')

vals, scores = r['values'], r['scores']

# ── 표시할 네 항목. 라벨은 사람이 읽는 말로 바꾼다. ──────────────────
ROWS = [
    ('약을 담은 칸', 'layer', lambda v: f'{v}번 칸'),
    ('복용 요일', 'days', lambda v: ' · '.join(v)),
    ('복용 기간', 'duration', lambda v: {'7d': '7일', '14d': '14일', '30d': '30일',
                                        '90d': '90일', 'ongoing': '계속'}.get(v, v)),
    ('복용 시각', 'hour', lambda v: f'{int(v):02d}:00'),
]

W, H = 980, 560
img = Image.new('RGB', (W * S, H * S), 'white')
d = ImageDraw.Draw(img)

# ── 왼쪽: 파서에 넣은 사진 그대로 ────────────────────────────────
photo = Image.open(photo_path).convert('RGB')
pw = 430
ph = round(photo.height * pw / photo.width)
photo = photo.resize((pw * S, ph * S), Image.LANCZOS)
py = (H - ph) // 2
img.paste(photo, (24 * S, py * S))
d.rectangle([24 * S, py * S, (24 + pw) * S, (py + ph) * S], outline=LINE, width=S)
d.text((24 * S, (py + ph + 8) * S), '파서에 입력한 사진 (원근·조명·초점 열화 포함)',
       font=F(10), fill=MUTE)

# 가운데 화살표 — 사진에서 값으로 간다는 것만 표시한다
ax = 24 + pw + 26
d.line([ax * S, (H // 2) * S, (ax + 34) * S, (H // 2) * S], fill=LINE, width=2 * S)
d.polygon([((ax + 34) * S, (H // 2 - 6) * S), ((ax + 46) * S, (H // 2) * S),
           ((ax + 34) * S, (H // 2 + 6) * S)], fill=LINE)

# ── 오른쪽: 읽어낸 값 ────────────────────────────────────────
x = ax + 62
d.text((x * S, 46 * S), '읽어낸 값', font=F(13, True), fill=INK)

y = 84
for label, key, fmt in ROWS:
    d.text((x * S, y * S), label, font=F(10), fill=MUTE)
    d.text((x * S, (y + 16) * S), fmt(vals[key]), font=F(16, True), fill=INK)

    # 점수 막대 — 고른 칸(진한 색)과 나머지(옅은 색)
    g = scores[key]
    picked = set(vals[key]) if isinstance(vals[key], list) else {vals[key]}
    bx, bw, gap = x, 300, 2
    n = len(g)
    each = (bw - gap * (n - 1)) / n
    top = y + 46
    for i, (k, v) in enumerate(g.items()):
        left = bx + i * (each + gap)
        # 빈 칸도 자리를 보인다 — 안 그리면 고른 칸 하나만 떠 있어 간격이 안 읽힌다.
        d.rectangle([left * S, top * S, (left + each) * S, (top + 26) * S], fill=(238, 240, 244))
        h = v * 26
        if h >= 0.5:
            d.rectangle([left * S, (top + 26 - h) * S, (left + each) * S, (top + 26) * S],
                        fill=(GREEN if k in picked else (188, 194, 204)))
    other = max([v for k, v in g.items() if k not in picked], default=0)
    d.text((bx * S, (top + 31) * S), '고른 칸', font=F(8), fill=MUTE)
    d.text(((bx + 26) * S, (top + 31) * S), f'{min(g[k] for k in picked):.2f}',
           font=MONO(8), fill=GREEN)
    d.text(((bx + 52) * S, (top + 31) * S), '· 나머지 최대', font=F(8), fill=MUTE)
    d.text(((bx + 100) * S, (top + 31) * S), f'{other:.2f}', font=MONO(8), fill=MUTE)
    y += 108

d.text((x * S, (H - 40) * S),
       '네 귀퉁이 ArUco 마커로 원근을 보정한 뒤 정해진 좌표의 채움 비율을 읽는다.',
       font=F(9), fill=SUB)
d.text((x * S, (H - 26) * S),
       '값은 합성 시 정한 정답(3번 칸 · 월수금 · 30일 · 08시)과 일치한다.',
       font=F(9), fill=SUB)

img.resize((W, H), Image.LANCZOS).save(FIG / 'fig14_formsheet.png')
print('fig14_formsheet.png  ', vals)
