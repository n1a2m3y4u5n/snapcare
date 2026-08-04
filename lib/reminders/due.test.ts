import { test } from 'node:test';
import assert from 'node:assert/strict';

import { alarmKey, bundle, upcoming } from './due.ts';
import type { Reminder } from '../../stores/reminders.ts';

function remind(over: Partial<Reminder> & { time: string; name: string }): Reminder {
  const { name, time, ...rest } = over;
  return {
    id: `r_${name}_${time}`,
    memberId: 'm1',
    time,
    item: { id: name, name, kind: 'medicine', emoji: '', detectedVia: '' },
    ...rest,
  } as Reminder;
}

const AT = (hm: string) => new Date(`2026-08-04T${hm}:00`);

test('하루 세 번이면 세 번 다 잡는다', () => {
  /*
    이것이 이 파일이 존재하는 이유다. 예전에는 처방을 스캔한 화면이 `setTimeout` 을
    **하나** 걸었고 그것이 첫 복용이었다. 하루 세 번 먹는 약을 등록하면 아침만
    울리고 점심·저녁은 앱이 아무 말도 하지 않았다.
  */
  const rs = [
    remind({ name: 'Metformin', time: '08:00' }),
    remind({ name: 'Metformin', time: '13:00' }),
    remind({ name: 'Metformin', time: '20:00' }),
  ];
  const due = upcoming(rs, '2026-08-04', AT('07:00'));
  assert.deepEqual(due.map((d) => d.reminder.time), ['08:00', '13:00', '20:00']);
});

test('이미 지난 시각은 내일 것으로 잡는다', () => {
  // `msUntil` 이 그렇게 센다. 오후 2시에 앱을 열면 아침 8시는 지난 것이 아니라
  // 내일 아침 8시다 — 그 편이 맞다. 오늘 아침을 놓친 것은 알림이 아니라 기록의 일이다.
  const due = upcoming([remind({ name: 'A', time: '08:00' })], '2026-08-04', AT('14:00'));
  assert.equal(due.length, 1);
  assert.ok(due[0].inMs > 17 * 60 * 60 * 1000, '내일 아침까지 18시간쯤이어야 한다');
});

test('setTimeout 이 즉시 실행하는 지연은 만들지 않는다', () => {
  /*
    2^31-1 ms 를 넘는 지연을 주면 브라우저는 기다리지 않고 **즉시** 실행한다.
    창을 하루로 자르는 것이 그것을 막는다 — 자르지 않으면 무기한 알람 하나가 앱을
    여는 순간 알림으로 튀어나온다.
  */
  const due = upcoming([remind({ name: 'A', time: '08:00' })], '2026-08-04', AT('07:00'));
  for (const d of due) assert.ok(d.inMs <= 2_147_483_647);
});

test('끝난 처방은 잡지 않는다', () => {
  // 판단은 course.ts 가 한다. 여기서 다시 하지 않는 것이 요점이다 — 두 곳에서
  // 답하기 시작하면 어느 날 두 답이 갈린다.
  const done = remind({ name: 'Amoxicillin', time: '08:00', startedOn: '2026-07-01', days: 7 });
  assert.deepEqual(upcoming([done], '2026-08-04', AT('07:00')), []);
});

test('이름에 날짜가 들어간다', () => {
  /*
    약 이름과 시각만으로 이름을 지으면, 오늘 아침 8시에 울린 알람이 내일 아침 8시에
    "이미 울린 것" 이 되어 영원히 조용해진다. 매일 먹는 약인데.
  */
  const r = remind({ name: 'A', time: '08:00' });
  const today = alarmKey(r, AT('07:00'), 60 * 60 * 1000);
  const tomorrow = alarmKey(r, AT('09:00'), 23 * 60 * 60 * 1000);
  assert.notEqual(today, tomorrow);
  assert.match(today, /^2026-08-04\|/);
  assert.match(tomorrow, /^2026-08-05\|/);
});

test('밤에 잡은 내일 알람은 자정을 넘겨도 같은 이름이다', () => {
  // 날짜를 "지금" 이 아니라 "울릴 때" 로 붙이는 이유. 밤 11시에 연 앱이 잡은 내일
  // 아침 알람을, 자정 뒤에 다시 계산할 때 다른 이름으로 보면 두 번 울린다.
  const r = remind({ name: 'A', time: '08:00' });
  const before = alarmKey(r, new Date('2026-08-04T23:00:00'), 9 * 60 * 60 * 1000);
  const after = alarmKey(r, new Date('2026-08-05T00:30:00'), 7.5 * 60 * 60 * 1000);
  assert.equal(before, after);
});

test('같은 분의 약들은 알림 하나로 묶는다', () => {
  // 아침 8시에 세 알을 먹는 사람에게 알림 셋은 알림이 아니라 서랍 채우기다.
  const rs = [
    remind({ name: 'Metformin', time: '08:00' }),
    remind({ name: 'Amlodipine', time: '08:00' }),
    remind({ name: 'Simvastatin', time: '20:00' }),
  ];
  const out = bundle(upcoming(rs, '2026-08-04', AT('07:00')));
  assert.equal(out.length, 2);
  assert.match(out[0].body, /Metformin, Amlodipine/);
  assert.match(out[1].body, /^Simvastatin/);
});
