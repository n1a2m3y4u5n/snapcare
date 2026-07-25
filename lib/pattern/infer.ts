import type { ConditionDef, ItemFlag } from '@/lib/snapcare/types';
// 상대경로 + 확장자: 이 모듈을 node --test 로 번들러 없이 직접 돌린다 (@/ 별칭은 해석되지 않는다).
import { CONDITIONS } from '../snapcare/conditions.ts';

/**
 * 식사 기록에서 알레르기·불내성을 역추론한다.
 *
 * 왜 필요한가
 * ----------
 * 조건 목록을 `knownBy: 'experience'` 로 바꿔 "땅콩 먹고 탈 난 적 있나요"를 묻게 했지만,
 * 그것도 본인이 이미 음식과 증상을 연결지어 놨을 때만 답할 수 있다. 대상 지역에는
 * 알레르기 검사 인프라가 사실상 없고, 글을 못 읽으면 원재료명을 확인할 방법도 없다.
 * 검사가 없는 곳에서 실제로 쓰는 방법이 식이 일지 + 제거식이다 — 그 연결을 앱이 대신 짓는다.
 *
 * 무엇을 하지 않는가
 * -----------------
 * 진단하지 않는다. 결과는 "이 성분이 든 음식에서 자주 불편했다"는 **관찰**이고,
 * 사용자가 확인해야 프로필의 조건으로 들어간다. 없는 알레르기를 있다고 하면
 * 식량이 부족한 곳에서 단백질 급원을 하나 지워버리는 셈이라, 놓치는 것만큼 해롭다.
 *
 * 통계
 * ----
 * 표본이 작다(한 가족의 몇 주치 끼니). 그래서 비율 비교 대신 Fisher 정확검정을 쓴다 —
 * 2×2 분할표에서 표본이 작을 때 정확한 확률을 주는 검정이다. 성분을 여러 개 동시에
 * 검사하므로 유의수준은 Bonferroni 로 나눈다. 그렇게 하지 않으면 성분 8개를 볼 때
 * "우연히 하나쯤"이 거의 항상 걸린다.
 */

export type Symptom = 'skin' | 'gut' | 'breath' | 'mouth';
export type Reaction = 'fine' | 'unwell';

/** 한 끼에 대한 사후 기록. 아이콘 세 개로 입력받는다 — 글자가 필요 없어야 한다. */
export interface MealFeedback {
  /** 그 끼니에 들어 있던 알레르겐 태그 (OpenFoodFacts 형식: 'en:peanuts') */
  tags: string[];
  reaction: Reaction;
  /** reaction='unwell' 일 때 어디가 불편했는지 */
  symptoms?: Symptom[];
}

export interface SuspectedTrigger {
  /** 프로필에 넣을 조건 (사용자가 확인하면) */
  condition: ConditionDef;
  /** 그 성분을 먹고 불편했던 횟수 / 먹은 횟수 */
  unwellWhenEaten: number;
  timesEaten: number;
  /** 그 성분이 없을 때 불편했던 횟수 / 먹은 횟수 — 대조군 */
  unwellOtherwise: number;
  timesOtherwise: number;
  /** Fisher 정확검정 단측 p 값 */
  p: number;
  /** 증상 양상이 알레르기 쪽인지 소화 불내성 쪽인지 */
  pattern: 'allergy' | 'intolerance';
  /** 화면·음성용 한 줄 (숫자를 읽지 못하는 사용자를 위해 횟수로 말한다) */
  text: string;
}

/** 이만큼은 쌓여야 말을 꺼낸다. 한두 번 체한 것을 알레르기라고 부르지 않는다. */
export const MIN_UNWELL = 3;      // 그 성분을 먹고 불편했던 횟수
export const MIN_EATEN = 4;       // 그 성분을 먹은 총 횟수
export const MIN_CONTROL = 3;     // 그 성분이 없던 끼니 수 (대조군이 없으면 비교가 불가능하다)
export const ALPHA = 0.05;

/** 태그 → 앱의 플래그. compute.ts 의 매핑과 같은 구분을 쓴다 (땅콩과 견과류는 다른 알레르겐). */
const TAG_FLAG: { match: RegExp; flag: ItemFlag }[] = [
  { match: /peanut/i, flag: 'peanut' },
  { match: /(?<!pea)nuts?\b|almond|hazelnut|walnut|cashew|pistachio|pecan/i, flag: 'tree_nuts' },
  { match: /gluten|wheat|barley|rye/i, flag: 'gluten' },
  { match: /milk|lactose|dairy/i, flag: 'lactose' },
  { match: /crustacean|shellfish|mollusc/i, flag: 'shellfish' },
  { match: /\begg/i, flag: 'egg' },
  { match: /soy|soja/i, flag: 'soy' },
  { match: /sesame|참깨/i, flag: 'sesame' },
];

function flagsOf(tags: string[]): ItemFlag[] {
  const out = new Set<ItemFlag>();
  for (const tag of tags) {
    for (const { match, flag } of TAG_FLAG) if (match.test(tag)) out.add(flag);
  }
  return [...out];
}

/**
 * 이 플래그를 방아쇠로 삼는 조건. 없으면 제안할 대상이 아니다.
 *
 * kind 로 거르지 않는다 — 우유·글루텐은 kind 가 'diet' 인데, 식이 일지가 가장 잘
 * 찾아내는 것이 바로 그 둘이다. 여기 들어오는 플래그는 전부 알레르겐 태그에서
 * 나온 것이라(TAG_FLAG) 애초에 수치 플래그나 약물 플래그가 섞일 수 없다.
 */
function conditionForFlag(flag: ItemFlag): ConditionDef | undefined {
  return CONDITIONS.find((c) => c.trigger === flag);
}

export function findTriggers(log: MealFeedback[]): SuspectedTrigger[] {
  // 검사 대상: 기록에 실제로 등장한 성분만. 먹은 적 없는 성분을 검정하면
  // Bonferroni 분모만 키워서 진짜 신호를 죽인다.
  const flags = new Set<ItemFlag>();
  for (const m of log) for (const f of flagsOf(m.tags)) flags.add(f);

  const testable = [...flags]
    .map((f) => ({ flag: f, condition: conditionForFlag(f) }))
    .filter((x): x is { flag: ItemFlag; condition: ConditionDef } => x.condition !== undefined);
  if (testable.length === 0) return [];

  const threshold = ALPHA / testable.length;   // Bonferroni
  const out: SuspectedTrigger[] = [];

  for (const { flag, condition } of testable) {
    const withIt = log.filter((m) => flagsOf(m.tags).includes(flag));
    const without = log.filter((m) => !flagsOf(m.tags).includes(flag));

    const a = withIt.filter((m) => m.reaction === 'unwell').length;
    const b = withIt.length - a;
    const c = without.filter((m) => m.reaction === 'unwell').length;
    const d = without.length - c;

    if (a < MIN_UNWELL || withIt.length < MIN_EATEN || without.length < MIN_CONTROL) continue;

    const p = fisherRightTail(a, b, c, d);
    if (p > threshold) continue;

    const pattern = patternOf(withIt);
    out.push({
      condition, p, pattern,
      unwellWhenEaten: a, timesEaten: withIt.length,
      unwellOtherwise: c, timesOtherwise: without.length,
      text: `${condition.label}: unwell ${a} of the ${withIt.length} times it was eaten, ${c} of ${without.length} times otherwise.`,
    });
  }

  return out.sort((x, y) => x.p - y.p);
}

/**
 * 증상 양상 → 알레르기인지 소화 불내성인지.
 *
 * 임상적으로 다른 것이고 앱의 대응도 달라야 한다. 두드러기·입술 부음·숨 가쁨은
 * 즉시형 알레르기 쪽이라 회피가 맞고, 배탈만 반복되는 것은 유당 불내성처럼
 * 양을 줄이면 되는 경우가 많다 — 그걸 다 '먹지 마시오'로 만들면 먹을 게 없어진다.
 */
function patternOf(meals: MealFeedback[]): 'allergy' | 'intolerance' {
  const symptoms = meals.flatMap((m) => m.symptoms ?? []);
  const immediate = symptoms.filter((s) => s === 'skin' || s === 'breath' || s === 'mouth').length;
  return immediate > 0 ? 'allergy' : 'intolerance';
}

/**
 * Fisher 정확검정 (단측, 오른쪽 꼬리).
 *
 *            불편   괜찮음
 *   먹었다     a       b
 *   안 먹었다  c       d
 *
 * 관측된 것만큼 또는 그보다 치우친 표의 확률을 전부 더한다.
 * 카이제곱과 달리 기대빈도가 5 미만이어도 쓸 수 있다 — 우리 표본이 늘 그렇다.
 */
export function fisherRightTail(a: number, b: number, c: number, d: number): number {
  const max = Math.min(a + b, a + c);
  let p = 0;
  for (let i = a; i <= max; i++) {
    // 주변합(행합·열합)을 고정한 채 a 만 i 로 옮기면 나머지 세 칸이 따라 정해진다.
    //   b' = (a+b) - i,  c' = (a+c) - i,  d' = (c+d) - c' = d - a + i
    p += Math.exp(logHypergeom(i, a + b - i, a + c - i, d - a + i));
  }
  return Math.min(1, p);
}

function logHypergeom(a: number, b: number, c: number, d: number): number {
  return (
    logFactorial(a + b) + logFactorial(c + d) + logFactorial(a + c) + logFactorial(b + d)
    - logFactorial(a + b + c + d)
    - logFactorial(a) - logFactorial(b) - logFactorial(c) - logFactorial(d)
  );
}

// 계승을 그대로 곱하면 20! 부터 배정밀도를 넘는다. 로그로 더한다.
const LOG_FACT = [0];
function logFactorial(n: number): number {
  for (let i = LOG_FACT.length; i <= n; i++) LOG_FACT[i] = LOG_FACT[i - 1] + Math.log(i);
  return LOG_FACT[n];
}
