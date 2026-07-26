"""형태소 에셋을 다시 생성한다.

    python3 engine/build_assets.py            # 전부 다시 그린다
    python3 engine/build_assets.py --sheet    # 한 장에 모아 눈으로 확인할 시트도 만든다

dictionary.json 도 함께 맞춘다 — 에셋과 사전이 어긋나면 엔진이 파일을 못 찾고
픽토그램이 통째로 빠진다. 손으로 두 곳을 고치던 것을 한 곳에서 만든다.
"""

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from draw import Canvas, SIZE  # noqa: E402
from glyphs import HEADS, MODIFIERS, SLOTS  # noqa: E402

ROLES = {"head": HEADS, "modifier": MODIFIERS}


def build() -> int:
    n = 0
    for role, table in ROLES.items():
        out = HERE / "assets" / role
        out.mkdir(parents=True, exist_ok=True)
        # 표에서 사라진 글리프의 파일은 지운다. 이름을 바꾸거나 다른 역할로 옮기면
        # 옛 파일이 남아, 사전과 파일 수가 어긋나고 화면에는 유령 글리프가 남는다.
        for stale in out.glob("*.png"):
            if stale.stem not in table:
                stale.unlink()
        for name, fn in table.items():
            c = Canvas()
            fn(c)
            c.save(out / f"{name}.png")
            n += 1
    return n


def publish() -> int:
    """글리프를 웹앱이 직접 참조할 수 있는 자리에 복사한다.

    합성 픽토그램은 SIGIL 엔진이 만들지만, 화면의 단일 버튼(증상 선택 등)은 글리프
    한 장을 그대로 쓴다. 그때마다 엔진을 호출하는 건 과하고, 파이썬이 없는 환경에서는
    아예 안 나온다 — 정적 파일로 두면 오프라인에서도 그대로 뜬다.
    """
    out = HERE.parent / "public" / "glyphs"
    out.mkdir(parents=True, exist_ok=True)
    known = {name for t in ROLES.values() for name in t}
    for stale in out.glob("*.png"):
        if stale.stem not in known:
            stale.unlink()
    n = 0
    for role in ROLES:
        for f in (HERE / "assets" / role).glob("*.png"):
            (out / f.name).write_bytes(f.read_bytes())
            n += 1
    return n


def sheet() -> Path:
    """모든 글리프를 한 장에. 작게 줄였을 때 알아볼 수 있는지가 유일한 합격 기준이라,
    실제 앱에서 보이는 크기 근처로 함께 배치한다."""
    from PIL import Image, ImageDraw

    items = [(r, n) for r, t in ROLES.items() for n in t]
    cols = 8
    cell = 128
    rows = (len(items) + cols - 1) // cols
    img = Image.new("RGB", (cols * cell, rows * (cell + 46) + 10), "white")
    d = ImageDraw.Draw(img)

    for i, (role, name) in enumerate(items):
        x = (i % cols) * cell
        y = (i // cols) * (cell + 46)
        g = Image.open(HERE / "assets" / role / f"{name}.png")
        img.paste(g.resize((cell - 16, cell - 16), Image.LANCZOS), (x + 8, y + 8), g.resize((cell - 16, cell - 16), Image.LANCZOS))
        # 앱에서 실제로 쓰이는 크기 — 여기서 안 읽히면 그 글리프는 실패다
        small = g.resize((40, 40), Image.LANCZOS)
        img.paste(small, (x + cell - 48, y + cell - 4), small)
        d.text((x + 8, y + cell + 8), name, fill="black")

    path = HERE / "examples" / "glyph_sheet.png"
    path.parent.mkdir(exist_ok=True)
    img.save(path)
    return path


def sync_dictionary() -> None:
    """사전의 heads/modifiers 를 실제 글리프 목록에 맞춘다 (기존 설명은 보존)."""
    p = HERE / "dictionary.json"
    d = json.loads(p.read_text())
    for key, table in (("heads", HEADS), ("modifiers", MODIFIERS)):
        old = {e["name"]: e for e in d[key]}
        entries = []
        for name in table:
            if name in old:
                e = dict(old[name])
                # 슬롯은 그림 옆(glyphs.SLOTS)이 출처다. 사전에 남은 옛 좌표를 덮어쓴다.
                if key == "heads":
                    e["slot"] = list(SLOTS[name]) if name in SLOTS else None
                entries.append(e)
            else:
                entries.append({
                    "name": name,
                    "category": name.split("_")[0],
                    "description": name.replace("_", " ").capitalize() + ".",
                    **({"slot": list(SLOTS[name]) if name in SLOTS else None} if key == "heads" else {}),
                })
        d[key] = entries
    p.write_text(json.dumps(d, indent=2, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    count = build()
    sync_dictionary()
    print(f"{publish()} glyphs -> public/glyphs/")
    print(f"{count} glyphs -> {SIZE}px")
    if "--sheet" in sys.argv:
        print("sheet:", sheet())
