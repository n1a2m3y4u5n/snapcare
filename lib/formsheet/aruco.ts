/**
 * ArUco 마커 검출 — 우리가 종이에 인쇄한 넷만.
 *
 * 폼시트 네 귀퉁이에는 DICT_4X4_50 의 id 0·1·2·3 이 찍혀 있다. 사전 전체(50개)를
 * 옮길 이유가 없어서 그 넷의 비트만 들고 있는다. 덕분에 오식별 여지도 줄었다 —
 * 후보가 사전의 다른 46개 중 하나로 "고쳐질" 길이 아예 없다.
 *
 * 단계는 OpenCV 와 같다:
 *   적응형 이진화(창 크기 셋) → 바깥 윤곽선 → 사각형 후보 → 정사각형으로 펴기
 *   → 오츠 → 6×6 칸에서 비트 읽기 → 테두리 검사 → 네 방향으로 대조
 *
 * 창 크기를 셋 훑는 이유는 OpenCV 와 같다. 마커가 종이의 밝은 쪽에 있는지 그늘에
 * 있는지에 따라 잘 잡히는 창이 다르고, 셋 중 하나만 잡아도 그 마커는 찾은 것이다.
 */
import { adaptiveThresholdMean, otsu, stdDev, type Gray } from './image.ts';
import { approxPolyDPClosed, findOuterContours, isConvex, perimeter, toClockwise } from './contours.ts';
import { getPerspectiveTransform, type Pt } from './homography.ts';
import { warpPerspective } from './warp.ts';

/**
 * DICT_4X4_50 의 id 0–3, 행 우선 16비트. 1 = 흰 칸.
 *
 * `cv2.aruco.generateImageMarker` 로 그려서 칸 중심을 읽어 뽑았다 — 사전의 바이트
 * 표현을 손으로 풀면 비트 순서를 틀리기 쉽고, 틀려도 조용히 "마커 없음" 으로만
 * 나타난다. 재현: engine 쪽이 아니라 `.venv-cv/bin/python` 으로
 *   m = cv2.aruco.generateImageMarker(D, i, 60)
 *   [1 if m[r*10+5, c*10+5] > 127 else 0 for r in range(1,5) for c in range(1,5)]
 */
const DICT_4X4_50_0_TO_3 = [
  '1011010100110010',
  '0000111110011010',
  '0011001100101101',
  '1001100101000110',
] as const;

const MARKER_BITS = 4;
const BORDER_BITS = 1;
const CELLS = MARKER_BITS + 2 * BORDER_BITS; // 6
const PX_PER_CELL = 4;
const WARP_SIDE = CELLS * PX_PER_CELL; // 24

// OpenCV DetectorParameters 의 기본값들.
const WIN_SIZES = [3, 13, 23];
const THRESH_CONSTANT = 7;
const MIN_PERIMETER_RATE = 0.03;
const MAX_PERIMETER_RATE = 4.0;
const APPROX_ACCURACY_RATE = 0.03;
const MIN_CORNER_DISTANCE_RATE = 0.05;
const MIN_DISTANCE_TO_BORDER = 3;
const MAX_BORDER_ERRORS = Math.trunc(MARKER_BITS * MARKER_BITS * 0.35); // 5
const MIN_OTSU_STDDEV = 5.0;

/** 4×4 비트판을 시계 방향으로 90° 돌린다. dest[i][j] = src[N-1-j][i] */
function rotCW(bits: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const n = MARKER_BITS;
  const out = new Uint8Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) out[i * n + j] = bits[(n - 1 - j) * n + i];
  }
  return out;
}

/** id → [회전 0..3 의 비트판]. 모듈 적재 시 한 번만 만든다. */
const ROTATIONS = DICT_4X4_50_0_TO_3.map((s) => {
  const base = new Uint8Array(MARKER_BITS * MARKER_BITS);
  for (let i = 0; i < base.length; i++) base[i] = s[i] === '1' ? 1 : 0;
  const all = [base];
  for (let r = 1; r < 4; r++) all.push(rotCW(all[r - 1]));
  return all;
});

export interface Detection {
  id: number;
  /** 마커 자신의 좌상단에서 시작해 시계 방향인 네 꼭짓점 (사진 좌표). */
  corners: Pt[];
}

/**
 * 후보 사각형 하나가 우리 마커인지 판정한다.
 *
 * 돌려주는 꼭짓점은 **마커 자신의 좌상단부터** 시계 방향이다. 그 기준이 마커 자신의
 * 무늬에 붙어 있어서, 종이를 거꾸로 놓고 찍어도 정규 좌표로 펴면 바로 선다.
 */
function identify(gray: Gray, quad: Pt[]): Detection | null {
  const dst: Pt[] = [
    { x: 0, y: 0 },
    { x: WARP_SIDE - 1, y: 0 },
    { x: WARP_SIDE - 1, y: WARP_SIDE - 1 },
    { x: 0, y: WARP_SIDE - 1 },
  ];
  const M = getPerspectiveTransform(quad, dst);
  if (!M) return null;
  const patch = warpPerspective(gray, M, WARP_SIDE, WARP_SIDE, 'nearest');

  // 균일한 얼룩은 오츠가 잡음을 반으로 갈라 그럴듯한 비트를 만들어 낸다.
  if (stdDev(patch.d) < MIN_OTSU_STDDEV) return null;
  const t = otsu(patch.d);

  // 칸마다 흰 화소가 절반을 넘으면 1.
  const cells = new Uint8Array(CELLS * CELLS);
  for (let cy = 0; cy < CELLS; cy++) {
    for (let cx = 0; cx < CELLS; cx++) {
      let white = 0;
      for (let y = 0; y < PX_PER_CELL; y++) {
        const row = (cy * PX_PER_CELL + y) * WARP_SIDE + cx * PX_PER_CELL;
        for (let x = 0; x < PX_PER_CELL; x++) if (patch.d[row + x] > t) white++;
      }
      cells[cy * CELLS + cx] = white > (PX_PER_CELL * PX_PER_CELL) / 2 ? 1 : 0;
    }
  }

  // 테두리는 전부 검어야 한다. 흰 칸이 많으면 마커가 아니라 그냥 네모난 무엇이다.
  let borderErrors = 0;
  for (let y = 0; y < CELLS; y++) {
    for (let x = 0; x < CELLS; x++) {
      const onBorder = x === 0 || y === 0 || x === CELLS - 1 || y === CELLS - 1;
      if (onBorder && cells[y * CELLS + x]) borderErrors++;
    }
  }
  if (borderErrors > MAX_BORDER_ERRORS) return null;

  const inner = new Uint8Array(MARKER_BITS * MARKER_BITS);
  for (let y = 0; y < MARKER_BITS; y++) {
    for (let x = 0; x < MARKER_BITS; x++) {
      inner[y * MARKER_BITS + x] = cells[(y + BORDER_BITS) * CELLS + (x + BORDER_BITS)];
    }
  }

  // 정확히 일치할 때만 받는다. DICT_4X4_50 의 maxCorrectionBits 는 1 이지만 OpenCV 의
  // 기본 보정률 0.6 을 곱하면 0 이 되어, 실제로도 오차를 고쳐 주지 않는다.
  for (let id = 0; id < ROTATIONS.length; id++) {
    for (let k = 0; k < 4; k++) {
      const want = ROTATIONS[id][k];
      let same = true;
      for (let i = 0; i < inner.length && same; i++) same = inner[i] === want[i];
      if (!same) continue;
      // 펼친 그림이 사전 비트를 시계 방향 k 번 돌린 것과 같다면, 마커 자신의
      // 좌상단은 후보 꼭짓점의 k 번째에 있다. (유도는 formsheet 시험에 함께 둔다)
      return { id, corners: [quad[k % 4], quad[(k + 1) % 4], quad[(k + 2) % 4], quad[(k + 3) % 4]] };
    }
  }
  return null;
}

/**
 * 사진 한 장에서 마커 id → 꼭짓점 넷.
 *
 * 같은 id 가 여러 번 잡히면(창 크기가 셋이고, 마커 테두리의 안쪽 경계도 사각형으로
 * 보일 수 있다) 둘레가 가장 긴 것을 남긴다 — 바깥 테두리가 우리가 재고 싶은 것이다.
 */
export function detectMarkers(gray: Gray): Map<number, Pt[]> {
  const { w, h } = gray;
  const maxDim = Math.max(w, h);
  const minPts = MIN_PERIMETER_RATE * maxDim;
  const maxPts = MAX_PERIMETER_RATE * maxDim;

  const best = new Map<number, { corners: Pt[]; size: number }>();

  for (const win of WIN_SIZES) {
    const bin = adaptiveThresholdMean(gray, win, THRESH_CONSTANT);
    for (const contour of findOuterContours(bin, Math.ceil(minPts))) {
      const n = contour.length;
      if (n < minPts || n > maxPts) continue;

      const approx = approxPolyDPClosed(contour, n * APPROX_ACCURACY_RATE);
      if (approx.length !== 4 || !isConvex(approx)) continue;

      // 꼭짓점이 서로 너무 가까우면 사각형이라기보다 찌그러진 무엇이다.
      let minCorner = Infinity;
      for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) {
          minCorner = Math.min(minCorner, Math.hypot(approx[i].x - approx[j].x, approx[i].y - approx[j].y));
        }
      }
      if (minCorner < MIN_CORNER_DISTANCE_RATE * n) continue;

      // 화면 끝에 걸린 사각형은 잘려 있을 수 있다.
      if (approx.some((p) => p.x < MIN_DISTANCE_TO_BORDER || p.y < MIN_DISTANCE_TO_BORDER
        || p.x > w - 1 - MIN_DISTANCE_TO_BORDER || p.y > h - 1 - MIN_DISTANCE_TO_BORDER)) continue;

      const found = identify(gray, toClockwise(approx));
      if (!found) continue;
      const size = perimeter(found.corners);
      const prev = best.get(found.id);
      if (!prev || size > prev.size) best.set(found.id, { corners: found.corners, size });
    }
  }

  const out = new Map<number, Pt[]>();
  for (const [id, v] of best) out.set(id, v.corners);
  return out;
}
