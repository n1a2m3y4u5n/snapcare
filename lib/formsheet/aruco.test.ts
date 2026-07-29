import test from 'node:test';
import assert from 'node:assert/strict';
import { detectMarkers } from './aruco.ts';
import { makeGray, type Gray } from './image.ts';
import { applyH, type Mat3, type Pt } from './homography.ts';
import { warpPerspective } from './warp.ts';

/**
 * 마커 방향이 이 판독기에서 가장 조용한 실패 지점이다.
 *
 * 검출기가 돌려주는 꼭짓점은 **마커 자신의 좌상단**부터 시계 방향이어야 한다. 그
 * 기준이 마커의 무늬에 매여 있기 때문에 종이를 거꾸로 놓고 찍어도 정규 좌표로 펴면
 * 바로 선다. 시작점을 한 칸 어긋나게 잡으면 오류가 나지 않는다 — 버블 지도가 90°
 * 돌아간 채로 그럴듯한 다른 일정이 읽힌다.
 *
 * 그래서 여기서는 마커를 직접 그려 놓고 화면을 돌려 가며 확인한다. 합성 사진이나
 * OpenCV 없이 도는 시험이라 CI 에서도 그대로 돈다.
 */

// aruco.ts 와 같은 값을 일부러 다시 적는다 — 한쪽을 잘못 고치면 여기서 걸린다.
const BITS = [
  '1011010100110010',
  '0000111110011010',
  '0011001100101101',
  '1001100101000110',
];

const CELL = 12;
const MARGIN = 40;
const SIDE = MARGIN * 2 + CELL * 6;

/** 6×6 칸(테두리 한 줄 + 무늬 4×4)을 흰 종이 위에 그린다. 좌상단은 (MARGIN, MARGIN). */
function drawMarker(id: number): Gray {
  const g = makeGray(SIDE, SIDE);
  g.d.fill(255);
  for (let cy = 0; cy < 6; cy++) {
    for (let cx = 0; cx < 6; cx++) {
      const border = cx === 0 || cy === 0 || cx === 5 || cy === 5;
      const white = border ? false : BITS[id][(cy - 1) * 4 + (cx - 1)] === '1';
      if (white) continue;
      for (let y = 0; y < CELL; y++) {
        const row = (MARGIN + cy * CELL + y) * SIDE + MARGIN + cx * CELL;
        for (let x = 0; x < CELL; x++) g.d[row + x] = 0;
      }
    }
  }
  return g;
}

/** 화면을 시계 방향 90°. (x, y) → (S-1-y, x) */
function rotate90(g: Gray): Gray {
  const out = makeGray(g.h, g.w);
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) out.d[x * g.h + (g.h - 1 - y)] = g.d[y * g.w + x];
  }
  return out;
}

function near(a: Pt, b: Pt, tol: number): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= tol;
}

test('네 마커를 각각 알아본다', () => {
  for (let id = 0; id < 4; id++) {
    const found = detectMarkers(drawMarker(id));
    assert.deepEqual([...found.keys()], [id], `id ${id}`);
  }
});

test('꼭짓점은 마커 자신의 좌상단에서 시계 방향으로 시작한다', () => {
  const found = detectMarkers(drawMarker(2));
  const c = found.get(2)!;
  assert.equal(c.length, 4);
  const tl = { x: MARGIN, y: MARGIN };
  const tr = { x: MARGIN + CELL * 6 - 1, y: MARGIN };
  const br = { x: MARGIN + CELL * 6 - 1, y: MARGIN + CELL * 6 - 1 };
  const bl = { x: MARGIN, y: MARGIN + CELL * 6 - 1 };
  assert.ok(near(c[0], tl, 2), `0번이 좌상단이 아니다: ${JSON.stringify(c[0])}`);
  assert.ok(near(c[1], tr, 2), `1번이 우상단이 아니다: ${JSON.stringify(c[1])}`);
  assert.ok(near(c[2], br, 2), `2번이 우하단이 아니다: ${JSON.stringify(c[2])}`);
  assert.ok(near(c[3], bl, 2), `3번이 좌하단이 아니다: ${JSON.stringify(c[3])}`);
});

test('화면을 돌려도 마커 자신의 좌상단을 따라간다', () => {
  // 종이를 거꾸로 놓고 찍은 장이 여기에 걸린다. 방향을 잘못 잡으면 검출은 그대로
  // 성공하고 버블 지도만 90° 돌아간다 — 오류 없이 다른 일정이 나온다.
  let img = drawMarker(1);
  let tl: Pt = { x: MARGIN, y: MARGIN };
  for (let turn = 0; turn < 4; turn++) {
    const found = detectMarkers(img);
    const c = found.get(1);
    assert.ok(c, `${turn * 90}° 에서 마커를 놓쳤다`);
    assert.ok(near(c[0], tl, 2.5), `${turn * 90}° 에서 좌상단이 어긋났다: ${JSON.stringify(c[0])}`);
    img = rotate90(img);
    tl = { x: img.w - 1 - tl.y, y: tl.x };
  }
});

test('비스듬히 찍혀도 알아본다', () => {
  const H: Mat3 = new Float64Array([
    1.0, 0.13, 6,
    -0.06, 0.95, 14,
    0.00016, -0.00009, 1,
  ]);
  const warped = warpPerspective(drawMarker(3), H, SIDE + 40, SIDE + 40, 'bilinear');
  const c = detectMarkers(warped).get(3);
  assert.ok(c, '원근이 들어가자 마커를 놓쳤다');
  assert.ok(near(c[0], applyH(H, { x: MARGIN, y: MARGIN }), 3));
});

test('마커가 아닌 네모는 받지 않는다', () => {
  // 테두리는 검은데 속이 사전에 없는 무늬 — 표에 없으면 고쳐 주지 않고 버린다.
  const g = drawMarker(0);
  // 무늬 한 칸을 뒤집어 사전에서 벗어나게 만든다.
  const cx = 2;
  const cy = 2;
  for (let y = 0; y < CELL; y++) {
    const row = (MARGIN + cy * CELL + y) * SIDE + MARGIN + cx * CELL;
    for (let x = 0; x < CELL; x++) g.d[row + x] = 255 - g.d[row + x];
  }
  assert.equal(detectMarkers(g).size, 0);
});
