/**
 * 원근 워프 — 비스듬히 찍힌 종이를 정면에서 본 격자로 편다.
 *
 * 목적지 픽셀마다 역행렬로 원본 좌표를 찾아 표본을 뜬다(역사상). 순방향으로 뿌리면
 * 구멍이 생긴다.
 */
import { invert3, type Mat3 } from './homography.ts';
import { makeGray, type Gray } from './image.ts';

export type Interp = 'nearest' | 'bilinear';

/** `M` 은 원본 → 목적지 변환이다 (OpenCV warpPerspective 와 같은 방향). */
export function warpPerspective(
  src: Gray,
  M: Mat3,
  dw: number,
  dh: number,
  interp: Interp = 'bilinear',
): Gray {
  const I = invert3(M);
  const out = makeGray(dw, dh);
  const { w, h, d } = src;

  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const wz = I[6] * x + I[7] * y + I[8];
      if (wz === 0) continue;
      const sx = (I[0] * x + I[1] * y + I[2]) / wz;
      const sy = (I[3] * x + I[4] * y + I[5]) / wz;

      if (interp === 'nearest') {
        const ix = Math.round(sx);
        const iy = Math.round(sy);
        // 범위 밖은 0 으로 둔다 (BORDER_CONSTANT — OpenCV 의 기본값).
        if (ix >= 0 && ix < w && iy >= 0 && iy < h) out.d[y * dw + x] = d[iy * w + ix];
        continue;
      }

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      if (x0 < 0 || y0 < 0 || x0 + 1 >= w || y0 + 1 >= h) {
        // 가장자리에서는 가장 가까운 화소로 떨어진다 — 종이는 프레임 안이므로
        // 버블이 여기 걸릴 일은 없고, 마커의 바깥 한 줄만 이 경로를 탄다.
        const ix = Math.max(0, Math.min(w - 1, Math.round(sx)));
        const iy = Math.max(0, Math.min(h - 1, Math.round(sy)));
        out.d[y * dw + x] = d[iy * w + ix];
        continue;
      }
      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = y0 * w + x0;
      const top = d[i00] * (1 - fx) + d[i00 + 1] * fx;
      const bot = d[i00 + w] * (1 - fx) + d[i00 + w + 1] * fx;
      out.d[y * dw + x] = (top * (1 - fy) + bot * fy + 0.5) | 0;
    }
  }
  return out;
}
