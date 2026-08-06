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
  /** 총 용량("500 ml"). 캔·병·한 봉지에서는 이것이 곧 1회분이다 — `servingOf` 참고. */
  quantity?: string;
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
    servingGrams: servingOf(p),
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
/**
 * 이 사람이 한 번에 먹는 양.
 *
 * `serving_size` 만 봤다. 그 칸이 비면 계산이 100g 로 떨어지는데, 그것이 **한 캔을
 * 오분의 일만 마신 것**으로 세는 일이 된다. 실제로 겪은 것: Monster 500ml 캔을 찍으면
 * 소금이 0.2g(4%)으로 나와 화면의 문턱(5%)을 못 넘고, 영양 막대가 **하나도 안 뜬다.**
 * 사람이 보는 것은 "안전합니다" 한 줄뿐이다.
 *
 * OFF 는 총 용량을 `quantity` 에 따로 담고, 우리는 그 칸을 이미 받아 오면서 안 쓰고
 * 있었다. 캔·병·한 봉지짜리 제품에서는 **그것이 곧 1회분**이다 — 500ml 캔을 반만
 * 마시는 사람은 드물다.
 *
 * 600 을 넘으면 안 쓴다. 1kg 쌀자루나 2L 병을 한 번에 먹는 것으로 세면 반대 방향으로
 * 틀리고, 그쪽이 더 나쁘다 — 아무 제품이나 "하루 기준치의 300%" 가 되어 경고가 뜻을
 * 잃는다. 그 구간은 `serving_size` 가 없으면 여전히 100g 로 둔다.
 */
function servingOf(p: OffProduct): number | undefined {
  const declared = parseServingGrams(p.serving_size);
  if (declared) return declared;
  const whole = parseServingGrams(p.quantity);
  return whole && whole <= 600 ? whole : undefined;
}

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
export function nameOverlap(query: string, candidate: string, productName?: string): number {
  return nameMatch(query, candidate, productName).score;
}

/**
 * 나온 값을 뒤집을 수 있는 수식어들.
 *
 * "Zero" 가 붙은 것과 안 붙은 것은 **같은 이름의 다른 물건**이다. Coca-Cola Zero 를
 * 찍었는데 Coca-Cola 의 영양이 붙으면 당이 0 에서 10.6g/100ml 이 되고, 당뇨 프로필의
 * 판정이 통째로 뒤집힌다. 이름이 아무리 겹쳐도 이것이 어긋나면 다른 물건이다.
 */
const FLIPS = ['zero', 'free', 'diet', 'light', 'lite', 'sugarfree', 'unsweetened', 'decaf', 'skim', 'skimmed'];

/**
 * 이름이 같은 물건을 가리키는가.
 *
 * **양쪽에서 본다.** 전에는 "내 낱말이 후보에 얼마나 들어 있나" 하나만 봤는데, 그러면
 * 후보 이름이 짧을 때 이길 수가 없다. 실제로 겪은 것:
 *
 *   찍은 것   "Munchy's Lexus Vanilla Cream Sandwich Biscuits"  (뜻 있는 낱말 여섯)
 *   후보      "Lexus" (브랜드 Munchy's)                          → 2/6 = 0.33, 탈락
 *
 * OFF 의 레코드 이름은 짧기 일쑤고(브랜드가 따로 있으니), 판별 모델이 내는 이름은
 * 길기 일쑤다(포장지를 그대로 읽으니). 한 방향만 보면 그 둘이 영영 안 만난다.
 *
 * 그래서 **후보의 낱말이 내 질의에 얼마나 들어 있나**도 같이 보고 높은 쪽을 쓴다.
 * "Lexus" 는 통째로 질의 안에 있으므로 1.0 이다.
 *
 * 뒤집는 방향은 헐거워서 두 가지로 조인다:
 *
 *   맞은 낱말이 **둘 이상**   "Milk" 하나가 통째로 들어 있다고 아무 우유나 되면 안 된다.
 *   `FLIPS` 가 어긋나면 탈락   Zero 를 찍었는데 Zero 아닌 것이 오면 그것은 다른 물건이다.
 *
 * 여기까지가 이 점수로 할 수 있는 전부다. `Snickers bar 50g` 와 `Mars Snickers` 는
 * 0.50 인데, `Apple juice 1l` 과 `Orange juice` 도 0.50 이다 — 앞엣것은 받고 싶고
 * 뒤엣것은 막아야 하는데 점수가 같다. 문턱을 내리면 사과주스에 오렌지주스의 당이
 * 붙는다. 그래서 안 내린다: 못 찾으면 "성분표를 찍어 보라" 로 끝나지만, 잘못 찾으면
 * 다른 제품의 숫자가 이 사람의 하루 누적에 조용히 들어간다.
 */
export function nameMatch(query: string, candidate: string, productName = candidate):
  { score: number; matched: number } {
  /*
    용량은 이름이 아니다.

    `500ml`, `50g`, `1l` 같은 토큰은 판별 모델이 포장지에서 읽어 붙이는데, OFF 는 그것을
    이름이 아니라 `quantity` 칸에 따로 담는다. 그래서 이 토큰들은 **어느 후보에도 안
    맞으면서 분모만 키운다** — 낱말 셋짜리 질의에서 하나가 용량이면 나머지가 다 맞아도
    0.67 이다.
  */
  const SIZE = /^\d+(\.\d+)?(g|kg|mg|ml|l|cl|oz|lb|pc|pcs|x\d+)?$/;
  const words = (t: string) => flatten(t).split(' ')
    .filter((w) => w.length > 2 && !SIZE.test(w));
  const q = words(query);
  const c = words(candidate);
  if (q.length === 0 || c.length === 0) return { score: 0, matched: 0 };

  const cSet = ` ${c.join(' ')} `;
  const qSet = ` ${q.join(' ')} `;
  const hit = q.filter((w) => cSet.includes(w));
  const back = c.filter((w) => qSet.includes(w));

  // 값을 뒤집는 수식어는 양쪽에 같이 있거나 같이 없어야 한다.
  for (const flip of FLIPS) {
    if (q.includes(flip) !== c.includes(flip)) return { score: 0, matched: 0 };
  }
  /*
    한 낱말만 겹칠 때는 그 낱말이 **제품 이름**에 있어야 한다. 브랜드로는 안 된다.

    후보 이름에는 브랜드가 앞에 붙는데, 브랜드 하나가 맞았다고 그 브랜드의 아무
    제품이나 받으면 안 된다. 실제로 겪은 것: "Géli Caramel Candy" 를 찍고 낱말이
    줄어든 질의가 `Geli` 가 되면, OFF 의 `Geli Berry mix` 가 1.00 으로 통과했다 —
    캐러멜 사탕에 젤리의 당 60.7g 이 붙는다.

    "Nutella" 처럼 낱말 하나가 곧 제품인 경우는 그대로 통과한다. 그쪽은 이름에 있다.
  */
  if (hit.length < 2) {
    const inName = ` ${words(productName).join(' ')} `;
    const solid = hit.filter((w) => inName.includes(w));
    return { score: solid.length / q.length, matched: solid.length };
  }

  return { score: Math.max(hit.length / q.length, back.length / c.length), matched: hit.length };
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
/**
 * 검색에 보낼 낱말들.
 *
 * **괄호가 검색을 통째로 죽인다.** 판별 모델은 이름 뒤에 설명을 붙이는 일이 잦고
 * ("Monster Energy Ultra (Zero Sugar)"), 그것을 그대로 보내면 OFF 의 질의 문법이
 * 괄호를 연산자로 읽어 **0건**을 낸다. 괄호만 빼면 같은 질의가 그 제품을 첫 번째로
 * 돌려준다 — 실제로 그렇게 확인했다.
 *
 * 화면에는 "성분표를 못 읽었다" 가 뜬다. 사람은 뒷면을 다시 찍으라는 말을 듣지만,
 * 이 앱은 그 이름으로 이미 찾을 수 있었다.
 */
export function searchWords(query: string): string[] {
  return flatten(query).split(' ').filter(Boolean);
}

export async function searchByName(query: string): Promise<NutrientProfile | null> {
  const words = searchWords(query);
  if (words.join('').length < 3) return null;

  /*
    길게 한 번, 짧게 한 번.

    모델이 붙이는 꼬리는 괄호만이 아니다 — 용량("500ml can"), 묶음("family pack"),
    맛 설명이 이름 뒤에 붙는데 그런 낱말은 어느 제품 이름에도 없다. 낱말이 다섯을
    넘으면 앞의 넷으로 한 번 더 묻는다. 브랜드와 제품명은 앞에 오기 때문이다.

    한 번 더 묻는 값이 싸지 않다(분당 10회 한도가 있다). 그래서 **첫 질의가 빈손일
    때만** 두 번째를 보낸다.
  */
  const tries = words.length > 4 ? [words.join(' '), words.slice(0, 4).join(' ')] : [words.join(' ')];
  for (const attempt of tries) {
    const found = await searchOnce(attempt, query);
    if (found) return found;
  }
  return null;
}

async function searchOnce(q: string, forScoring: string): Promise<NutrientProfile | null> {
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
      /*
        점수는 **줄인 질의가 아니라 원래 이름**으로 매긴다.

        줄여서 물어본 뒤 그 줄인 것으로 재면, 낱말이 적어진 만큼 아무 제품이나 쉽게
        문턱을 넘는다 — 다른 제품의 영양 정보가 이 사람의 하루 누적에 들어간다.
        묻는 것은 넓게, 받아들이는 것은 좁게.
      */
      .map((p) => ({ p, score: nameMatch(forScoring, `${p.brands ?? ''} ${p.name}`, p.name).score }))
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
