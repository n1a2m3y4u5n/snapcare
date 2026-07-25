import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findTriggers, fisherRightTail, feedbackFrom } from './infer.ts';
import type { MealFeedback } from './infer.ts';
import type { ScanRecord, Symptom } from '../snapcare/types.ts';

/** n 끼: 그 성분이 든 끼니 `eaten` 회 중 `unwell` 회 불편, 없는 끼니 `other` 회 중 `otherUnwell` 회 불편. */
function log(
  tag: string,
  { eaten, unwell, other, otherUnwell, symptoms = ['gut'] }:
  { eaten: number; unwell: number; other: number; otherUnwell: number; symptoms?: Symptom[] },
): MealFeedback[] {
  const out: MealFeedback[] = [];
  for (let i = 0; i < eaten; i++) {
    out.push(i < unwell
      ? { tags: [tag], reaction: 'unwell', symptoms }
      : { tags: [tag], reaction: 'fine' });
  }
  for (let i = 0; i < other; i++) {
    out.push(i < otherUnwell
      ? { tags: ['en:rice'], reaction: 'unwell', symptoms }
      : { tags: ['en:rice'], reaction: 'fine' });
  }
  return out;
}

test('Fisher 정확검정이 알려진 값과 맞는다', () => {
  // 고전적인 2×2 (3,1,1,3) → 단측 p = 17/70
  assert.equal(Math.round(fisherRightTail(3, 1, 1, 3) * 10000) / 10000, 0.2429);
  // 완전 분리 (5,0,0,5) → 1/252
  assert.ok(Math.abs(fisherRightTail(5, 0, 0, 5) - 1 / 252) < 1e-9);
  // 신호가 전혀 없으면 p 는 크다
  assert.ok(fisherRightTail(3, 3, 3, 3) > 0.5);
});

test('한 성분에서만 반복해서 탈이 나면 지목한다', () => {
  const t = findTriggers(log('en:peanuts', { eaten: 5, unwell: 4, other: 6, otherUnwell: 0 }));
  assert.equal(t.length, 1);
  assert.equal(t[0].condition.id, 'peanut_allergy');
  assert.equal(t[0].unwellWhenEaten, 4);
  assert.equal(t[0].timesEaten, 5);
  assert.ok(t[0].p < 0.05);
});

test('우연히 겹친 정도로는 지목하지 않는다', () => {
  // 먹었을 때도 절반, 안 먹었을 때도 절반 불편 — 성분과 무관하다.
  const t = findTriggers(log('en:peanuts', { eaten: 6, unwell: 3, other: 6, otherUnwell: 3 }));
  assert.deepEqual(t, []);
});

test('기록이 적으면 비율이 아무리 높아도 말하지 않는다', () => {
  // 세 번 먹고 세 번 다 탈이 났다 — 100% 다. 그래도 세 끼는 근거가 아니다.
  // 없는 알레르기를 있다고 하면 식량이 부족한 곳에서 급원 하나를 지우는 셈이다.
  const t = findTriggers(log('en:peanuts', { eaten: 3, unwell: 3, other: 5, otherUnwell: 0 }));
  assert.deepEqual(t, []);
});

test('대조군이 없으면 비교 자체가 성립하지 않는다', () => {
  // 매 끼니에 다 들어 있으면 그 성분 때문인지 알 방법이 없다 (주식이 그렇다).
  const t = findTriggers(log('en:peanuts', { eaten: 8, unwell: 6, other: 1, otherUnwell: 0 }));
  assert.deepEqual(t, []);
});

test('증상 양상으로 알레르기와 소화 불내성을 구분한다', () => {
  // 두드러기·입술 부음·숨 가쁨은 즉시형 알레르기 쪽이다.
  const skin = findTriggers(log('en:peanuts', { eaten: 5, unwell: 4, other: 6, otherUnwell: 0, symptoms: ['skin'] }));
  assert.equal(skin[0].pattern, 'allergy');

  // 배탈만 반복되는 것은 양을 줄이면 되는 경우가 많다. 전부 '먹지 마시오'로 만들면 먹을 게 없어진다.
  const gut = findTriggers(log('en:milk', { eaten: 5, unwell: 4, other: 6, otherUnwell: 0, symptoms: ['gut'] }));
  assert.equal(gut[0].pattern, 'intolerance');
  assert.equal(gut[0].condition.id, 'lactose_intolerant');
});

test('우유·글루텐도 후보에 든다', () => {
  // kind 로 걸러버리면 'diet' 로 분류된 이 둘이 빠진다 — 식이 일지가 가장 잘 찾는 것들이다.
  assert.equal(findTriggers(log('en:milk', { eaten: 5, unwell: 4, other: 6, otherUnwell: 0 }))[0].condition.id, 'lactose_intolerant');
  assert.equal(findTriggers(log('en:gluten', { eaten: 5, unwell: 4, other: 6, otherUnwell: 0 }))[0].condition.id, 'gluten_sensitivity');
});

test('스스로는 알 수 없는 성분도 찾아낸다', () => {
  // 콩·참깨는 자가보고 목록에 없다. 여러 끼니를 가로질러 봐야만 드러난다.
  assert.equal(findTriggers(log('en:soybeans', { eaten: 5, unwell: 4, other: 6, otherUnwell: 0 }))[0].condition.id, 'soy_allergy');
  assert.equal(findTriggers(log('en:sesame-seeds', { eaten: 5, unwell: 4, other: 6, otherUnwell: 0 }))[0].condition.id, 'sesame_allergy');
});

test('땅콩과 견과류를 섞지 않는다', () => {
  const t = findTriggers(log('en:peanuts', { eaten: 5, unwell: 4, other: 6, otherUnwell: 0 }));
  assert.deepEqual(t.map((x) => x.condition.id), ['peanut_allergy']);
});

test('성분을 여러 개 볼수록 기준을 높인다', () => {
  // 성분 8개를 각각 5% 로 검정하면 "우연히 하나쯤"이 거의 항상 걸린다.
  // 같은 땅콩 신호라도 다른 성분이 함께 검정될 때는 더 강해야 통과한다.
  const peanut = { eaten: 5, unwell: 4, other: 6, otherUnwell: 0 };
  const alone = findTriggers(log('en:peanuts', peanut));
  assert.equal(alone.length, 1, '단독 검정에서는 통과하는 신호다');

  // 같은 기록에 무해한 성분들을 섞어 검정 대상을 늘린다 (신호는 그대로).
  const noisy = log('en:peanuts', peanut).map((m, i) => ({
    ...m,
    tags: [...m.tags, ...['en:milk', 'en:eggs', 'en:gluten', 'en:soybeans'].slice(0, (i % 4) + 1)],
  }));
  assert.equal(findTriggers(noisy).length, 0, 'Bonferroni 보정 후에는 같은 신호로 부족하다');
});

test('답하지 않은 끼니는 자료로 세지 않는다', () => {
  const rec = (over: Partial<ScanRecord>): ScanRecord => ({
    id: 'r', itemId: 'i', name: 'n', kind: 'food', emoji: '🍚',
    memberId: 'you', level: 'safe', timeLabel: '', dayKey: 'today', ...over,
  });

  const records = [
    rec({ id: '1', tags: ['en:peanuts'], reaction: 'unwell', symptoms: ['skin'] }),
    rec({ id: '2', tags: ['en:peanuts'] }),                                    // 답 안 함
    rec({ id: '3', tags: ['en:rice'], reaction: 'fine' }),
    rec({ id: '4', tags: ['en:peanuts'], reaction: 'fine', memberId: 'mia' }), // 다른 사람
    rec({ id: '5', tags: [], reaction: 'unwell', kind: 'medicine' }),          // 약
  ];

  const out = feedbackFrom(records, 'you');
  // 답한 것 + 본인 것 + 음식/음료만 남는다.
  // 무응답을 '괜찮았다'로 세면 분모가 부풀어 신호가 묽어지고,
  // '불편했다'로 세면 없는 알레르기가 만들어진다.
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((m) => m.reaction), ['unwell', 'fine']);
  assert.deepEqual(out[0].symptoms, ['skin']);
});

test('기록이 비어도 죽지 않는다', () => {
  assert.deepEqual(findTriggers([]), []);
  assert.deepEqual(findTriggers([{ tags: [], reaction: 'fine' }]), []);
});
