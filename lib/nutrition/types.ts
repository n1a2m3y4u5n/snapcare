// SnapCare 영양 계산 엔진 — 도메인 타입
//
// 설계 원칙: 식품 데이터(무엇이 얼마나 들었나)는 외부(OpenFoodFacts)에서 받고,
// 기준 산출·환산·판정은 전부 이 엔진이 한다.
// WHO 권고가 "총 에너지의 몇 %" 형태라, 개인 에너지 요구량에서 상한을 유도하는 계산이 핵심이다.

/** 다루는 영양소. energy 는 kcal, 나머지는 g. */
export type NutrientKey =
  | 'energy'
  | 'sugars'
  | 'salt'
  | 'saturatedFat'
  | 'fat'
  | 'protein'
  | 'fiber'
  | 'carbohydrates';

export type NutrientAmounts = Partial<Record<NutrientKey, number>>;

/** 영양소가 "적을수록 좋은 것"인지 "채워야 하는 것"인지. 판정 방향이 반대다. */
export type NutrientKind = 'limit' | 'target';

export const NUTRIENT_KIND: Record<NutrientKey, NutrientKind> = {
  energy: 'limit',
  sugars: 'limit',
  salt: 'limit',
  saturatedFat: 'limit',
  fat: 'limit',
  protein: 'target',
  fiber: 'target',
  carbohydrates: 'target',
};

export const NUTRIENT_LABEL: Record<NutrientKey, string> = {
  energy: 'Energy',
  sugars: 'Sugars',
  salt: 'Salt',
  saturatedFat: 'Saturated fat',
  fat: 'Fat',
  protein: 'Protein',
  fiber: 'Fiber',
  carbohydrates: 'Carbs',
};

export const NUTRIENT_UNIT: Record<NutrientKey, 'kcal' | 'g'> = {
  energy: 'kcal',
  sugars: 'g',
  salt: 'g',
  saturatedFat: 'g',
  fat: 'g',
  protein: 'g',
  fiber: 'g',
  carbohydrates: 'g',
};

/** 정규화된 식품 영양 프로필 — 100g(또는 100ml) 기준. */
export interface NutrientProfile {
  /** 어디서 온 데이터인지 (화면에 출처를 밝히기 위해 보관) */
  source: 'openfoodfacts' | 'label-ocr' | 'vision' | 'manual';
  /** 바코드 (있으면) */
  code?: string;
  name: string;
  brands?: string;
  /** 1회 제공량(g). 없으면 100g 기준으로 계산한다. */
  servingGrams?: number;
  per100: NutrientAmounts;
  /** OpenFoodFacts allergens_tags (예: 'en:peanuts') */
  allergenTags?: string[];
  /** Nutri-Score 등급 (a~e). 참고 표시용 — 우리 판정에는 쓰지 않는다. */
  nutriscore?: string;
}

/** 한 사람의 하루 기준치. limits = 넘지 말 것, targets = 채울 것. */
export interface DailyReference {
  energyKcal: number;
  limits: NutrientAmounts;
  targets: NutrientAmounts;
  /** 근거 요약 (심사 Q&A·화면 표시용) */
  basis: string;
}

/** 영양소 1종에 대한 판정 결과. */
export interface NutrientAssessment {
  key: NutrientKey;
  kind: NutrientKind;
  /** 실제 섭취량 (energy=kcal, 그 외 g) */
  amount: number;
  /** 기준치 (limit 또는 target) */
  reference: number;
  /** 기준 대비 백분율 */
  pct: number;
  /**
   * limit: 'low' | 'moderate' | 'high'  (high = 한 번에 하루 상한의 절반 이상)
   * target: 'low' | 'some' | 'good'
   */
  level: 'low' | 'moderate' | 'high' | 'some' | 'good';
}
