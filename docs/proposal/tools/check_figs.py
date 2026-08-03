"""도판에서 글자가 상자를 넘거나 다른 글자와 겹치는 자리를 찾는다.

    python3 docs/proposal/tools/check_figs.py

눈으로 열넷을 보는 것보다 재는 편이 낫다. matplotlib 이 글자마다 실제로
차지하는 사각형을 알려 주므로, 그것을 상자 사각형과 견주면 된다.

diagrams.py 를 그대로 임포트해 save() 만 가로챈다. 그림을 저장하기 직전의
Figure 를 손에 넣어야 글자 위치를 잴 수 있다. 그래서 이 검사는 파일이
아니라 그리는 코드를 본다. 도판을 고치면 다시 뜨지 않아도 바로 걸린다.
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

import matplotlib
matplotlib.use('Agg')
import matplotlib.patches as mp        # noqa: E402
import matplotlib.pyplot as plt        # noqa: E402

import style                            # noqa: E402

REPORT = []


def _check(fig, name):
    """이 그림의 글자와 상자를 견준다."""
    fig.canvas.draw()
    r = fig.canvas.get_renderer()
    for ax in fig.axes:
        boxes = [p for p in ax.patches if isinstance(p, mp.Rectangle)]
        rects = []
        for p in boxes:
            bb = p.get_window_extent(r)
            rects.append((bb.x0, bb.y0, bb.x1, bb.y1))

        texts = []
        for t in ax.texts:
            if not t.get_text().strip():
                continue
            bb = t.get_window_extent(r)
            texts.append((t.get_text()[:26], bb.x0, bb.y0, bb.x1, bb.y1))

        # 글자가 상자 하나의 안에 있으면서 그 테두리를 넘는가
        for txt, tx0, ty0, tx1, ty1 in texts:
            for bx0, by0, bx1, by1 in rects:
                inside_x = tx0 < bx1 and tx1 > bx0
                inside_y = ty0 < by1 and ty1 > by0
                if not (inside_x and inside_y):
                    continue
                # 글자 중심이 상자 안에 있으면 "그 상자의 글" 로 본다
                cx, cy = (tx0 + tx1) / 2, (ty0 + ty1) / 2
                if not (bx0 < cx < bx1 and by0 < cy < by1):
                    continue
                over = []
                if tx0 < bx0 + 1: over.append('왼쪽')
                if tx1 > bx1 - 1: over.append('오른쪽')
                if ty0 < by0 + 1: over.append('아래')
                if ty1 > by1 - 1: over.append('위')
                if over:
                    REPORT.append(f'{name}: 글자가 상자 {"·".join(over)} 로 넘는다 — "{txt}"')
                break

        # 글자끼리 겹치는가
        for i in range(len(texts)):
            for j in range(i + 1, len(texts)):
                a, b = texts[i], texts[j]
                ox = min(a[3], b[3]) - max(a[1], b[1])
                oy = min(a[4], b[4]) - max(a[2], b[2])
                # 글자 상자는 글자보다 위아래로 넉넉하다(어센더·디센더 몫).
                # 그 여유만큼 겹치는 것은 실제로 겹친 것이 아니므로,
                # 작은 쪽 높이의 3할을 넘게 겹칠 때만 잡는다.
                lim = 0.30 * min(a[4] - a[2], b[4] - b[2])
                if ox > 3 and oy > max(3.0, lim):
                    REPORT.append(f'{name}: 글자끼리 겹친다 — "{a[0]}" × "{b[0]}"')


_orig_save = style.save


def _save(fig, name, **kw):
    _check(fig, name)
    plt.close(fig)


style.save = _save
import diagrams                          # noqa: E402
diagrams.save = _save

for fn in ('userflow', 'verdict_flow', 'condition_branches', 'gate_flow',
           'gate_pictogram', 'recognition_layers', 'relay_keys', 'sw_strategy',
           'verdict_order', 'formsheet_flow', 'sign_payload', 'failure_paths',
           'voca_rebuild'):
    f = getattr(diagrams, fn, None)
    if f:
        try:
            f()
        except Exception as e:
            REPORT.append(f'{fn}: 돌리다 멈췄다 — {type(e).__name__} {e}')

if REPORT:
    print(f'도판에서 {len(REPORT)}건\n')
    for r in REPORT:
        print(' ', r)
    raise SystemExit(1)
print('도판: 글자가 상자를 넘거나 겹치는 자리 없음')
