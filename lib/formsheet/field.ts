import type { FieldRect } from './config.ts';
import { invert3, type Mat3 } from './homography.ts';
import { makeGray, type Gray } from './image.ts';
import { warpPerspective } from './warp.ts';

/**
 * 손으로 쓴 칸을 **원본 사진의 해상도로** 잘라낸다.
 *
 * 왜 정규 격자에서 자르면 안 되는가
 * ---------------------------------
 * 버블 판독은 1000×1000 정규 격자에서 한다. 버블은 "채웠나" 만 보면 되고, 그 물음에는
 * 정규 격자가 넉넉하다.
 *
 * 이름칸은 다르다. 정규 좌표로 28행뿐이라 — A5 에서 4.7mm 다 — 그 격자에서 잘라낸
 * 그림은 어떤 OCR 도 못 읽는다. 워프가 정보를 버리는 것이 아니라, 우리가 1000 을
 * 골라 놓고 그 안에서 읽으려 하는 것이 문제다.
 *
 * 그래서 이 함수는 **원본 → 정규 변환을 거꾸로 써서** 그 칸이 사진의 어디였는지를
 * 찾고, 거기서 바로 편다. 폰으로 A5 를 찍으면 1mm 가 25px 쯤이라 그 4.7mm 띠는
 * 120px 이 넘는다. 같은 사진, 같은 변환, 다른 배율일 뿐이다.
 *
 * 배율을 부르는 쪽이 정하지 않는다
 * --------------------------------
 * `scale` 은 "정규 좌표 1 단위를 몇 픽셀로 펼 것인가" 다. 기본값 4 면 이름칸이
 * 3712×112 가 되는데, 이것은 종이의 실제 해상도와 무관한 **목표 크기**다. 원본이
 * 그보다 성기면 늘어난 그림이 되고 — 늘려도 없는 획이 생기지는 않지만 — OCR 은
 * 작은 글자보다 흐린 큰 글자를 낫게 읽는다. 원본이 더 촘촘하면 줄어들면서 잡음이
 * 같이 줄어든다. 어느 쪽이든 **크기가 일정하다**는 것이 중요하다: OCR 은 글자
 * 높이에 민감하고, 사진마다 다른 크기를 던지면 잘 읽히는 날과 아닌 날이 생긴다.
 */
export function cropField(
  src: Gray,
  /** 원본 → 1000×1000 정규 좌표 변환. `estimatePageHomography` 가 준 것. */
  M: Mat3,
  rect: FieldRect,
  scale = 4,
): Gray {
  const [x0, y0, x1, y1] = rect;
  const w = Math.max(1, Math.round((x1 - x0) * scale));
  const h = Math.max(1, Math.round((y1 - y0) * scale));

  /*
    원본 → 칸 변환을 한 번에 만든다.

    두 단계로 나눌 수도 있다(원본 → 정규 → 칸). 그러면 정규 격자를 한 번 거치면서
    거기서 잃은 해상도가 그대로 남는다 — 이 파일이 있는 이유가 그것을 안 거치는
    것이다. 행렬 곱 하나로 붙이면 표본은 원본에서 한 번만 뜬다.
  */
  const T = Float64Array.from([
    scale, 0, -x0 * scale,
    0, scale, -y0 * scale,
    0, 0, 1,
  ]) as unknown as Mat3;
  return warpPerspective(src, mul3(T, M), w, h, 'bilinear');
}

/** `A · B`. 두 변환을 하나로. */
function mul3(a: Mat3, b: Mat3): Mat3 {
  const out = new Float64Array(9) as unknown as Mat3;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return out;
}

/**
 * OCR 에 넘기기 전에 손보는 것.
 *
 * 두 가지만 한다. **밑줄 지우기**와 **대비 올리기**.
 *
 * 밑줄은 인쇄된 것이라 어느 사진에나 있고, 글자 바닥에 붙은 긴 가로선은 OCR 이
 * 글자의 일부로 읽는다 — `amoxicillin` 이 `arnoxicillin` 이 되는 것보다 나쁘게,
 * 글자가 통째로 하나로 뭉친다. 잘라낸 칸 안에서 밑줄은 **폭의 대부분을 차지하는
 * 어두운 행**이라 알아보기 쉽고, 그런 행은 글자에서 나올 수 없다.
 *
 * 대비는 Otsu 로 문턱을 잡아 흑백으로 만든다. 손으로 쓴 연필과 볼펜은 종이보다
 * 조금 어두울 뿐이고, 그 조금을 남겨 두면 OCR 이 종이의 결을 글자로 읽는다.
 */
export function forOcr(crop: Gray): Gray {
  const { w, h, d } = crop;
  const out = makeGray(w, h);
  // `<=` 다. Otsu 가 돌려주는 것은 **어두운 무리에 들어가는 마지막 값**이라,
  // `<` 로 쓰면 문턱 자신이 밝은 쪽으로 넘어간다 — 값이 두 봉우리에 몰려 있는
  // 흑백 그림에서는 그 한 칸이 어두운 무리를 통째로 잃는다는 뜻이다.
  const t = otsu(d);
  for (let i = 0; i < d.length; i++) out.d[i] = d[i] <= t ? 0 : 255;

  // 폭의 70% 넘게 검은 행은 인쇄된 밑줄이다. 글자는 그렇게 넓을 수 없다 —
  // 이 칸은 한 줄짜리라 어떤 글자도 칸을 가로지르지 않는다.
  for (let y = 0; y < h; y++) {
    let dark = 0;
    for (let x = 0; x < w; x++) if (out.d[y * w + x] === 0) dark++;
    if (dark > w * 0.7) for (let x = 0; x < w; x++) out.d[y * w + x] = 255;
  }
  return out;
}

/**
 * Otsu — 두 무리로 갈랐을 때 무리 사이 분산이 가장 큰 문턱.
 *
 * 돌려주는 값은 **어두운 무리에 들어가는 마지막 밝기**다. 부르는 쪽은 `<=` 로 갈라야
 * 하고, `<` 로 가르면 문턱 자신이 밝은 쪽으로 넘어간다.
 */
export function otsu(d: Uint8Array | Uint8ClampedArray | number[]): number {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < d.length; i++) hist[d[i]]++;
  const total = d.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];

  let sumB = 0;
  let wB = 0;
  let best = 0;
  let at = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; at = t; }
  }
  return at;
}

/**
 * 같은 종이를 **다른 배율로 디코드한 사진**에 맞게 변환을 옮긴다.
 *
 * 버블은 2000px 로 줄인 그림에서 읽는다 — 마커 무늬가 60px 로 잡히고 그것으로
 * 충분하며, 윤곽선 추적이 화소 수에 비례하기 때문이다. 그런데 이름칸은 종이의
 * 4.7mm 라 그 배율에서는 글자가 남지 않는다.
 *
 * 마커를 다시 찾을 이유는 없다. 같은 사진이고 같은 종이라 변환은 **배율만** 다르다.
 * `k` 는 새 그림이 옛 그림의 몇 배인가다.
 */
export function scaleTransform(M: Mat3, k: number): Mat3 {
  const S = Float64Array.from([1 / k, 0, 0, 0, 1 / k, 0, 0, 0, 1]) as unknown as Mat3;
  return mul3(M, S);
}

/** 역행렬이 필요한 곳을 위해 다시 내보낸다 — 이 파일이 유일한 사용처다. */
export { invert3 };
