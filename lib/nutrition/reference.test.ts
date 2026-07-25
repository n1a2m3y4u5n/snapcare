import { test } from 'node:test';
import assert from 'node:assert/strict';
import { referenceFor, ageFromRole } from './reference.ts';
import type { Member } from '../snapcare/types.ts';

const member = (over: Partial<Member> = {}): Member => ({
  id: 'm', name: 'Test', role: 'Adult', emoji: '🙂', color: '#000', conditionIds: [], ...over,
});

test('성인 기준치가 WHO 권고에서 그대로 유도된다', () => {
  const r = referenceFor(member());
  assert.equal(r.energyKcal, 2000);
  assert.equal(r.limits.sugars, 50);          // 2000 × 10% ÷ 4 kcal/g  (WHO 2015)
  assert.equal(r.limits.saturatedFat, 22.2);  // 2000 × 10% ÷ 9 kcal/g  (WHO 2023)
  assert.equal(r.limits.fat, 66.7);           // 2000 × 30% ÷ 9 kcal/g  (TRS 916 상한)
  assert.equal(r.limits.salt, 5);             // 성인 절대량            (WHO 2012)
  assert.equal(r.targets.fiber, 25);          // 성인 절대량            (TRS 916)
  assert.equal(r.targets.protein, 51.5);      // 62 kg × 0.83 g/kg      (WHO/FAO/UNU 2007)
});

test('당·포화지방 상한은 어느 연령대에서도 에너지의 정확히 10%다', () => {
  // 이 앱이 연령별 고정 표를 들고 있는 게 아니라 계산으로 유도한다는 주장의 근거.
  // 표였다면 새 연령대를 넣을 때마다 값을 손으로 채워야 하고, 이 항등식은 깨진다.
  for (const ageBand of ['child', 'teen', 'adult', 'senior'] as const) {
    const r = referenceFor(member({ ageBand }));
    assert.equal(r.limits.sugars, round1((r.energyKcal * 0.1) / 4), `sugars @ ${ageBand}`);
    assert.equal(r.limits.saturatedFat, round1((r.energyKcal * 0.1) / 9), `satFat @ ${ageBand}`);
  }
});

test('소금·식이섬유는 절대량 권고라 아이 쪽으로 낮춘다', () => {
  const child = referenceFor(member({ ageBand: 'child' }));   // 1800 kcal
  const adult = referenceFor(member({ ageBand: 'adult' }));    // 2000 kcal
  assert.ok(child.limits.salt! < adult.limits.salt!, '아이 소금 상한이 성인보다 낮아야 한다');
  assert.equal(child.limits.salt, 4.5);                        // 5 g × (1800/2000)
  assert.equal(child.targets.fiber, 22.5);                     // 25 g × (1800/2000)
});

test('나이대를 그림으로 고른 값이 role 문자열보다 우선한다', () => {
  // 온보딩에서 나이대를 고르면 ageBand 가 들어온다. role 은 구버전 저장분 호환용이다.
  const m = member({ role: 'Adult', ageBand: 'child' });
  assert.equal(referenceFor(m).energyKcal, 1800, 'ageBand 를 무시하면 성인 기준이 잘못 적용된다');
});

test('나이 정보가 없으면 성인 기준으로 떨어진다', () => {
  assert.equal(ageFromRole('Adult'), null);
  assert.equal(ageFromRole('Child · age 7'), 7);
  assert.equal(referenceFor(member({ role: 'Grandmother' })).energyKcal, 2000);
});

test('근거 문구가 기준치와 함께 나온다', () => {
  // 심사 Q&A 와 화면 표시에 쓴다 — 숫자만 있고 출처가 없으면 방어할 수 없다.
  assert.match(referenceFor(member()).basis, /WHO\/FAO/);
  assert.match(referenceFor(member({ ageBand: 'child' })).basis, /1800 kcal/);
});

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
