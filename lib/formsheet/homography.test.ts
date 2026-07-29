import test from 'node:test';
import assert from 'node:assert/strict';
import { applyH, findHomography, invert3, residuals, type Pt } from './homography.ts';

/**
 * 이 행렬이 조금 틀리면 판독기는 실패하지 않는다 — 버블 지도를 통째로 밀어 놓고
 * **옆 칸을 읽는다.** 그래서 여기서는 "대충 맞는다" 가 아니라 잔차를 잰다.
 */

const H: Float64Array = new Float64Array([
  1.2, 0.15, -30,
  -0.08, 1.05, 20,
  0.00021, -0.00013, 1,
]);

const CORNERS: Pt[] = [
  { x: 0, y: 0 }, { x: 999, y: 0 }, { x: 999, y: 999 }, { x: 0, y: 999 },
];

test('네 점이면 정확히 복원한다', () => {
  const dst = CORNERS.map((p) => applyH(H, p));
  const M = findHomography(CORNERS, dst);
  assert.ok(M);
  for (const r of residuals(M, CORNERS, dst)) assert.ok(r < 1e-6, `잔차 ${r}`);
});

test('점이 많아도 최소제곱이 무너지지 않는다', () => {
  // 폼시트는 마커 넷 × 꼭짓점 넷 = 열여섯 점으로 맞춘다.
  const src: Pt[] = [];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) src.push({ x: 100 + i * 260, y: 80 + j * 270 });
  }
  const dst = src.map((p) => applyH(H, p));
  const M = findHomography(src, dst)!;
  assert.ok(Math.max(...residuals(M, src, dst)) < 1e-6);
});

test('네 점뿐이면 어긋난 점도 그대로 삼킨다', () => {
  // 호모그래피의 자유도는 8, 대응점 넷이 주는 식도 8 이다. 남는 것이 없으니 넷 중
  // 하나를 옮겨도 잔차는 0 이다 — **거짓말이 잔차에 안 보인다.**
  //
  // 그래서 종이를 맞출 때 마커 셋(열두 점)을 요구한다. 넷을 잘 맞추는 문제가 아니라,
  // 틀렸을 때 틀렸다고 말해 줄 여분이 있느냐의 문제다.
  const dst = CORNERS.map((p) => applyH(H, p));
  dst[2] = { x: dst[2].x + 25, y: dst[2].y - 25 };
  const M = findHomography(CORNERS, dst)!;
  assert.ok(Math.max(...residuals(M, CORNERS, dst)) < 1e-6);
});

test('점이 남아돌면 어긋난 점이 잔차에 드러난다', () => {
  // 마커 셋 이상일 때의 실제 상황. 거부의 근거가 되는 성질이라 조용히 흡수하면 안 된다.
  const src: Pt[] = [];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) src.push({ x: 100 + i * 260, y: 80 + j * 270 });
  }
  const dst = src.map((p) => applyH(H, p));
  dst[5] = { x: dst[5].x + 40, y: dst[5].y - 40 };
  const M = findHomography(src, dst)!;
  assert.ok(Math.max(...residuals(M, src, dst)) > 5);
});

test('세 점으로는 맞추지 않는다', () => {
  assert.equal(findHomography(CORNERS.slice(0, 3), CORNERS.slice(0, 3)), null);
});

test('역행렬을 곱하면 제자리로 온다', () => {
  const I = invert3(H);
  for (const p of CORNERS) {
    const back = applyH(I, applyH(H, p));
    assert.ok(Math.hypot(back.x - p.x, back.y - p.y) < 1e-6);
  }
});
