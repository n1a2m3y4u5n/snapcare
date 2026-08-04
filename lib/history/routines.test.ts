import { test } from 'node:test';
import assert from 'node:assert/strict';

import { routineSentence, routines } from './routines.ts';
import type { Reminder } from '../../stores/reminders.ts';

const TODAY = '2026-08-04';

function reminder(name: string, time: string, over: Partial<Reminder> = {}): Reminder {
  return {
    id: `${name}-${time}`,
    memberId: 'm1',
    time,
    item: { name, emoji: '💊' },
    ...over,
  } as Reminder;
}

test('약 하나에 알람 여럿이면 한 줄로 묶인다', () => {
  // 하루 두 번 먹는 약은 알람 둘이지만 사람에게는 한 가지 일이다. 화면이 알람
  // 단위로 말하면 약 하나가 두 줄로 앉아 처방이 실제보다 복잡해 보인다.
  const list = routines(
    [reminder('Metformin', '8:00 AM'), reminder('Metformin', '8:00 PM')], TODAY);
  assert.equal(list.length, 1);
  assert.deepEqual(list[0].times, ['8:00 AM', '8:00 PM']);
});

test('시각이 순서대로 선다', () => {
  const list = routines(
    [reminder('Metformin', '8:00 PM'), reminder('Metformin', '8:00 AM')], TODAY);
  assert.deepEqual(list[0].times, ['8:00 AM', '8:00 PM']);
});

test('끝난 처방은 빠진다', () => {
  // 이 목록의 물음은 "지금 무엇을 먹기로 되어 있나" 이고, 지난달에 끝난 항생제는
  // 그 물음의 답이 아니다. 지난 것은 아래 기록에 그대로 남는다.
  const done = reminder('Amoxicillin', '9:00 AM', { startedOn: '2026-07-01', days: 7 });
  const live = reminder('Metformin', '8:00 AM');
  const list = routines([done, live], TODAY);
  assert.deepEqual(list.map((r) => r.name), ['Metformin']);
});

test('끝나는 날이 있으면 들고 있는다', () => {
  const list = routines(
    [reminder('Amoxicillin', '9:00 AM', { startedOn: '2026-08-01', days: 7 })], TODAY);
  assert.equal(list[0].endsOn, '2026-08-07');   // 시작일이 1일째다
});

test('칸 배정이 상자로 보내는 것과 같은 함수에서 나온다', () => {
  // 화면이 말하는 칸과 약이 실제로 나오는 칸이 갈라지면, 그 어긋남은 사람이
  // 엉뚱한 칸에 약을 채워 넣는 모습으로만 드러난다.
  const list = routines(
    [reminder('Evening', '8:00 PM'), reminder('Morning', '8:00 AM')], TODAY);
  assert.deepEqual(list.map((r) => [r.name, r.tray]), [['Morning', 1], ['Evening', 2]]);
});

test('하루 몇 번인지 말로도 나온다', () => {
  const [one] = routines([reminder('Metformin', '8:00 AM')], TODAY);
  assert.match(routineSentence(one), /once a day, at 8:00 AM/);

  const [two] = routines(
    [reminder('Metformin', '8:00 AM'), reminder('Metformin', '8:00 PM')], TODAY);
  assert.match(routineSentence(two), /2 times a day/);
});
