import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pending } from './autoSend.ts';
import type { Reminder } from '../../stores/reminders.ts';

/**
 * 자동 전송에서 유일하게 틀리면 아픈 자리.
 *
 * 기기는 새 일정을 받으면 "오늘 이미 나간 것" 을 다시 센다 — 처방이 바뀐 날 아침
 * 약이 새 계획대로 나오려면 그래야 한다. 그러니 내용이 같은 일정을 다시 보내면
 * 이미 먹은 복용이 다시 밀린 것이 되고, 그것은 **한 번 더 먹으라는 뜻**이 된다.
 *
 * 자동 전송은 알람 배열이 바뀔 때마다 도는데, 그 배열은 상자와 아무 상관 없는
 * 이유로도 바뀐다 — 이름을 고치거나, 서버 동기화가 같은 내용을 다시 넣거나.
 * 그래서 비교는 스토어의 모양이 아니라 **전선에 실릴 문장**을 봐야 한다.
 */

function reminder(over: Partial<Reminder> = {}): Reminder {
  return {
    id: 'r1',
    memberId: 'm1',
    time: '8:00 AM',
    item: { name: 'Metformin', emoji: '💊' } as Reminder['item'],
    ...over,
  } as Reminder;
}

test('알람이 없으면 아무것도 보내지 않는다', () => {
  // 빈 일정을 보내는 것은 "상자에 실린 것을 지워라" 이고, 앱을 새 폰에 깔아 아직
  // 비어 있는 상태와 사람이 전부 지운 상태가 여기서는 구별되지 않는다.
  assert.equal(pending([], 8, null), null);
  assert.equal(pending([], 8, 'SC1*W*1:0800-127-000'), null);
});

test('처음 만든 알람은 보낸다', () => {
  const next = pending([reminder()], 8, null);
  assert.ok(next);
  assert.match(next.payload, /^SC1\*W\*/);
  assert.equal(next.slots.length, 1);
});

test('같은 일정을 두 번 보내지 않는다', () => {
  const first = pending([reminder()], 8, null);
  assert.ok(first);
  assert.equal(pending([reminder()], 8, first.payload), null);
});

test('상자에 갈 것이 그대로면 이름이 바뀌어도 안 보낸다', () => {
  // 알람의 표시 이름은 SC1 문장에 실리지 않는다. 그것이 바뀔 때마다 보내면 사람이
  // 오타 하나 고칠 때마다 오늘 먹은 약이 다시 밀린다.
  const first = pending([reminder()], 8, null);
  assert.ok(first);
  const renamed = reminder({ item: { name: 'Metformin XR', emoji: '💊' } as Reminder['item'] });
  assert.equal(pending([renamed], 8, first.payload), null);
});

test('시각이 바뀌면 보낸다', () => {
  const first = pending([reminder()], 8, null);
  assert.ok(first);
  const moved = pending([reminder({ time: '9:00 PM' })], 8, first.payload);
  assert.ok(moved, 'a real change has to reach the box');
  assert.notEqual(moved.payload, first.payload);
});
