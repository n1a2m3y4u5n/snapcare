import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  looksLikeNutritionLabel, looksLikePrescription, parseNutritionLabel,
  parseServingSize, expandCandidates,
} from './labelOcr.ts';

/** scripts/make_label_samples.py 가 그리는 US 라벨과 같은 내용 — 깨끗하게 읽힌 경우. */
const US_LABEL = `Nutrition Facts
Serving size 40 g   |   Amount per serving
Calories 150
Total Fat 1.5 g
Saturated Fat 0.3 g
Sodium 190 mg
Total Carbohydrate 32 g
Dietary Fiber 3 g
Total Sugars 12 g
Protein 4 g
INGREDIENTS: WHOLE GRAIN OAT FLOUR, SUGAR, SALT.`;

test('성분표와 처방전과 밥상 사진을 갈라낸다', () => {
  assert.equal(looksLikeNutritionLabel(US_LABEL), true);
  assert.equal(looksLikePrescription(US_LABEL), false);

  const rx = 'AMOXICILLIN 500mg capsule\nTake one three times daily after meal\nPharmacy';
  assert.equal(looksLikePrescription(rx), true);
  assert.equal(looksLikeNutritionLabel(rx), false);

  // 밥상 사진에서 읽히는 글자들. 예전엔 글자가 있다는 이유만으로 처방전이 됐다.
  const meal = 'Bibimbap\nRestaurant\n5,000';
  assert.equal(looksLikePrescription(meal), false);
  assert.equal(looksLikeNutritionLabel(meal), false);
});

test('제공량 기준 표를 100g 기준으로 되돌린다', () => {
  const r = parseNutritionLabel(US_LABEL);
  assert.equal(r.basis, 'perServing');
  assert.equal(r.servingGrams, 40);
  assert.deepEqual(r.rejected, []);

  // 표에 적힌 값 × (100 / 40)
  const p = r.profile!.per100;
  assert.equal(p.energy, 375);
  assert.equal(p.fat, 3.75);
  assert.equal(p.saturatedFat, 0.75);
  assert.equal(p.carbohydrates, 80);
  assert.equal(p.sugars, 30);
  assert.equal(p.protein, 10);
  assert.equal(p.fiber, 7.5);
});

test('나트륨(mg)을 소금(g)으로 바꾼다', () => {
  // US·KR 라벨은 나트륨을 mg 로 적고, WHO 권고와 우리 엔진은 소금 g 을 쓴다.
  // 190 mg 나트륨 → 0.19 g × 2.5 = 0.475 g 소금 → 100g 기준 ×2.5
  const p = parseNutritionLabel(US_LABEL).profile!.per100;
  assert.equal(p.salt, 1.2);
});

test('제공량 숫자에 단위가 붙어 읽힌 경우를 되돌린다', () => {
  assert.equal(parseServingSize('Serving size 40 g'), 40);
  assert.equal(parseServingSize('1회 제공량 30g'), 30);
  assert.equal(parseServingSize('Serving size 308'), 30, '"30g" 의 g 가 8 로 읽힌 경우');
  assert.equal(parseServingSize('Total 2 servings'), undefined);
});

test('g 가 숫자로 읽히는 실패를 후보로 펼친다', () => {
  // Tesseract 의 체계적 실패다: "1.5 g" → "159", "9 g" → "98", "6.1 g" → "6.19".
  // 한 값만 고르는 대신 가능한 해석을 전부 만들고, 뒤에서 Atwater 로 고른다.
  const values = (t: string) => expandCandidates(t, false, 'fat').map((c) => c.value);
  assert.ok(values('159').includes(1.5), '끝자리를 단위로 보고 소수점을 되살려야 한다');
  assert.ok(values('98').includes(9), '끝자리 8 이 g 였던 경우');

  // 원문 그대로가 가장 싼 해석이어야 한다 — 보정은 근거가 있을 때만 이긴다.
  assert.equal(expandCandidates('12', false, 'sugars')[0].value, 12);

  // "03" 을 3 으로 읽으면 10배 틀린다. 라벨에 3 을 03 으로 적지 않는다.
  assert.equal(expandCandidates('03', false, 'saturatedFat')[0].value, 0.3);
});

test('자릿수가 흔들리면 열량 항등식에 묶인 세 값을 통째로 버린다', () => {
  // Atwater 는 열량·탄수·단백·지방을 **함께** 검증한다. 한 항목의 해석이 갈리면
  // 나머지를 떠받치던 근거도 같이 사라지므로, 셋을 따로 채택해서는 안 된다.
  for (const misread of ['159', '15', '1.59', '15.9']) {
    const r = parseNutritionLabel(US_LABEL.replace('Total Fat 1.5 g', `Total Fat ${misread}`));
    assert.equal(r.profile!.per100.fat, undefined, `"${misread}" 에서 지방을 채택했다`);
    for (const k of ['carbohydrates', 'protein', 'fat']) {
      assert.ok(r.rejected.includes(k as never), `"${misread}" 에서 ${k} 를 버리지 않았다`);
    }
  }
});

test('항등식과 무관한 항목은 함께 버리지 않는다', () => {
  // 셋을 버린다고 라벨 전체를 포기하지는 않는다. 당·소금·포화지방은 WHO 상한 판정에
  // 직접 쓰이는 값이고 별도 근거로 읽힌 것이라 그대로 남는다.
  const r = parseNutritionLabel(US_LABEL.replace('Total Fat 1.5 g', 'Total Fat 15.9'));
  assert.equal(r.profile!.per100.energy, 375);
  assert.equal(r.profile!.per100.sugars, 30);
  assert.equal(r.profile!.per100.salt, 1.2);
});

test('한 항목이 10배로 읽혀도 확신에 찬 숫자를 내놓지 않는다', () => {
  // 회귀: OCR 이 "1.5 g" 을 "15.9" 로 읽으면(주석에 적힌 g→9 실패) 지방이 39.75 g/100g
  // 으로 채택되고, 제대로 읽힌 탄수·단백이 대신 버려졌다. 항목별로 합의를 따진 탓에
  // 후보가 하나뿐인 오독이 "합의한" 것처럼 보였다.
  const r = parseNutritionLabel(US_LABEL.replace('Total Fat 1.5 g', 'Total Fat 15.9'));
  assert.notEqual(r.profile!.per100.fat, 39.75);
  assert.ok(r.rejected.length > 0, '되묻지 않고 넘어가면 화면이 틀린 값을 보여준다');
});

test('판단할 수 없으면 숫자를 만들어내지 않는다', () => {
  // 열량이 없으면 교차검증 수단이 사라진다. 그때는 프로필을 내지 않는다 —
  // 틀린 수치를 자신 있게 내놓는 것이 이 경로에서 제일 위험한 실패다.
  const noEnergy = 'Nutrition Facts\nServing size 40 g\nTotal Fat 1.5 g\nProtein 4 g';
  assert.equal(parseNutritionLabel(noEnergy).profile, null);
});

test('제품명을 못 찾으면 지어내지 않는다', () => {
  assert.equal(parseNutritionLabel(US_LABEL).profile!.name, 'Packaged food');
  assert.equal(parseNutritionLabel(US_LABEL, 'Oat Crunch').profile!.name, 'Oat Crunch');
});

test('원재료 줄에서 알레르겐을 뽑는다', () => {
  const withPeanut = US_LABEL.replace('SUGAR, SALT.', 'SUGAR, PEANUTS, SALT.');
  const tags = parseNutritionLabel(withPeanut).profile!.allergenTags ?? [];
  assert.ok(tags.some((t) => /peanut/.test(t)), `땅콩을 못 잡았다: ${tags.join(',')}`);
});
