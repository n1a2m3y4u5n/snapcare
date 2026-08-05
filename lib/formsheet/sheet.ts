/**
 * 종이 폼시트 사진 → 복약 일정. 브라우저에서.
 *
 * 파이썬 `pill_dispenser/form_sheet_parser/form_sheet_parser.py` 를 그대로 옮긴 것이다.
 * 옮긴 이유는 하나다 — 이 경로만 서버를 필요로 했다. 손글씨 읽기, 식사 모델(ONNX),
 * 판정 엔진, 픽토그램 117장은 이미 전부 브라우저 안에 있는데, 의사가 채워 준 종이를
 * 읽는 길만 파이썬 프로세스를 띄워야 했다. 인터넷이 끊긴 진료소에서 가장 쓰고 싶은
 * 기능이 인터넷을 요구하고 있었다.
 *
 * 파이프라인:
 *   사진 → 마커 검출 → 1000×1000 로 펴기 → 이진화 → 버블 점수
 *
 * 버블을 읽는 방법이 이 파일에서 유일하게 미묘한 부분이고, 그 설명은 파이썬 원본의
 * 머리말에 있다. 요지: **빈 버블도 비어 있지 않다.** 인쇄된 테두리가 잉크다. 그래서
 * 고정 컷오프는 "칠해졌나" 가 아니라 "보정하던 날의 테두리보다 진한가" 를 재게 된다.
 * 대신 장마다 스스로 보정한다 — 44개 버블 점수의 하위 사분위수를 *이 사진에서*
 * 빈 버블이 어떻게 보이는지로 삼고, 거기에 맞춰 다시 눈금을 매긴다.
 */
import { detectMarkers } from './aruco.ts';
import { SHEET_CONFIG, type SheetConfig } from './config.ts';
import { findHomography, residuals, type Mat3, type Pt } from './homography.ts';
import {
  adaptiveThresholdGaussian, blurGaussian, laplacianVariance, meanLuma, type Gray,
} from './image.ts';
import { warpPerspective } from './warp.ts';

export const SIDE = 1000;

// ── 종이 위의 기하 (form_sheet/.form_sheet.tex 에서 온 값) ────────────────────
const PAGE_W_MM = 148.0; // A5 세로
const PAGE_H_MM = 210.0;
const MARKER_BOX_MM = 9.0; // \includegraphics[width=9mm]
const MARKER_MARGIN_MM = 6.0; // 각 변에서 들어간 여백
// 마커를 그릴 때 600px 무늬 둘레에 120px 흰 여백을 두른다. 그래서 실제 무늬는
// 배치된 9mm 의 600/840 이고, 시작점도 120/840 만큼 안쪽이다. 그 흰 여백이 없으면
// 검출기가 무늬와 종이를 갈라내지 못한다.
const PATTERN_FRAC = 600 / 840;
const QUIET_FRAC = 120 / 840;
const MARKER_PATTERN_MM = MARKER_BOX_MM * PATTERN_FRAC;
const INSET_MM = MARKER_MARGIN_MM + MARKER_BOX_MM * QUIET_FRAC;

const X0 = INSET_MM;
const Y0 = INSET_MM;
const X1 = PAGE_W_MM - INSET_MM;
const Y1 = PAGE_H_MM - INSET_MM;

/** 마커 셋이면 편다. 둘은 종이의 먼 쪽을 잡아 주지 못한다. */
export const MIN_MARKERS = 3;
/** 라플라시안 분산. 일부러 느슨하다 — 흐림이 정말 문제가 되는 지점은 마커가 아예
 *  안 잡히는 쪽이고, 그것은 "종이를 못 찾았다" 로 따로 잡힌다. */
export const MIN_SHARPNESS = 15.0;
/** 이보다 어두우면 적응형 이진화가 의미를 잃는다. 추측해서 보여주느니 다시 찍게 한다. */
export const MIN_MEAN_LUMA = 45.0;
/** 맞춘 변환이 마커 꼭짓점을 얼마나 빗나가도 되는가 (정규 좌표 화소).
 *  버블은 16×32 이므로 반 버블만 밀려도 이미 다른 칸을 읽는다. */
export const MAX_FIT_RESIDUAL_PX = 8.0;

function mmToCanonical(xMm: number, yMm: number): Pt {
  return {
    x: ((xMm - X0) / (X1 - X0)) * (SIDE - 1),
    y: ((yMm - Y0) / (Y1 - Y0)) * (SIDE - 1),
  };
}

/**
 * 마커 id → 정규 좌표에서의 꼭짓점 넷 (검출기 순서: 자기 좌상단에서 시계 방향).
 *
 * 그 순서가 마커 자신의 무늬에 매여 있어서 종이와 함께 돈다 — 거꾸로 놓고 찍은
 * 장도 똑바로 선 채로 펴지는 이유다.
 */
export const CANONICAL_MARKERS: Record<number, Pt[]> = (() => {
  const size = MARKER_PATTERN_MM;
  const origins: Record<number, [number, number]> = {
    0: [X0, Y0], // 좌상
    1: [PAGE_W_MM - INSET_MM - size, Y0], // 우상
    2: [PAGE_W_MM - INSET_MM - size, PAGE_H_MM - INSET_MM - size], // 우하
    3: [X0, PAGE_H_MM - INSET_MM - size], // 좌하
  };
  const out: Record<number, Pt[]> = {};
  for (const [id, [ox, oy]] of Object.entries(origins)) {
    out[Number(id)] = [
      mmToCanonical(ox, oy),
      mmToCanonical(ox + size, oy),
      mmToCanonical(ox + size, oy + size),
      mmToCanonical(ox, oy + size),
    ];
  }
  return out;
})();

export interface FitInfo {
  markers: number;
  markerIds: number[];
  residualPx: number;
  dropped: number[];
}

/**
 * 찾은 마커의 **모든** 꼭짓점으로 사진 → 정규 변환을 맞춘다.
 *
 * 바깥 네 점이 아니라 열여섯 점을 쓰는 이유는 파이썬 원본의 설명 그대로다. 종이를
 * 붙잡은 손이 마커 하나를 늘 가리고, 그래도 읽혀야 한다. 그럴듯한 수선 — 종이를
 * 평행사변형으로 보고 나머지 셋에서 네 번째를 유추하는 것 — 은 원근 아래에서 틀리고,
 * 가장 나쁜 방식으로 틀린다. 요란하게 실패하지 않고 버블 지도 전체를 종이의 몇
 * 퍼센트만큼 밀어 놓아서, 표시가 옆 칸에 떨어지고 시트는 **전혀 다른, 그럴듯한**
 * 일정으로 읽힌다. 약을 내보내는 기계로 들어가는 조용한 오독이다.
 *
 * 파이썬은 여기서 RANSAC 을 쓴다. 여기서는 최소제곱으로 한 번 맞춘 뒤 잔차가 크면
 * **마커 단위로** 가장 나쁜 것을 하나 버리고 다시 맞춘다. 여기서 이상치는 꼭짓점
 * 하나가 아니라 잘못 잡힌 마커 하나로 오기 때문이고, 무작위가 없어 같은 사진이 늘
 * 같은 답을 낸다.
 */
export function estimatePageHomography(gray: Gray): { M: Mat3; info: FitInfo } {
  const found = detectMarkers(gray);
  if (found.size === 0) throw new Error('마커가 하나도 잡히지 않았다');
  if (found.size < MIN_MARKERS) {
    const missing = [0, 1, 2, 3].filter((i) => !found.has(i));
    throw new Error(
      `마커 4개 중 ${found.size}개만 잡혔다 (없는 것: ${missing.join(', ')}); `
      + `종이를 찾으려면 최소 ${MIN_MARKERS}개가 필요하다`,
    );
  }

  const dropped: number[] = [];
  let ids = [...found.keys()].sort((a, b) => a - b);

  for (;;) {
    const src: Pt[] = [];
    const dst: Pt[] = [];
    for (const id of ids) {
      src.push(...found.get(id)!);
      dst.push(...CANONICAL_MARKERS[id]);
    }
    const M = findHomography(src, dst);
    if (!M) throw new Error('잡힌 마커로 종이 변환을 맞출 수 없다');

    const res = residuals(M, src, dst);
    const worst = Math.max(...res);
    if (worst <= MAX_FIT_RESIDUAL_PX || ids.length <= MIN_MARKERS) {
      return { M, info: { markers: ids.length, markerIds: ids, residualPx: worst, dropped } };
    }
    // 가장 못 맞는 마커 하나를 버리고 다시.
    let worstId = ids[0];
    let worstMean = -1;
    ids.forEach((id, k) => {
      const mean = (res[k * 4] + res[k * 4 + 1] + res[k * 4 + 2] + res[k * 4 + 3]) / 4;
      if (mean > worstMean) {
        worstMean = mean;
        worstId = id;
      }
    });
    dropped.push(worstId);
    ids = ids.filter((id) => id !== worstId);
  }
}

/** 흐림 → 적응형 이진화. 잉크 = 255, 종이 = 0. */
export function preprocess(warped: Gray): Gray {
  const blurred = blurGaussian(warped, 5, 0, 'reflect101');
  const blurGray: Gray = {
    w: warped.w,
    h: warped.h,
    d: Uint8ClampedArray.from(blurred, (v) => Math.round(v)),
  };
  return adaptiveThresholdGaussian(blurGray, 51, 10);
}

export interface Quality {
  sharpness: number;
  meanLuma: number;
  markers: number;
  residualPx: number;
}

/**
 * "이 사진을 읽을 가치가 있는가" 를 버블 하나 재기 전에 묻는다.
 *
 * 나쁜 사진을 거절하는 쪽이 자신 있게 읽는 쪽보다 훨씬 자주 옳다. 사용자는 시트
 * 앞에 서 있으니 한 장 더 찍으면 되지만, 틀린 일정은 약이 든 기계로 간다.
 */
export function assessQuality(warped: Gray, info: FitInfo): { quality: Quality; problems: string[] } {
  const sharpness = laplacianVariance(warped);
  const luma = meanLuma(warped);
  const problems: string[] = [];
  if (sharpness < MIN_SHARPNESS) {
    problems.push(`photo is out of focus (sharpness ${sharpness.toFixed(0)} < ${MIN_SHARPNESS.toFixed(0)})`);
  }
  if (luma < MIN_MEAN_LUMA) {
    problems.push(`photo is too dark (mean luma ${luma.toFixed(0)} < ${MIN_MEAN_LUMA.toFixed(0)})`);
  }
  // 잔차가 크다는 것은 마커는 찾았는데 종이가 어디 있는지에 서로 동의하지 않는다는
  // 뜻이다 — 접힌 자국, 말린 종이, 잡음을 마커로 오인한 것. 버블 지도가 엉뚱한 데
  // 깔리므로 아래에 뭐가 걸리든 읽지 않고 거절한다.
  if (info.residualPx > MAX_FIT_RESIDUAL_PX) {
    problems.push(
      `page does not lie flat (marker fit is off by ${info.residualPx.toFixed(0)}px, `
      + `limit ${MAX_FIT_RESIDUAL_PX.toFixed(0)}px) — flatten the sheet and retake`,
    );
  }
  return {
    quality: { sharpness, meanLuma: luma, markers: info.markers, residualPx: info.residualPx },
    problems,
  };
}

// ── 버블 점수 ───────────────────────────────────────────────────────────────

/**
 * (cx, cy) 를 중심으로 한 상자 안의 잉크 비율.
 *
 * 상자는 인쇄된 버블보다 **일부러 작다.** 시트의 칸은 3×5.5mm — 정규 좌표로 대략
 * 22×28 인데 표본 창은 12×18 이라, 테두리 안쪽에 사방 5px 여유를 두고 앉는다.
 *
 * 그 여유가 요령의 전부다. 테두리에 닿을 만큼 큰 창은 면적의 대부분으로 표시가
 * 아니라 테두리를 재게 된다 — 원래의 16×32 창에서는 빈 버블이 0.12, 반쯤 칠한
 * 버블이 0.19 로 간격이 0.07 이었고, 그 사이에 안전하게 앉을 수 있는 임계값은 없다.
 * 안쪽만 표본하면 빈 것은 0.04, 꽉 칠한 것은 0.81 이 된다.
 */
function fillRatio(bin: Gray, cx: number, cy: number, hw: number, hh: number): number {
  const y0 = Math.max(0, cy - hh);
  const y1 = Math.min(bin.h, cy + hh);
  const x0 = Math.max(0, cx - hw);
  const x1 = Math.min(bin.w, cx + hw);
  if (y0 >= y1 || x0 >= x1) return 0;
  let sum = 0;
  for (let y = y0; y < y1; y++) {
    const row = y * bin.w;
    for (let x = x0; x < x1; x++) sum += bin.d[row + x];
  }
  return sum / ((y1 - y0) * (x1 - x0)) / 255;
}

/** numpy.quantile 의 기본(선형 보간)과 같다. */
export function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const a = [...values].sort((x, y) => x - y);
  const pos = q * (a.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}

function normalize(raw: number, baseline: number): number {
  const denom = Math.max(1e-6, 1 - baseline);
  return Math.min(1, Math.max(0, (raw - baseline) / denom));
}

export interface SheetValues {
  layer: string | null;
  days: string[];
  duration: string | null;
  hour: string | null;
}

export interface SheetResult {
  foundPage: boolean;
  /**
   * 원본 → 1000×1000 정규 좌표 변환. 종이를 못 찾았으면 `null`.
   *
   * 손으로 쓴 칸을 읽으려면 이것이 필요하다. 칸은 정규 격자가 아니라 **원본
   * 해상도에서** 잘라야 하고(`field.ts`), 그러려면 그때 쓴 변환이 있어야 한다.
   * 부르는 쪽이 마커를 다시 찾게 하면 같은 일을 두 번 하는데, 그것이 이 화면에서
   * 가장 비싼 일이다.
   */
  transform: Mat3 | null;
  values: SheetValues;
  problems: string[];
  baseline: number;
  quality: Quality | null;
  scores: Record<string, Record<string, number>>;
  ok: boolean;
}

function emptyValues(cfg: SheetConfig): SheetValues {
  const v: Record<string, string | string[] | null> = {};
  for (const [name, g] of Object.entries(cfg.groups)) v[name] = g.mode === 'many' ? [] : null;
  return v as unknown as SheetValues;
}

/**
 * 보정된 좌표표에 맞춰 모든 버블 무리를 채점한다.
 *
 * 무리는 `one`(정확히 하나 — 칸, 기간, 시각) 이거나 `many`(아무 부분집합 — 요일)다.
 * 둘 다 추측하지 않는다. `one` 은 1·2등이 갈라지지 않으면 아무것도 내놓지 않고,
 * `many` 는 확실히 빈 것과 확실히 칠한 것 사이에 앉은 버블을 문제로 표시한다.
 * 이름 붙은 문제는 사용자를 시트로 돌려보내므로 회복할 수 있고, 자신 있는 오독은
 * 회복할 수 없다.
 */
export function readFormSheet(
  bin: Gray,
  cfg: SheetConfig = SHEET_CONFIG,
  quality: Quality | null = null,
  priorProblems: string[] = [],
): SheetResult {
  const { half_width: hw, half_height: hh, abs_min: absMin, margin, normalize: doNorm } = cfg;

  const raw: Record<string, Record<string, number>> = {};
  for (const [name, group] of Object.entries(cfg.groups)) {
    raw[name] = {};
    for (const [key, [cx, cy]] of Object.entries(group.bubbles)) {
      raw[name][key] = fillRatio(bin, cx, cy, hw, hh);
    }
  }

  const allRaw = Object.values(raw).flatMap((g) => Object.values(g));
  const baseline = doNorm ? quantile(allRaw, 0.25) : 0;
  const scores: Record<string, Record<string, number>> = {};
  for (const [name, group] of Object.entries(raw)) {
    scores[name] = {};
    for (const [k, v] of Object.entries(group)) scores[name][k] = doNorm ? normalize(v, baseline) : v;
  }

  const values: Record<string, string | string[] | null> = {};
  const problems = [...priorProblems];

  for (const [name, group] of Object.entries(cfg.groups)) {
    const s = scores[name];
    if (group.mode === 'one') {
      const ranked = Object.entries(s).sort((a, b) => b[1] - a[1]);
      const [best, second] = ranked;
      if (best[1] < absMin) {
        values[name] = null;
        problems.push(`${name}: nothing filled`);
      } else if (second && second[1] >= absMin) {
        // 두 칸이 모두 제대로 칠해져 있다. 둘 사이의 간격만 보면 펜이 더 많이 덮은
        // 쪽을 조용히 고르게 된다 — 한 칸을 칠했다가 마음을 바꿔 지우지 않고 다른
        // 칸을 칠한 시트에서. 시트가 두 가지를 말하고 있고, 어느 쪽이었는지는 쓴
        // 사람만 안다.
        values[name] = null;
        problems.push(
          `${name}: two boxes filled (${best[0]}=${best[1].toFixed(2)}, `
          + `${second[0]}=${second[1].toFixed(2)}) — erase one and retake`,
        );
      } else if (second && best[1] - second[1] < margin) {
        values[name] = null;
        problems.push(`${name}: ambiguous (${best[0]}=${best[1].toFixed(2)}, ${second[0]}=${second[1].toFixed(2)})`);
      } else {
        values[name] = best[0];
      }
    } else {
      // 점수 순이 아니라 설정이 선언한 순서(MON..SUN)를 지킨다 — 사람에게 요일을
      // 되보여 줄 때는 주 순서로 보고 싶다.
      const keys = Object.keys(group.bubbles);
      const picked = keys.filter((k) => s[k] >= absMin);
      const unclear = keys.filter((k) => s[k] >= absMin - margin && s[k] < absMin);
      values[name] = picked;
      if (picked.length === 0) problems.push(`${name}: nothing filled`);
      if (unclear.length) problems.push(`${name}: borderline ${unclear.join(', ')}`);
    }
  }

  return {
    foundPage: true,
    // `readFormSheet` 는 이미 편 그림만 받으므로 변환을 모른다. `parseFormSheet` 이
    // 자기가 쓴 것을 위에 덮어씌운다 — 아는 쪽이 채우는 것이 맞다.
    transform: null,
    values: values as unknown as SheetValues,
    problems,
    baseline,
    quality,
    scores,
    ok: problems.length === 0,
  };
}

/**
 * 사진 → SheetResult. 나머지 시스템이 부르는 단 하나의 함수.
 *
 * 나쁜 사진에 예외를 던지지 않는다. 종이를 못 찾는 것은 카메라를 무언가에 들이댄
 * 결과로 지극히 평범한 일이고 — 시트가 프레임 밖이거나, 엄지가 마커를 덮었거나,
 * 사진이 흔들렸거나 — 부르는 쪽의 대응은 다른 어떤 문제와도 같다. 무엇이 잘못됐는지
 * 말해 주고 다시 찍게 하는 것. 그 경우만 예외로 도착하게 만들면 얻는 것 없이
 * 언젠가 아무도 처리하지 않는 갈래가 된다.
 */
export function parseFormSheet(gray: Gray, cfg: SheetConfig = SHEET_CONFIG): SheetResult {
  let M: Mat3;
  let info: FitInfo;
  try {
    ({ M, info } = estimatePageHomography(gray));
  } catch (err) {
    return {
      foundPage: false,
      transform: null,
      values: emptyValues(cfg),
      problems: [`could not locate the sheet: ${err instanceof Error ? err.message : String(err)}`],
      baseline: 0,
      quality: null,
      scores: {},
      ok: false,
    };
  }

  const warped = warpPerspective(gray, M, SIDE, SIDE, 'bilinear');
  const { quality, problems } = assessQuality(warped, info);
  return { ...readFormSheet(preprocess(warped), cfg, quality, problems), transform: M };
}
