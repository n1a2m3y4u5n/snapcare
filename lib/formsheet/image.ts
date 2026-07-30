/**
 * 회색조 이미지 한 장과, 그 위에서 도는 연산 몇 개.
 *
 * 폼시트 판독을 브라우저로 옮기면서 필요해진 것들이다. 파이썬 쪽은 OpenCV 를 부르면
 * 끝났지만 여기서는 opencv.js(wasm 8MB) 를 더 얹는 대신 쓰는 함수만 옮겨 적었다 —
 * 이 파일이 쓰는 것은 가우시안 흐림, 적응형 이진화, 라플라시안 분산, 원근 워프,
 * 오츠 임계값이 전부다. 다섯 개를 위해 8MB 를 더 받게 하고 싶지 않았다.
 *
 * OpenCV 와 같은 답을 내는 것이 목표라서 세부를 맞췄다 — 커널 계수, 가장자리 처리
 * 방식, 반올림 지점까지. 어긋나면 파이썬으로 보정한 버블 좌표가 조금씩 빗나가고,
 * 그것은 "안 읽힌다" 가 아니라 **옆 칸을 읽는다** 로 나타난다.
 */

/** 한 픽셀 한 바이트. */
export interface Gray {
  readonly w: number;
  readonly h: number;
  readonly d: Uint8ClampedArray;
}

export type Border = 'reflect101' | 'replicate';

export function makeGray(w: number, h: number): Gray {
  return { w, h, d: new Uint8ClampedArray(w * h) };
}

/**
 * RGBA(캔버스에서 나오는 그대로) → 회색조.
 * 계수는 OpenCV COLOR_BGR2GRAY 와 같은 BT.601 이다.
 */
export function grayFromRGBA(rgba: Uint8ClampedArray, w: number, h: number): Gray {
  const d = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; i < d.length; i++, p += 4) {
    d[i] = (rgba[p] * 0.299 + rgba[p + 1] * 0.587 + rgba[p + 2] * 0.114 + 0.5) | 0;
  }
  return { w, h, d };
}

// ── 가장자리 처리 ───────────────────────────────────────────────────────────

function clampIdx(i: number, n: number, border: Border): number {
  if (i >= 0 && i < n) return i;
  if (border === 'replicate') return i < 0 ? 0 : n - 1;
  // reflect101: 가장자리 픽셀을 겹치지 않고 되접는다 (OpenCV 의 기본값).
  let v = i;
  while (v < 0 || v >= n) v = v < 0 ? -v : 2 * (n - 1) - v;
  return v;
}

// ── 가우시안 ────────────────────────────────────────────────────────────────

/**
 * OpenCV getGaussianKernel 과 같은 계수.
 *
 * 작은 홀수 크기에 sigma 를 안 주면 OpenCV 는 계산식이 아니라 **표에 박아 둔 값**을
 * 쓴다. GaussianBlur(img, (5,5), 0) 이 정확히 그 경우라, 식으로 만든 커널을 쓰면
 * 미세하게 다른 그림이 나온다.
 */
export function gaussianKernel(ksize: number, sigma = 0): Float64Array {
  const SMALL: Record<number, number[]> = {
    1: [1],
    3: [0.25, 0.5, 0.25],
    5: [0.0625, 0.25, 0.375, 0.25, 0.0625],
    7: [0.03125, 0.109375, 0.21875, 0.28125, 0.21875, 0.109375, 0.03125],
  };
  if (sigma <= 0 && ksize <= 7 && ksize % 2 === 1) return Float64Array.from(SMALL[ksize]);

  const s = sigma > 0 ? sigma : 0.3 * ((ksize - 1) * 0.5 - 1) + 0.8;
  const scale = -0.5 / (s * s);
  const k = new Float64Array(ksize);
  let sum = 0;
  for (let i = 0; i < ksize; i++) {
    const t = i - (ksize - 1) * 0.5;
    k[i] = Math.exp(scale * t * t);
    sum += k[i];
  }
  for (let i = 0; i < ksize; i++) k[i] /= sum;
  return k;
}

/** 분리형 가우시안. 가로 한 번, 세로 한 번 — 커널이 51 이어도 O(w·h·k) 로 끝난다. */
export function blurGaussian(g: Gray, ksize: number, sigma = 0, border: Border = 'reflect101'): Float64Array {
  const k = gaussianKernel(ksize, sigma);
  const r = (ksize - 1) >> 1;
  const { w, h, d } = g;
  const tmp = new Float64Array(w * h);
  const out = new Float64Array(w * h);

  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = 0; i < ksize; i++) acc += k[i] * d[row + clampIdx(x + i - r, w, border)];
      tmp[row + x] = acc;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let acc = 0;
      for (let i = 0; i < ksize; i++) acc += k[i] * tmp[clampIdx(y + i - r, h, border) * w + x];
      out[y * w + x] = acc;
    }
  }
  return out;
}

// ── 적응형 이진화 ───────────────────────────────────────────────────────────

/**
 * 적응형 이진화(가우시안 평균), THRESH_BINARY_INV. 잉크 = 255, 종이 = 0.
 *
 * 전역 임계값을 못 쓰는 이유는 파이썬 쪽 주석에 있다 — 폰으로 찍은 평평한 종이는
 * 절대 고르게 밝지 않다. 램프 쪽은 밝고 찍는 사람 쪽은 그늘이라, 하나의 컷오프는
 * 그 기울기를 "왼쪽은 전부 칠해졌다" 로 바꿔 놓는다.
 *
 * OpenCV 는 이 안쪽 흐림에 BORDER_REPLICATE 를 쓴다 (바깥쪽 GaussianBlur 의 기본값과
 * 다르다). 가장자리 버블이 여기에 걸린다.
 */
export function adaptiveThresholdGaussian(g: Gray, blockSize: number, C: number): Gray {
  const mean = blurGaussian(g, blockSize, 0, 'replicate');
  const out = new Uint8ClampedArray(g.w * g.h);
  // OpenCV 는 평균을 uchar 로 반올림한 뒤 비교한다. BINARY_INV 의 delta 는 내림이다.
  const delta = Math.floor(C);
  for (let i = 0; i < out.length; i++) {
    const m = Math.max(0, Math.min(255, Math.round(mean[i])));
    out[i] = g.d[i] - m <= -delta ? 255 : 0;
  }
  return { w: g.w, h: g.h, d: out };
}

/**
 * 적응형 이진화(상자 평균), THRESH_BINARY_INV. 적분영상이라 창 크기와 무관하게 O(w·h).
 * ArUco 검출이 창 크기 셋을 훑으므로 이쪽은 속도가 중요하다.
 */
export function adaptiveThresholdMean(g: Gray, blockSize: number, C: number): Gray {
  const { w, h, d } = g;
  const r = (blockSize - 1) >> 1;
  // 적분영상 (w+1)×(h+1)
  const S = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += d[y * w + x];
      S[(y + 1) * (w + 1) + (x + 1)] = S[y * (w + 1) + (x + 1)] + rowSum;
    }
  }
  const out = new Uint8ClampedArray(w * h);
  const delta = Math.floor(C);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w - 1, x + r);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum = S[(y1 + 1) * (w + 1) + (x1 + 1)] - S[y0 * (w + 1) + (x1 + 1)]
        - S[(y1 + 1) * (w + 1) + x0] + S[y0 * (w + 1) + x0];
      const m = Math.round(sum / area);
      out[y * w + x] = d[y * w + x] - m <= -delta ? 255 : 0;
    }
  }
  return { w, h, d: out };
}

// ── 품질 지표 ───────────────────────────────────────────────────────────────

/** 라플라시안의 분산 — 흔한 초점 흐림 지표. cv2.Laplacian(gray, CV_64F).var() 와 같다. */
export function laplacianVariance(g: Gray): number {
  const { w, h, d } = g;
  const n = w * h;
  let sum = 0;
  let sumSq = 0;
  for (let y = 0; y < h; y++) {
    const ym = clampIdx(y - 1, h, 'reflect101') * w;
    const yp = clampIdx(y + 1, h, 'reflect101') * w;
    const yc = y * w;
    for (let x = 0; x < w; x++) {
      const xm = clampIdx(x - 1, w, 'reflect101');
      const xp = clampIdx(x + 1, w, 'reflect101');
      const v = d[ym + x] + d[yp + x] + d[yc + xm] + d[yc + xp] - 4 * d[yc + x];
      sum += v;
      sumSq += v * v;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export function meanLuma(g: Gray): number {
  let sum = 0;
  for (let i = 0; i < g.d.length; i++) sum += g.d[i];
  return sum / g.d.length;
}

/** 오츠 임계값. 히스토그램 하나면 되므로 작은 조각에 쓰기 좋다. */
export function otsu(d: Uint8ClampedArray): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < d.length; i++) hist[d[i]]++;
  const total = d.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];

  let sumB = 0;
  let wB = 0;
  let best = 0;
  let bestT = 0;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      bestT = t;
    }
  }
  return bestT;
}

/** 표준편차 — ArUco 후보가 그냥 균일한 얼룩인지 거르는 데 쓴다. */
export function stdDev(d: Uint8ClampedArray): number {
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < d.length; i++) {
    sum += d[i];
    sumSq += d[i] * d[i];
  }
  const mean = sum / d.length;
  return Math.sqrt(Math.max(0, sumSq / d.length - mean * mean));
}
