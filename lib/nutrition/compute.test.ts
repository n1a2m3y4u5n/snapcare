import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  portionGrams, amountsFor, sumAmounts, assess, deriveFlags, flagsForMember, summarize,
} from './compute.ts';
import { referenceFor } from './reference.ts';
import type { NutrientProfile } from './types.ts';
import type { Member } from '../snapcare/types.ts';

const member = (over: Partial<Member> = {}): Member => ({
  id: 'm', name: 'Test', role: 'Adult', emoji: '🙂', color: '#000', conditionIds: [], ...over,
});

const profile = (over: Partial<NutrientProfile> = {}): NutrientProfile => ({
  source: 'openfoodfacts', name: 'Test product', per100: { energy: 100 }, ...over,
});

test('제공량이 있으면 그것을, 없으면 100g 을 한 번 먹는 양으로 본다', () => {
  assert.equal(portionGrams(profile({ servingGrams: 250 })), 250);
  assert.equal(portionGrams(profile()), 100);
  assert.equal(portionGrams(profile({ servingGrams: 250 }), 2), 500);
  assert.equal(portionGrams(profile({ servingGrams: 0 })), 100, '0 은 값이 없는 것으로 본다');
});

test('100g 기준 밀도를 실제 먹는 양으로 환산한다', () => {
  const a = amountsFor(profile({ per100: { energy: 100, sugars: 8, salt: 0.4 } }), 250);
  assert.deepEqual(a, { energy: 250, sugars: 20, salt: 1 });
});

test('하루 누적은 항목마다 합산한다', () => {
  // 누적 화면이 이걸 쓴다 — 한 끼는 괜찮아도 하루로 모으면 상한을 넘는 경우를 잡는다.
  const total = sumAmounts([{ sugars: 10, salt: 1 }, { sugars: 5.5 }, { salt: 2.3, fiber: 4 }]);
  assert.deepEqual(total, { sugars: 15.5, salt: 3.3, fiber: 4 });
});

test('상한 영양소는 한 끼가 하루치의 절반을 넘으면 high 로 본다', () => {
  const ref = referenceFor(member());               // 성인: 당 상한 50 g
  const [sugars] = assess({ sugars: 30 }, ref);
  assert.equal(sugars.level, 'high');
  assert.equal(sugars.pct, 60);
  assert.equal(assess({ sugars: 13 }, ref)[0].level, 'moderate');   // 26%
  assert.equal(assess({ sugars: 5 }, ref)[0].level, 'low');         // 10%
});

test('채워야 하는 영양소는 방향이 반대다', () => {
  const ref = referenceFor(member());               // 성인: 식이섬유 목표 25 g
  assert.equal(assess({ fiber: 8 }, ref)[0].level, 'good');   // 32%
  assert.equal(assess({ fiber: 3 }, ref)[0].level, 'some');   // 12%
  assert.equal(assess({ fiber: 1 }, ref)[0].level, 'low');    // 4%
});

test('경고가 될 수 있는 것을 먼저 보여준다', () => {
  const ref = referenceFor(member());
  const out = assess({ fiber: 8, sugars: 30 }, ref);
  assert.equal(out[0].key, 'sugars', '상한 초과가 목표 달성보다 앞에 와야 한다');
  assert.equal(out[0].kind, 'limit');
});

test('기준치가 없는 영양소는 판정하지 않는다', () => {
  // 성인 기준에 탄수화물 상한은 없다 — 없는 기준으로 0 나누기를 하거나 만들어내면 안 된다.
  assert.deepEqual(assess({ carbohydrates: 60 }, { energyKcal: 2000, limits: {}, targets: {}, basis: '' }), []);
});

test('땅콩과 견과류를 섞지 않는다', () => {
  // OpenFoodFacts 는 'en:peanuts' 와 'en:nuts' 를 나눠 쓰고 의학적으로도 다른 알레르겐이다.
  // 정규식이 'peanuts' 안의 'nuts' 를 잡으면 땅콩 알레르기가 견과류 경고까지 끌고 온다.
  const ref = referenceFor(member());
  assert.deepEqual(deriveFlags(profile({ allergenTags: ['en:peanuts'] }), {}, ref), ['peanut']);
  assert.deepEqual(deriveFlags(profile({ allergenTags: ['en:nuts'] }), {}, ref), ['tree_nuts']);
  assert.deepEqual(
    deriveFlags(profile({ allergenTags: ['en:peanuts', 'en:nuts'] }), {}, ref).sort(),
    ['peanut', 'tree_nuts'],
  );
});

test('같은 제품이 사람에 따라 다르게 표시된다', () => {
  // 이 엔진의 요점이다. 'high_sugar' 를 카탈로그에 손으로 박아두면 모두에게 같은 답이 나온다.
  // 여기서는 그 사람의 하루 상한 대비로 계산하므로 아이에게만 붙는 구간이 존재한다.
  //   아이(1800 kcal): 당 상한 45 g → 경고선 22.5 g
  //   성인(2000 kcal): 당 상한 50 g → 경고선 25 g
  const drink = profile({ per100: { sugars: 9.6 }, servingGrams: 250 });   // 한 캔에 24 g

  assert.ok(flagsForMember(drink, member({ ageBand: 'child' })).includes('high_sugar'));
  assert.ok(!flagsForMember(drink, member({ ageBand: 'adult' })).includes('high_sugar'));
});

test('요약 문장은 수치를 읽지 못하는 사용자를 위한 것이다', () => {
  const ref = referenceFor(member());
  assert.match(summarize(assess({ sugars: 30 }, ref))!, /High in sugars/);
  assert.match(summarize(assess({ saturatedFat: 15 }, ref))!, /saturated fat/, '변수명이 그대로 나가면 안 된다');
  assert.match(summarize(assess({ fiber: 8 }, ref))!, /Good source/);
  assert.equal(summarize(assess({ sugars: 1 }, ref)), null, '할 말이 없으면 아무 말도 하지 않는다');
});
