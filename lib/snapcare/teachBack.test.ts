import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuestions } from './teachBack.ts';
import type { ScanItem } from './types.ts';

const item = (rx?: ScanItem['rx']): ScanItem => ({
  id: 'amox', name: 'Amoxicillin', kind: 'prescription', emoji: '💊',
  detectedVia: 'test', flags: [], rx,
});

const base = {
  dosageText: 'with food', durationText: '7 days',
  schedule: [
    { time: '08:00', label: 'Morning', emoji: '🌅' },
    { time: '19:00', label: 'Evening', emoji: '🌙' },
  ],
};

test('처방전이 말한 것만 묻는다', () => {
  // 없는 것을 물으면 지어낸 답을 가르치게 된다.
  assert.deepEqual(buildQuestions(item(undefined)), []);
  const noDose = buildQuestions(item({ ...base, schedule: [] }), 5);
  assert.ok(!noDose.some((q) => /how many/i.test(q.ask)), '개수가 없는데 개수를 물었다');
  assert.ok(!noDose.some((q) => /when/i.test(q.ask)), '시각이 없는데 시각을 물었다');
});

test('맞는 답은 반드시 답지 안에 있다', () => {
  for (const q of buildQuestions(item({ ...base, doseCount: 2 }), 5)) {
    assert.ok(q.options.includes(q.correct), `${q.ask} 의 답지에 정답이 없다`);
  }
});

test('오답이 사실은 맞는 답이면 안 된다', () => {
  // 아침·저녁을 먹는 처방에서 저녁을 오답으로 내면, 옳게 짚은 사람에게 틀렸다고 말한다.
  const q = buildQuestions(item({ ...base, doseCount: 1 }), 5).find((x) => /when/i.test(x.ask));
  assert.ok(q);
  assert.ok(!q.options.includes('time_evening'), `실제 복용 시각이 오답으로 나왔다: ${q.options.join(' ')}`);
  assert.ok(q.options.includes('time_morning'));
});

test('하루 네 번 먹는 약에는 시각을 묻지 않는다', () => {
  // 오답으로 쓸 시각이 남지 않는다. 물음을 억지로 만들면 답지가 전부 정답이 된다.
  const four = ['Morning', 'Noon', 'Evening', 'Night'].map((label) => ({ time: '00:00', label, emoji: '' }));
  const qs = buildQuestions(item({ ...base, schedule: four, doseCount: 1 }), 5);
  assert.ok(!qs.some((q) => /when/i.test(q.ask)), qs.map((q) => q.ask).join(' · '));
});

test('답지 순서는 볼 때마다 같다', () => {
  // 볼 때마다 답이 옮겨 다니면, 처음 짚어 본 자리를 기억한 사람이 두 번째에 헤맨다.
  const a = buildQuestions(item({ ...base, doseCount: 2 }), 5);
  const b = buildQuestions(item({ ...base, doseCount: 2 }), 5);
  assert.deepEqual(a.map((q) => q.options), b.map((q) => q.options));
});

test('식사 지시가 없으면 식사를 묻지 않는다', () => {
  const qs = buildQuestions(item({ ...base, dosageText: 'twice daily', doseCount: 1 }), 5);
  assert.ok(!qs.some((q) => /with food/i.test(q.ask)), qs.map((q) => q.ask).join(' · '));
});

test('공복 처방은 공복이 답이다', () => {
  const qs = buildQuestions(item({ ...base, dosageText: 'before meals', doseCount: 1 }), 5);
  const food = qs.find((q) => /with food/i.test(q.ask));
  assert.ok(food);
  assert.equal(food.correct, 'food_empty_bowl');
});

test('물음 수를 제한한다 — 확인이지 시험이 아니다', () => {
  assert.ok(buildQuestions(item({ ...base, doseCount: 2 })).length <= 2);
});

test('개수를 먼저 묻는다', () => {
  // 표 4 에서 전체 오류의 28.4% 가 용량 오류였다.
  const qs = buildQuestions(item({ ...base, doseCount: 2 }), 5);
  assert.match(qs[0].ask, /how many/i);
});

test('하루 세 번 먹는 약에도 시각을 묻지 않는다 — 답지가 둘뿐이면 확인이 못 된다', () => {
  const three = ['Morning', 'Noon', 'Evening'].map((label) => ({ time: '00:00', label, emoji: '' }));
  const qs = buildQuestions(item({ ...base, schedule: three, doseCount: 1 }), 5);
  assert.ok(!qs.some((q) => /when/i.test(q.ask)), qs.map((q) => q.ask).join(' · '));
  // 대신 물어볼 것이 남아 있어야 한다 — 확인 자체가 사라지면 안 된다.
  assert.ok(qs.length >= 2, qs.map((q) => q.ask).join(' · '));
});

test('모든 물음의 답지는 셋이거나, 둘 뿐인 예-아니오다', () => {
  const qs = buildQuestions(item({ ...base, doseCount: 2 }), 5);
  for (const q of qs) {
    const yesNo = /with food/i.test(q.ask);
    assert.equal(q.options.length, yesNo ? 2 : 3, `${q.ask}: ${q.options.join(' ')}`);
  }
});
