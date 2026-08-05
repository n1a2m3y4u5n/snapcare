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

/*
  이름으로 제품을 찾는다 — 바코드가 안 보일 때의 두 번째 길.

  왜 필요한가
  -----------
  포장 식품을 찍으면 자체 모델이 숫자를 내는데, 그 모델은 **접시에 담긴 끼니**로
  배웠다. 초콜릿바 포장지를 보고 "이렇게 생긴 요리" 의 밀도를 내놓으므로 실제 성분표와
  전혀 다른 값이 나온다. 회귀 모델은 기권할 수 없어서 그 사실을 스스로 말하지도 못한다.

  왜 검색이 마지막 순위인가
  -------------------------
  이 자리에는 더 나은 답이 둘 있고, 둘 다 **사진 안에** 있다 — 바코드와 성분표.
  검색은 그 둘이 다 안 보일 때만 쓴다. 이유가 둘이다:

   · 이름 검색은 **다른 제품을 가져올 수 있다.** 바코드는 그 물건 하나를 가리키지만
     "chocolate biscuit" 은 수천 개다. 그래서 아래에서 이름이 충분히 닮았는지 다시 재고,
     안 닮으면 답하지 않는다.
   · OFF 검색은 **분당 10회** 로 묶여 있다(바코드 조회는 100회). 넘으면 JSON 이 아니라
     HTML 안내 페이지가 온다 — 실제로 그걸 받아 봤다. 그래서 아래는 상태 코드만이
     아니라 content-type 도 본다. `res.json()` 에 그냥 넘기면 파싱 오류로 터진다.
*/
const SEARCH = 'https://world.openfoodfacts.org/cgi/search.pl';

/** 이름이 이만큼은 닮아야 같은 제품으로 친다. 안 닮으면 답하지 않는다. */
const NAME_MIN = 0.55;

/** 글자만 남기고 소문자로. 브랜드 표기의 잡음(®, 하이픈, 용량)을 지운다. */
function flatten(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * 검색어의 낱말이 후보 이름에 얼마나 들어 있나 (0~1).
 *
 * 편집 거리가 아니라 낱말 겹침을 쓴다. 제품 이름은 낱말이 늘었다 줄었다 하는데
 * ("Nutella" vs "Nutella hazelnut spread 350g") 편집 거리는 그것을 크게 다르다고
 * 읽는다. 우리가 묻는 것은 "같은 물건인가" 이지 "같은 문자열인가" 가 아니다.
 */
export function nameOverlap(query: string, candidate: string): number {
  const q = flatten(query).split(' ').filter((w) => w.length > 2);
  if (q.length === 0) return 0;
  const c = ` ${flatten(candidate)} `;
  return q.filter((w) => c.includes(` ${w} `) || c.includes(w)).length / q.length;
}

/** 영양 수치가 하나도 없는 레코드는 찾은 것이 아니다 — OFF 에는 빈 항목이 많다. */
function hasNumbers(p: NutrientProfile): boolean {
  return typeof p.per100.energy === 'number';
}

/**
 * 제품 이름(+브랜드)으로 찾는다. 확신이 안 서면 `null`.
 *
 * 못 찾는 것이 정상적인 답이다. 대상 지역의 지역 식품은 OFF 에 거의 없고, 그래서
 * 이 저장소에 라벨 OCR 이 따로 있다. 여기서 억지로 하나를 고르면 **다른 제품의
 * 영양 정보가 이 사람의 하루 누적에 들어간다.**
 */
export async function searchByName(query: string): Promise<NutrientProfile | null> {
  const q = query.trim();
  if (flatten(q).length < 3) return null;

  const url = `${SEARCH}?search_terms=${encodeURIComponent(q)}&search_simple=1`
    + `&action=process&json=1&page_size=5&fields=${FIELDS}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SnapCare/0.1 (e-ICON World Contest student project)' },
      signal: AbortSignal.timeout(8000),
    });
    // 분당 한도를 넘기면 200 에 HTML 이 온다. 여기서 안 막으면 파싱 오류로 터진다.
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null;

    const body = (await res.json()) as { products?: OffProduct[] };
    const found = (body.products ?? [])
      .map(toProfile)
      .filter(hasNumbers)
      .map((p) => ({ p, score: nameOverlap(q, `${p.brands ?? ''} ${p.name}`) }))
      .sort((a, b) => b.score - a.score)[0];

    if (!found || found.score < NAME_MIN) return null;
    return found.p;
  } catch {
    // 망이 없거나 OFF 가 느린 것은 실패가 아니다. 부르는 쪽이 다음 칸으로 넘어간다.
    return null;
  }
}
