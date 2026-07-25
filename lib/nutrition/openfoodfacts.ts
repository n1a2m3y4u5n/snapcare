import type { NutrientAmounts, NutrientProfile } from './types';

/**
 * OpenFoodFacts 어댑터 — 외부 레코드를 앱의 정규화된 프로필로 바꾼다.
 *
 * 이 파일이 외부 의존을 한 곳에 가둔다. 다른 데이터 소스(라벨 OCR, Vision)를 붙여도
 * 같은 NutrientProfile 을 만들면 계산 엔진은 그대로 쓴다.
 */

const API = 'https://world.openfoodfacts.org/api/v2/product';
const FIELDS = [
  'code', 'product_name', 'brands', 'quantity', 'serving_size',
  'nutriments', 'nutriscore_grade', 'allergens_tags',
].join(',');

/** OFF nutriments 키 → 우리 키. 값은 100g(또는 100ml) 기준. */
const NUTRIMENT_MAP = {
  'energy-kcal_100g': 'energy',
  'sugars_100g': 'sugars',
  'salt_100g': 'salt',
  'saturated-fat_100g': 'saturatedFat',
  'fat_100g': 'fat',
  'proteins_100g': 'protein',
  'fiber_100g': 'fiber',
  'carbohydrates_100g': 'carbohydrates',
} as const;

interface OffProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  serving_size?: string;
  nutriscore_grade?: string;
  allergens_tags?: string[];
  nutriments?: Record<string, unknown>;
}

/** 바코드로 제품을 조회한다. 없으면 null. */
export async function fetchByBarcode(barcode: string): Promise<NutrientProfile | null> {
  const res = await fetch(`${API}/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`, {
    headers: {
      // OFF는 식별 가능한 User-Agent를 요구한다.
      'User-Agent': 'SnapCare/0.1 (e-ICON World Contest student project)',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;

  const body = (await res.json()) as { status?: number; product?: OffProduct };
  if (body.status !== 1 || !body.product) return null;

  return toProfile(body.product);
}

/** OFF 레코드 → 정규화 프로필. */
export function toProfile(p: OffProduct): NutrientProfile {
  const per100: NutrientAmounts = {};
  const n = p.nutriments ?? {};

  for (const [offKey, key] of Object.entries(NUTRIMENT_MAP)) {
    const raw = n[offKey];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      per100[key] = raw;
    }
  }

  return {
    source: 'openfoodfacts',
    code: p.code,
    name: p.product_name?.trim() || 'Unknown product',
    brands: p.brands?.trim() || undefined,
    servingGrams: parseServingGrams(p.serving_size),
    per100,
    allergenTags: p.allergens_tags ?? [],
    nutriscore: p.nutriscore_grade,
  };
}

/**
 * serving_size 문자열에서 g/ml 수치를 뽑는다.
 * OFF의 serving_size 는 자유 입력이라 '30 g', '1 portion (330 ml)', '2 biscuits (25g)' 등 형태가 제각각이다.
 * ml 은 물 기준 1ml=1g 으로 근사한다 (음료 대부분에서 오차가 작다).
 */
export function parseServingGrams(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const m = raw.match(/(\d+(?:[.,]\d+)?)\s*(g|ml)\b/i);
  if (!m) return undefined;
  const value = Number(m[1].replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}
