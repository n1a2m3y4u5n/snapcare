import { test } from 'node:test';
import assert from 'node:assert/strict';

import { byMedicine, medicineSentence } from './byMedicine.ts';
import type { DoseRow } from './adherence.ts';

const TODAY = '2026-08-04';

function dose(tray: number, taken: boolean, dayKey = TODAY, name = ''): DoseRow {
  return { dayKey, due: '0800', taken, tray, name, reason: taken ? 'released' : 'not-released' };
}

test('층마다 따로 센다', () => {
  // 합친 수는 고칠 곳을 안 가리킨다. 열 번을 걸렀다는 것이 한 약에 몰린 것인지
  // 두 약에 흩어진 것인지에 따라 할 일이 다르다.
  const rows = [
    dose(1, true, TODAY, 'Metformin'), dose(1, false, TODAY, 'Metformin'),
    dose(2, true, TODAY, 'Amlodipine'),
  ];
  const list = byMedicine(rows, TODAY);
  assert.deepEqual(list.map((m) => [m.tray, m.offered, m.taken]), [[1, 2, 1], [2, 1, 1]]);
});

test('층 순서대로. 상자를 열면 위에서 아래로 보이는 순서다', () => {
  const list = byMedicine([dose(3, true), dose(1, true), dose(2, true)], TODAY);
  assert.deepEqual(list.map((m) => m.tray), [1, 2, 3]);
});

test('이름이 없으면 층으로 지어 준다', () => {
  // 이름은 앱이 처방에서 붙여 주는 것이라 없을 수 있다. 상자가 아는 것은 층뿐이다.
  const [m] = byMedicine([dose(2, true)], TODAY);
  assert.equal(m.name, 'Compartment 2');
});

test('뒤늦게 붙은 이름을 집어 온다', () => {
  const list = byMedicine([dose(1, true), dose(1, true, TODAY, 'Metformin')], TODAY);
  assert.equal(list[0].name, 'Metformin');
});

test('창 밖의 날은 안 센다', () => {
  const list = byMedicine([dose(1, true, '2026-06-01'), dose(1, true)], TODAY, 7);
  assert.equal(list[0].offered, 1);
});

test('아무것도 안 내민 층은 0%가 아니라 모름이다', () => {
  // 0% 는 "다 걸렀다" 이고, 기록이 없는 것은 "아직 모른다" 다. 둘을 같은 그림으로
  // 그리면 상자를 이번 주에 산 사람이 자기가 다 걸렀다고 읽는다.
  assert.deepEqual(byMedicine([], TODAY), []);
});

test('줄마다 읽어 줄 말이 있다', () => {
  const [m] = byMedicine([dose(1, true, TODAY, 'Metformin'), dose(1, false, TODAY, 'Metformin')], TODAY);
  assert.match(medicineSentence(m), /out of 2 doses, missed once/);
});
