import test from 'node:test';
import assert from 'node:assert/strict';

import { adherence, doseRows } from './adherence.ts';

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

test('시연 통계는 진짜 배출을 안 센다', () => {
  /*
    발표 콘솔에서 떨어뜨린 것이 오늘 칸에 쌓여 `29` 로 나왔다. 자료는 맞지만 시연
    계정의 통계는 지어낸 이야기라, 진짜 사건이 섞이면 이야기가 그 칸에서 무너진다.
  */
  const scans = [
    { id: 'demo_dose_2026-08-05_0800', dayKey: '2026-08-05', name: 'Metformin', memberId: 'me',
      dose: { taken: true, due: '0800' } },
    { id: 'dev_2026-08-05T14:02:11+09:00_1_1400', dayKey: '2026-08-05', name: 'Compartment 1', memberId: 'me',
      dose: { taken: true, due: '1400' } },
  ] as never as Parameters<typeof doseRows>[0];

  assert.equal(doseRows(scans, 'me').length, 2, '평소에는 둘 다 센다');
  const only = doseRows(scans, 'me', true);
  assert.equal(only.length, 1);
  assert.equal(only[0].name, 'Metformin');
});
