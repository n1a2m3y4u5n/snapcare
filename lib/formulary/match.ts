import { WHO_DRUGS, type Drug } from './who.ts';

/**
 * OCR 이 읽은 글자 → 표에 있는 약 하나. 아니면 **없다고 말한다.**
 *
 * 왜 이것이 손글씨 OCR 을 쓸 만하게 만드는가
 * -------------------------------------------
 * 이 저장소는 손글씨 OCR 의 실패를 이미 재 두었다 — 라고스 안과 처방전에서
 * `8hrly` 가 `8mg` 로 읽혔고, 프리토리아 조사도 손글씨에서는 안 될 것이라고 적었다.
 * 그 측정은 여전히 맞다. 바뀐 것은 **문제**다.
 *
 * "아무 글자나 맞히기" 와 "이 목록에서 가장 가까운 것 고르기" 는 다른 문제다.
 * 앞쪽은 글자 하나가 틀리면 답이 틀리고, 뒤쪽은 글자 몇 개가 망가져도 답이 하나로
 * 모인다 — 목록에 `amoxicillin` 은 있고 `arnoxicillin` 은 없기 때문이다. 어휘를
 * 닫는 것이 OCR 을 고치는 것보다 싸고 확실하다.
 *
 * 그래서 이 파일의 일은 **거리를 재는 것**이 아니라 **언제 답하지 않을지 정하는
 * 것**이다. 아래 두 문턱값이 그 전부다.
 *
 * 두 문턱값
 * ---------
 * `MIN_SIMILARITY` 하나만으로는 모자란다. `insulin` 을 읽었는데 표에 `insulin` 과
 * `isoniazid` 가 둘 다 있고 둘 다 0.7 쯤이면, 하나를 고르는 것은 동전 던지기다.
 * 그래서 **2등과의 차이**(`MIN_MARGIN`)도 본다. 비슷한 것이 둘이면 답하지 않는다.
 *
 * 답하지 않는 쪽으로 틀리는 이유는 이 앱의 다른 모든 곳과 같다 — 이름이 틀리면
 * 그것은 **다른 약**이고, 다른 약의 그림과 다른 약의 경고가 화면에 뜬다. 못 읽었다고
 * 말하면 사람이 종이를 다시 보고, 틀리게 읽으면 아무도 모른다.
 */

/**
 * OCR 이 글자를 숫자로 잘못 읽는 짝들.
 *
 * 정규화 단계에서 숫자를 글자로 되돌린다. 약 이름에 숫자가 들어가는 경우는 이
 * 표에 없고(`3tc`·`azt` 같은 약어는 `also` 에서 따로 받는다), 그래서 숫자를 만나면
 * 그것은 함량이거나 잘못 읽은 글자다. 함량은 아래에서 통째로 잘라 내므로 남는 것은
 * 후자뿐이다.
 */
const CONFUSABLE: Record<string, string> = {
  '0': 'o', '1': 'l', '2': 'z', '5': 's', '6': 'g', '8': 'b',
};

/** 함량과 제형 — 이름이 아닌 뒷부분. `shortName` 과 같은 판단이다. */
const NOT_A_NAME = /\b\d+(\.\d+)?\s?(mg|mcg|ug|g|ml|l|iu|%)\b.*$|\b(tab|tabs|tablet|tablets|cap|caps|capsule|capsules|syrup|susp|suspension|drops?|cream|inj|injection|sachet|bp|usp|ip)\b/gi;

/** 이 아래로는 답하지 않는다. */
export const MIN_SIMILARITY = 0.72;
/** 2등과 이만큼은 벌어져야 한다. 아니면 둘 중 하나를 고를 근거가 없다. */
export const MIN_MARGIN = 0.06;

/**
 * 비교용으로 글자를 납작하게 만든다.
 *
 * 소문자, 숫자를 닮은 글자로 되돌리기, 글자만 남기기. 공백도 지운다 —
 * `co-trimoxazole` 과 `co trimoxazole` 과 `cotrimoxazole` 은 같은 약이고,
 * 손으로 쓴 종이에서 그 셋을 가르는 것은 뜻이 없다.
 */
export function normalize(text: string): string {
  let out = String(text ?? '').toLowerCase();
  out = out.replace(NOT_A_NAME, ' ');
  out = out.replace(/[0-9]/g, (d) => CONFUSABLE[d] ?? ' ');
  return out.replace(/[^a-z]/g, '');
}

/**
 * Damerau–Levenshtein 거리. 바꿔치기 하나를 **한 번**으로 센다.
 *
 * 보통의 Levenshtein 이 아닌 이유가 있다. OCR 과 손글씨에서 가장 흔한 오류가 인접한
 * 두 글자가 뒤바뀌는 것인데(`amoxicillin` → `amoxicilinl`), Levenshtein 은 그것을
 * 두 번으로 세고 그러면 문턱값을 넘어 버린다. 가장 흔한 오류를 가장 비싸게 매기는
 * 자는 이 일에 맞지 않는다.
 */
export function distance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // 세 줄만 들고 간다 — 바꿔치기를 세려면 두 줄 전이 필요하다.
  let prev2: number[] = [];
  let prev: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  let cur: number[] = new Array(n + 1);

  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, prev2[j - 2] + 1);
      }
      cur[j] = best;
    }
    prev2 = prev;
    prev = cur;
    cur = new Array(n + 1);
  }
  return prev[n];
}

/** 0..1. 긴 이름의 한 글자와 짧은 이름의 한 글자가 같은 무게를 갖지 않게 나눈다. */
export function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  return longest === 0 ? 0 : 1 - distance(a, b) / longest;
}

/**
 * 이 약이 종이에 적힐 수 있는 모든 철자와, 그 철자의 무게.
 *
 * 병합제의 **성분 하나**도 후보다. 종이에 `Trimethoprim` 이라고만 적혀 있는데
 * 표의 INN 은 `sulfamethoxazole + trimethoprim` 이라, 통째로 견주면 길이 차이만으로
 * 점수가 바닥난다. `also` 가 상품명을 받지만 성분 이름까지 다 적어 둘 수는 없다.
 *
 * 성분에는 무게를 깎는다. 안 깎으면 `Amoxicillin` 을 읽었을 때 단일제
 * `amoxicillin` 과 병합제의 성분 `amoxicillin` 이 **똑같이 1.0** 이 되고, 2등과의
 * 차이가 0 이라 답을 안 하게 된다 — 답이 뻔한 자리에서.
 */
function spellingsOf(drug: Drug): [string, number][] {
  const out: [string, number][] = [];
  for (const spelling of [drug.inn, drug.name, ...(drug.also ?? [])]) {
    out.push([spelling, 1]);
    if (spelling.includes('+')) {
      for (const part of spelling.split('+')) {
        const trimmed = part.trim();
        if (trimmed) out.push([trimmed, 0.94]);
      }
    }
  }
  return out;
}

export interface Match {
  drug: Drug;
  /** 어느 철자에 맞았나 — INN 인지 상품명인지. 화면이 그것을 말할 수 있어야 한다. */
  matched: string;
  similarity: number;
  /** 2등과의 차이. 0 에 가까우면 이 답은 우연에 가깝다. */
  margin: number;
}

/**
 * 표에서 하나 고른다. 확신이 안 서면 `null`.
 *
 * `null` 이 흔한 답이라는 것을 부르는 쪽이 알아야 한다. 표는 일차 진료에서 흔한
 * 것들만 담고 있고 — 전체 EML 이 아니다 — 표에 없는 약을 처방받은 사람이 실제로
 * 있다. 그때 화면이 할 말은 "못 읽었다" 가 아니라 **"이 목록에 없다"** 이고, 그
 * 둘은 사람이 다음에 할 일이 다르다.
 */
export function matchDrug(text: string, drugs: Drug[] = WHO_DRUGS): Match | null {
  const needle = normalize(text);
  // 두 글자로는 아무것도 못 고른다. `al`(artemether-lumefantrine)처럼 짧은 약어가
  // 표에 있는데, 그것들은 아래 정확히-일치로만 잡히게 둔다.
  if (needle.length < 3) {
    const exact = drugs.find((d) => [d.inn, ...(d.also ?? [])]
      .some((s) => normalize(s) === needle));
    return exact ? { drug: exact, matched: needle, similarity: 1, margin: 1 } : null;
  }

  const scored: Match[] = [];
  for (const drug of drugs) {
    let best = 0;
    let bestSpelling = drug.inn;
    for (const [spelling, weight] of spellingsOf(drug)) {
      const flat = normalize(spelling);
      if (!flat) continue;
      const score = similarity(needle, flat) * weight;
      if (score > best) { best = score; bestSpelling = spelling; }
    }
    scored.push({ drug, matched: bestSpelling, similarity: best, margin: 0 });
  }

  scored.sort((a, b) => b.similarity - a.similarity);
  const top = scored[0];
  if (!top || top.similarity < MIN_SIMILARITY) return null;

  const second = scored[1];
  const margin = second ? top.similarity - second.similarity : 1;
  if (second && second.drug !== top.drug && margin < MIN_MARGIN
      && normalize(top.matched) !== normalize(second.matched)) {
    /*
      2등과 너무 가까우면 답하지 않는다 — 다만 **같은 낱말에 맞은 경우는 빼고**.

      `Amoxicillin` 을 읽으면 단일제 `amoxicillin` 과 병합제의 성분 `amoxicillin` 이
      둘 다 걸리고, 둘의 점수 차이는 위에서 성분에 매긴 무게(0.94)뿐이다. 그 차이가
      작다는 것은 답이 애매하다는 뜻이 아니라 **우리가 그렇게 정했다**는 뜻이다.
      여기서 답을 접으면, 답이 가장 뻔한 자리에서 접게 된다.

      문턱값이 막으려는 것은 서로 **다른 낱말**이 비슷하게 걸리는 경우다 —
      `insulin` 과 `isoniazid` 같은. 그때는 하나를 고르는 것이 동전 던지기다.
    */
    return null;
  }

  return { ...top, margin };
}
