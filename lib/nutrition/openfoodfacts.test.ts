import test from 'node:test';
import assert from 'node:assert/strict';

import { JUDGED, nameOverlap, searchWords as searchWordsForTest, toProfile } from './openfoodfacts.ts';

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

/*
  이름이 짧은 후보를 못 이기던 것.

  "내 낱말이 후보에 얼마나 들어 있나" 한 방향만 봤다. 그러면 OFF 의 짧은 레코드 이름은
  긴 질의를 영영 못 이긴다 — 그런데 OFF 이름은 짧기 일쑤고(브랜드가 따로 있으니)
  판별 모델이 내는 이름은 길기 일쑤다(포장지를 그대로 읽으니).

  실제로 겪은 것: "Munchy's Lexus Vanilla Cream Sandwich Biscuits" 를 찍었는데 후보
  "Lexus"(브랜드 Munchy's)가 0.33 으로 떨어져 "성분표를 못 읽었다" 가 떴다.
*/
test('후보 이름이 짧아도 통째로 들어 있으면 받는다', () => {
  assert.ok(nameOverlap("Munchy's Lexus Vanilla Cream Sandwich Biscuits", "Munchy's Lexus") >= 0.55);
  assert.ok(nameOverlap('Nutella', 'Ferrero Nutella hazelnut spread') >= 0.55);
});

test('값을 뒤집는 수식어가 어긋나면 같은 물건이 아니다', () => {
  /*
    Coca-Cola Zero 를 찍었는데 Coca-Cola 의 영양이 붙으면 당이 0 에서 10.6g/100ml 이
    된다. 이름은 거의 겹치므로 점수로는 못 막는다 — 뜻으로 막아야 한다.
  */
  assert.equal(nameOverlap('Coca-Cola Zero 500ml', 'Coca-Cola'), 0);
  assert.equal(nameOverlap('Coca-Cola 500ml', 'Coca-Cola Zero'), 0);
  assert.equal(nameOverlap('Monster Energy Ultra Zero Sugar', 'Monster Energy'), 0);
});

test('한 낱말만 겹치는 것으로는 안 받는다', () => {
  // "Milk" 가 통째로 들어 있다고 아무 우유의 영양이나 붙으면 안 된다.
  assert.ok(nameOverlap('Chocolate milk drink 250ml', 'Milk') < 0.55);
  assert.ok(nameOverlap('Apple juice 1l', 'Orange juice') < 0.55);
});

test('용량은 이름으로 안 센다', () => {
  // OFF 는 용량을 `quantity` 에 따로 담는다. 이름 점수의 분모만 키우던 토큰이다.
  assert.equal(nameOverlap('Nutella 350g', 'Nutella'), nameOverlap('Nutella', 'Nutella'));
});
