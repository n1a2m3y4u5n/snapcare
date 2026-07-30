import test from 'node:test';
import assert from 'node:assert/strict';
import { SHEET_CONFIG } from './config.ts';
import { makeGray, type Gray } from './image.ts';
import { parseFormSheet, quantile, readFormSheet, SIDE } from './sheet.ts';

/**
 * 버블 채점. 여기서 틀리면 두 방향으로 다치는데 무게가 다르다.
 *
 *  - 못 읽으면 → 사용자가 한 장 더 찍는다. 성가시지만 회복된다.
 *  - 잘못 읽으면 → 약이 든 기계로 틀린 일정이 간다. 회복되지 않는다.
 *
 * 그래서 시험도 "읽어내는가" 보다 **"모를 때 모른다고 하는가"** 쪽에 무게를 둔다.
 */

const { half_width: HW, half_height: HH } = SHEET_CONFIG;

/** 버블 하나를 `frac` 만큼 칠한다 (판독기가 표본하는 12×18 상자 기준). */
function mark(bin: Gray, group: string, key: string, frac: number): void {
  const [cx, cy] = SHEET_CONFIG.groups[group].bubbles[key];
  const total = 2 * HW * 2 * HH;
  let want = Math.round(frac * total);
  for (let y = cy - HH; y < cy + HH && want > 0; y++) {
    for (let x = cx - HW; x < cx + HW && want > 0; x++, want--) bin.d[y * SIDE + x] = 255;
  }
}

function blank(): Gray {
  return makeGray(SIDE, SIDE); // 0 = 종이
}

test('표시한 대로 읽는다', () => {
  const bin = blank();
  mark(bin, 'layer', '3', 0.9);
  for (const d of ['MON', 'WED', 'FRI']) mark(bin, 'days', d, 0.9);
  mark(bin, 'duration', '30d', 0.9);
  mark(bin, 'hour', '8', 0.9);

  const r = readFormSheet(bin);
  assert.deepEqual(r.values, { layer: '3', days: ['MON', 'WED', 'FRI'], duration: '30d', hour: '8' });
  assert.deepEqual(r.problems, []);
  assert.ok(r.ok);
});

test('요일은 점수 순이 아니라 주 순서로 나온다', () => {
  const bin = blank();
  mark(bin, 'days', 'SUN', 0.95);
  mark(bin, 'days', 'MON', 0.6);
  const r = readFormSheet(bin);
  assert.deepEqual(r.values.days, ['MON', 'SUN']);
});

test('빈 시트는 읽었다고 하지 않는다', () => {
  const r = readFormSheet(blank());
  assert.deepEqual(r.values, { layer: null, days: [], duration: null, hour: null });
  assert.equal(r.problems.length, 4);
  assert.ok(r.problems.every((p) => p.endsWith('nothing filled')));
});

test('한 무리에 둘을 칠하면 고르지 않고 되묻는다', () => {
  // 한 칸을 칠했다가 마음을 바꿔 지우지 않고 다른 칸을 칠한 시트. 펜이 더 많이 덮은
  // 쪽을 고르면 그럴듯하게 틀린다 — 어느 쪽이었는지는 쓴 사람만 안다.
  const bin = blank();
  mark(bin, 'duration', '7d', 0.9);
  mark(bin, 'duration', '90d', 0.75);
  const r = readFormSheet(bin);
  assert.equal(r.values.duration, null);
  assert.ok(r.problems.some((p) => p.includes('two boxes filled')));
});

test('간격이 좁으면 고르지 않는다', () => {
  const bin = blank();
  mark(bin, 'layer', '5', 0.34);
  mark(bin, 'layer', '6', 0.28);
  const r = readFormSheet(bin);
  assert.equal(r.values.layer, null);
  assert.ok(r.problems.some((p) => p.includes('ambiguous')));
});

test('요일이 애매하면 표시해 둔다', () => {
  const bin = blank();
  mark(bin, 'days', 'TUE', 0.9);
  mark(bin, 'days', 'THU', 0.26); // abs_min 0.3 과 margin 0.08 사이
  const r = readFormSheet(bin);
  assert.deepEqual(r.values.days, ['TUE']);
  assert.ok(r.problems.some((p) => p.includes('borderline') && p.includes('THU')));
});

test('장마다 스스로 보정한다 — 종이가 진해도 답이 같다', () => {
  // 인쇄된 테두리도 잉크다. 고정 컷오프는 "칠해졌나" 가 아니라 "보정하던 날의
  // 테두리보다 진한가" 를 재게 된다. 종이·프린터·조명이 바뀌면 그 컷오프가 발밑에서
  // 흘러간다.
  //
  // 여기서는 모든 버블이 절대 임계값(0.3)을 **넘는** 0.35 로 읽히게 해 둔다.
  // 보정이 없으면 44개가 전부 "칠해짐" 이 되어 모든 무리가 무너진다.
  const bin = blank();
  for (const [name, g] of Object.entries(SHEET_CONFIG.groups)) {
    for (const key of Object.keys(g.bubbles)) mark(bin, name, key, 0.35);
  }
  mark(bin, 'layer', '2', 0.9);
  for (const d of ['TUE', 'THU']) mark(bin, 'days', d, 0.9);
  mark(bin, 'duration', 'ongoing', 0.9);
  mark(bin, 'hour', '19', 0.9);

  const r = readFormSheet(bin);
  assert.ok(r.baseline > 0.3, `기준선이 종이를 따라가지 않았다: ${r.baseline}`);
  assert.deepEqual(r.values, { layer: '2', days: ['TUE', 'THU'], duration: 'ongoing', hour: '19' });
  assert.deepEqual(r.problems, []);
});

test('numpy 와 같은 분위수', () => {
  assert.equal(quantile([0, 1, 2, 3], 0.25), 0.75);
  assert.equal(quantile([5], 0.25), 5);
  assert.equal(quantile([], 0.25), 0);
});

test('종이를 못 찾으면 예외가 아니라 결과로 알린다', () => {
  // 카메라를 아무 데나 들이대는 것은 평범한 일이다. 그 경우만 예외로 도착하게
  // 만들면 언젠가 아무도 처리하지 않는 갈래가 된다.
  const noise = makeGray(300, 400);
  noise.d.fill(200);
  const r = parseFormSheet(noise);
  assert.equal(r.foundPage, false);
  assert.equal(r.ok, false);
  assert.deepEqual(r.values, { layer: null, days: [], duration: null, hour: null });
  assert.ok(r.problems[0].startsWith('could not locate the sheet'));
});
