"""배포된 web.onnx 를 Nutrition5k 공식 테스트 split 로 직접 채점한다.

메타데이터(web.json)에 이미 수치가 적혀 있으나, 그 값을 그대로 옮겨 적지 않고
같은 자료로 다시 재어 대조한다. 이 문서에서 인용을 대조하며 배운 것이 있다면,
"어딘가에 적혀 있는 값" 과 "그 출처가 실제로 말하는 값" 이 자주 다르다는 것이다.

전처리는 web.json 이 명시한 그대로다 — RGB, 짧은 변을 258 로 맞춘 뒤 224 중앙 크롭,
255 로 나눔. 정규화는 그래프 안에 있으므로 여기서 하지 않는다.

MAE% 는 공식 정의(metrics.per_field)를 따른다 — 절대오차의 평균을 정답의 평균으로
나눈다. 접시마다의 비율을 평균하는 것이 아니다.
"""
import json
import pathlib

import numpy as np
import onnxruntime as ort
from PIL import Image

# 자료는 레포에 넣지 않는다(193 MB). 아래 경로에 내려받은 뒤 돌린다 — 받는 방법은
# 이 파일 맨 아래 주석에 있다.
HERE = pathlib.Path(__file__).resolve().parent / 'n5k'
MODEL = pathlib.Path('/Users/namyunsu/Desktop/Claude/snapcare/nutrition_manager/web/model/web.onnx')
TARGETS = ['calories', 'mass', 'fat', 'carb', 'protein']

# ── 정답 ───────────────────────────────────────────────────────────
gt = {}
for csv in ('metadata/dish_metadata_cafe1.csv', 'metadata/dish_metadata_cafe2.csv'):
    for line in (HERE / csv).read_text().splitlines():
        f = line.split(',')
        if len(f) >= 6 and f[0].startswith('dish_'):
            gt[f[0]] = [float(x) for x in f[1:6]]

ids = [i for i in (HERE / 'test_overhead_ids.txt').read_text().split() if i in gt]
print(f'채점 대상 {len(ids)}개 (오버헤드 프레임과 정답이 모두 있는 접시)')


def prep(path):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    s = 258 / min(w, h)
    im = im.resize((round(w * s), round(h * s)), Image.BILINEAR)
    w, h = im.size
    l, t = (w - 224) // 2, (h - 224) // 2
    a = np.asarray(im.crop((l, t, l + 224, t + 224)), dtype=np.float32) / 255.0
    return a.transpose(2, 0, 1)


sess = ort.InferenceSession(str(MODEL))
preds, gts = [], []
for k in range(0, len(ids), 32):
    chunk = ids[k:k + 32]
    batch = np.stack([prep(HERE / 'img' / f'{i}.png') for i in chunk])
    out = sess.run(['nutrition'], {'pixels': batch})[0]
    preds.append(out)
    gts.append(np.array([gt[i] for i in chunk], dtype=np.float64))
    print(f'  {min(k + 32, len(ids))}/{len(ids)}', end='\r')

preds = np.concatenate(preds).astype(np.float64)
gts = np.concatenate(gts)

abs_err = np.abs(preds - gts)
mae = abs_err.mean(axis=0)
mae_pct = 100.0 * mae / np.maximum(gts.mean(axis=0), 1e-6)

print('\n')
print(f"{'항목':<10}{'MAE':>12}{'MAE%':>10}{'정답 평균':>12}")
for n, m, p, g in zip(TARGETS, mae, mae_pct, gts.mean(axis=0)):
    print(f'{n:<10}{m:>12.2f}{p:>10.2f}{g:>12.1f}')
print(f"\n평균 MAE% = {mae_pct.mean():.3f}")

claimed = json.loads((MODEL.parent / 'web.json').read_text())['artifacts']['float32']
print(f"메타데이터가 적어 둔 값 = {claimed['test_mean_mae_pct']}")
print('\n항목별 대조:')
for n, m, p in zip(TARGETS, mae, mae_pct):
    cm = claimed['test_fields'][f'{n}_MAE']
    cp = claimed['test_fields'][f'{n}_MAE_%']
    print(f'  {n:<10} 재측정 {m:7.2f} / {p:5.2f}%   기록 {cm:7.2f} / {cp:5.2f}%   차이 {abs(p - cp):5.2f}%p')

json.dump({'n': len(ids),
           'mae': dict(zip(TARGETS, mae.round(3).tolist())),
           'mae_pct': dict(zip(TARGETS, mae_pct.round(3).tolist())),
           'mean_mae_pct': round(float(mae_pct.mean()), 3)},
          open(HERE / 'result.json', 'w'), indent=1, ensure_ascii=False)


# ── 자료 받는 법 ────────────────────────────────────────────────────
#
#   B=https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset
#   mkdir -p n5k/{dish_ids/splits,metadata,img} && cd n5k
#   curl -s -o dish_ids/splits/rgb_test_ids.txt   $B/dish_ids/splits/rgb_test_ids.txt
#   curl -s -o metadata/dish_metadata_cafe1.csv   $B/metadata/dish_metadata_cafe1.csv
#   curl -s -o metadata/dish_metadata_cafe2.csv   $B/metadata/dish_metadata_cafe2.csv
#
# 그 다음 테스트 목록 중 오버헤드 프레임이 실제로 있는 것만 골라 받는다. 709개 가운데
# 507개에만 있다 — 없는 것을 건너뛰지 않고 받으면 404 가 0바이트 파일로 남는다.
#
#   cat test_overhead_ids.txt | xargs -P 12 -I{} \
#     sh -c "curl -s -o img/{}.png $B/imagery/realsense_overhead/{}/rgb.png"
#
# test_overhead_ids.txt 는 버킷의 realsense_overhead 목록과 rgb_test_ids.txt 의
# 교집합이다 (storage.googleapis.com/storage/v1/b/nutrition5k_dataset/o 로 나열).
