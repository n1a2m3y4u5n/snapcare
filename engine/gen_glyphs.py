"""
형태소 자산을 생성 모델로 만들고, 우리 규격에 맞추고, 작은 크기에서 읽히는지 걸러낸다.

왜 이 파일이 gen_refs.py 를 대신하는가
--------------------------------------
첫 시도(gen_refs.py)에서 6개 중 4개는 지금 것보다 확실히 나았고 2개는 실패했다.
실패에 규칙이 있었다:

  peanut   성공 — 프롬프트가 **윤곽에 남는 특징**(잘록한 허리)과 **내부 구멍**(껍질 결)을
                  지목했다. 둘 다 실루엣으로 살아남는 정보다.
  tree_nut 실패 — "한쪽 끝이 뾰족한 아몬드" 는 윤곽만 보면 물방울과 같다. 게다가 우리
                  세트에는 이미 food_oil 의 방울이 있어 서로 헷갈린다.
  body_skin 실패 — 손이 팔을 꼬집는 장면이라 요소가 셋이다. 32px 로 줄이면 검은 덩어리다.

그래서 프롬프트는 세 가지를 반드시 말한다: 윤곽 특징, 내부 구멍, 무엇과 헷갈리면 안 되는가.
그리고 생성물은 믿지 않고 **규격에 맞춘 뒤 작은 크기에서 시험해 통과한 것만** 남긴다.
사람이 눈으로 고르는 단계를 없애야 반복해서 돌릴 수 있다.

쓰는 법
-------
키는 셸 프로필에 한 번만 넣는다. 매번 export 하면 그 자체가 수동 단계다.

    # ~/.zshrc 에 한 줄
    export OPENAI_API_KEY="..."

그다음부터는 한 줄이면 끝난다. 생성 → 규격 변환 → 검사 → 설치 → 사전 렌더까지 이어진다.

    npm run glyphs

세부 조작이 필요할 때만:

    python3 engine/gen_glyphs.py                 # 아직 없는 것만
    python3 engine/gen_glyphs.py peanut sugar    # 지정한 것만
    python3 engine/gen_glyphs.py --tries 5       # 형태소당 최대 시도 횟수
    python3 engine/gen_glyphs.py --install       # 검사를 통과한 것을 자산으로 설치

결과는 engine/refs/ 에 남는다(git 에 올라가지 않는다). --install 을 줄 때만
engine/assets/ 를 건드리며, 검사를 통과하지 못한 것은 설치하지 않는다.

검사가 못 잡는 것
-----------------
이 자동화는 "작게 줄여도 살아남는가" 는 판정하지만 "맞는 것으로 보이는가" 는 판정하지
못한다. 1차에서 나온 물방울 모양 tree_nut 은 굵기도 구멍도 정상이라 검사를 통과한다 —
읽히기는 아주 잘 읽히고, 다만 견과류가 아닐 뿐이다. 의미는 사람에게 물어야 한다.
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import os
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps

API = 'https://api.openai.com/v1/images/generations'
MODEL = os.environ.get('IMAGE_MODEL', 'gpt-image-1')
ROOT = Path(__file__).parent
REFS = ROOT / 'refs'
ASSETS = ROOT / 'assets'

# ── 우리 규격 (engine/draw.py 와 같아야 한다) ────────────────────────────────
SIZE = 512
INK = (17, 17, 17, 255)
MARGIN = 0.06          # 가장자리 여백 비율
INK_MIN, INK_MAX = 0.10, 0.42   # 실측한 기존 자산 범위(0.12~0.36)에 여유를 둔 것
SMALL = 32             # 목록·행에서 실제로 쓰이는 가장 작은 크기

# ── 프롬프트 ────────────────────────────────────────────────────────────────

STYLE = (
    'Pure black silhouette on a plain white background. '
    'Flat solid black only — no grey, no gradient, no shading, no outline stroke, '
    'no drop shadow, no text, no border, no frame. '
    'One single object, centred, filling most of the frame, seen straight on with no perspective. '
    'Bold simple masses: every black part must be at least one fifteenth of the image width thick, '
    'and every white gap inside the shape at least one twentieth, so the shape survives being '
    'shrunk to a 32 pixel icon. '
    'Detail must live in the outline and in large punched-out white holes, never in fine lines.'
)


@dataclass(frozen=True)
class Target:
    name: str
    role: str            # head | modifier
    asset: str           # engine/assets/{role}/{asset}.png
    subject: str         # 무엇을 그리는가 — 윤곽 특징과 내부 구멍을 반드시 포함
    not_like: str        # 우리 세트 안에서 헷갈리면 안 되는 것


TARGETS: list[Target] = [
    Target(
        'peanut', 'head', 'allergen_peanut',
        'a whole peanut still in its shell, standing upright, its outline clearly pinched inwards '
        'in the middle so it reads as two rounded lobes joined at a narrow waist, with three or four '
        'wide white grooves punched lengthwise through the shell',
        'the digit 8, a snowman, two stacked circles',
    ),
    Target(
        # 1차 실패: "뾰족한 아몬드" 는 윤곽만 보면 물방울이었다. 껍질을 깨서 알맹이가
        # 보이는 형태로 바꾸면 윤곽에 단차가 생겨 방울과 갈라진다.
        'tree_nut', 'head', 'allergen_tree_nut',
        'a cracked hazelnut in its shell: a round nut sitting in a cup-shaped shell that opens at the '
        'top, the rim of the cup drawn as a clear zigzag notch across the middle so the outline has '
        'an obvious step, with one wide white crescent punched into the nut',
        'a water drop, a teardrop, a flame, a leaf',
    ),
    Target(
        'sugar', 'head', 'food_sugar',
        'three sugar cubes stacked in a pyramid, two side by side below and one resting on top, each '
        'cube drawn as a solid black square with wide white lines punched between them so the three '
        'separate cubes are unmistakable',
        'a bar chart, stacked boxes, dice, bricks',
    ),
    Target(
        'oil', 'head', 'food_oil',
        'a cooking oil bottle with a narrow neck and a wide body, tilted, with one large round drop '
        'falling from the spout and clearly separated from the bottle by white space',
        'a water bottle, a milk carton, a single drop on its own',
    ),
    Target(
        'skin_rash', 'head', 'symptom_skin',
        'a bare human forearm shown from the elbow to the wrist as one simple solid black band, with '
        'about eight large round white dots punched into the middle of it to read as a rash',
        'dice, a domino, a die face, a keypad',
    ),
    Target(
        # 1차 실패: 손이 팔을 꼬집는 장면은 요소가 셋이라 작은 크기에서 뭉갰다.
        # 요소를 하나로 줄이고, 살결을 내부 구멍으로 표현한다.
        'body_skin', 'modifier', 'body_skin',
        'a single square patch of skin seen close up, drawn as one solid black rounded square with '
        'three or four wide white wavy grooves punched across it to read as skin texture, and one '
        'small notch in the outline so it is clearly a piece of something and not a plain tile',
        'a barcode, a keyboard key, a plain square, a striped flag',
    ),
]


# 재시도할 때마다 덧붙이는 지시. 실패는 대개 두 방향 중 하나라서, 그 방향을
# 되돌리는 말을 얹는다. 사람이 프롬프트를 고쳐 다시 돌리던 자리를 대신한다.
ESCALATION = [
    '',
    ' Make the shape noticeably chunkier and simplify it: fewer, larger parts.',
    ' Punch the white holes much larger and fewer, so they stay open when the image is tiny.',
    ' Remove every small detail. Keep only the two or three biggest shapes that make it recognisable.',
]


def prompt_for(t: Target, attempt: int = 0) -> str:
    return (
        f'{t.subject}. '
        f'It must not look like {t.not_like}. '
        f'{STYLE}'
        f'{ESCALATION[min(attempt, len(ESCALATION) - 1)]}'
    )


# ── 생성 ────────────────────────────────────────────────────────────────────

def generate(t: Target, attempt: int = 0) -> bytes:
    key = os.environ.get('OPENAI_API_KEY')
    if not key:
        raise SystemExit(
            'OPENAI_API_KEY 가 환경에 없다.\n'
            '  export OPENAI_API_KEY="..."  로 넣고 다시 실행할 것.\n'
            '  (키를 이 파일이나 저장소 안 어디에도 적지 말 것)'
        )
    body = json.dumps({
        'model': MODEL, 'prompt': prompt_for(t, attempt), 'size': '1024x1024', 'n': 1,
    }).encode()
    req = urllib.request.Request(
        API, data=body,
        headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'},
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            payload = json.load(resp)
    except urllib.error.HTTPError as e:
        # 본문에 실제 사유가 들어 있다(모델 접근 권한·잔액·조직 인증 등).
        detail = e.read().decode('utf-8', 'replace')[:300]
        raise SystemExit(f'{t.name}: HTTP {e.code}\n{detail}')
    item = payload['data'][0]
    if 'b64_json' in item:
        return base64.b64decode(item['b64_json'])
    with urllib.request.urlopen(item['url'], timeout=180) as r:
        return r.read()


# ── 규격 맞추기 ─────────────────────────────────────────────────────────────

def conform(raw: Image.Image) -> Image.Image:
    """
    생성물을 우리 자산 규격으로 옮긴다.

    생성 모델은 '검은 실루엣' 을 요청해도 미세한 회색과 여백을 남긴다. 그대로 쓰면
    합성할 때 가장자리가 지저분하고, 부정 연산자(no{})가 얹는 고리와 섞인다.
    그래서 이진화 → 잉크 경계로 자르기 → 여백 통일 → 우리 잉크색으로 칠하기까지
    기계적으로 처리한다. 사람이 매번 다듬으면 반복해서 돌릴 수 없다.
    """
    g = ImageOps.grayscale(raw.convert('RGB'))
    # 배경이 흰색이므로 어두운 쪽이 잉크다. 문턱은 중간보다 밝게 잡아
    # 안티에일리어싱된 가장자리를 잉크로 끌어온다(가늘어지는 것을 막는다).
    mask = g.point(lambda v: 255 if v < 160 else 0).convert('L')

    bbox = mask.getbbox()
    if bbox is None:
        raise ValueError('빈 이미지')
    mask = mask.crop(bbox)

    # 정사각 캔버스에 여백을 두고 앉힌다
    inner = int(SIZE * (1 - 2 * MARGIN))
    mask.thumbnail((inner, inner), Image.LANCZOS)
    mask = mask.point(lambda v: 255 if v > 127 else 0)

    canvas = Image.new('L', (SIZE, SIZE), 0)
    canvas.paste(mask, ((SIZE - mask.width) // 2, (SIZE - mask.height) // 2))

    out = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    out.paste(Image.new('RGBA', (SIZE, SIZE), INK), (0, 0), canvas)
    return out


def ink_ratio(im: Image.Image) -> float:
    a = im.split()[-1]
    hist = a.histogram()
    return sum(hist[128:]) / (im.width * im.height)


# ── 검사 ────────────────────────────────────────────────────────────────────

@dataclass
class Check:
    ok: bool
    reasons: list[str]
    ink: float
    small_ink: float
    keeps_holes: bool


def holes_count(im: Image.Image, size: int) -> int:
    """
    구멍(내부 흰 영역) 개수. 배경에서 시작한 채움이 닿지 않는 흰 영역을 센다.

    왜 세는가: 우리 도상은 정보를 '내부 구멍' 에 싣는다(껍질 결, 발진 점, 각설탕 사이).
    작게 줄였을 때 구멍이 메워지면 남는 것은 덩어리 하나뿐이고, 그 순간 그림이
    말하던 것이 사라진다. 눈으로 보면 알지만 자동으로 걸러내려면 세어야 한다.
    """
    small = im.resize((size, size), Image.LANCZOS)
    a = small.split()[-1].point(lambda v: 255 if v > 110 else 0)
    w, h = a.size
    px = a.load()
    seen = [[False] * h for _ in range(w)]
    # 배경(가장자리에 닿는 흰 영역)을 먼저 지운다
    stack = [(x, y) for x in range(w) for y in (0, h - 1) if px[x, y] == 0]
    stack += [(x, y) for y in range(h) for x in (0, w - 1) if px[x, y] == 0]
    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= w or y >= h or seen[x][y] or px[x, y] != 0:
            continue
        seen[x][y] = True
        stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    # 남은 흰 영역이 구멍이다
    holes = 0
    for x in range(w):
        for y in range(h):
            if px[x, y] == 0 and not seen[x][y]:
                holes += 1
                stack = [(x, y)]
                while stack:
                    a2, b2 = stack.pop()
                    if a2 < 0 or b2 < 0 or a2 >= w or b2 >= h or seen[a2][b2] or px[a2, b2] != 0:
                        continue
                    seen[a2][b2] = True
                    stack += [(a2 + 1, b2), (a2 - 1, b2), (a2, b2 + 1), (a2, b2 - 1)]
    return holes


def check(im: Image.Image) -> Check:
    reasons: list[str] = []
    ink = ink_ratio(im)
    if ink < INK_MIN:
        reasons.append(f'너무 가늘다 (잉크 {ink:.2f} < {INK_MIN})')
    if ink > INK_MAX:
        reasons.append(f'너무 뭉쳤다 (잉크 {ink:.2f} > {INK_MAX})')

    small = im.resize((SMALL, SMALL), Image.LANCZOS)
    sink = ink_ratio(small)
    # 줄였을 때 잉크가 크게 불어나면 구멍이 메워졌다는 뜻이다.
    if sink - ink > 0.18:
        reasons.append(f'{SMALL}px 에서 뭉갠다 (잉크 {ink:.2f} → {sink:.2f})')

    big_holes = holes_count(im, 256)
    small_holes = holes_count(im, SMALL)
    keeps = small_holes >= max(1, big_holes // 2) if big_holes > 0 else True
    if not keeps:
        reasons.append(f'{SMALL}px 에서 구멍이 사라진다 ({big_holes} → {small_holes})')

    return Check(not reasons, reasons, ink, sink, keeps)


def score(im: Image.Image, c: Check) -> float:
    """
    후보 사이의 순위. 통과가 최우선이고, 그다음은 기존 자산의 잉크 중앙값(0.25)에
    가까운 것, 그다음은 작은 크기에서 구멍이 많이 남는 것이다.
    """
    s = 100.0 if c.ok else 0.0
    s -= abs(c.ink - 0.25) * 50
    s += holes_count(im, SMALL) * 2
    return s


# ── 실행 ────────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('names', nargs='*', help='생성할 형태소 (비우면 아직 없는 것 전부)')
    ap.add_argument('--force', action='store_true', help='이미 있어도 다시 생성')
    ap.add_argument('--install', action='store_true', help='검사를 통과한 것을 자산으로 설치')
    ap.add_argument('--tries', type=int, default=3,
                    help='형태소당 최대 시도 횟수. 실패하면 프롬프트를 강화해 다시 뽑는다')
    args = ap.parse_args()

    by_name = {t.name: t for t in TARGETS}
    unknown = [n for n in args.names if n not in by_name]
    if unknown:
        raise SystemExit(f'모르는 이름: {", ".join(unknown)}\n가능: {", ".join(by_name)}')

    chosen = [by_name[n] for n in args.names] if args.names else TARGETS
    REFS.mkdir(exist_ok=True)

    passed, failed = [], []
    for t in chosen:
        out = REFS / f'{t.name}.png'
        if out.exists() and not args.force and args.names == []:
            print(f'{t.name:11} 건너뜀 (이미 있음)')
            continue

        best = None   # (점수, 이미지, 검사결과, 시도번호)
        for attempt in range(args.tries):
            try:
                im = conform(Image.open(io.BytesIO(generate(t, attempt))))
            except SystemExit:
                raise
            except Exception as e:                   # noqa: BLE001
                print(f'{t.name:11} 시도 {attempt + 1} ✗ {e}')
                continue
            c = check(im)
            sc = score(im, c)
            print(f'{t.name:11} 시도 {attempt + 1}  {"통과" if c.ok else "실패"} '
                  f'잉크 {c.ink:.2f} 점수 {sc:5.1f}'
                  + ('' if c.ok else '  | ' + ' · '.join(c.reasons)))
            if best is None or sc > best[0]:
                best = (sc, im, c, attempt)
            # 통과했으면 더 뽑을 이유가 없다 — 호출 한 번이 곧 비용이다.
            if c.ok:
                break

        if best is None:
            failed.append((t, ['생성 실패']))
            continue

        _, im, c, attempt = best
        im.save(out)
        print(f'{t.name:11} → 채택: 시도 {attempt + 1} ({"통과" if c.ok else "실패"})')
        (passed if c.ok else failed).append((t, c.reasons))

        if c.ok and args.install:
            dest = ASSETS / t.role / f'{t.asset}.png'
            dest.parent.mkdir(parents=True, exist_ok=True)
            im.save(dest)
            print(f'{"":11}   설치 → {dest.relative_to(ROOT.parent)}')

    print(f'\n통과 {len(passed)} · 실패 {len(failed)}')
    if failed and not args.install:
        print('실패한 것은 프롬프트를 고쳐 다시 돌리면 된다 (--force).')
    if args.install:
        print('설치했으면 dictionary 를 다시 만들 것: python3 engine/build_assets.py --publish')


if __name__ == '__main__':
    main()
