/**
 * 평면 사영변환(호모그래피) 추정과 적용.
 *
 * 사진 좌표 → 정규 좌표(1000×1000) 로 옮기는 3×3 행렬 하나가 폼시트 판독의 전부다.
 * 이 행렬이 반 버블만큼 어긋나면 판독기는 실패하지 않는다 — **옆 칸을 읽는다.**
 * 그래서 여기서는 잔차를 반드시 함께 돌려주고, 부르는 쪽이 그것으로 거부한다.
 */

/** 행 우선 3×3. */
export type Mat3 = Float64Array;

export interface Pt {
  x: number;
  y: number;
}

export function applyH(M: Mat3, p: Pt): Pt {
  const w = M[6] * p.x + M[7] * p.y + M[8];
  return {
    x: (M[0] * p.x + M[1] * p.y + M[2]) / w,
    y: (M[3] * p.x + M[4] * p.y + M[5]) / w,
  };
}

export function invert3(M: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = M;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-15) throw new Error('행렬을 뒤집을 수 없다');
  const inv = new Float64Array(9);
  inv[0] = A / det;
  inv[1] = -(b * i - c * h) / det;
  inv[2] = (b * f - c * e) / det;
  inv[3] = B / det;
  inv[4] = (a * i - c * g) / det;
  inv[5] = -(a * f - c * d) / det;
  inv[6] = C / det;
  inv[7] = -(a * h - b * g) / det;
  inv[8] = (a * e - b * d) / det;
  return inv;
}

/** 가우스-조던 소거. n×n 정방계를 푼다. 못 풀면 null. */
function solve(A: Float64Array, b: Float64Array, n: number): Float64Array | null {
  const M = Float64Array.from(A);
  const x = Float64Array.from(b);
  for (let col = 0; col < n; col++) {
    // 부분 피벗 — 이 계는 조건수가 좋지만 공짜에 가깝다.
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r * n + col]) > Math.abs(M[piv * n + col])) piv = r;
    if (Math.abs(M[piv * n + col]) < 1e-12) return null;
    if (piv !== col) {
      for (let k = 0; k < n; k++) {
        const t = M[col * n + k];
        M[col * n + k] = M[piv * n + k];
        M[piv * n + k] = t;
      }
      const t = x[col];
      x[col] = x[piv];
      x[piv] = t;
    }
    const d = M[col * n + col];
    for (let k = col; k < n; k++) M[col * n + k] /= d;
    x[col] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r * n + col];
      if (factor === 0) continue;
      for (let k = col; k < n; k++) M[r * n + k] -= factor * M[col * n + k];
      x[r] -= factor * x[col];
    }
  }
  return x;
}

/** 하틀리 정규화 — 무게중심을 원점으로, 평균 거리를 √2 로. */
function normalizer(pts: Pt[]): { T: Mat3; out: Pt[] } {
  let cx = 0;
  let cy = 0;
  for (const p of pts) {
    cx += p.x;
    cy += p.y;
  }
  cx /= pts.length;
  cy /= pts.length;
  let dist = 0;
  for (const p of pts) dist += Math.hypot(p.x - cx, p.y - cy);
  dist /= pts.length;
  const s = dist > 1e-12 ? Math.SQRT2 / dist : 1;
  const T = new Float64Array([s, 0, -s * cx, 0, s, -s * cy, 0, 0, 1]);
  return { T, out: pts.map((p) => ({ x: (p.x - cx) * s, y: (p.y - cy) * s })) };
}

function mul3(A: Mat3, B: Mat3): Mat3 {
  const C = new Float64Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      C[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
    }
  }
  return C;
}

/**
 * 최소제곱 호모그래피 (정규화 DLT, h₈ = 1 고정).
 *
 * 특이값 분해 대신 h₈ 을 1 로 고정하고 8×8 정규방정식을 푼다. h₈ 이 0 에 가까울 때만
 * 무너지는데 그것은 상이 무한대로 가는 배치라 종이를 찍은 사진에는 없다. 하틀리
 * 정규화를 먼저 하므로 조건수도 문제가 되지 않는다.
 */
export function findHomography(src: Pt[], dst: Pt[]): Mat3 | null {
  if (src.length < 4 || src.length !== dst.length) return null;
  const ns = normalizer(src);
  const nd = normalizer(dst);
  const n = src.length;

  // 2n×8 을 정규방정식 8×8 로 접는다.
  const AtA = new Float64Array(64);
  const Atb = new Float64Array(8);
  const row = new Float64Array(8);
  for (let i = 0; i < n; i++) {
    const { x, y } = ns.out[i];
    const { x: u, y: v } = nd.out[i];
    for (const [r, target] of [
      [[x, y, 1, 0, 0, 0, -u * x, -u * y], u] as const,
      [[0, 0, 0, x, y, 1, -v * x, -v * y], v] as const,
    ]) {
      row.set(r);
      for (let a = 0; a < 8; a++) {
        Atb[a] += row[a] * target;
        for (let b = 0; b < 8; b++) AtA[a * 8 + b] += row[a] * row[b];
      }
    }
  }
  const h = solve(AtA, Atb, 8);
  if (!h) return null;

  const Hn = new Float64Array([h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1]);
  // H = T_dst⁻¹ · H_norm · T_src
  return mul3(invert3(nd.T), mul3(Hn, ns.T));
}

/** 정확히 네 점 — 최소제곱과 같은 코드로 풀린다 (해가 유일하므로 잔차 0). */
export function getPerspectiveTransform(src: Pt[], dst: Pt[]): Mat3 | null {
  return src.length === 4 ? findHomography(src, dst) : null;
}

/** 각 대응점의 재투영 오차. */
export function residuals(M: Mat3, src: Pt[], dst: Pt[]): number[] {
  return src.map((p, i) => {
    const q = applyH(M, p);
    return Math.hypot(q.x - dst[i].x, q.y - dst[i].y);
  });
}
