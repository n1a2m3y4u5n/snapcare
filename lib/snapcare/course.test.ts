import test from 'node:test';
import assert from 'node:assert/strict';
import {
  finished, isOver, lastDay, medicineKey, nextDue, replaceCourse, running,
} from './course.ts';
import type { Reminder } from '../../stores/reminders.ts';

/**
 * 여기서 틀리면 두 방향으로 다치는데, 두 방향의 무게가 다르다.
 *
 *  - 너무 늦게 끝내면 → 다 먹은 약을 계속 알린다. 성가시고, 성가신 알람은 결국
 *    모든 알람을 무시하게 만든다.
 *  - 너무 일찍 끝내면 → **먹어야 할 약을 안 알린다.** 이쪽이 훨씬 무겁다.
 *
 * 그래서 경계와 '모르는 경우' 를 함께 잡는다. 모를 때는 끝내지 않는 쪽이다.
 */

const med = (name: string, time = '8:00 AM', extra: Partial<Reminder> = {}): Reminder => ({
  id: `r_${name}_${time}`, memberId: 'me', time,
  item: { id: 'i', name, kind: 'prescription', emoji: '💊', detectedVia: 'test', flags: [] },
  ...extra,
});

test('시작일이 1일째다', () => {
  // 처방전의 "7일간" 은 오늘 포함 이레다. 약국도 그렇게 센다.
  assert.equal(lastDay('2026-07-29', 7), '2026-08-04');
  assert.equal(lastDay('2026-07-29', 1), '2026-07-29');
});

test('무기한은 끝이 없다', () => {
  assert.equal(lastDay('2026-07-29', 0), null);
  assert.equal(isOver(med('Metformin', '8:00 AM', { startedOn: '2020-01-01', days: 0 }), '2026-07-29'), false);
});

test('마지막 날에는 아직 끝나지 않았다', () => {
  const r = med('Amoxicillin', '8:00 AM', { startedOn: '2026-07-29', days: 7 });
  assert.equal(isOver(r, '2026-08-04'), false, '마지막 날에 끊기면 한 번을 덜 먹는다');
  assert.equal(isOver(r, '2026-08-05'), true);
});

test('기간을 모르면 끝내지 않는다', () => {
  // 이 필드가 생기기 전에 만들어진 알람이 어느 날 갑자기 사라지면 안 된다.
  assert.equal(isOver(med('Old'), '2026-07-29'), false);
  assert.equal(isOver(med('Old', '8:00 AM', { startedOn: '2026-07-01' }), '2026-07-29'), false);
});

test('끝난 것만 걷어내고 나머지는 그대로 둔다', () => {
  const rs = [
    med('Amoxicillin', '8:00 AM', { startedOn: '2026-07-01', days: 7 }),   // 끝났다
    med('Metformin', '8:00 AM', { startedOn: '2026-07-01', days: 0 }),     // 무기한
    med('Ibuprofen', '6:00 PM'),                                            // 모른다
  ];
  assert.deepEqual(running(rs, '2026-07-29').map((r) => r.item.name), ['Metformin', 'Ibuprofen']);
});

test('끝난 것은 약마다 하나씩만 알린다', () => {
  // 하루 세 번짜리는 알람이 셋이다. 셋을 다 알리면 같은 말을 세 번 듣는다.
  const rs = [
    med('Amoxicillin', '8:00 AM', { startedOn: '2026-07-01', days: 7 }),
    med('Amoxicillin', '2:00 PM', { startedOn: '2026-07-01', days: 7 }),
    med('Amoxicillin', '8:00 PM', { startedOn: '2026-07-01', days: 7 }),
  ];
  assert.equal(finished(rs, '2026-07-29').length, 1);
});

test('다음 복용은 배열 순서가 아니라 시각으로 고른다', () => {
  // 전에는 reminders[0] 을 썼는데 그 배열은 '최근에 더한 순' 이다.
  const rs = [med('C', '8:00 PM'), med('A', '8:00 AM'), med('B', '2:00 PM')];
  assert.equal(nextDue(rs, '07:00')?.item.name, 'A');
  assert.equal(nextDue(rs, '09:00')?.item.name, 'B');
  assert.equal(nextDue(rs, '15:00')?.item.name, 'C');
});

test('오늘 것이 다 지났으면 내일 첫 것', () => {
  const rs = [med('A', '8:00 AM'), med('C', '8:00 PM')];
  assert.equal(nextDue(rs, '23:00')?.item.name, 'A');
});

test('시각을 읽을 수 없는 알람은 후보에서 뺀다', () => {
  // 'as needed' 는 시각이 아니다. 이것을 0시로 읽으면 늘 이것이 다음 복용이 된다.
  const rs = [med('PRN', 'as needed'), med('A', '8:00 AM')];
  assert.equal(nextDue(rs, '07:00')?.item.name, 'A');
  assert.equal(nextDue([med('PRN', 'as needed')], '07:00'), undefined);
});

test('같은 약을 다시 찍으면 갈아 끼운다', () => {
  const before = [med('Amoxicillin 250mg', '8:00 AM'), med('Metformin 500mg', '8:00 AM')];
  const after = replaceCourse(before, [med('Amoxicillin 250 mg', '9:00 AM')]);
  const amox = after.filter((r) => /amox/i.test(r.item.name));
  assert.equal(amox.length, 1, '용량이 바뀌면 옛 알람과 새 알람이 함께 울렸다');
  assert.equal(amox[0].time, '9:00 AM');
});

test('다른 약은 건드리지 않는다', () => {
  const before = [med('Metformin 500mg', '8:00 AM')];
  const after = replaceCourse(before, [med('Amoxicillin 250mg', '8:00 AM')]);
  assert.deepEqual(after.map((r) => r.item.name).sort(), ['Amoxicillin 250mg', 'Metformin 500mg']);
});

test('띄어쓰기와 대소문자가 달라도 같은 약이다', () => {
  // OCR 은 같은 종이를 두 번 찍어도 글자를 조금씩 다르게 읽는다.
  assert.equal(medicineKey('Amoxicillin 250mg'), medicineKey('AMOXICILLIN 250 MG'));
  assert.notEqual(medicineKey('Amoxicillin'), medicineKey('Metformin'));
});
