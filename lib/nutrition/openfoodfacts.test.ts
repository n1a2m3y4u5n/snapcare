import test from 'node:test';
import assert from 'node:assert/strict';

import { JUDGED, toProfile } from './openfoodfacts.ts';

/*
  열량 하나만 있는 레코드를 "찾았다" 로 치면 안 된다.

  OFF 에는 열량만 채워진 항목이 흔하다. 그것이 통과하면 화면이 "숫자를 찾았다" 로
  넘어가고(`nutritionUnknown` 이 안 붙고), 당·소금·포화지방이 비어 있으니 걸리는
  플래그가 하나도 없고, 걸리는 것이 없으니 판정이 초록이 된다. 당뇨 프로필이든
  조건을 하나도 안 적은 사람이든 똑같이 그렇다.

  열량만으로는 경고가 안 나온다 — 기준치가 하루 전체(2000kcal)라 100g 당 500kcal 도
  25% 에 그치고, 판정은 100% 를 넘어야 경고를 낸다.

  이 파일이 재는 것은 `hasNumbers` 의 기준인 `JUDGED` 다. 그 함수 자체는 안 내보내지만
  기준 목록은 내보내므로, 목록이 흔들리면 여기서 걸린다.
*/
test('열량은 판정 기준에 안 들어간다', () => {
  assert.ok(!(JUDGED as readonly string[]).includes('energy'),
    '열량이 기준에 들어가면 열량만 있는 레코드가 다시 통과한다');
});

test('판정에 쓰이는 값들이 기준에 들어 있다', () => {
  // 이 셋이 빠지면 당뇨·고혈압 프로필의 경고가 통째로 사라진다.
  for (const k of ['sugars', 'salt', 'saturatedFat']) {
    assert.ok((JUDGED as readonly string[]).includes(k), `${k} 가 기준에서 빠졌다`);
  }
});

test('열량만 있는 레코드에는 판정에 쓸 값이 하나도 없다', () => {
  const only = toProfile({ product_name: 'X', nutriments: { 'energy-kcal_100g': 520 } } as never);
  assert.ok(!JUDGED.some((k) => typeof only.per100[k] === 'number'));
  const withSugar = toProfile({ product_name: 'X', nutriments: { sugars_100g: 32 } } as never);
  assert.ok(JUDGED.some((k) => typeof withSugar.per100[k] === 'number'));
});
