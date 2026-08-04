"""
앱 화면을 학술 도판 관례로 묶는다.

낱장으로 두면 한 장이 한 쪽을 먹고, 읽는 사람은 세 쪽을 넘겨야 한 흐름을 본다.
(a)(b)(c) 서브패널로 묶으면 한 판에서 비교가 되고 밀도도 올라간다.

색은 낮추지 않는다. 초록·노랑·빨강 판정은 이 앱의 설계 주장 자체이므로 무채색으로
바꾸면 도판이 근거이기를 그만둔다. 대신 그림자·둥근 모서리 같은 제품 홍보 쪽 장식을
빼고, 얇은 회색 테두리와 흰 여백만 남긴다.

    python3 docs/proposal/tools/panels.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from i18n import T, LANG, FIG as FIG_OUT, FIG_SRC

HERE = Path(__file__).resolve().parent
FIG = FIG_OUT

S = 2                      # 2배 렌더 후 축소
COL_W = 250                # 한 칸의 폭
GAP = 16
PAD = 10
LABEL_H = 22
BORDER = (176, 179, 186)
INK, SUB = (24, 24, 27), (90, 90, 98)


def F(sz, bold=False):
    return ImageFont.truetype('/System/Library/Fonts/AppleSDGothicNeo.ttc', sz * S,
                              index=(3 if bold else 1))


def panel(name, items, height=430):
    """items: [(파일명, '(a) 설명'), ...] — 모두 같은 높이로 맞춰 가로로 늘어놓는다."""
    shots = []
    for fn, _ in items:
        im = Image.open(FIG_SRC / f'{fn}.png').convert('RGB')
        w = round(im.width * height / im.height)
        shots.append(im.resize((w * S, height * S), Image.LANCZOS))

    widths = [s.width // S for s in shots]
    W = PAD * 2 + sum(widths) + GAP * (len(shots) - 1)
    H = PAD + height + LABEL_H + 6

    img = Image.new('RGB', (W * S, H * S), 'white')
    d = ImageDraw.Draw(img)
    f = F(9)

    x = PAD
    for (fn, cap), sh, w in zip(items, shots, widths):
        img.paste(sh, (x * S, PAD * S))
        d.rectangle([x * S, PAD * S, (x + w) * S, (PAD + height) * S],
                    outline=BORDER, width=1)
        tw = d.textlength(cap, font=f)
        d.text((x * S + (w * S - tw) / 2, (PAD + height + 6) * S), cap, font=f, fill=SUB)
        x += w + GAP

    img.resize((W, H), Image.LANCZOS).save(FIG / f'{name}.png')
    print(f'  {name}.png  ({len(items)}칸)')


if __name__ == '__main__':
    # 촬영에서 판정까지 — 한 흐름이므로 한 판에 둔다.
    panel('panelA_flow', [
        ('fig04_camera', T('(a) 촬영')),
        ('fig05_processing', T('(b) 인식 진행')),
        ('fig06_verdict_rx', T('(c) 처방 판정')),
    ])

    # 판정 이후 — 한 번의 판정과 하루의 합.
    panel('panelB_nutrition', [
        ('fig07_verdict_label', T('(a) 영양성분표 판정')),
        ('fig08_today', T('(b) 오늘 누적')),
        ('fig09_device', T('(c) 기기 연동')),
    ])

    # 첫 실행 — 안내에서 프로필까지. 홈 화면은 §2.1 에서 따로 쓰므로 여기 넣지 않는다.
    panel('panelC_onboarding', [
        ('fig12_textsize', T('(a) 글자 크기')),
        ('fig16_picturekey', T('(b) 픽처키')),
        ('fig13_profile', T('(c) 프로필 설정')),
    ])
