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
  /** 옛 주소는 쉼표로 이은 문자열, search-a-licious 는 배열로 준다. 둘 다 받는다. */
  brands?: string | string[];
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
    brands: (Array.isArray(p.brands) ? p.brands.join(', ') : p.brands)?.trim() || undefined,
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
/*
  검색은 **search-a-licious** 로 간다 — 옛 `cgi/search.pl` 이 아니라.

  처음엔 그 옛 주소로 붙였다. 한 번 되기에 됐다고 봤는데, 다시 재 보니 계속
  `Page temporarily unavailable`(503, HTML)을 돌려준다. 내 기계에서도, 배포 서버
  에서도 그랬다 — 내 IP 가 막힌 것이 아니라 그 엔드포인트가 죽어 있는 것이다.

  그 사이 화면은 **포장 식품에 숫자를 하나도 못 붙이고** 있었다. 사다리의 셋째 칸이
  통째로 비어 있었다는 뜻이고, 그러면 바코드도 성분표도 안 보이는 흔한 사진이 전부
  넷째 칸("모른다")으로 떨어진다. 고친 것이 안 고친 것보다 나빠 보이는 상태였다.

  세 주소를 나란히 재고 골랐다:
    cgi/search.pl              503 HTML          ✗
    api/v2/search              됨. 단 태그 검색이라 자유 문구가 안 통한다
    search.openfoodfacts.org   됨. 자유 문구 그대로. Nutella 539kcal, 콜라 42kcal

  그래서 세 번째다. 자유 문구가 필요한 이유는 우리가 가진 것이 사진에서 읽은 제품
  이름이기 때문이다 — 태그가 아니라 사람이 포장지에 적어 둔 말이다.
*/
const SEARCH = 'https://search.openfoodfacts.org/search';

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

/**
 * 판정을 낼 만큼의 숫자가 있는가.
 *
 * 열량 하나만 봤다. 그런데 OFF 에는 열량만 채워진 레코드가 흔하고, 그것이 통과하면
 * 화면이 **"숫자를 찾았다"** 로 넘어간다(`nutritionUnknown` 이 안 붙는다). 그 뒤가
 * 조용하다: 당·소금·포화지방이 전부 비어 있으니 걸리는 플래그가 하나도 없고, 걸리는
 * 것이 없으니 판정이 `safe` 가 된다. 당뇨 프로필이든 조건을 하나도 안 적은 사람이든
 * 똑같이 초록이 뜬다.
 *
 * 열량만으로는 경고가 안 나온다. 기준치가 하루 전체(2000kcal)라 100g 당 500kcal 짜리도
 * 25% 에 그치고, `verdict.ts` 는 100% 를 넘어야 경고를 낸다.
 *
 * 그래서 **판정에 쓰이는 값이 하나라도** 있어야 찾은 것으로 친다. 없으면 `null` 을
 * 내고, 위에서 "성분표를 찍어 보라" 로 이어진다 — 지어낸 초록보다 낫다.
 */
function hasNumbers(p: NutrientProfile): boolean {
  return JUDGED.some((k) => typeof p.per100[k] === 'number');
}

/** 판정이 실제로 읽는 값들. 열량은 빠져 있다 — 위 주석에 이유가 있다. */
export const JUDGED = ['sugars', 'salt', 'saturatedFat', 'fat', 'fiber', 'protein', 'carbohydrates'] as const;

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

  const url = `${SEARCH}?q=${encodeURIComponent(q)}&page_size=5&fields=${FIELDS}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SnapCare/0.1 (e-ICON World Contest student project)' },
      signal: AbortSignal.timeout(8000),
    });
    // 분당 한도를 넘기면 200 에 HTML 이 온다. 여기서 안 막으면 파싱 오류로 터진다.
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null;

    // search-a-licious 는 `hits` 로 준다. 옛 주소의 `products` 도 함께 본다 —
    // 되살아나면 그대로 돌아갈 수 있고, 없는 키를 읽는 값이 싸다.
    const body = (await res.json()) as { hits?: OffProduct[]; products?: OffProduct[] };
    /*
      이름이 비슷하면 **알레르겐이 적힌 쪽**을 고른다.

      OFF 는 같은 제품의 레코드가 여럿이고 채워진 정도가 제각각이다. Nutella 를
      찾으면 열량만 있는 것과 `en:nuts, en:milk, en:soybeans` 까지 있는 것이 나란히
      온다. 이름 점수만 보면 앞엣것이 이기는데, 두 레코드의 차이는 **이 앱에서 가장
      비싼 칸**이다 — 숫자는 틀려도 하루 누적이 어긋날 뿐이지만 땅콩 한 줄을 놓치면
      먹으면 안 되는 것을 먹는다.

      이름 점수를 먼저 보고(0.05 안쪽이면 비긴 것으로 친다) 그 다음에 알레르겐을 본다.
      순서를 뒤집으면 다른 제품이 알레르겐을 갖고 있다는 이유로 이긴다.
    */
    const found = (body.hits ?? body.products ?? [])
      .map(toProfile)
      .filter(hasNumbers)
      .map((p) => ({ p, score: nameOverlap(q, `${p.brands ?? ''} ${p.name}`) }))
      .sort((a, b) => (Math.abs(b.score - a.score) > 0.05
        ? b.score - a.score
        : (b.p.allergenTags?.length ?? 0) - (a.p.allergenTags?.length ?? 0)))[0];

    if (!found || found.score < NAME_MIN) return null;
    return found.p;
  } catch {
    // 망이 없거나 OFF 가 느린 것은 실패가 아니다. 부르는 쪽이 다음 칸으로 넘어간다.
    return null;
  }
}
