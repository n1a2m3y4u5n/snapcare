import test from 'node:test';
import assert from 'node:assert/strict';

import { JUDGED, searchWords as searchWordsForTest, toProfile } from './openfoodfacts.ts';

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

/*
  검색어에 붙은 군더더기가 검색을 통째로 죽이던 것.

  판별 모델은 이름 뒤에 설명을 붙인다 — "Monster Energy Ultra (Zero Sugar)". 그것을
  그대로 보내면 OFF 의 질의 문법이 괄호를 연산자로 읽어 **0건**을 낸다. 괄호만 빼면
  같은 질의가 그 제품을 첫 번째로 돌려준다.

  화면에는 "성분표를 못 읽었다 — 뒷면을 찍으세요" 가 뜬다. 사람은 캔을 뒤집는데,
  이 앱은 그 이름으로 이미 찾을 수 있었다.
*/
test('괄호와 기호는 검색어에서 빠진다', () => {
  assert.equal(searchWordsForTest('Monster Energy Ultra (Zero Sugar)').join(' '),
    'monster energy ultra zero sugar');
  assert.equal(searchWordsForTest('Nutella® 350g — hazelnut').join(' '),
    'nutella 350g hazelnut');
});

test('낱말이 적으면 줄여서 다시 묻지 않는다', () => {
  // 한 번 더 묻는 값이 싸지 않다 — 분당 한도가 있다.
  assert.equal(searchWordsForTest('Nutella').length, 1);
});
