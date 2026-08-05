import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDensity } from './validate.ts';
import type { NutrientAmounts } from './types.ts';

/**
 * LLM 이 낸 영양 수치를 받아들일지 버릴지 정하는 문지기.
 *
 * 이 파일에는 시험이 없었다. 문지기가 조용히 잠들면 아무도 모른다 — 통과시키는 쪽으로
 * 고장 나면 화면에는 그럴듯한 숫자가 뜨고, 그 숫자로 판정이 나가고, 사용자는 그것이
 * 지어낸 값이라는 것을 알 방법이 없다.
 *
 * 그래서 여기서 재는 것은 "맞는 것을 통과시키는가" 보다 **"틀린 것을 막는가"** 다.
 */

const ok: NutrientAmounts = {
  energy: 250, carbohydrates: 30, protein: 10, fat: 10, sugars: 5, saturatedFat: 3, fiber: 2, salt: 1,
};

// 4·30 + 4·10 + 9·10 = 250 — Atwater 가 정확히 맞는 값이다.

test('물리적으로 성립하는 값은 통과한다', () => {
  const r = validateDensity(ok);
  assert.ok(r.ok, r.problems.join(' · '));
  assert.ok((r.atwaterError ?? 1) < 0.01);
});

test('100g 에 담길 수 없는 양은 막는다', () => {
  // 탄수 60 + 지방 40 + 단백 30 = 130g 이 100g 안에 들어갈 수는 없다.
  const r = validateDensity({ ...ok, carbohydrates: 60, fat: 40, protein: 30 });
  assert.ok(!r.ok);
  assert.ok(r.problems.some((p) => p.startsWith('mass')), r.problems.join(' · '));
});

test('부분집합이 뒤집히면 막는다', () => {
  // 당류는 탄수화물의 일부다. 그보다 클 수 없다.
  assert.ok(!validateDensity({ ...ok, sugars: 40 }).ok);
  assert.ok(!validateDensity({ ...ok, saturatedFat: 20 }).ok);
});

test('반올림만큼의 차이는 뒤집힘으로 세지 않는다', () => {
  // 성분표는 반올림된 값을 싣는다. 0.3g 차이로 라벨을 버리면 멀쩡한 제품이 떨어진다.
  assert.ok(validateDensity({ ...ok, carbohydrates: 30, sugars: 30.3 }).ok);
});

test('열량이 조성과 맞지 않으면 막는다', () => {
  // Atwater: 4·탄수 + 4·단백 + 9·지방. 이 항등식이 깨진 값은 어디서 왔든 지어낸 것이다.
  const r = validateDensity({ ...ok, energy: 700 });
  assert.ok(!r.ok);
  assert.ok(r.problems.some((p) => p.includes('energy mismatch')), r.problems.join(' · '));
  assert.ok((r.atwaterError ?? 0) > 0.3);
});

test('범위를 벗어난 값은 막는다', () => {
  // 100g 당 900kcal 이 넘는 식품은 없다 — 순지방이 900 이다.
  assert.ok(!validateDensity({ ...ok, energy: 1200 }).ok);
  assert.ok(!validateDensity({ ...ok, fat: 150 }).ok);
  assert.ok(!validateDensity({ ...ok, salt: 50 }).ok);
});

test('음수는 막는다', () => {
  assert.ok(!validateDensity({ ...ok, protein: -5 }).ok);
});

test('숫자가 아닌 값은 막는다', () => {
  // LLM 은 문자열이나 null 을 섞어 보낸다. 그것이 산술에 들어가면 NaN 이 되고,
  // NaN 은 모든 비교에서 false 라 **모든 검사를 조용히 통과한다.**
  for (const bad of [NaN, Infinity, 'lots' as unknown as number, null as unknown as number]) {
    const r = validateDensity({ ...ok, protein: bad });
    assert.ok(!r.ok, `${String(bad)} 가 통과했다`);
  }
});

test('빈 값은 통과시킨다 — 없는 것과 틀린 것은 다르다', () => {
  // 성분표에 없는 항목을 틀렸다고 하면 부분적으로만 읽힌 라벨이 통째로 버려진다.
  // 그 판단은 이 문지기가 아니라 부르는 쪽이 한다.
  assert.ok(validateDensity({}).ok);
});

test('열량이 0 이면 항등식을 따지지 않는다', () => {
  // 0 으로 나눌 수 없다. 물처럼 실제로 0 인 것이 있다.
  const r = validateDensity({ energy: 0, carbohydrates: 0, protein: 0, fat: 0 });
  assert.ok(r.ok, r.problems.join(' · '));
  assert.equal(r.atwaterError, undefined);
});

/*
  이름으로 제품을 고를 때 **다른 제품을 안 집는가.**

  바코드는 그 물건 하나를 가리키지만 이름은 안 그렇다. 여기서 헐겁게 고르면 다른
  제품의 영양 정보가 이 사람의 하루 누적에 들어가고, 화면에는 아무 표시도 안 남는다.
*/
const { nameOverlap } = await import('./openfoodfacts.ts');

test('낱말이 겹치면 같은 제품으로 본다 — 길이가 달라도', () => {
  // 편집 거리로 재면 이 둘은 멀다. 우리가 묻는 것은 같은 물건인가다.
  assert.ok(nameOverlap('Nutella', 'Ferrero Nutella hazelnut spread 350g') >= 0.55);
  assert.ok(nameOverlap('Indomie Chicken Noodles', 'Indomie instant noodles chicken flavour') >= 0.55);
});

test('다른 제품은 안 집는다', () => {
  assert.ok(nameOverlap('Indomie Chicken Noodles', 'Coca-Cola Zero 330ml') < 0.55);
  assert.ok(nameOverlap('Maggi cube', 'Nutella hazelnut spread') < 0.55);
});

test('짧은 낱말은 세지 않는다 — "of", "the" 로 점수가 오르면 안 된다', () => {
  // 세 글자 이하를 빼지 않으면 "Can of X" 가 "Bag of Y" 와 겹쳐 보인다.
  assert.ok(nameOverlap('Can of beans', 'Bag of rice') < 0.55);
});
