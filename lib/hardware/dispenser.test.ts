import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  to24h, planTrays, saveUrl, dropUrl, cleanHost, looksLikeHost, MAX_TRAYS,
  durationDays, weeklyFrom,
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

test('약 하나가 칸 하나 — 하루 몇 번을 먹든', () => {
  /*
    복용 한 번을 칸 하나로 배정하고 있었다. 그래서 하루 세 번 먹는 약이 **칸 셋**을
    먹었고, 상자는 그렇게 안 생겼다 — 칸은 층이고 한 층에 한 약이 쌓여 있으며, 같은
    약을 아침저녁으로 먹는다는 것은 같은 층이 두 번 열린다는 뜻이다.

    그 어긋남이 화면 세 곳에 새어 나왔다. 기기 탭이 약 둘을 세 줄로 냈고, 복약률이
    한 약을 두 번 세었고, 발표자 콘솔의 버튼이 약보다 많았다.
  */
  const { plan } = planTrays([rem('Amoxicillin', '8:00 AM'), rem('Amoxicillin', '12:00 PM'),
    rem('Amoxicillin', '6:00 PM')]);
  assert.equal(plan.length, 1);
  assert.deepEqual(plan[0].times, ['08:00', '12:00', '18:00']);
  assert.equal(plan[0].time, '08:00', '`time` 은 첫 시각 — 옛 /save 경로가 하나만 받는다');
});

test('함량이 다르면 다른 칸이다', () => {
  /*
    묶는 열쇠는 `medicineKey` 이고 그것은 함량을 남긴다. 남기는 것이 맞다 — 500mg
    한 알과 850mg 한 알은 **다른 알약**이고, 층에는 알약이 쌓인다. 이름만으로 묶으면
    두 알약이 한 층에 섞이고, 상자는 어느 것이 나갔는지 모른다.
  */
  const { plan } = planTrays([rem('Metformin 500mg', '8:00 AM'), rem('Metformin 850mg', '7:00 PM')]);
  assert.equal(plan.length, 2);

  // 띄어쓰기와 대소문자는 같은 약이다.
  const same = planTrays([rem('Metformin 500mg', '8:00 AM'), rem('metformin  500 mg', '7:00 PM')]);
  assert.equal(same.plan.length, 1);
  assert.deepEqual(same.plan[0].times, ['08:00', '19:00']);
});

test('시각 순으로 배치한다', () => {
  const { plan } = planTrays([rem('B', '6:00 PM'), rem('A', '8:00 AM')]);
  assert.deepEqual(plan.map((p) => p.time), ['08:00', '18:00']);
});

test('트레이가 모자라면 조용히 자르지 않고 돌려준다', () => {
  // 약이 서로 달라야 칸을 따로 먹는다 — 이름이 같으면 한 칸이다.
  const many = Array.from({ length: MAX_TRAYS + 3 }, (_, i) => rem(`Drug${i}`, `${(i % 12) + 1}:00 AM`));
  const { plan, dropped } = planTrays(many);
  assert.equal(plan.length, MAX_TRAYS);
  assert.equal(dropped.length, 3);
});

test('긴 약 이름은 기기 화면 폭에 맞춰 자른다', () => {
  const { plan } = planTrays([rem('Paracetamol Oral Suspension 120 mg', '8:00 AM')]);
  assert.ok(plan[0].name.length <= 16);
});

test('저장 URL 은 펌웨어 파라미터 이름을 그대로 쓴다', () => {
  // 서로 다른 약 둘 — 같은 약이면 한 칸이라 `time2` 가 없다.
  const { plan } = planTrays([rem('Amox', '8:00 AM'), rem('Ibu', '6:00 PM')]);
  const u = new URL(saveUrl('pilldispenser.local', plan));
  assert.equal(u.protocol, 'http:');
  assert.equal(u.hostname, 'pilldispenser.local');
  assert.equal(u.pathname, '/save');
  assert.equal(u.searchParams.get('trayNames1'), 'Amox');
  assert.equal(u.searchParams.get('trayNames2'), 'Ibu');
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

test('처방 기간을 날수로 읽는다 — 없으면 무기한(0)', () => {
  assert.equal(durationDays('for 7 days'), 7);
  assert.equal(durationDays('7일간'), 7);
  assert.equal(durationDays('2 weeks'), 14);
  assert.equal(durationDays('ongoing'), 0);
  assert.equal(durationDays(undefined), 0);
});

test('주간 슬롯에 복용 기간이 실린다 — /save 로는 보낼 수 없는 것', () => {
  const r = {
    id: 'a', memberId: 'me', time: '8:00 AM',
    item: { name: 'Amox', rx: { durationText: 'for 7 days' } },
  } as unknown as Reminder;
  const { slots } = weeklyFrom([r], 3);
  assert.equal(slots.length, 1);
  assert.deepEqual(slots[0].times, ['0800']);
  assert.equal(slots[0].durationDays, 7);
  assert.equal(slots[0].days, 127);   // 요일은 앱이 묻지 않아 매일
});

test('달려 있는 트레이 수를 넘으면 남는다 — 출품 기기는 3개뿐이다', () => {
  // 서로 다른 약 다섯. 같은 약이면 한 칸이라 이 시험이 재려는 것을 못 잰다.
  const many = Array.from({ length: 5 }, (_, i) => ({
    id: String(i), memberId: 'me', time: `${i + 1}:00 AM`, item: { name: `Drug${i}` },
  } as unknown as Reminder));
  const { slots, dropped } = weeklyFrom(many, 3);
  assert.equal(slots.length, 3);
  assert.equal(dropped.length, 2);
});
