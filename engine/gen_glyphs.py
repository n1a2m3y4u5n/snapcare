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
import re
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
#: 생성된 그림에서 뽑아낸 슬롯. 손으로 적은 glyphs.py 의 SLOTS 를 덮어쓴다 —
#: 생성물이라 사람이 고쳐 쓰는 파일과 섞지 않는다.
SLOTS_OUT = ROOT / 'slots_gen.json'
#: 설치한 자산의 이름. build_assets.py 가 이 목록을 보고 다시 그리기를 건너뛴다 —
#: 그러지 않으면 `--install && build_assets` 순서에서 방금 넣은 그림이 코드로 그린
#: 그림에 즉시 덮어써진다.
GENERATED_OUT = ROOT / 'generated.json'
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
    sparse: bool = False  # 점이 적은 것이 곧 뜻인가 (qty_one 등) — 잉크 하한을 면제한다
    parts: int = 0       # 떨어진 덩어리가 정확히 몇 개여야 하는가. 0 이면 세지 않는다.
    slot: bool = False   # 안쪽에 수식어가 들어가는가 — 슬롯을 그림에서 뽑아낸다
    #: 검사를 통과하더라도 설치하지 않는다. 사람이 둘을 나란히 놓고 본 뒤 지금 자산이
    #: 낫다고 판정한 것 — 그 판정을 여기 적어두지 않으면 다음 --force 실행이 조용히
    #: 뒤집는다. 왜 그렇게 봤는지는 해당 Target 의 주석에 남긴다.
    keep_current: bool = False
    #: 사람(또는 Vision)에게 "무엇으로 보이나" 를 물었을 때 나와야 하는 말.
    #: 비우면 이름에서 만든다 — allergen_peanut → peanut.
    means: str = ''


def expected_meaning(t: 'Target') -> str:
    if t.means:
        return t.means
    n = t.name
    for p in ('allergen_', 'food_', 'symptom_', 'state_', 'body_', 'storage_', 'time_'):
        n = n.removeprefix(p)
    return n.replace('_', ' ')


TARGETS: list[Target] = [
    # ── 알레르겐 ────────────────────────────────────────────────────────────
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
        # 검사기가 "cracked egg" 로 읽었다. 우리 세트에 egg 가 따로 있어 특히 나쁘다 —
        # 알레르기 둘이 같은 그림이 된다. 깨진 껍질을 버리고 알맹이의 결을 형태로 삼는다.
        'a walnut half seen flat from above: a rounded shape with a clear waist pinched into one '
        'side, and four deep curling white grooves carved across it like the folds of a kernel',
        'a cracked egg, an egg in a shell, a water drop, a leaf, a shell',
        means='walnut',
    ),
    Target(
        'egg', 'head', 'allergen_egg',
        # 협성대 박남수 교수(2026년 8월 조사): "계란 알러지를 표시할 때 흑백으로만
        # 제시되었을 때는 그게 계란인지 명확하게 알기 어렵다."
        #
        # 위에서 본 프라이는 흰자가 흰색이라 실루엣에서 **사라진다.** 남는 것은 가운데
        # 노른자 원 하나뿐이고, 그것은 과녁이나 단추와 같은 그림이다. 채운 실루엣으로
        # 그리는 세트에서 '흰 부분이 뜻을 지는 그림' 은 처음부터 성립하지 않았다.
        #
        # 깨진 달걀로 바꾼다. 껍데기 두 쪽이라는 윤곽이 뜻을 지므로 흰색에 기대지 않고,
        # §5.2 에서 tree_nut 이 "깨진 달걀" 로 읽혔던 것이 곧 그 형태가 달걀로 읽힌다는
        # 증거이기도 하다.
        'a cracking egg seen from the side: one solid black egg shape split across the middle by a '
        'wide zigzag white gap, so the top shell cap and the bottom shell read as two separate '
        'pieces with a jagged edge facing each other',
        'a peanut, a target, a button, a plain circle, a walnut',
        means='cracked egg',
    ),
    Target(
        'fish', 'head', 'allergen_fish',
        'a whole fish seen from the side, pointing left, with a clear triangular notched tail fin at '
        'the right, one triangular fin on the back, and one large round white eye punched near the '
        'head, plus one wide white curved gill line behind the head',
        'a leaf, an arrow, a boat, a whale',
    ),
    Target(
        'milk', 'head', 'allergen_milk',
        'a milk carton seen straight on: a tall rectangle with a folded triangular gable roof on top, '
        'and one wide horizontal white band punched across the middle to read as a label',
        'a house, a bottle, a box, a bread slice',
        means='milk carton',
    ),
    Target(
        'gluten', 'head', 'allergen_gluten',
        'a single ear of wheat standing upright: a straight vertical stalk with about five pairs of '
        'pointed grains angled upwards along it, each grain a separate shape with clear white gaps '
        'between it and its neighbours so the outline is strongly serrated',
        'a feather, a leaf, a tree, a fish bone',
        means='wheat',
    ),
    Target(
        'soy', 'head', 'allergen_soy',
        'a soybean pod seen from the side: a long curved pod, its outline bulging into three rounded '
        'humps, with three large round white circles punched through it to show the beans inside',
        'a peanut, a banana, a caterpillar, a crescent moon',
        means='soybean pod',
    ),
    Target(
        'sesame', 'head', 'allergen_sesame',
        # 판정: 지금 자산을 쓴다. 꼬투리 안에 씨를 넣은 새 그림이 흩뿌린 씨(꽃으로 읽힘)보다
        # 낫지만, 우리 세트의 soy 가 이미 '콩이 든 꼬투리' 다 — 알레르겐 둘이 같은 그림이
        # 된다. tree_nut 이 egg 로 읽히던 것을 고쳤는데 여기서 다시 만들 수는 없다.
        # 참깨를 다른 씨앗과 구별시키는 그림은 없다는 것이 이 자리의 결론이다.
        # 흩뿌린 씨는 세 번 다 petals·paw print 로 읽혔다 — 방사형으로 놓이면 무엇이든
        # 꽃이 된다. 씨를 담을 그릇(꼬투리)을 주면 배열이 한 줄로 고정된다.
        'an open sesame seed pod split lengthwise: a long pointed husk drawn as a bold outline with a '
        'row of five small solid oval seeds sitting in a line inside it',
        'a flower, petals in a circle, a paw print, rice grains, a cluster',
        # 기대값을 'sesame' 에서 'seeds' 로 낮춘다. 그림을 통과시키려고 기준을 무른
        # 것이 아니라, 애초에 도달할 수 없는 것을 기대하고 있었다 — 어떤 그림도 참깨를
        # 다른 씨앗과 구별시키지 못한다. 이 자리에서 전달돼야 하는 것은 '씨앗' 이고,
        # 무엇의 씨앗인지는 음성과 글씨가 말한다.
        means='seeds',
        keep_current=True,
    ),
    Target(
        'shellfish', 'head', 'allergen_shellfish',
        'a shrimp seen from the side, its body curved into a strong C shape with the tail fanning out '
        'at one end, and four wide white lines punched across the body to read as segments',
        'a fish, a comma, a crescent moon, a leaf',
        means='shrimp',
    ),

    # ── 음식 ────────────────────────────────────────────────────────────────
    Target(
        'sugar', 'head', 'food_sugar',
        # 각설탕은 입체로 그리면 hexagons, 평평하게 그리면 dice 가 된다 — 정육면체라는
        # 형태 자체가 우리 세트에서 설탕을 뜻하지 못한다. 담는 도구로 바꾼다.
        'a heaped spoon of sugar seen from the side: a spoon with a long straight handle going to the '
        'right, and a rounded mound heaped well above the bowl of the spoon, with three small grains '
        'falling below',
        'hexagons, dice, a bar chart, bricks, a solid block, a magnifying glass',
        means='spoon of sugar',
    ),
    Target(
        'oil', 'head', 'food_oil',
        'a cooking oil bottle with a narrow neck and a wide body, tilted, with one large round drop '
        'falling from the spout and clearly separated from the bottle by white space',
        'a water bottle, a milk carton, a single drop on its own',
        means='oil bottle',
    ),
    Target(
        'salt', 'head', 'food_salt',
        'a salt shaker seen straight on: a rounded body narrowing to a flat domed cap, with five large '
        'round white holes punched through the cap, and three small solid grains falling below the '
        'shaker with clear white space between them and the shaker',
        'a pepper mill, a bottle, a chess pawn, a lighthouse',
        means='salt shaker',
    ),
    Target(
        # 잉크 0.43~0.52 로 세 번 뭉쳤다. 구멍을 더 뚫는 지시는 면적을 줄이지 못했다 —
        # sugar 와 같은 처방으로 방향을 뒤집는다: 덩어리를 작게, 껍질을 선으로.
        'food_bread', 'head', 'food_bread',
        'one slice of bread seen straight on: a solid filled black square with a rounded dome on top, '
        'drawn small in the middle of the frame with wide empty white space around it, with three '
        'very large round white holes punched through it. Draw it as one solid filled black shape — not a hollow outline drawing, not an empty white interior with a black border.',
        'a house, a tombstone, a solid block, a mushroom, a filled square',
    ),
    Target(
        'rice', 'head', 'food_rice',
        'a bowl of rice seen from the side: a wide shallow bowl drawn as a bold curved band, with a '
        'rounded mound of rice heaped above it, and three wide white notches cut into the mound so it '
        'does not read as one solid lump',
        'a cup, a hat, a hill, an empty bowl, a boat',
        means='bowl of rice',
    ),
    Target(
        'meat', 'head', 'food_meat',
        'a bone-in meat chop seen from the side: a thick rounded piece of meat with a straight bone '
        'sticking out at one end ending in two small round knobs, and one wide white curved line '
        'punched inside the meat to separate the fat rim from the middle',
        'a chicken leg, a hand, a leaf, a club',
        means='meat',
    ),
    Target(
        'fruit', 'head', 'food_fruit',
        # 판정: 지금 자산을 쓴다. 실루엣판은 흰 초승달이 베어 먹은 자국처럼 보이고,
        # 윤곽선판은 세트에서 혼자 다른 언어가 된다. 지금 것으로 충분히 읽힌다.
        # 잉크 0.47 로 뭉쳤다 — 사과는 본래 덩어리라 속을 비워야 한다.
        'an apple seen straight on: a solid filled black round body with a clear notch dipping into the '
        'top of its outline and two wide white crescents punched into it, one short stem rising from '
        'the notch, and one pointed leaf beside the stem separated from it by white space. Draw it as one solid filled black shape — not a hollow outline drawing, not an empty white interior with a black border.',
        'a tomato, a cherry, a ball, a heart',
        keep_current=True,
        means='apple',
    ),
    Target(
        # 32px 에서 구멍 2개 소실. 잎을 크게 줄이고 몸통과의 틈을 넓힌다.
        'food_vegetable', 'head', 'food_vegetable',
        'a carrot pointing down: one thick tapering black wedge with two large separate leaves on top, '
        'the leaves clearly detached from the carrot by wide white gaps, and two wide white notches '
        'cut into the side of the carrot',
        'a flame, a tooth, an arrow, an ice cream cone',
        means='carrot',
    ),
    Target(
        'caffeine', 'head', 'caffeine',
        'a coffee cup seen from the side: a rounded cup on a flat saucer with one large open handle on '
        'the right, the handle a bold ring with a wide white hole through its middle, and two wavy '
        'steam lines rising above the cup clearly separated from it',
        'a mug with no handle, a bucket, a pot, a bell',
        means='coffee cup',
    ),
    Target(
        'no_alcohol', 'head', 'no_alcohol',
        # 금지는 \no{} 가 얹는다 — 여기서는 술 그 자체만 그린다.
        'a stemmed wine glass seen straight on: a wide bowl narrowing to a thin stem and a flat round '
        'base, with the lower half of the bowl filled solid black and the upper half left white and '
        'open so the rim reads as a clear thin line',
        'a trophy, a funnel, a tree, a mushroom, a martini glass',
        means='wine glass',
    ),

    # ── 제형 ────────────────────────────────────────────────────────────────
    Target(
        'pill_bottle', 'head', 'pill_bottle',
        'a medicine bottle seen straight on: a wide rectangular body with rounded corners and a '
        'narrower cap on top, the cap separated from the body by one wide white line, and the middle '
        'of the body left as a large solid black rectangle',
        'a milk carton, a battery, a box, a can',
        slot=True,
    ),
    Target(
        'liquid_bottle', 'head', 'liquid_bottle',
        'a syrup bottle seen straight on: a tall narrow neck opening out into a wide rounded body, a '
        'small flat cap on top, and one wide white line across the neck where it meets the body, the '
        'lower body a large solid black area',
        'a pill bottle, a vase, a light bulb, a chess piece',
        slot=True,
    ),
    Target(
        'dropper_bottle', 'head', 'dropper_bottle',
        'an eye drop bottle seen straight on: a rounded body with a long narrow nozzle tapering to a '
        'point at the top, one round drop falling from the tip clearly separated by white space, and '
        'one wide white line across the shoulder of the bottle',
        'a syrup bottle, a rocket, a pen, a flame',
        slot=True,
    ),
    Target(
        'cream_tube', 'head', 'cream_tube',
        # 32px 에서 구멍 5개 중 4개가 메워졌다 — 적고 크게.
        'an ointment tube seen straight on: a long rounded rectangle with a small screw cap at the '
        'top, the bottom end crimped flat, and exactly two very wide white bands punched straight '
        'across the tube, each band at least one sixth of the image tall',
        'a battery, a pill bottle, a crayon, a toothbrush',
        slot=True,
    ),
    Target(
        # 32px 에서 구멍 1개 소실. 흡입기는 입에 닿는 부분이 보여야 흡입기다.
        'inhaler', 'head', 'inhaler',
        # "letter l" 로 읽혔다 — not_like 에 이미 적어둔 것이 그대로 나왔다.
        # 분사되는 입자를 붙여 L 자의 두 획을 깬다.
        'an asthma inhaler seen from the side as an L shape: an upright canister with a mouthpiece '
        'sticking out at the bottom front, one wide white slot punched where the two meet, and three '
        'short separate puff marks sprayed out of the mouthpiece with white space between them',
        'the letter L, a boot, a camera, a stapler, a step',
        means='inhaler',
        slot=True,
    ),
    Target(
        'sachet', 'head', 'sachet',
        # 잉크 0.49 로 뭉쳤다 — "large solid black rectangle" 이라고 내가 시켰다.
        # 뭉침을 고치려다 속 빈 사각형이 됐다 — 봉지가 아니라 종이로 보인다. 몸통은 채우고
        # 무게는 구멍으로 던다.
        #
        # 그렇게 통과한 그림이 **"사탕 껍질"** 로 읽혔다. 원인은 내가 시킨 두 가지가
        # 겹친 것이다 — 위쪽의 톱니와 옆구리의 홈. 둘이 함께 있으면 양끝을 비틀어
        # 묶은 모양이 되고, 그것이 사탕 껍질의 형태 그 자체다. 홈을 뺀다.
        #
        #
        # 이 그림은 기계 검사를 통과하고도 **"candy wrapper"** 로 읽힌다. 고쳐 보려고
        # 두 방향을 시도했고 둘 다 실패했다. 남겨 두는 이유는 다음 사람이 같은 길을
        # 다시 걷지 않게 하기 위해서다.
        #
        #  1) 옆구리 홈을 빼고 가루를 작은 흰 점으로 그리게 했다.
        #     - 여전히 "candy wrapper" 였다. 원인은 홈이 아니라 **톱니**다. 실제 약
        #       봉지의 뜯는 자리와 사탕 껍질의 주름은 실루엣에서 같은 모양이다.
        #     - 그리고 "작은 흰 점" 은 32px 에서 통째로 사라졌다(21개 → 0개). 이 검사가
        #       잡으라고 있는 바로 그 실패를 내 지시가 만들었다. 작게 그리라고 하면 안 된다.
        #
        #  2) 대상을 바꿔 봉지를 기울여 붓는 순간으로 그리게 했다.
        #     - "ice cream cone", "cocktail shaker pouring" 으로 읽혔다. 넓어지는 쐐기가
        #       콘이 된다.
        #     - 세 번째 시도는 이미지 API 가 거절했다 (safety_violations=[self-harm]).
        #       "가루를 붓는" 그림을 요청하는 것이 약물 오남용으로 읽힌 것이다.
        #
        # 형태만으로는 갈라지지 않는다고 본다 — §5.3 의 suppository·sesame 과 같은
        # 부류다. 봉지와 사탕 껍질을 가르는 것은 실루엣이 아니라 맥락이고, 정지한
        # 그림에는 맥락이 없다. 화면에서는 옆의 문장과 음성이 그것을 메운다
        # (그림을 누르면 "The powder sachet." 라고 말한다).
        'a powder sachet seen straight on: a solid filled black rectangular pouch whose top edge is '
        'a clear zigzag saw tooth line where it tears open, with two very wide white bands punched '
        'straight across the body and one wide notch cut into the side near the top. Draw it as one solid filled black shape — not a hollow outline drawing, not an empty white interior with a black border.',
        'a candy wrapper, a sweet with twisted ends, a bread slice, an envelope, a flag, a crown',
        slot=True,
        means='a sachet of medicine powder',
    ),
    Target(
        'capsule_strip', 'head', 'capsule_strip',
        'one medicine capsule lying horizontally: a long rounded pill shape with one wide white line '
        'punched straight across its middle where the two halves join, one half solid black and the '
        'other half drawn as a bold outline with white inside',
        'a battery, a pill bottle, a tablet, a bean',
        slot=True,
        means='capsule',
    ),
    Target(
        'tablet_blister', 'head', 'tablet_blister',
        # 구멍만 뚫으면 die·egg carton·6-hole tray 가 된다 — 빈 구멍은 약을 뜻하지 않는다.
        # 알약을 넣고 포일 한 귀퉁이를 벗겨야 약 포장이 된다.
        'a blister pack seen at a slight angle: a rectangle with rounded corners holding six round '
        'pills in two rows of three, each pill sitting in a raised bubble drawn as a bold ring, with '
        'one corner of the foil peeled back',
        'a die, an egg carton, a pill organizer, a domino, a phone keypad, a tray',
        slot=True,
    ),
    Target(
        'syringe', 'head', 'syringe',
        'a syringe lying at a diagonal: a long barrel with a thin needle at one end and a flat round '
        'plunger flange at the other, with three wide white lines punched across the barrel to read '
        'as measuring marks',
        'a pen, an arrow, a thermometer, a nail',
        slot=True,
    ),
    Target(
        'spray', 'head', 'spray',
        'a pump spray bottle seen from the side: a rectangular body with a flat trigger head on top '
        'angled to the left, three short spray lines coming out of the nozzle clearly separated from '
        'the bottle by white space, and one wide white line across the neck',
        'a watering can, a hairdryer, a gun, a kettle',
        slot=True,
    ),
    Target(
        'suppository', 'head', 'suppository',
        # 판정: 지금 자산을 쓴다. 포장을 씌웠더니 꼬리가 날개가 되어 'bomb'·'rocket' 이
        # 됐다. 총알과 좌약은 형태가 같아서 형태만으로는 갈라지지 않는다.
        # bullet 로 읽혔다. 총알과 좌약은 형태가 같으므로 형태로는 갈라지지 않는다 —
        # 포장을 씌워 의약품 쪽으로 밀어낸다.
        'a suppository in its wrapper: a bullet shape with the wrapper twisted closed at the wide end '
        'so two short flared tails stick out, like a wrapped sweet, and two wide white bands punched '
        'across the body',
        'a bullet, ammunition, an egg, a flame, a drop',
        means='suppository',
        slot=True,
        keep_current=True,
    ),
    Target(
        'shake_bottle', 'head', 'shake_bottle',
        'a medicine bottle tilted to one side with two curved motion arcs on each side of it, the '
        'arcs clearly separated from the bottle by white space, and one wide white line across the '
        'neck of the bottle',
        'a bell, a maraca, a plain bottle, a rattle',
        means='bottle shaking',
    ),
    Target(
        'tablet_split', 'head', 'tablet_split',
        # 판정: 지금 자산을 쓴다. 꽉 찬 원반은 잉크 경계로 자르면 비율이 원리상 0.5 를
        # 넘어 검사를 통과할 수 없고, 통과시키려 구멍을 뚫으면 금 간 쿠키가 된다.
        # \no{} 를 씌우면 '쪼개지 마시오' 가 된다.
        # 1차에서 금 간 링이 나왔다 — 갈라진 알약으로 안 읽힌다. 두 반쪽이 각각
        # 꽉 찬 덩어리여야 '쪼갠 것' 이 된다.
        'a round tablet broken into two halves pulled apart, each half a completely solid filled '
        'black half-disc with no hole in it, separated by one wide empty white channel running '
        'straight down the middle, the facing break edges clearly jagged. Draw it as one solid filled black shape — not a hollow outline drawing, not an empty white interior with a black border.',
        'a full circle, a moon phase, a coin, a pill capsule',
        keep_current=True,
        means='tablet broken in half',
    ),

    # ── 기기 ────────────────────────────────────────────────────────────────
    Target(
        'thermometer', 'head', 'thermometer',
        'a medical thermometer standing upright: a long thin straight stem with a large solid round '
        'bulb at the bottom, the bulb clearly wider than the stem, and three short white marks '
        'punched across the stem',
        'a syringe, a match, a key, a balloon',
        slot=True,
    ),
    Target(
        'glucometer', 'head', 'glucometer',
        # "key fob" 로 읽혔다. 혈액 한 방울이 붙어야 혈당계가 된다.
        'a blood glucose meter: a small handheld rectangle standing upright with a large white '
        'rectangular screen punched into its upper half, a short test strip sticking out of the '
        'bottom edge, and one round drop resting on the tip of that strip',
        'a key fob, a remote control, a phone, a calculator, a card',
        slot=True,
    ),
    Target(
        'bp_monitor', 'head', 'bp_monitor',
        'a blood pressure cuff wrapped around an arm: a thick black band forming a broad C shape with '
        'a wide white gap in the middle where the arm passes through, and one short tube leaving the '
        'band at the top right',
        'a belt, a watch, a horseshoe, a letter C',
        slot=True,
    ),
    Target(
        # 32px 에서 구멍 6개가 전부 메워졌다. 반창고의 구멍을 크고 적게.
        'patch', 'head', 'patch',
        'a sticking plaster shown flat and straight, a wide rectangle with rounded ends and a bigger '
        'square pad in the middle, with four large round white holes punched into the pad, the holes '
        'big enough to stay open in a tiny icon',
        'a chocolate bar, a ruler, a battery, a domino',
        slot=True,
    ),
    Target(
        'contact_lens', 'head', 'contact_lens',
        # 렌즈만 그리면 언덕이 된다 — 눈과 함께 있어야 무엇인지가 정해진다.
        'an eye seen straight on with a contact lens held on a fingertip just below it: the eye is a '
        'wide almond outline with one solid round pupil inside, and the lens is a thin shallow arc '
        'sitting on the finger, clearly separated from the eye by white space',
        'a hill, a bowl, an eye on its own, a smile',
        means='eye',
    ),

    # ── 행동 ────────────────────────────────────────────────────────────────
    Target(
        'hand_wash', 'head', 'hand_wash',
        # 손 전체를 곡선 덩어리로 그리면 불꽃이 된다 — 손가락 사이 틈이 손을 만든다.
        #
        # 한국공예디자인문화진흥원 이용한 선임(2026년 8월 조사)이 구체적인 지시를 줬다:
        # "물 나오는 수도꼭지 아래에 손이 있는 그림이 훨씬 잘 와닿을 것." 떨어지는 물방울
        # 셋만으로는 무엇이 물을 내보내는지가 그림에 없어서, 손 위의 점 세 개로 남는다.
        # 수도꼭지가 들어오면 장면이 성립하고 '씻는다' 가 손 모양이 아니라 배치에서 나온다.
        'a tap above an open hand: a bold angled faucet spout entering from the top left, a short '
        'straight stream of water falling from its mouth, and below it one open human hand seen palm '
        'up with fingers spread wide apart and deep white gaps between every finger, the hand clearly '
        'separated from the spout by white space',
        'a flame, a leaf, a glove, a star, a tree, a watering can',
        means='hand under a tap',
    ),
    Target(
        'call_help', 'head', 'call_help',
        'an old telephone handset seen from the side, curved like a wide bracket with a rounded '
        'earpiece at each end, and two curved sound arcs beside the upper end clearly separated from '
        'the handset by white space',
        'a bone, a banana, a smile, a bracket',
        means='telephone',
    ),
    Target(
        'vehicle', 'head', 'vehicle',
        # 졸음 유발 약의 '운전 금지'. 금지는 \no{} 가 얹는다.
        'a small car seen from the side: a low body with a raised cabin in the middle, two large '
        'round white wheel holes punched through the bottom, and one wide white window shape punched '
        'into the cabin',
        'a bus, a shoe, a boat, a hill',
        means='car',
    ),
    Target(
        'finish_course', 'head', 'finish_course',
        # 이 그림은 **뜻이 뒤집혀 있었다.**
        #
        # 전에는 "먹은 날과 남은 날이 한 줄에 같이 보여야 한다" 는 생각으로 다섯 칸 중
        # 셋을 채우고 둘을 비웠다. 2026년 8월 전문가 조사에서 말라야대 Sheron Sir Loon
        # Goh 전임강사가 그것을 읽은 그대로 적었다 — "검은 점이 끝까지 차 있지 않으므로
        # 나에게는 완주하지 않아도 된다는 뜻으로 읽힌다."
        #
        # 맞는 말이다. 진행 중인 상태를 그리면 그림은 **아직 안 끝났다**를 말하지,
        # 끝내라를 말하지 않는다. 항생제를 끝까지 먹으라는 지시가 정반대로 읽히면
        # 이것은 SDG 3.d 기여가 아니라 해다.
        #
        # 뜻 검사가 이것을 못 잡은 이유도 함께 적어 둔다. means 가 'row of boxes' 였다 —
        # 생김새만 물었으니 방향이 반대인 그림도 통과한다. 그림이 아니라 **읽히는 방향**을
        # 기대값에 넣어야 검사가 일을 한다. 같은 응답자가 제안한 화살표를 그 자리에 쓴다.
        'a row of five square boxes side by side with clear white gaps between them, all five '
        'filled solid black and the same size, and directly below them one bold thick horizontal '
        'arrow spanning the whole row from the first box to the last with a large solid triangular '
        'head pointing right at the last box',
        'a bar chart, a calendar grid, a barcode, a ruler',
        means='arrow pointing to the end of a row of boxes',
    ),

    # ── 증상 ────────────────────────────────────────────────────────────────
    Target(
        'skin_rash', 'head', 'symptom_skin',
        # "gloved arm" 로 읽혔다 — 팔 모양이 장갑이 됐다. 팔을 버리고 피부 면만 남긴다.
        'a square patch of bare skin seen close up, drawn as one solid filled black square with '
        'rounded corners, with about six large round white dots punched into it to read as a rash',
        'a glove, an arm, a hand, a die, a domino',
        means='skin rash',
    ),
    Target(
        # 32px 에서 구멍 소실. 입은 벌어진 틈이 곧 뜻이라 그 틈이 커야 한다.
        'symptom_mouth', 'head', 'symptom_mouth',
        'an open mouth seen straight on: two thick lips forming a wide almond shape with one large '
        'white opening between them taking up most of the middle, and three large round white dots '
        'above the upper lip to read as a rash or swelling',
        'an eye, a leaf, a closed mouth, a boat',
        means='swollen mouth',
    ),
    Target(
        'symptom_fever', 'head', 'symptom_fever',
        # 이마를 가로지르는 막대가 "robber face mask" 로 읽혔다 — 복면이다.
        # 체온계를 입에 물려 얼굴을 가리지 않게 한다.
        'a head seen in profile facing left with a thermometer held in the mouth, the thermometer a '
        'straight bar sticking out and upwards at an angle with a round bulb at the outer end, '
        'clearly separated from the face by white space',
        'a robber mask, a face mask, a bandit, a clock, a sun',
        means='fever',
    ),
    Target(
        'symptom_cough', 'head', 'symptom_cough',
        'a head seen from the side facing left with the mouth open, drawn as a solid filled black '
        'silhouette, and three short puff shapes coming out of the mouth, each puff a separate solid '
        'rounded blob with clear white space between them and the face. Draw it as one solid filled black shape — not a hollow outline drawing, not an empty white interior with a black border.',
        'a speech bubble, a cloud, a face on its own, steam',
        means='coughing',
    ),
    Target(
        'symptom_breath', 'head', 'symptom_breath',
        'a pair of lungs seen straight on: two rounded lobes side by side joined at the top by a short '
        'straight windpipe, with a wide white channel running down between the two lobes and two wide '
        'white branch lines punched inside each lobe',
        'a heart, a tree, a butterfly, a cloud',
        means='lungs',
    ),
    Target(
        'symptom_gut', 'head', 'symptom_gut',
        # "lightning bolt icon" 으로 읽혔다 — 번개가 배를 삼켰다.
        'a rounded belly drawn as one large solid black oval filling most of the frame, with a bold '
        'lightning bolt punched through its middle as a white zigzag no more than half the width of '
        'the oval, so the oval clearly surrounds the bolt on every side',
        'a lightning bolt on its own, a flash icon, an egg, a cloud',
        means='stomach ache',
    ),
    Target(
        'symptom_vomit', 'head', 'symptom_vomit',
        'a head seen from the side facing left and tipped forward, with a thick stream pouring '
        'downwards out of the open mouth and ending in two separate round drops below, the drops '
        'clearly detached from the stream',
        'a watering can, a face on its own, a teapot, a fountain',
        means='vomiting',
    ),
    Target(
        'symptom_dizzy', 'head', 'symptom_dizzy',
        'a head seen straight on as a bold rounded outline, with one spiral drawn above it as a thick '
        'coiled line with wide white space between each turn, the spiral clearly separated from the '
        'head',
        'a face on its own, a snail, a lollipop, a cloud',
        means='dizzy',
    ),
    Target(
        'warn_bleeding', 'head', 'warn_bleeding',
        # 방울로만 그리면 기름·건조 표시와 겹친다 — 위(胃) 안에 피를 둔다.
        'a stomach shown as a curved pouch shape leaning to one side with a short tube at the top and '
        'a short tube at the bottom, and two large round white drop shapes punched inside the pouch',
        'a plain drop, a bean, a kidney, a comma',
        means='stomach',
    ),

    # ── 사람 상태 ───────────────────────────────────────────────────────────
    Target(
        'state_infant', 'head', 'state_infant',
        # 판정: 지금 자산을 쓴다. 생성물은 웅크린 태아라 state_pregnant 와 헷갈릴 위험이
        # 있고, 34px 에서는 덩어리 하나가 된다.
        # 잉크 0.45 로 뭉쳤다. 몸을 작게 하고 머리와의 틈 하나만 크게 남긴다.
        # 1차에서 윤곽선으로 그린 태아가 나왔다. 세트의 나머지가 전부 꽉 찬 실루엣이다.
        'a baby lying curled on its side seen from the side, drawn small in the middle of the frame '
        'with wide empty white space around it: one very large solid round head beside one small '
        'solid curled body, with a single wide white channel between them. Draw it as one solid filled black shape — not a hollow outline drawing, not an empty white interior with a black border.',
        'a standing child, an adult, a ball, a comma',
        keep_current=True,
    ),
    Target(
        'state_child', 'head', 'state_child',
        'a small standing child seen straight on as one simple pictogram figure: a large round head '
        'floating above a short wide body, separated only by one wide white gap at the neck; the '
        'arms and legs are part of the body silhouette with no gaps between them',
        'an adult, a teenager, a snowman, a star',
    ),
    Target(
        'state_teen', 'head', 'state_teen',
        # 아이와 어른 사이 — 머리는 어른 비율, 몸은 아직 가늘다.
        # 4회 연속 실패했다. '가는 몸' 과 '32px 에서 살아남기' 는 서로 반대라, 팔과 몸
        # 사이의 얇은 틈은 줄이면 반드시 메워진다. 틈을 목 하나로 줄이고 비례로 구분한다.
        'a slim standing teenager seen straight on as one simple pictogram figure: a medium round '
        'head floating above a tall narrow body, separated only by one wide white gap at the neck; '
        'the arms and legs are part of the body silhouette with no gaps between them',
        'a child, a heavy adult, a stick, a letter T',
    ),
    Target(
        'state_adult', 'head', 'state_adult',
        'a standing adult seen straight on as one simple pictogram figure: a round head floating above '
        'a tall body with broad square shoulders clearly wider than the head, separated only by one '
        'wide white gap at the neck; the arms and legs are part of the body silhouette',
        'a child, a teenager, a cross, a tree',
    ),
    Target(
        'state_elderly', 'head', 'state_elderly',
        'an old person seen from the side walking with a stick, as one simple pictogram figure: a round '
        'head floating above a body whose back curves clearly forward, separated only by one wide '
        'white gap at the neck, and one straight walking stick held well in front of the body with a '
        'wide white channel between them',
        'a standing adult, a hiker, a letter r, a question mark',
        means='old person',
    ),
    Target(
        'state_pregnant', 'head', 'state_pregnant',
        'a pregnant woman seen from the side facing right, as one simple pictogram figure: a round head '
        'floating above a body whose front bulges out into one large clear rounded belly, separated '
        'only by one wide white gap at the neck; the arm is part of the body silhouette',
        'a standing adult, a person with a bag, a balloon, a snowman',
        means='pregnant',
    ),
    Target(
        'state_breastfeeding', 'head', 'state_breastfeeding',
        'a seated woman seen from the side holding a baby to her chest, as one simple pictogram figure: '
        'one large round adult head at the top and one smaller round baby head held lower down in '
        'the curve of her arms, the two heads separated by one wide white channel and everything '
        'else joined as a single silhouette',
        'a pregnant woman, a person holding a bag, a hugging couple',
        means='breastfeeding',
    ),

    # ── 수식어: 몸 ──────────────────────────────────────────────────────────
    Target(
        'body_mouth', 'modifier', 'body_mouth',
        'a simple open mouth seen straight on, two thick curved lips with one big white gap between '
        'them filling most of the shape, nothing else',
        'an eye, a leaf, an almond, a boat',
    ),
    Target(
        'body_eye', 'modifier', 'body_eye',
        'a single eye seen straight on: a wide almond outline drawn as a bold line, with one large '
        'solid round pupil in the middle and wide white space between the pupil and the outline on '
        'both sides',
        'a mouth, a leaf, a football, a fish',
    ),
    Target(
        'body_ear', 'modifier', 'body_ear',
        'a human ear seen from the side: a bold rounded outer rim shaped like a C opening to the left, '
        'with one large white hollow inside it and one short curved inner fold, the hollow big enough '
        'to stay open in a tiny icon',
        'a letter C, a shell, a comma, a question mark',
    ),
    Target(
        'body_nose', 'modifier', 'body_nose',
        'a nose seen from the side facing left: a bold profile line that rises, juts out to a point '
        'and curves back under to a rounded tip, with one large round white nostril hole punched '
        'underneath',
        'a triangle, an arrow, a mountain, a beak',
    ),
    Target(
        # 2차에서 잉크 0.60 — 꽉 찬 사각형이 됐다. 채우지 말고 '결' 자체를 형태로 만든다.
        'body_skin', 'modifier', 'body_skin',
        # 판정: 지금 자산을 쓴다. 꼬집는 손가락은 'footprints'·'paw print' 로 읽혔다.
        # 결로 그리면 물결, 팔로 그리면 뭉침, 손가락으로 그리면 발자국이다 —
        # '피부' 는 홀로 설 수 있는 물체가 아니다.
        # 결만 그리면 water waves 이고, 팔로 그리면 잉크 0.60 으로 뭉쳤다. 꼬집는 손가락을
        # 두면 그것이 피부라는 것이 정해지고 덩어리도 작아진다.
        'a pinch of skin between two fingertips seen close up: two rounded fingertips coming in from '
        'the top and a small fold of skin drawn as a bold curved band held between them, with wide '
        'empty white space around',
        'water waves, ripples, a flag, an equals sign, a glove, an arm',
        means='skin',
        keep_current=True,
    ),
    Target(
        'body_stomach', 'modifier', 'body_stomach',
        'a stomach shown as a curved pouch leaning to one side, with a short tube entering at the top '
        'left and a short narrow tube leaving at the bottom right, and one wide white curved line '
        'punched inside the pouch',
        'a bean, a kidney, a drop, a comma',
    ),

    # ── 수식어: 개수 ────────────────────────────────────────────────────────
    # 여기서는 개수가 곧 뜻이다. 이미지 모델이 가장 자주 틀리는 것도 개수이므로
    # parts 로 세어 확인한다 — 통과했다는 말이 '개수가 맞다' 를 포함하게 만든다.
    Target(
        'qty_one', 'modifier', 'qty_one',
        # 1차에서 속 빈 고리가 나왔다. qty_two 는 채운 점이라 하나만 고리면 세트 안에서
        # '1' 이 아니라 '0' 으로 읽힌다. 채워져 있다는 것을 여러 번 못박는다.
        'exactly one completely solid filled black disc in the centre of the frame, filled in all '
        'the way through with no hole and no white centre, nothing else, plenty of empty white '
        'space all around it',
        'a ring, a donut, a hollow circle, an outlined circle, two circles, a target',
        sparse=True, parts=1,
        means='one dot',
    ),
    Target(
        'qty_two', 'modifier', 'qty_two',
        'exactly two solid black circles side by side with a wide white gap between them, the same '
        'size, nothing else in the frame',
        'rings, donuts, hollow circles, outlined circles, one circle, three circles, a colon, an ellipsis',
        sparse=True, parts=2,
        means='two dots',
    ),
    Target(
        'qty_three', 'modifier', 'qty_three',
        'exactly three solid black circles arranged in a triangle with wide white gaps between them, '
        'all the same size, nothing else in the frame',
        'rings, donuts, hollow circles, outlined circles, two circles, four circles, a cluster, a flower',
        sparse=True, parts=3,
        means='three dots',
    ),
    Target(
        'qty_four', 'modifier', 'qty_four',
        'exactly four solid black circles arranged in a two by two square with wide white gaps '
        'between them, all the same size, nothing else in the frame',
        'rings, donuts, hollow circles, outlined circles, three circles, five circles, a die face, a window',
        sparse=True, parts=4,
        means='four dots',
    ),
    Target(
        'qty_five', 'modifier', 'qty_five',
        'exactly five solid black circles arranged like the five face of a die, four at the corners '
        'and one in the middle, wide white gaps between them, nothing else in the frame',
        'rings, donuts, hollow circles, outlined circles, four circles, six circles, a flower, an X',
        sparse=True, parts=5,
        means='five dots',
    ),

    # ── 수식어: 시각 ────────────────────────────────────────────────────────
    Target(
        'time_morning', 'modifier', 'time_morning',
        'a sun rising over a horizon: one straight horizontal line across the bottom with a half '
        'circle sitting on top of it, and four short straight rays above the half circle each clearly '
        'separated from it by white space',
        'a full sun, a setting sun, a moon, an umbrella',
        # 개수를 세지 않는다: 해가 지평선에 닿으면 한 덩어리라 세는 값이 흔들리는데,
        # 여기서 뜻을 지는 것은 개수가 아니라 '지평선 위/아래' 라는 배치다.
        means='sunrise',
    ),
    Target(
        'time_noon', 'modifier', 'time_noon',
        'a full sun high in the frame: one solid black circle in the middle with eight short straight '
        'rays pointing outwards all around it, every ray clearly detached from the circle by white '
        'space, and no horizon line',
        'a rising sun, a flower, a star, a gear',
        means='sun',
    ),
    Target(
        'time_evening', 'modifier', 'time_evening',
        # 판정: 지금 자산을 쓴다. 화살표를 넣으니 'press down button' 이 됐다. 해가 뜨는
        # 것과 지는 것은 방향으로만 갈리는데, 정지한 그림에 방향은 없다.
        # 지평선 아래 반원에 광선을 내리니 ufo with light beams 가 됐다. 광선을 버리고
        # 내려간다는 뜻은 화살표 하나로 옮긴다.
        'a sun going down below a horizon: one long straight horizontal line running the full width '
        'of the frame, a half circle sitting below the line so only the lower half of the sun shows, '
        'and one short thick downward arrow standing above the line at the right',
        'a ufo with light beams, arrows pointing down, a dome, a rising sun, a bowl',
        means='sunset',
        keep_current=True,
    ),
    Target(
        'time_night', 'modifier', 'time_night',
        'a crescent moon opening to the right, drawn as a thick curved sickle with pointed tips at '
        'the top and bottom, with two small solid stars beside the opening clearly separated from the '
        'moon by white space',
        'a full moon, a banana, a letter C, a sun',
        means='crescent moon',
    ),

    # ── 수식어: 보관 ────────────────────────────────────────────────────────
    Target(
        'storage_fridge', 'modifier', 'storage_fridge',
        # 눈송이를 맨몸으로 두었더니 해(time_noon)와 부딪혔다. 벨그라드 대학교
        # Katarina Vučićević 교수가 2026년 8월 조사에서 "냉장 보관과 정오 형태소가
        # 헷갈린다" 고 적었고, 실제로 나란히 놓고 보면 둘 다 **가운데에서 사방으로
        # 뻗는 별 모양**이다. 실루엣이 같으면 크기를 키워도 갈리지 않는다.
        #
        # 교수의 제안은 색을 쓰라는 것이었다(검정+노랑은 낮에). 색은 두 번째 층으로는
        # 좋지만 첫 번째 층이 될 수 없다 — 색을 못 보는 사람에게는 두 그림이 여전히
        # 같고, 그 사람이 §3.7 이 지키기로 한 사람이다. 그래서 실루엣을 바꾼다.
        #
        # 눈송이는 버리지 않는다. 포장에 찍힌 냉장 표시로 이미 배운 그림이라, 상자
        # **안에** 넣어 겉모양만 바꾼다 — 배운 것은 남고 부딪히는 것은 사라진다.
        'a solid black upright rectangle with rounded corners filling most of the frame, with one '
        'bold six-armed snowflake punched right through it as wide white channels so the snowflake '
        'reads as empty space cut out of the box, and nothing at all outside the rectangle',
        'a bare snowflake, a sun, a star, an asterisk, a flower, a wheel, a window, a door',
        means='a box with a snowflake cut out of it',
    ),
    Target(
        'storage_dry', 'modifier', 'storage_dry',
        # 채운 방울 위에 잉크로 X 를 그으면 검정 위 검정이라 사라진다 — 구멍으로 판다.
        'one large solid black water drop, rounded at the bottom and pointed at the top, with a bold '
        'X punched right through it as wide white channels so the X reads as empty space cut out of '
        'the drop',
        'a plain drop, a flame, a balloon, a leaf',
        means='drop crossed out',
    ),
    Target(
        'storage_dark', 'modifier', 'storage_dark',
        'a sun with straight rays whose middle circle is drawn as a bold ring, and one thick straight '
        'bar crossing the whole shape diagonally from the lower left to the upper right, the bar '
        'separated from the rays by white gaps on both sides',
        'a plain sun, a no entry sign, a clock, a wheel',
        means='sun crossed out',
    ),

    # ── 수식어: 식사·물 ─────────────────────────────────────────────────────
    Target(
        'food_bowl', 'modifier', 'food_bowl',
        # circle with line 로 읽혔다 — 음식이 그릇 위로 안 올라왔다. 더미를 크게 하고
        # 김을 올려 뜨거운 음식이라는 것을 더한다.
        'a bowl of food seen from the side: a deep bowl drawn as one thick solid curved band, a tall '
        'rounded mound of food heaped well above its rim and clearly wider than the rim, and two '
        'short curved steam lines rising above the mound',
        'a circle with a line, an empty bowl, a hat, a hill, a smile, a boat',
        means='bowl of food',
    ),
    Target(
        'food_empty_bowl', 'modifier', 'food_empty_bowl',
        # 판정: 지금 자산을 쓴다. 지금 것의 X 표시가 '공복' 을 명시하는데, 생성물은 빈
        # 그릇일 뿐이라 34px 에서 밥그릇(food_bowl)과 갈리지 않는다.
        # 비어 있음 = 공복. 가득 찬 그릇과 한눈에 갈라져야 한다.
        'an empty bowl seen from the side: a wide shallow bowl drawn as one thick solid filled black '
        'curved band with nothing heaped above its rim, and one short straight foot under it. Draw it as one solid filled black shape — not a hollow outline drawing, not an empty white interior with a black border.',
        'a bowl of food, a cup, a smile, a boat',
        keep_current=True,
        means='empty bowl',
    ),
    Target(
        'water_glass', 'modifier', 'water_glass',
        'a drinking glass seen straight on: a straight sided tumbler slightly wider at the top drawn '
        'as a bold outline, filled solid black only up to about two thirds of its height, with the '
        'top third left white and open',
        'a wine glass, a bucket, a cup with a handle, a box',
        means='glass of water',
    ),
]


# 재시도할 때마다 덧붙이는 지시. 실패는 대개 두 방향 중 하나라서, 그 방향을
# 되돌리는 말을 얹는다. 사람이 프롬프트를 고쳐 다시 돌리던 자리를 대신한다.
def escalate(c: 'Check | None') -> str:
    """직전 실패의 **사유에 맞춰** 다시 시킨다.

    처음에는 시도 횟수에 따라 고정된 사다리를 올렸다. 그 두 번째 칸이
    "Make the shape noticeably chunkier" 였는데, 뭉쳐서 실패한 것에 이 말을 하면
    실패한 방향으로 더 밀게 된다. food_bread 가 0.52 → 0.47 → 0.51 로 세 번 헛돈
    것이 그래서다 — 재시도가 수렴하지 않고 진동했다.

    사유는 검사기가 이미 알고 있으니 그대로 쓴다. 고칠 방향을 모르면서 다시 뽑는 것은
    그냥 같은 주사위를 다시 굴리는 것이고, 굴릴 때마다 요금이 나간다.
    """
    if c is None:
        return ''
    r = ' · '.join(c.reasons)
    if '뭉쳤다' in r:
        # "속을 비우라" 고만 하면 윤곽선 그림이 나온다. 무게는 줄지만 세트의 나머지가
        # 전부 꽉 찬 실루엣이라 시각 언어가 섞이고, qty_one 은 채운 점이 아니라 고리가
        # 되어 '1' 이 아니라 '0' 으로 읽혔다. 줄이는 방법을 구멍과 크기로 한정한다.
        return (' The shape came out far too heavy. Draw it noticeably smaller inside the frame with '
                'wide empty white space around it, and punch two or three much larger white holes '
                'through it. Keep it a solid filled black silhouette — do not turn it into a hollow '
                'outline drawing with an empty white interior.')
    if '가늘다' in r:
        return (' The shape came out too thin and sparse. Make every black part much thicker and '
                'heavier, and let it fill more of the frame. Fewer, larger, bolder masses.')
    if '개수' in r:
        return (' The number of separate shapes was wrong. Draw exactly the number stated, each one '
                'fully detached from the others with wide white space between them.')
    if '뜻이 안 맞는다' in r:
        # 굵기를 고쳐봐야 소용없다 — 잘못 그린 것은 형태이지 무게가 아니다.
        return (f' The previous attempt was misread: it {r.split("—")[-1].strip()}. '
                'Redraw it so the object is unmistakable at a glance: change the shape and the '
                'outline, not the weight. Exaggerate the one feature that makes this object '
                'different from anything else.')
    if '구멍' in r or '뭉갠다' in r:
        return (' The white holes closed up when the image was shrunk. Use far fewer holes and make '
                'each one much larger — at most three, each at least one sixth of the image wide.')
    return ' Remove every small detail. Keep only the two or three biggest shapes.'


def prompt_for(t: Target, last: 'Check | None' = None) -> str:
    return (
        f'{t.subject}. '
        f'It must not look like {t.not_like}. '
        f'{STYLE}'
        f'{escalate(last)}'
    )


# ── 생성 ────────────────────────────────────────────────────────────────────

VISION_API = 'https://api.anthropic.com/v1/messages'
VISION_MODEL = os.environ.get('VISION_MODEL', 'claude-sonnet-5')


def _ask(key: str, content, max_tokens: int = 200) -> str:
    body = json.dumps({'model': VISION_MODEL, 'max_tokens': max_tokens,
                       'messages': [{'role': 'user', 'content': content}]}).encode()
    req = urllib.request.Request(VISION_API, data=body, headers={
        'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=90) as resp:
        return json.load(resp)['content'][0]['text']


def _field(text: str, name: str) -> str:
    m = re.search(r'"%s"\s*:\s*"([^"]*)"' % re.escape(name), text)
    return m.group(1).strip().lower() if m else ''


def same_idea(got: str, expect: str, key: str) -> bool:
    """본 것과 기대한 것이 같은 뜻인가.

    처음에는 글자가 겹치는지로 판정했다. 기침하는 사람 그림에 "person breathing out"
    이라는 답이 돌아왔는데 "coughing" 과 한 글자도 안 겹쳐서 떨어졌다 — 그림은 맞는데
    판정이 틀린 것이다. 뜻이 같은지는 글자로 알 수 없으니 물어야 한다.

    묻는 것은 그림이 아니라 **말 두 개**다. 그림은 이미 앞에서 설명이 끝났으므로,
    여기서 기대한 답을 보여줘도 그 설명이 흔들리지 않는다 — 유도가 되지 않는 자리다.
    """
    if not got:
        return False
    # 말이 겹치면 물어볼 것이 없다. 물어봤더니 "peanut shape" 와 "peanut" 을 다르다고
    # 한 적이 있다 — 판정자도 틀리므로, 확실한 경우는 판정자에게 보내지 않는다.
    # (호출 한 번을 아끼는 것은 덤이다.)
    words = {w for w in expect.lower().replace('_', ' ').split() if len(w) > 2}
    if any(w in got for w in words):
        return True
    try:
        ans = _ask(key, (
            f'Someone looked at a pictogram and said it shows: "{got}".\n'
            f'It was meant to show: "{expect}".\n\n'
            'Would that person have understood the intended meaning? Answer YES only if their '
            'description names the same object or the same action. Answer NO if it is a different '
            'object, even a similar-looking one.\n'
            'Reply with one word: YES or NO.'
        ), 10)
        return ans.strip().upper().startswith('YES')
    except Exception:                                     # noqa: BLE001
        return True     # 판정할 수 없는 것을 실패로 세지 않는다


def rival_meanings(t: 'Target') -> list[str]:
    """세트 안의 **다른** 형태소들이 뜻하는 것.

    not_like 는 손으로 적는 목록이라 우리가 이미 아는 충돌만 담는다. 2026년 8월 전문가
    조사에서 베오그라드대 Katarina Vučićević 교수가 냉장 보관과 정오가 헷갈린다고 적었을 때,
    두 Target 의 not_like 를 열어 보니 **서로를 적어 두지 않았다** — storage_fridge 는
    'a star, an asterisk, a flower, a wheel', time_noon 은 'a rising sun, a flower, a star,
    a gear'. 둘 다 'star' 를 적었으니 각자 별과 헷갈리지 않는지는 봤지만, 서로와
    헷갈리는지는 아무도 묻지 않았다.

    목록을 더 길게 적는 것으로는 이 문제가 닫히지 않는다 — 78개면 짝이 3003개이고,
    그것을 손으로 적을 수는 없다. 대신 **세트가 자기 자신을 목록으로 쓴다.** 어떤 그림이
    다른 형태소의 뜻으로 헷갈린다면, 그것을 우리가 미리 적어 두었든 아니든 충돌이다.

    낱말로 쪼개지 않고 **뜻 구절 전체**로 맞춘다. 쪼개면 'the'·'one'·'row' 같은 조각이
    남의 답에 걸려 멀쩡한 그림을 떨어뜨린다. 통째로 맞추면 'sun'·'snowflake' 처럼 한
    낱말짜리 뜻이 정확히 그 자리에서 잡히고, 'row of boxes with an arrow…' 같은 긴 뜻은
    애초에 짧은 답에 통째로 나타나지 않으므로 조용히 넘어간다 — 그런 것은 손으로 적은
    not_like 가 계속 맡는다.
    """
    return sorted({expected_meaning(o).lower().strip()
                   for o in TARGETS if o.name != t.name and len(expected_meaning(o)) >= 3})


def clashes(conf: str, not_like: str, rivals: list[str] | None = None) -> str | None:
    """헷갈린다고 답한 것이 우리 세트 안의 무언가인가. 맞으면 그 낱말을 돌려준다.

    각각은 잘 그렸는데 서로 구별되지 않으면 세트로서는 못 쓴다.
    """
    low = conf.lower()
    for bad in not_like.lower().split(','):
        if bad.strip() and bad.strip() in low:
            return bad.strip()
    for r in rivals or []:
        if re.search(rf'\b{re.escape(r)}\b', low):
            return r
    return None


def verify_meaning(im: Image.Image, expect: str, not_like: str,
                   strict: bool = False, rivals: list[str] | None = None) -> tuple[bool, str]:
    """이 그림이 무엇으로 보이는지 묻는다. 답이 기대와 다르면 통과시키지 않는다.

    기계 검사가 못 잡는 자리가 여기다. qty_one 이 속 빈 고리로 나온 날, 잉크량도
    구멍도 개수도 전부 통과했다 — 사람이 확대해서 보고서야 그게 '1' 이 아니라 '0'
    으로 읽힌다는 것을 알았다.

    묻는 방식이 중요하다. "이것이 땅콩입니까?" 라고 물으면 웬만하면 그렇다고 한다.
    그래서 **무엇으로 보이는지를 먼저 열어 놓고 묻고**, 그 답이 기대한 것과 맞는지를
    우리가 판정한다. ISO 9186 의 이해도 시험이 보기를 주지 않고 서술하게 하는 것과
    같은 이유다.

    작게 줄인 그림을 함께 보낸다. 512px 에서 무엇인지 알아보는 것은 우리 문제가
    아니다 — 목록에서 34px 로 보일 때 알아보는 것이 문제다.
    """
    #: strict 는 판정할 수 없을 때 어느 쪽으로 넘어질지를 정한다.
    #:
    #: 오프라인에서는 통과시킨다 — 키가 없거나 망이 끊긴 것을 그림의 결함으로 세면
    #: 안 된다. 실행 중에는 막는다 — 검증되지 않은 그림을 보여주느니 "그림 없음" 이
    #: 낫다는 것이 이 기능 전체의 전제이고, 그 전제는 검증이 실패한 순간에 가장
    #: 중요해진다.
    fail = (False, '검증할 수 없어 막았다') if strict else (True, '건너뜀')
    key = os.environ.get('ANTHROPIC_API_KEY')
    if not key:
        return fail[0], f'{fail[1]} (ANTHROPIC_API_KEY 없음)'

    def b64(img: Image.Image) -> str:
        flat = Image.new('RGB', img.size, 'white')
        flat.paste(img, (0, 0), img)
        buf = io.BytesIO()
        flat.save(buf, format='PNG')
        return base64.b64encode(buf.getvalue()).decode()

    small = im.resize((SMALL, SMALL), Image.LANCZOS).resize((256, 256), Image.NEAREST)
    ask = (
        'These are two views of the same black-and-white pictogram: the first at full size, '
        'the second shrunk to 32 pixels and blown back up — that second one is how it will '
        'actually be seen.\n\n'
        'Answer as JSON only, no other text:\n'
        '{"is": "<what single object or idea the SMALL one depicts, 1-4 words>", '
        '"confusable": "<the one thing it could most easily be mistaken for, 1-4 words>"}\n\n'
        'Say what you actually see. Do not guess what it is supposed to be.'
    )
    body = json.dumps({
        'model': VISION_MODEL, 'max_tokens': 200,
        'messages': [{'role': 'user', 'content': [
            {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/png', 'data': b64(im)}},
            {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/png', 'data': b64(small)}},
            {'type': 'text', 'text': ask},
        ]}],
    }).encode()
    req = urllib.request.Request(VISION_API, data=body, headers={
        'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            text = json.load(resp)['content'][0]['text']
    except Exception as e:                                # noqa: BLE001
        return fail[0], f'{fail[1]} ({type(e).__name__})'

    # 엄격한 JSON 파싱에 기대지 않는다. 실제로 이런 답이 왔다:
    #   {"is": "glucose meter", "device with buttons"}
    # 두 번째 항목에 키가 없어 json.loads 가 터지고, 그러면 "판정 못 함 → 통과" 로
    # 떨어진다. 답은 멀쩡히 있는데 버리고 통과시키는 셈이라 방향이 나쁘다.
    got = _field(text, 'is')
    conf = _field(text, 'confusable')
    if not got:
        return fail[0], f'{fail[1]} (답을 읽지 못함)'
    hit = same_idea(got, expect, key)
    # 우리 세트 안의 다른 것으로 헷갈린다면 그것도 실패다 — 각각은 잘 그렸는데
    # 서로 구별되지 않으면 세트로서는 못 쓴다. 손으로 적은 not_like 뿐 아니라 세트의
    # 다른 형태소가 뜻하는 것까지 본다 (rival_meanings 참고).
    clash = clashes(conf, not_like, rivals)
    if not hit:
        return False, f'"{got}" 로 보인다 (기대: {expect})'
    if clash:
        return False, f'"{conf}" 와 헷갈린다 (세트 안의 "{clash}")'
    return True, got


def generate(t: Target, last: 'Check | None' = None) -> bytes:
    key = os.environ.get('OPENAI_API_KEY')
    if not key:
        raise SystemExit(
            'OPENAI_API_KEY 가 환경에 없다.\n'
            '  export OPENAI_API_KEY="..."  로 넣고 다시 실행할 것.\n'
            '  (키를 이 파일이나 저장소 안 어디에도 적지 말 것)'
        )
    body = json.dumps({
        'model': MODEL, 'prompt': prompt_for(t, last), 'size': '1024x1024', 'n': 1,
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


def parts_count(im: Image.Image, size: int = 128) -> int:
    """떨어져 있는 잉크 덩어리의 개수.

    qty_three 가 점 두 개로 나오면 검사기의 다른 항목은 전부 통과한다 — 잉크도
    적당하고 구멍도 남는다. 그런데 이 글리프에서 개수는 장식이 아니라 뜻 자체이고,
    이미지 모델이 가장 자주 틀리는 것도 개수다. 그래서 따로 센다.
    """
    a = im.resize((size, size), Image.LANCZOS).split()[-1].point(lambda v: 255 if v > 110 else 0)
    w, h = a.size
    px = a.load()
    seen = [[False] * h for _ in range(w)]
    n = 0
    for x in range(w):
        for y in range(h):
            if px[x, y] != 255 or seen[x][y]:
                continue
            n += 1
            stack = [(x, y)]
            while stack:
                a2, b2 = stack.pop()
                if a2 < 0 or b2 < 0 or a2 >= w or b2 >= h or seen[a2][b2] or px[a2, b2] != 255:
                    continue
                seen[a2][b2] = True
                stack += [(a2 + 1, b2), (a2 - 1, b2), (a2, b2 + 1), (a2, b2 - 1),
                          (a2 + 1, b2 + 1), (a2 - 1, b2 - 1), (a2 + 1, b2 - 1), (a2 - 1, b2 + 1)]
    return n


def derive_slot(im: Image.Image, size: int = 64) -> tuple[float, float, float, float]:
    """그림에서 수식어가 들어갈 사각형을 뽑아낸다.

    사전에 손으로 적어둔 슬롯 좌표는 손으로 그린 글리프를 전제한다. 생성된 그림은
    같은 약병이라도 몸통이 어디 있는지가 매번 다르므로, 그 좌표를 그대로 쓰면
    수식어가 병 밖 허공에 뜬다.

    엔진은 슬롯 자리를 **뚫고** 그 안에 수식어를 그린다. 그러니 좋은 슬롯은 잉크
    한가운데다 — 빈 곳을 뚫으면 창이 아니라 아무것도 아니고, 윤곽에 걸치게 뚫으면
    실루엣이 잘려 무엇을 그린 것인지가 사라진다.

    "가장 꽉 찬 사각형" 으로 찾으면 안 된다: 반창고의 가운데 패드는 구멍이 뚫려 있어
    덜 차 있고, 그래서 아무 무늬 없는 왼쪽 끝이 뽑힌다. "잉크 안쪽으로 가장 깊은 곳"
    도 같은 이유로 끝을 고른다. 두 기준 모두 *어디가 그 글리프의 몸통인가* 를 묻지
    않기 때문이다.

    그래서 자리는 가운데로 **제한하고**, 그 안에서 잉크 안쪽으로 가장 깊은 곳을
    고른다. 창의 크기도 그 깊이가 정한다 — 경계 상자의 좁은 쪽으로 잡아봤더니
    주사기가 깨졌다. 대각선으로 누운 물체는 상자가 거의 정사각형이라, 상자 기준으로는
    큰 창이 나오는데 정작 몸통은 가늘어 창이 물체보다 커진다. 깊이는 그 자리 잉크가
    실제로 얼마나 두꺼운지를 재므로 물체의 자세와 무관하다.
    """
    a = im.resize((size, size), Image.LANCZOS).split()[-1].point(lambda v: 255 if v > 110 else 0)
    bb = a.getbbox()
    if bb is None:
        return (0.30, 0.35, 0.70, 0.75)
    bx0, by0, bx1, by1 = bb
    bw, bh = bx1 - bx0, by1 - by0
    px = a.load()

    # 각 화소에서 가장 가까운 여백까지의 거리 — 그 자리 잉크의 두께 (체임퍼 거리 변환)
    BIG = size * 4
    d = [[0 if not px[x, y] else BIG for y in range(size)] for x in range(size)]
    for x in range(size):
        for y in range(size):
            if d[x][y]:
                d[x][y] = min(d[x][y], d[x - 1][y] + 1 if x else BIG,
                              d[x][y - 1] + 1 if y else BIG,
                              d[x - 1][y - 1] + 1 if x and y else BIG)
    for x in range(size - 1, -1, -1):
        for y in range(size - 1, -1, -1):
            if d[x][y]:
                d[x][y] = min(d[x][y], d[x + 1][y] + 1 if x < size - 1 else BIG,
                              d[x][y + 1] + 1 if y < size - 1 else BIG,
                              d[x + 1][y + 1] + 1 if x < size - 1 and y < size - 1 else BIG)

    # 자리는 몸통 가운데 34% 안으로 제한한다. 점수로 누르려 해봤지만 잉크량 차이가
    # 위치 벌점을 늘 이긴다 — 반창고의 민짜 왼쪽 끝은 구멍 뚫린 가운데 패드보다 항상
    # 잉크가 많아서, 벌점을 어디까지 올려야 하는지가 글리프마다 달라졌다.
    lo_x, hi_x = bx0 + int(bw * 0.34), bx1 - int(bw * 0.34)
    lo_y, hi_y = by0 + int(bh * 0.34), by1 - int(bh * 0.34)
    best, bx, by, br = -1e9, (bx0 + bx1) // 2, (by0 + by1) // 2, size * 0.14
    for cy in range(lo_y, max(lo_y + 1, hi_y)):
        for cx in range(lo_x, max(lo_x + 1, hi_x)):
            r = d[cx][cy]
            if r <= 1:
                continue
            # 깊은 곳이 곧 몸통이다. 같은 깊이면 한가운데에 가까운 쪽.
            s = r * 3 - abs(cx - (bx0 + bx1) / 2) * 0.2 - abs(cy - (by0 + by1) / 2) * 0.2
            if s > best:
                best, bx, by, br = s, cx, cy, r
    # 반변은 두께보다 조금 작게 — 윤곽에 딱 붙이면 테두리가 끊긴다.
    half = max(br * 0.85, size * 0.09)
    return tuple(round(min(max(v, 0.0), 1.0), 3) for v in
                 ((bx - half) / size, (by - half) / size,
                  (bx + half) / size, (by + half) / size))


def check(im: Image.Image, sparse_ok: bool = False, parts_want: int = 0) -> Check:
    """
    sparse_ok: 개수를 세는 글리프(qty_one 등)에는 잉크 상·하한을 둘 다 적용하지 않는다.

    하한을 적용하면 점이 적은 올바른 설계를 결함으로 센다. 상한은 더 나쁜데,
    conform() 이 잉크 경계로 잘라내므로 점 하나짜리 qty_one 은 그 점이 화면을 꽉
    채운 그림이 되어 비율이 0.60 이 나온다. 그 값은 그림이 아니라 자르기를 잰 것이라
    무엇을 그리든 통과할 수 없다.

    이 글리프들에서 뜻을 지는 것은 굵기가 아니라 개수뿐이므로, 판정도 parts_want
    하나에 맡긴다.

    parts_want: 떨어진 덩어리가 정확히 몇 개여야 하는가. 0 이면 세지 않는다.
    """
    reasons: list[str] = []
    ink = ink_ratio(im)
    if parts_want:
        got = parts_count(im)
        if got != parts_want:
            reasons.append(f'개수가 틀렸다 ({got}개, {parts_want}개여야 한다)')
    if ink < INK_MIN and not sparse_ok:
        reasons.append(f'너무 가늘다 (잉크 {ink:.2f} < {INK_MIN})')
    if ink > INK_MAX and not sparse_ok:
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

def pairs(top: int = 15, size: int = SMALL) -> int:
    """세트 안에서 **서로 닮은 짝**을 찾아 가까운 순으로 보고한다.

    왜 이것이 필요한가
    ------------------
    verify_meaning 은 그림 하나를 놓고 "무엇으로 보이나" 를 묻는다. 그 물음은 각각이
    잘 그려졌는지는 알려주지만 **둘이 서로 구별되는지는 알려주지 않는다.** 지금까지는
    Target 마다 손으로 적어 둔 not_like 로 그것을 막았는데, 손으로 적는 목록은 우리가
    이미 아는 충돌만 담는다.

    2026년 8월 전문가 조사에서 베오그라드대 Katarina Vučićević 교수가 냉장 보관과 정오가
    헷갈린다고 적었다. 둘의 not_like 를 열어 보면 storage_fridge 는 'a star, an asterisk,
    a flower, a wheel', time_noon 은 'a rising sun, a flower, a star, a gear' 다 — **서로를
    적어 두지 않았다.** 눈사람 여섯 팔과 해 여덟 살은 우리에게는 다른 그림이지만 32px
    에서는 같은 방사형 얼룩이고, 그것을 알아채려면 사람이 그 둘을 나란히 놓아야 했다.

    이 검사는 나란히 놓는 일을 기계가 한다. 목록에 무엇을 적어 둘지 미리 알 필요가 없다.

    어떻게 재는가
    -------------
    설치된 형태소를 **실제로 보이는 크기(32px)로** 줄여 화소 차이를 잰다. 512px 에서
    구별되는 것은 우리 문제가 아니다 — 목록에서 34px 로 보일 때 구별되는 것이 문제다.
    API 를 부르지 않으므로 언제든 돌릴 수 있고 답이 늘 같다.

    거리는 정규화된 RMS 다. 0 이면 같은 그림이고, 값이 작을수록 헷갈린다. 절대적인
    합격선을 두지 않는 이유는 그 선을 정할 근거가 아직 없어서다 — 순위를 보여주고
    사람이 판단한다. 이미 서로의 not_like 에 적혀 있는 짝은 '알고 있음' 으로 표시해,
    새로 드러난 것과 가른다.
    """
    import math

    loaded: list[tuple[str, list[float]]] = []
    for t in TARGETS:
        p = ASSETS / t.role / f'{t.asset}.png'
        if not p.exists():
            continue
        im = Image.open(p).convert('RGBA')
        flat = Image.new('L', im.size, 255)
        flat.paste(im.convert('L'), (0, 0), im)
        small = flat.resize((size, size), Image.LANCZOS)
        px = [v / 255.0 for v in small.tobytes()]
        loaded.append((t.name, px))

    by_name = {t.name: t for t in TARGETS}

    def declared(a: str, b: str) -> bool:
        """둘 중 하나라도 상대를 not_like 에 적어 두었는가 (낱말 겹침으로 느슨하게 본다)."""
        for x, y in ((a, b), (b, a)):
            words = {w for w in by_name[y].name.split('_') if len(w) > 3}
            if any(w in by_name[x].not_like.lower() for w in words):
                return True
        return False

    scored: list[tuple[float, str, str]] = []
    for i in range(len(loaded)):
        for j in range(i + 1, len(loaded)):
            a, b = loaded[i], loaded[j]
            rms = math.sqrt(sum((x - y) ** 2 for x, y in zip(a[1], b[1])) / len(a[1]))
            scored.append((rms, a[0], b[0]))
    scored.sort()

    print(f'{len(loaded)}개 형태소를 {size}px 로 줄여 비교했다. 가까운 순:\n')
    for rms, a, b in scored[:top]:
        mark = '알고 있음' if declared(a, b) else '←  새로 드러남'
        print(f'  {rms:.4f}  {a:22} {b:22} {mark}')
    print(f'\n중앙값 {scored[len(scored) // 2][0]:.4f} · 가장 먼 짝 {scored[-1][0]:.4f}')
    return 0


def sheet(path: Path, per_row: int = 8) -> None:
    """생성물과 현재 자산을 나란히 놓은 검토표를 만든다.

    검사기가 판정하는 것은 '작게 줄여도 살아남는가' 지 '맞는 것으로 보이는가' 가
    아니다. 후자는 기계로 물을 수 없으므로 사람이 볼 그림을 남긴다 — 물방울처럼
    생긴 견과는 모든 항목을 통과하고도 그냥 틀린 그림이다.
    """
    from PIL import ImageDraw, ImageFont
    # 기본 비트맵 글꼴에는 한글이 없어 판정이 네모로 나온다 — 읽으라고 만든 표이므로 채운다.
    def _font(sz: int):
        for p in ('/System/Library/Fonts/AppleSDGothicNeo.ttc',
                  '/System/Library/Fonts/Supplemental/AppleGothic.ttf'):
            if Path(p).exists():
                return ImageFont.truetype(p, sz)
        return ImageFont.load_default()
    F, FS = _font(12), _font(11)
    CELL, BIG, TINY, PAD = 118, 74, 34, 26
    rows = (len(TARGETS) + per_row - 1) // per_row
    W = per_row * CELL + PAD * 2
    H = rows * (CELL + 46) + 44
    im = Image.new('RGB', (W, H), 'white')
    d = ImageDraw.Draw(im)
    d.text((PAD, 12), '왼쪽=현재 자산  오른쪽=생성  ·  아래 작은 것은 34px 축소', fill=(90, 90, 90), font=F)

    for i, t in enumerate(TARGETS):
        cx = PAD + (i % per_row) * CELL
        cy = 44 + (i // per_row) * (CELL + 46)
        for j, p in enumerate((ASSETS / t.role / f'{t.asset}.png', REFS / f'{t.name}.png')):
            if not p.exists():
                continue
            g = Image.open(p).convert('RGBA')
            for side, oy in ((BIG // 2 + 8, 0), (TINY, BIG // 2 + 14)):
                r = g.resize((side, side), Image.LANCZOS)
                im.paste(r, (cx + j * (CELL // 2) + 6, cy + oy), r)
        ref = REFS / f'{t.name}.png'
        if ref.exists():
            c = check(Image.open(ref).convert('RGBA'), sparse_ok=t.sparse, parts_want=t.parts)
            d.text((cx + 2, cy + CELL + 2), t.name[:16], fill=(20, 20, 20), font=FS)
            d.text((cx + 2, cy + CELL + 15), f'{"통과" if c.ok else "실패"} {c.ink:.2f}',
                   fill=(0, 130, 60) if c.ok else (200, 30, 30), font=FS)
            if not c.ok:
                d.text((cx + 2, cy + CELL + 28), c.reasons[0][:18], fill=(200, 30, 30), font=FS)
        else:
            d.text((cx + 2, cy + CELL + 2), t.name[:16] + ' (없음)', fill=(150, 150, 150), font=FS)
    im.save(path)
    print(f'검토표 → {path}')


def install(t: Target, im: Image.Image, slots: dict, names: set) -> None:
    """검사를 통과한 그림을 자산으로 옮기고, 슬롯이 있으면 그림에서 뽑아 기록한다."""
    if t.keep_current:
        print(f'{t.name:11} 설치 안 함 (지금 자산이 낫다고 판정된 것)')
        names.discard(t.asset)
        return
    names.add(t.asset)
    dest = ASSETS / t.role / f'{t.asset}.png'
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest)
    line = f'{t.name:11} 설치 → {dest.relative_to(ROOT.parent)}'
    if t.slot:
        slots[t.asset] = derive_slot(im)
        line += f'  슬롯 {slots[t.asset]}'
    print(line)


def describe(concept: str) -> Target:
    """개념 이름 하나를 우리 프롬프트 형식으로 부풀린다.

    78개는 내가 하나씩 손으로 썼다 — 윤곽에 남는 특징, 내부 구멍, 무엇과 헷갈리면
    안 되는가. 실행 중에는 그 자리에 사람이 없으므로 같은 형식을 글로 받아 온다.
    "nebulizer" 만 넘기면 프롬프트가 부실해져서 생성물도 부실해진다.
    """
    key = os.environ.get('ANTHROPIC_API_KEY')
    fallback = Target(concept, 'head', concept,
                      f'a {concept.replace("_", " ")}, drawn as one solid filled black silhouette '
                      f'with two or three large white holes punched through it',
                      'any other medical object', means=concept.replace('_', ' '))
    if not key:
        return fallback
    ask = (
        f'We draw flat black pictograms for people who cannot read. I need a drawing brief for: '
        f'"{concept.replace("_", " ")}".\n\n'
        'Answer as JSON only:\n'
        '{"subject": "<what to draw: name the object, then the ONE outline feature that makes it '
        'unmistakable, then the large white holes punched through it. One sentence, no style words>", '
        '"not_like": "<3-5 things it must not be mistaken for, comma separated>", '
        '"means": "<what a viewer should say it is, 1-3 words>"}\n\n'
        'The drawing must survive being shrunk to 32 pixels, so detail can only live in the '
        'outline and in large punched-out holes — never in thin lines.'
    )
    body = json.dumps({'model': VISION_MODEL, 'max_tokens': 400,
                       'messages': [{'role': 'user', 'content': ask}]}).encode()
    req = urllib.request.Request(VISION_API, data=body, headers={
        'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            text = json.load(resp)['content'][0]['text']
        d = json.loads(text[text.index('{'):text.rindex('}') + 1])
        return Target(concept, 'head', concept, d['subject'], d['not_like'],
                      means=d.get('means', concept.replace('_', ' ')))
    except Exception:                                     # noqa: BLE001
        return fallback


def one(concept: str, out: Path, tries: int = 3) -> dict:
    """개념 하나를 생성해 검사·검증까지 통과하면 저장한다. 결과를 JSON 으로 돌려준다.

    실행 중에 앱이 부르는 자리다. 통과하지 못하면 저장하지 않고 실패를 돌려준다 —
    읽지 못하는 사람에게 틀린 그림은 그림이 없는 것보다 나쁘다.
    """
    t = describe(concept)
    last, notes = None, []
    for attempt in range(tries):
        try:
            im = conform(Image.open(io.BytesIO(generate(t, last))))
        except Exception as e:                            # noqa: BLE001
            notes.append(f'{attempt + 1}: 생성 실패 {e}')
            break
        c = check(im)
        if c.ok:
            # 실행 중이라 막는 쪽으로 넘어진다 — 검증되지 않은 그림을 보여주느니
            # "맞는 그림 없음" 이 낫다.
            ok, note = verify_meaning(im, expected_meaning(t), t.not_like, strict=True,
                                      rivals=rival_meanings(t))
            if not ok:
                c = Check(False, [f'뜻이 안 맞는다 — {note}'], c.ink, c.small_ink, c.keeps_holes)
        notes.append(f'{attempt + 1}: ' + ('통과' if c.ok else ' · '.join(c.reasons)))
        if c.ok:
            out.parent.mkdir(parents=True, exist_ok=True)
            im.save(out)
            return {'ok': True, 'path': str(out), 'means': expected_meaning(t), 'log': notes}
        last = c
    return {'ok': False, 'log': notes}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('names', nargs='*', help='생성할 형태소 (비우면 아직 없는 것 전부)')
    ap.add_argument('--force', action='store_true', help='이미 있어도 다시 생성')
    ap.add_argument('--install', action='store_true', help='검사를 통과한 것을 자산으로 설치')
    ap.add_argument('--tries', type=int, default=3,
                    help='형태소당 최대 시도 횟수. 실패하면 프롬프트를 강화해 다시 뽑는다')
    ap.add_argument('--one', metavar='CONCEPT',
                    help='개념 하나를 생성해 --out 에 저장한다. 결과를 JSON 으로 낸다 '
                         '(앱이 실행 중에 부르는 자리)')
    ap.add_argument('--out', metavar='PATH', help='--one 이 저장할 파일')
    ap.add_argument('--verify', action='store_true',
                    help='기계 검사를 통과한 것에 "무엇으로 보이나" 를 물어 뜻까지 확인한다 '
                         '(ANTHROPIC_API_KEY 필요)')
    ap.add_argument('--sheet', metavar='PATH',
                    help='생성하지 않고, 현재 자산과 생성물을 나란히 놓은 검토표만 만든다')
    ap.add_argument('--pairs', action='store_true',
                    help='세트 안에서 서로 닮은 짝을 작은 크기로 재어 가까운 순으로 보고한다 '
                         '(API 를 부르지 않는다)')
    args = ap.parse_args()

    if args.pairs:
        raise SystemExit(pairs())

    if args.one:
        if not args.out:
            raise SystemExit('--one 에는 --out 이 필요하다')
        print(json.dumps(one(args.one, Path(args.out), args.tries), ensure_ascii=False))
        return

    if args.sheet:
        sheet(Path(args.sheet))
        return

    by_name = {t.name: t for t in TARGETS}
    unknown = [n for n in args.names if n not in by_name]
    if unknown:
        raise SystemExit(f'모르는 이름: {", ".join(unknown)}\n가능: {", ".join(by_name)}')

    chosen = [by_name[n] for n in args.names] if args.names else TARGETS
    REFS.mkdir(exist_ok=True)
    # 이번에 뽑지 않은 head 의 슬롯까지 날려버리면 안 되므로 기존 것을 읽고 덮어쓴다.
    slots = json.loads(SLOTS_OUT.read_text()) if SLOTS_OUT.exists() else {}
    names = set(json.loads(GENERATED_OUT.read_text())) if GENERATED_OUT.exists() else set()

    passed, failed = [], []
    for t in chosen:
        out = REFS / f'{t.name}.png'
        if out.exists() and not args.force and args.names == []:
            # 이미 뽑아둔 것은 다시 생성하지 않는다. 그렇다고 설치까지 건너뛰면
            # --install 이 아무것도 하지 않는다 — 설치는 생성의 결과를 옮기는 일이지
            # 생성 자체가 아니다. 검사만 다시 하고 통과한 것을 옮긴다.
            im = Image.open(out).convert('RGBA')
            c = check(im, sparse_ok=t.sparse, parts_want=t.parts)
            (passed if c.ok else failed).append((t, c.reasons))
            if args.install and c.ok and not t.keep_current:
                install(t, im, slots, names)
            else:
                print(f'{t.name:11} 건너뜀 (이미 있음)')
            continue

        best = None   # (점수, 이미지, 검사결과, 시도번호)
        last = None   # 직전 시도의 검사 결과 — 다음 프롬프트의 방향을 여기서 정한다
        for attempt in range(args.tries):
            try:
                im = conform(Image.open(io.BytesIO(generate(t, last))))
            except SystemExit:
                raise
            except Exception as e:                   # noqa: BLE001
                print(f'{t.name:11} 시도 {attempt + 1} ✗ {e}')
                continue
            c = check(im, sparse_ok=t.sparse, parts_want=t.parts)
            # 의미 검증은 기계 검사를 통과한 것에만 묻는다. 굵기도 안 맞는 그림에
            # "무엇으로 보이나" 를 묻는 것은 답이 뻔하고 요금만 나간다.
            if c.ok and args.verify:
                ok, note = verify_meaning(im, expected_meaning(t), t.not_like,
                                          rivals=rival_meanings(t))
                print(f'{t.name:11}   의미: {note}')
                if not ok:
                    c = Check(False, [f'뜻이 안 맞는다 — {note}'], c.ink, c.small_ink, c.keeps_holes)
            sc = score(im, c)
            print(f'{t.name:11} 시도 {attempt + 1}  {"통과" if c.ok else "실패"} '
                  f'잉크 {c.ink:.2f} 점수 {sc:5.1f}'
                  + ('' if c.ok else '  | ' + ' · '.join(c.reasons)))
            last = c
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
            install(t, im, slots, names)

    if args.install:
        if slots:
            SLOTS_OUT.write_text(json.dumps(slots, indent=1, sort_keys=True) + '\n')
            print(f'슬롯 {len(slots)}개 → {SLOTS_OUT.relative_to(ROOT.parent)}')
        GENERATED_OUT.write_text(json.dumps(sorted(names), indent=1) + '\n')
        print(f'설치 목록 {len(names)}개 → {GENERATED_OUT.relative_to(ROOT.parent)}')

    print(f'\n통과 {len(passed)} · 실패 {len(failed)}')
    if failed and not args.install:
        print('실패한 것은 프롬프트를 고쳐 다시 돌리면 된다 (--force).')
    if args.install:
        print('설치했으면 dictionary 를 다시 만들 것: python3 engine/build_assets.py --publish')


if __name__ == '__main__':
    main()
