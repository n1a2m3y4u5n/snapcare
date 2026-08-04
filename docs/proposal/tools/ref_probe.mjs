/**
 * 나이대별 하루 기준치를 실제로 뽑아 준다.
 *
 * 표 11 은 제목에 "위 코드의 출력" 이라고 적어 두었다. 그러면 그 표는
 * 손으로 옮긴 값이 아니라 돌려서 나온 값이어야 한다. 실제로 한 칸이
 * 달랐다. 성인 지방이 표에는 67, 코드는 66.7 이었다.
 *
 * `check_docs.py` 의 `reference_table` 이 이것을 돌려 표와 견준다.
 *
 *     node --experimental-strip-types docs/proposal/tools/ref_probe.mjs
 *
 * 나이대 키는 child·teen·adult·senior 다. elderly 가 아니다. 없는 키를
 * 넣으면 나이가 undefined 로 흘러 기본값이 나오는데, 값이 그럴듯해서
 * 앱의 버그로 잘못 읽기 쉽다.
 */
import { referenceFor } from '../../../lib/nutrition/reference.ts';

const out = {};
for (const band of ['child', 'teen', 'adult', 'senior']) {
  const r = referenceFor({ ageBand: band, role: 'self' });
  out[band] = {
    energy: r.energyKcal,
    sugars: r.limits.sugars,
    saturatedFat: r.limits.saturatedFat,
    fat: r.limits.fat,
    salt: r.limits.salt,
    fiber: r.targets.fiber,
    protein: r.targets.protein,
  };
}
console.log(JSON.stringify(out));
