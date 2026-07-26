import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toSchedule, dayMask } from './formSheet.ts';
import { encodeWeekly, EVERY_DAY } from './protocol.ts';

const sheet = (over: Partial<Parameters<typeof toSchedule>[0]> = {}) => ({
  layer: '1', days: ['MON', 'WED', 'FRI'], duration: '30d', hour: '8', ...over,
});

test('시트에 표시된 요일이 일정까지 살아서 간다', () => {
  // 이 경로가 잃어버리던 것이 정확히 이 값이다. 요일을 버리면 월/수/금 시트가
  // '매일' 로 도착하고, 기기는 아무도 요청하지 않은 나흘에 칸을 연다.
  const { schedule } = toSchedule(sheet());
  assert.equal(schedule.length, 1);
  assert.equal(schedule[0].days, 0b0010101, '월·수·금');
  assert.equal(schedule[0].durationDays, 30);
  assert.deepEqual(schedule[0].times, ['0800']);
});

test('기기에 나가는 문자열까지 확인한다', () => {
  // 중간 자료구조가 맞아도 인코딩에서 흘리면 결과는 같다.
  assert.equal(encodeWeekly(toSchedule(sheet()).schedule), 'SC1*W*1:0800-021-030');
});

test('매일·무기한도 그대로 실린다', () => {
  const { schedule } = toSchedule(sheet({
    days: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
    duration: 'ongoing',
  }));
  assert.equal(schedule[0].days, EVERY_DAY);
  assert.equal(schedule[0].durationDays, 0, 'ongoing 은 0');
});

test('요일을 못 읽었으면 추측하지 않는다', () => {
  // 예전에는 요일이 비어도 시각만으로 일정을 만들었고, 기기는 그것을 매일로 받았다.
  // 되물어야 할 자리에서 추측하면 사용자는 되물어진 적이 없다는 것조차 모른다.
  const r = toSchedule(sheet({ days: [] }));
  assert.deepEqual(r.schedule, []);
  assert.ok(r.missing.includes('days'));
});

test('판독이 빠진 항목을 알린다', () => {
  const r = toSchedule({ layer: null, days: [], duration: null, hour: null });
  assert.deepEqual(r.missing.sort(), ['compartment', 'days', 'time']);
  assert.deepEqual(r.schedule, []);
});

test('요일 비트는 종이의 좌→우 순서다', () => {
  // 디버깅할 때 마스크를 종이와 눈으로 대조할 수 있어야 한다.
  assert.equal(dayMask(['MON']), 1);
  assert.equal(dayMask(['SUN']), 64);
  assert.equal(dayMask(['MON', 'SUN']), 65);
  assert.equal(dayMask(['mon']), 1, '대소문자를 가리지 않는다');
  assert.equal(dayMask(['NOPE']), 0);
});

test('사람이 읽을 요약도 함께 만든다', () => {
  // 화면은 여전히 사람에게 보여줘야 한다 — 시트를 잘못 읽었는지 확인할 사람은 사용자다.
  assert.equal(toSchedule(sheet()).summary, 'Compartment 1 · 08:00 · MON WED FRI · for 30d');
  assert.match(
    toSchedule(sheet({ days: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] })).summary,
    /every day/,
  );
});
