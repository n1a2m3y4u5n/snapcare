import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventDayKey, eventId, toScanRecord } from './doseLog.ts';
import type { DoseEvent } from './types.ts';

const taken: DoseEvent = {
  at: '2026-08-02T19:12:53+09:00',
  tray: 7,
  time: '1912',
  taken: true,
  confirmed: true,
  reason: 'released',
  seq: 4,
  sc1: 'SC1*E*7*1912*T*04',
};

test('사건이 일어난 날은 기기의 벽시계 날짜다', () => {
  // 폰이 어느 시간대에 있든 상관없어야 한다. Date 로 파싱해 폰의 날짜를 읽으면
  // 자정 무렵에 어제 먹은 약이 오늘로 넘어간다.
  assert.equal(eventDayKey(taken), '2026-08-02');
  assert.equal(eventDayKey({ ...taken, at: '2026-08-02T23:50:00-05:00' }), '2026-08-02');
});

test('이름표는 seq 가 아니라 시각으로 만든다', () => {
  // seq 는 100 에서 되돌아간다. 되돌아간 뒤의 사건이 옛 사건과 같은 이름표를
  // 가지면, 새 복용 기록이 조용히 사라진다.
  const later = { ...taken, at: '2026-08-09T19:12:53+09:00', seq: 4 };
  assert.notEqual(eventId(taken), eventId(later));
});

test('먹은 것과 놓친 것이 다른 판정으로 남는다', () => {
  const today = '2026-08-02';
  assert.equal(toScanRecord(taken, { today, memberId: 'you' }).level, 'safe');
  const missed: DoseEvent = { ...taken, taken: false, reason: 'not-released' };
  assert.equal(toScanRecord(missed, { today, memberId: 'you' }).level, 'caution');
});

test('놓친 복용도 기록에 남는다', () => {
  // 지워야 할 실패가 아니라 돌보는 사람이 알아야 하는 사실이다.
  const missed: DoseEvent = { ...taken, taken: false, reason: 'window-closed' };
  const rec = toScanRecord(missed, { today: '2026-08-02', memberId: 'you' });
  assert.equal(rec.dayKey, '2026-08-02');
  assert.equal(rec.kind, 'medicine');
});

test('오늘이면 Today, 아니면 날짜가 붙는다', () => {
  assert.equal(toScanRecord(taken, { today: '2026-08-02', memberId: 'you' }).timeLabel, 'Today · 7:12 PM');
  assert.equal(toScanRecord(taken, { today: '2026-08-03', memberId: 'you' }).timeLabel, '08-02 · 7:12 PM');
});

test('이름을 모르면 칸 번호로 부른다', () => {
  const anon = toScanRecord(taken, { today: '2026-08-02', memberId: 'you' });
  assert.equal(anon.name, 'Compartment 7');
  const named = toScanRecord(taken, { today: '2026-08-02', memberId: 'you', name: 'Amoxicillin' });
  assert.equal(named.name, 'Amoxicillin');
});

test('자정과 정오를 12시제로 옳게 읽는다', () => {
  const opts = { today: '2026-08-02', memberId: 'you' };
  assert.equal(toScanRecord({ ...taken, at: '2026-08-02T00:05:00+09:00' }, opts).timeLabel, 'Today · 12:05 AM');
  assert.equal(toScanRecord({ ...taken, at: '2026-08-02T12:00:00+09:00' }, opts).timeLabel, 'Today · 12:00 PM');
});
