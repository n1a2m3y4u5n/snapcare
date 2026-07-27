"""
글리프를 다시 그릴 때 볼 밑그림을 받아온다.

여기서 받은 그림은 **앱에 들어가지 않는다.** 실루엣 그림체·합성(`no{}`, `half{}`)·
용량이 전부 engine/glyphs.py 의 좌표에 묶여 있어서, 생성 이미지를 그대로 쓰면
금지 사선이 안 보이고 78개가 서로 다른 그림체가 된다. 여기서 얻는 것은
"땅콩 껍질이 실제로 어떤 실루엣인가" 하나뿐이고, 그걸 보고 손으로 옮긴다.

받는 대상도 좁다 — **실재하는 물건**만. 설탕이나 'finish_course' 처럼 그릴 대상이
없는 개념은 생성 모델도 못 그린다(모양이 없는 것이 문제지 그림 실력이 아니다).

    export OPENAI_API_KEY="..."          # 키는 환경변수로만. 파일에 적지 말 것
    python3 engine/gen_refs.py           # 전부
    python3 engine/gen_refs.py peanut    # 하나만

결과: engine/refs/<name>.png  (git 에 올라가지 않는다)
"""

from __future__ import annotations

import base64
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

API = 'https://api.openai.com/v1/images/generations'
MODEL = os.environ.get('IMAGE_MODEL', 'gpt-image-1')
OUT = Path(__file__).parent / 'refs'

# 실루엣으로 옮길 것이므로 처음부터 실루엣으로 받는다. 색·그림자·원근이 들어오면
# 어느 선이 형태이고 어느 선이 조명인지 구분하느라 밑그림 구실을 못 한다.
STYLE = (
    'A single centered black silhouette on a pure white background. '
    'Flat solid black, no gradient, no shading, no outline, no text, no drop shadow. '
    'Simple bold shape that stays readable at 32 pixels. '
    'Front view, no perspective. Fills most of the frame.'
)

# 지금 안 읽히는 것 중 **그릴 대상이 있는** 것들만.
# 왜 각각이 목록에 있는지는 engine/glyphs.py 의 현재 모양과 대조해서 판단했다.
TARGETS: dict[str, str] = {
    # 지금은 원 두 개라 숫자 8 로 읽힌다. 껍질의 잘록한 허리와 표면 결이 있어야 땅콩이 된다.
    'peanut': 'a peanut in its shell, whole, unshelled, with the pinched waist and ridged shell texture',
    # 지금은 원에 선 하나. 아몬드는 뾰족한 끝과 넓은 밑이 있어 실루엣만으로 구별된다.
    'tree_nut': 'a single almond nut, whole, pointed at one end and rounded at the other',
    # 지금은 네모 넷이라 아무것도 안 닮았다. 각설탕을 쌓으면 입체가 실루엣에 남는다.
    'sugar': 'a small stack of three sugar cubes, cubes clearly stacked with visible edges',
    # 지금은 주사위처럼 읽힌다. 팔뚝 위의 발진이어야 '피부 증상' 이 된다.
    'skin_rash': 'a human forearm with a patch of raised bumps rash on the skin',
    # 지금은 방울이 든 덩어리라 무엇의 기름인지 안 보인다.
    'oil': 'a cooking oil bottle with a narrow neck and a drop falling from the spout',
    # 지금은 세로줄 넷. 신체 부위로서의 피부는 꼬집힌 살결이 가장 읽힌다.
    'body_skin': 'a hand pinching a fold of skin on a forearm',
}


def generate(name: str, subject: str) -> Path:
    key = os.environ.get('OPENAI_API_KEY')
    if not key:
        raise SystemExit(
            'OPENAI_API_KEY 가 환경에 없다.\n'
            '  export OPENAI_API_KEY="..."  로 넣고 다시 실행할 것.\n'
            '  (키를 이 파일이나 저장소 안 어디에도 적지 말 것)'
        )

    body = json.dumps({
        'model': MODEL,
        'prompt': f'{subject}. {STYLE}',
        'size': '1024x1024',
        'n': 1,
    }).encode()

    req = urllib.request.Request(
        API,
        data=body,
        headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'},
    )

    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            payload = json.load(resp)
    except urllib.error.HTTPError as e:
        # 본문에 실제 사유가 들어 있다(모델 접근 권한·잔액·조직 인증 등).
        # 상태 코드만 보여주면 무엇을 고쳐야 하는지 알 수 없다.
        detail = e.read().decode('utf-8', 'replace')[:400]
        raise SystemExit(f'{name}: HTTP {e.code}\n{detail}')

    item = payload['data'][0]
    raw = base64.b64decode(item['b64_json']) if 'b64_json' in item else _fetch(item['url'])

    OUT.mkdir(exist_ok=True)
    path = OUT / f'{name}.png'
    path.write_bytes(raw)
    return path


def _fetch(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=180) as r:
        return r.read()


def main() -> None:
    wanted = sys.argv[1:] or list(TARGETS)
    unknown = [w for w in wanted if w not in TARGETS]
    if unknown:
        raise SystemExit(f'모르는 이름: {", ".join(unknown)}\n가능: {", ".join(TARGETS)}')

    for name in wanted:
        print(f'{name} …', flush=True)
        print(f'  -> {generate(name, TARGETS[name])}')


if __name__ == '__main__':
    main()
