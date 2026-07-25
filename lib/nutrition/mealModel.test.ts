import { test } from 'node:test';
import assert from 'node:assert/strict';
import { densityFromTotals, mergeVisionDetail } from './mealModel.ts';
import type { ModelTotals } from './mealModel.ts';

// 실제 Nutrition5k 접시에 가까운 값: 밥 한 공기 + 닭고기, 350 g
const plate: ModelTotals = { calories: 542, mass: 350, fat: 15.4, carb: 70, protein: 31.5 };

test('접시 총량을 100g 기준 밀도와 제공량으로 나눈다', () => {
  const d = densityFromTotals(plate);
  assert.equal(d.ok, true);
  if (!d.ok) return;
  assert.equal(d.servingGrams, 350);
  assert.equal(d.per100.energy, 154.9);
  assert.equal(d.per100.carbohydrates, 20);
  assert.equal(d.per100.protein, 9);
});

test('질량이 한 끼 범위를 벗어나면 채택하지 않는다', () => {
  // 모델이 접시가 아닌 것을 봤을 때 나오는 전형적 실패다
  assert.equal(densityFromTotals({ ...plate, mass: 4 }).ok, false);
  assert.equal(densityFromTotals({ ...plate, mass: 9000 }).ok, false);
});

test('Atwater 가 안 맞는 예측은 자기 모델이라도 버린다', () => {
  // 열량만 세 배로 빗나간 경우 — 거시 영양소와 물리적으로 모순이다
  const d = densityFromTotals({ ...plate, calories: 1800 });
  assert.equal(d.ok, false);
  if (d.ok) return;
  assert.match(d.problems.join(' '), /energy mismatch/);
});

test('Vision 의 세부 영양소는 모순되지 않을 때만 얹는다', () => {
  const base = { energy: 154.9, fat: 4.4, carbohydrates: 20, protein: 9 };
  const { per100, dropped } = mergeVisionDetail(base, { sugars: 3, saturatedFat: 1.5, salt: 0.8 });
  assert.equal(per100.sugars, 3);
  assert.equal(per100.salt, 0.8);
  assert.equal(per100.carbohydrates, 20, '모델의 거시 영양소는 Vision 이 덮어쓰지 못한다');
  assert.deepEqual(dropped, []);
});

test('당류가 탄수화물을 넘으면 그 항목을 버린다 — 깎지 않는다', () => {
  // 상한에 맞춰 깎으면 실제보다 안전해 보이는 숫자가 만들어진다. 없는 편이 낫다.
  const base = { energy: 154.9, fat: 4.4, carbohydrates: 20, protein: 9 };
  const { per100, dropped } = mergeVisionDetail(base, { sugars: 45, salt: 0.8 });
  assert.equal(per100.sugars, undefined);
  assert.deepEqual(dropped, ['sugars']);
  assert.equal(per100.salt, 0.8, '모순되지 않은 항목까지 같이 버리지는 않는다');
});

test('합친 결과가 검증에 걸리면 모델 값만 남긴다', () => {
  const base = { energy: 154.9, fat: 4.4, carbohydrates: 20, protein: 9 };
  // 식이섬유 90 g/100 g — 질량 보존이 깨진다
  const { per100 } = mergeVisionDetail(base, { fiber: 90, salt: 0.8 });
  assert.deepEqual(per100, base);
});
