import type { NutrientAmounts, NutrientKey } from './types';
// 확장자를 붙이는 이유: 테스트를 node --test 로 직접 돌린다(번들러 없이).
// 노드 ESM 로더는 확장자를 추론하지 않는다. tsconfig 의 allowImportingTsExtensions 가 이를 허용한다.
import { validateDensity } from './validate.ts';

/**
 * 자체 학습 모델(nutrition_manager) 출력 → 판정 엔진이 쓰는 100g 기준 밀도.
 *
 * 모델은 접시 전체의 총량을 kcal·g 로 내놓는다. Nutrition5k 는 접시를 저울에 올려
 * 만든 데이터셋이라 질량이 정답으로 들어있고, 그래서 모델이 "얼마나 있나"를 배운다 —
 * 사진 한 장에서 제일 맞히기 어려운 값이 그것이다. 반대로 판정 엔진은 100g 기준 밀도와
 * 1회 제공량을 받으므로, 여기서 나눠 형태를 맞춘다.
 *
 * 모델과 Vision 은 서로를 대체하지 않는다. 모델은 다섯 값(열량·질량·지방·탄수·단백)만
 * 알고 이름도 알레르기도 모른다. 둘을 합치는 규칙은 아래 mergeVisionDetail 에 있다.
 */

/** 모델이 예측하는 다섯 값 (configs/config.yaml 의 targets 순서와 이름). */
export interface ModelTotals {
  calories: number;
  mass: number;
  fat: number;
  carb: number;
  protein: number;
}

/** 한 끼 한 접시로 가능한 질량 범위. 벗어나면 추론이 빗나간 것으로 본다. */
export const MIN_PORTION_G = 10;
export const MAX_PORTION_G = 1500;

/** 모델이 예측하지 않는 영양소 — Vision 이 채울 수 있는 칸. */
const VISION_ONLY: NutrientKey[] = ['sugars', 'saturatedFat', 'fiber', 'salt'];

export type DensityResult =
  | { ok: true; per100: NutrientAmounts; servingGrams: number }
  | { ok: false; problems: string[] };

export function densityFromTotals(totals: ModelTotals): DensityResult {
  const bad = (['calories', 'mass', 'fat', 'carb', 'protein'] as const)
    .filter((k) => typeof totals[k] !== 'number' || !Number.isFinite(totals[k]) || totals[k] < 0)
    .map((k) => `${k}: ${totals[k]}`);
  if (bad.length) return { ok: false, problems: bad };

  const mass = Math.round(totals.mass);
  if (mass < MIN_PORTION_G || mass > MAX_PORTION_G) {
    return { ok: false, problems: [`mass ${mass} g outside ${MIN_PORTION_G}–${MAX_PORTION_G} g`] };
  }

  const scale = 100 / mass;
  const per100: NutrientAmounts = {
    energy: round1(totals.calories * scale),
    fat: round1(totals.fat * scale),
    carbohydrates: round1(totals.carb * scale),
    protein: round1(totals.protein * scale),
  };

  // 성분표 OCR·Vision 과 똑같은 물리 검증을 통과해야 채택한다. 회귀 모델도 학습 분포
  // 밖에서는 빗나가므로, 검증 계층은 출처를 가리지 않는다 — 자기 모델이라고 봐주지 않는다.
  const check = validateDensity(per100);
  if (!check.ok) return { ok: false, problems: check.problems };

  return { ok: true, per100, servingGrams: mass };
}

/**
 * 모델의 다섯 값에 Vision 이 본 세부 영양소(당·포화지방·식이섬유·나트륨)를 얹는다.
 * WHO 상한 판정에 그 넷이 필요한데 모델은 예측하지 않는다.
 *
 * 얹은 값이 모델의 거시 영양소와 모순되면(당류 > 탄수화물) 두 출처가 서로 다른 음식을
 * 보고 있다는 뜻이다. 그럴 땐 그 항목을 버린다 — 상한에 맞춰 깎으면 실제보다 안전해
 * 보이는 숫자를 만들어내게 되고, 그건 없느니만 못하다.
 */
export function mergeVisionDetail(
  per100: NutrientAmounts,
  visionPer100: NutrientAmounts | undefined,
): { per100: NutrientAmounts; dropped: NutrientKey[] } {
  if (!visionPer100) return { per100, dropped: [] };

  const merged: NutrientAmounts = { ...per100 };
  const dropped: NutrientKey[] = [];

  for (const k of VISION_ONLY) {
    const v = visionPer100[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) continue;
    if (k === 'sugars' && exceeds(v, per100.carbohydrates)) { dropped.push(k); continue; }
    if (k === 'saturatedFat' && exceeds(v, per100.fat)) { dropped.push(k); continue; }
    merged[k] = v;
  }

  // 합쳐놓고 보니 질량 보존이 깨지는 경우가 있다(모델 탄수 + Vision 식이섬유 …).
  // 그럴 땐 통째로 물러나 모델 값만 쓴다 — 검증을 통과하지 못한 조합은 채택하지 않는다.
  if (!validateDensity(merged).ok) {
    return { per100, dropped: VISION_ONLY.filter((k) => merged[k] !== undefined) };
  }
  return { per100: merged, dropped };
}

function exceeds(a: number, b: number | undefined): boolean {
  return b !== undefined && a > b + 0.5;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
