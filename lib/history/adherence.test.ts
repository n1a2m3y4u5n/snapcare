import test from 'node:test';
import assert from 'node:assert/strict';

import { adherence } from './adherence.ts';

test('아직 안 온 복용은 순응도의 분모에 안 들어간다', () => {
  /*
    안 빼면 매일 자정에 그 날 몫이 통째로 실패로 들어오고 하루가 지나면서 회복된다 —
    즉 아침마다 순응도가 가장 낮게 보인다. 실제로 나빠진 것이 없는데 숫자가 떨어진다.
  */
  const rows = [
    { dayKey: '2026-08-05', due: '0800', taken: true, tray: 1, reason: '', name: 'A' },
    { dayKey: '2026-08-05', due: '1300', taken: false, tray: 1, reason: '', name: 'A' },
    { dayKey: '2026-08-05', due: '1900', taken: false, tray: 1, reason: '', name: 'A' },
  ];
  const a = adherence(rows, '2026-08-05', 7, '1000');
  assert.equal(a.offered, 1, '아침 한 번만 셈에 든다');
  assert.equal(a.taken, 1);
  assert.equal(a.rate, 1, '아침에 100%%가 아니라 33%%로 보이면 안 된다');

  // 저녁이 되면 지나간 것이 셈에 들어온다.
  const later = adherence(rows, '2026-08-05', 7, '2000');
  assert.equal(later.offered, 3);
  assert.equal(later.taken, 1);
});
