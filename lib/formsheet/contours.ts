/**
 * 이진 영상에서 바깥 경계를 따고, 그것을 다각형으로 줄인다.
 *
 * ArUco 마커를 찾는 첫 단계다. OpenCV 의 findContours + approxPolyDP 자리인데,
 * 여기서 필요한 것은 **바깥 경계뿐**이라 무어 이웃 추적으로 충분하다.
 */
import type { Gray } from './image.ts';
import type { Pt } from './homography.ts';

// 시계 방향(화면 기준 — y 가 아래로 간다): E, SE, S, SW, W, NW, N, NE
const DX = [1, 1, 0, -1, -1, -1, 0, 1];
const DY = [0, 1, 1, 1, 0, -1, -1, -1];

/**
 * 잉크(255) 덩어리들의 바깥 경계를 순서대로 돌려준다.
 *
 * 시작점은 "전경이면서 위가 배경인" 화소로 잡는다. 구멍의 안쪽 경계도 같은 조건에
 * 걸릴 수 있지만(도넛의 아래쪽 안쪽 테두리), 그쪽은 사각형으로 근사되지 않거나
 * 뒤에서 같은 id 의 더 큰 후보에 밀린다.
 */
export function findOuterContours(bin: Gray, minPoints = 8, maxPoints = 1 << 20): Pt[][] {
  const { w, h, d } = bin;
  const seen = new Uint8Array(w * h);
  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x];

  const out: Pt[][] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i] !== 255 || seen[i] || at(x, y - 1) === 255) continue;

      const pts: Pt[] = [];
      let cx = x;
      let cy = y;
      let back = 4; // 서쪽에서 들어온 것으로 친다
      const startKey = i;
      let steps = 0;
      for (;;) {
        seen[cy * w + cx] = 1;
        pts.push({ x: cx, y: cy });
        let found = -1;
        for (let k = 1; k <= 8; k++) {
          const dir = (back + k) % 8;
          if (at(cx + DX[dir], cy + DY[dir]) === 255) {
            found = dir;
            break;
          }
        }
        if (found < 0) break; // 외톨이 화소
        cx += DX[found];
        cy += DY[found];
        back = (found + 4) % 8;
        if (cy * w + cx === startKey) break;
        if (++steps > maxPoints) break; // 병적인 모양에 대한 안전장치
      }
      if (pts.length >= minPoints) out.push(pts);
    }
  }
  return out;
}

function perpDistSq(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return (p.x - a.x) ** 2 + (p.y - a.y) ** 2;
  const cross = (p.x - a.x) * dy - (p.y - a.y) * dx;
  return (cross * cross) / len2;
}

/** 열린 구간 [first, last] 에 대한 더글러스-포이커. keep 에 표시한다. */
function dp(pts: Pt[], first: number, last: number, epsSq: number, keep: Uint8Array): void {
  const stack: [number, number][] = [[first, last]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    if (b <= a + 1) continue;
    let worst = -1;
    let worstD = epsSq;
    for (let i = a + 1; i < b; i++) {
      const dist = perpDistSq(pts[i], pts[a], pts[b]);
      if (dist > worstD) {
        worstD = dist;
        worst = i;
      }
    }
    if (worst < 0) continue;
    keep[worst] = 1;
    stack.push([a, worst], [worst, b]);
  }
}

/**
 * 닫힌 윤곽선의 다각형 근사.
 *
 * 닫힌 곡선에는 시작점이 없으므로 가장 멀리 떨어진 두 점을 먼저 찾아 두 개의 열린
 * 사슬로 자른 뒤 각각 줄인다. 아무 점에서나 시작하면 그 점 근처의 꼭짓점이 사라진다.
 */
export function approxPolyDPClosed(pts: Pt[], eps: number): Pt[] {
  const n = pts.length;
  if (n < 3) return pts.slice();

  const farthest = (from: Pt): number => {
    let bi = 0;
    let bd = -1;
    for (let i = 0; i < n; i++) {
      const dist = (pts[i].x - from.x) ** 2 + (pts[i].y - from.y) ** 2;
      if (dist > bd) {
        bd = dist;
        bi = i;
      }
    }
    return bi;
  };
  const i1 = farthest(pts[0]);
  const i2 = farthest(pts[i1]);
  const [a, b] = i1 < i2 ? [i1, i2] : [i2, i1];

  const keep = new Uint8Array(n);
  keep[a] = 1;
  keep[b] = 1;
  const epsSq = eps * eps;
  dp(pts, a, b, epsSq, keep);

  // 두 번째 사슬은 b → n-1 → 0 → a 로 감기므로 회전시켜 편다.
  const wrapped = pts.slice(b).concat(pts.slice(0, a + 1));
  const wrapKeep = new Uint8Array(wrapped.length);
  wrapKeep[0] = 1;
  wrapKeep[wrapped.length - 1] = 1;
  dp(wrapped, 0, wrapped.length - 1, epsSq, wrapKeep);
  for (let i = 1; i < wrapped.length - 1; i++) {
    if (wrapKeep[i]) keep[(b + i) % n] = 1;
  }

  const out: Pt[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

export function perimeter(pts: Pt[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return sum;
}

export function isConvex(q: Pt[]): boolean {
  let sign = 0;
  for (let i = 0; i < q.length; i++) {
    const a = q[i];
    const b = q[(i + 1) % q.length];
    const c = q[(i + 2) % q.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross === 0) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return sign !== 0;
}

/** 화면 기준 시계 방향으로 정렬한다 (y 가 아래로 가는 좌표계). */
export function toClockwise(q: Pt[]): Pt[] {
  const cross = (q[1].x - q[0].x) * (q[2].y - q[0].y) - (q[1].y - q[0].y) * (q[2].x - q[0].x);
  return cross < 0 ? [q[0], q[3], q[2], q[1]] : q.slice();
}
