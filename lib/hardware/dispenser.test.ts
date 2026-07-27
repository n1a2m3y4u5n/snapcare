import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  to24h, planTrays, saveUrl, dropUrl, cleanHost, looksLikeHost, MAX_TRAYS,
} from './dispenser.ts';
import type { Reminder } from '@/stores/reminders';

const rem = (name: string, time: string): Reminder =>
  ({ id: name + time, memberId: 'me', time, item: { name } } as unknown as Reminder);

test('12시간 표기를 24시간으로 — 기기는 24시간만 받는다', () => {
  assert.equal(to24h('8:00 AM'), '08:00');
  assert.equal(to24h('12:00 PM'), '12:00');   // 정오는 12시
  assert.equal(to24h('12:00 AM'), '00:00');   // 자정은 0시
  assert.equal(to24h('6:00 PM'), '18:00');
  assert.equal(to24h('09:30'), '09:30');      // 이미 24시간이면 그대로
});

test('복용 한 번이 트레이 하나 — 트레이당 시각은 하나뿐이다', () => {
  const { plan } = planTrays([rem('Amoxicillin', '8:00 AM'), rem('Amoxicillin', '12:00 PM'),
    rem('Amoxicillin', '6:00 PM')]);
  assert.equal(plan.length, 3);
  assert.deepEqual(plan.map((p) => p.tray), [1, 2, 3]);
  assert.deepEqual(plan.map((p) => p.time), ['08:00', '12:00', '18:00']);
});

test('시각 순으로 배치한다', () => {
  const { plan } = planTrays([rem('B', '6:00 PM'), rem('A', '8:00 AM')]);
  assert.deepEqual(plan.map((p) => p.time), ['08:00', '18:00']);
});

test('트레이가 모자라면 조용히 자르지 않고 돌려준다', () => {
  const many = Array.from({ length: MAX_TRAYS + 3 }, (_, i) => rem('X', `${(i % 12) + 1}:00 AM`));
  const { plan, dropped } = planTrays(many);
  assert.equal(plan.length, MAX_TRAYS);
  assert.equal(dropped.length, 3);
});

test('긴 약 이름은 기기 화면 폭에 맞춰 자른다', () => {
  const { plan } = planTrays([rem('Paracetamol Oral Suspension 120 mg', '8:00 AM')]);
  assert.ok(plan[0].name.length <= 16);
});

test('저장 URL 은 펌웨어 파라미터 이름을 그대로 쓴다', () => {
  const { plan } = planTrays([rem('Amox', '8:00 AM'), rem('Amox', '6:00 PM')]);
  const u = new URL(saveUrl('pilldispenser.local', plan));
  assert.equal(u.protocol, 'http:');
  assert.equal(u.hostname, 'pilldispenser.local');
  assert.equal(u.pathname, '/save');
  assert.equal(u.searchParams.get('trayNames1'), 'Amox');
  assert.equal(u.searchParams.get('time1'), '08:00');
  assert.equal(u.searchParams.get('time2'), '18:00');
  assert.equal(u.searchParams.get('trayAlertEna1'), 'on');
  // 펌웨어가 +1 해서 쓰므로 하나 뺀 값을 보낸다
  assert.equal(u.searchParams.get('trayinst'), '1');
});

test('사용자가 적은 주소의 흔한 실수를 걸러낸다', () => {
  assert.equal(cleanHost('http://pill.local/'), 'pill.local');
  assert.equal(cleanHost('  https://192.168.0.5  '), '192.168.0.5');
  assert.ok(looksLikeHost('pilldispenser.local'));
  assert.ok(looksLikeHost('192.168.0.5'));
  assert.ok(!looksLikeHost(''));
  assert.ok(!looksLikeHost('two words'));
});

test('주소를 정리한 뒤에도 URL 이 겹치지 않는다', () => {
  assert.ok(dropUrl('http://pill.local/', 2).startsWith('http://pill.local/dropout'));
});
