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

/*
  이름도 모르고 나온 적도 없는 칸.

  상자를 직접 눌러 돌린 자국이다 — 발표 콘솔의 배출 단추, 작업대 시험, 알람 없이
  종이로 바로 보낸 일정. 화면에 "Compartment 5: 0/1" 로 남는데, 그 줄은 아무 데도
  안 가리킨다: 무슨 약인지 모르니 약통을 열어도 할 일이 없고, 한 번도 안 나왔으니
  어긋난 습관도 없다.
*/
const row = (tray: number, name: string, taken: boolean) => ({
  dayKey: '2026-08-05', due: '0800', taken, tray, reason: '', name,
});

test('이름 모르고 나온 적도 없는 칸은 목록에서 뺀다', () => {
  const out = byMedicine([
    row(1, 'Metformin 500mg', true),
    row(4, '', false),
    row(5, '', false),
  ], '2026-08-05', 28);
  assert.deepEqual(out.map((m) => m.tray), [1], '빈 칸이 남아 있으면 진짜 줄이 안 읽힌다');
});

test('이름은 몰라도 실제로 나온 칸은 남긴다', () => {
  // 무슨 약인지는 몰라도 그 칸에서 뭔가 일어나고 있다는 사실은 진짜다.
  const out = byMedicine([row(3, '', true), row(3, '', false)], '2026-08-05', 28);
  assert.deepEqual(out.map((m) => m.tray), [3]);
  assert.equal(out[0].taken, 1);
});

test('이름이 있으면 한 번도 안 나왔어도 남긴다', () => {
  // 이쪽은 가리킬 곳이 있다 — 그 약을 계속 거르고 있다는 뜻이고, 고칠 수 있다.
  const out = byMedicine([row(2, 'Amlodipine 5mg', false)], '2026-08-05', 28);
  assert.deepEqual(out.map((m) => m.name), ['Amlodipine 5mg']);
});
