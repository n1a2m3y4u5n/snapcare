import type { NutrientAmounts, NutrientKey } from './types';

/**
 * 영양 밀도(100g 기준) 검증.
 *
 * 출처가 어디든 — 성분표 OCR이든, 사진 판별 LLM이든 — 우리 엔진에 들어오기 전에
 * 같은 물리 제약을 통과해야 한다. LLM의 확률적 출력에 결정론적 검증 계층을 두는 것은
 * 예선 제안서에서 SIGIL 파서가 LLM이 만든 DSL을 재검증하던 것과 같은 구조다.
 *
 * 검사 항목:
 *   ① 각 영양소가 물리적으로 가능한 범위인가
 *   ② 부분집합 관계 (당류 ≤ 탄수화물, 포화지방 ≤ 지방)
 *   ③ 질량 보존 (합 ≤ 100g/100g)
 *   ④ Atwater 열량 항등식 (4·탄수 + 4·단백 + 9·지방 ≈ 열량)
 */

const BOUNDS: Partial<Record<NutrientKey, [number, number]>> = {
  energy: [0, 900],
  fat: [0, 100],
  saturatedFat: [0, 100],
  carbohydrates: [0, 100],
  sugars: [0, 100],
  protein: [0, 100],
  fiber: [0, 100],
  salt: [0, 30],
};

const ATWATER_TOLERANCE = 0.3;
const MASS_LIMIT = 105;

export interface ValidationResult {
  ok: boolean;
  /** 통과하지 못한 이유 (로그·화면 안내용) */
  problems: string[];
  atwaterError?: number;
}

export function validateDensity(per100: NutrientAmounts): ValidationResult {
  const problems: string[] = [];

  for (const [k, v] of Object.entries(per100) as [NutrientKey, number][]) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      problems.push(`${k}: not a number`);
      continue;
    }
    const b = BOUNDS[k];
    if (b && (v < b[0] || v > b[1])) problems.push(`${k}=${v} out of range ${b[0]}–${b[1]}`);
  }

  if (gt(per100.sugars, per100.carbohydrates)) problems.push('sugars > carbohydrates');
  if (gt(per100.saturatedFat, per100.fat)) problems.push('saturatedFat > fat');

  const mass = (['carbohydrates', 'fat', 'protein', 'fiber', 'salt'] as NutrientKey[])
    .reduce((s, k) => s + (per100[k] ?? 0), 0);
  if (mass > MASS_LIMIT) problems.push(`mass ${mass.toFixed(1)} g per 100 g`);

  let atwaterError: number | undefined;
  const { energy, carbohydrates, protein, fat } = per100;
  if (energy !== undefined && energy > 0
      && carbohydrates !== undefined && protein !== undefined && fat !== undefined) {
    const predicted = 4 * carbohydrates + 4 * protein + 9 * fat;
    atwaterError = Math.abs(predicted - energy) / energy;
    if (atwaterError > ATWATER_TOLERANCE) {
      problems.push(`energy mismatch ${Math.round(atwaterError * 100)}%`);
    }
  }

  return { ok: problems.length === 0, problems, atwaterError };
}

function gt(a: number | undefined, b: number | undefined): boolean {
  return a !== undefined && b !== undefined && a > b + 0.5;
}
