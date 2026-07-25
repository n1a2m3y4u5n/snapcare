import type { ItemFlag, Member } from '@/lib/snapcare/types';
// 확장자를 붙이는 이유: 이 모듈들을 node --test 로 번들러 없이 직접 돌린다.
import { referenceFor } from './reference.ts';
import {
  NUTRIENT_KIND,
  type DailyReference,
  type NutrientAmounts,
  type NutrientAssessment,
  type NutrientKey,
  type NutrientProfile,
} from './types.ts';

/**
 * 영양 계산 코어 — 전부 순수 함수다 (네트워크·저장소 접근 없음).
 *
 * 흐름: 100g 기준 프로필 → 실제 섭취량으로 환산 → 개인 기준치와 대조 → 레벨/플래그.
 * 외부에서 받는 것은 "100g에 뭐가 얼마나 들었나" 뿐이고,
 * 그 뒤의 환산·기준 대조·경고 판단은 모두 여기서 일어난다.
 */

/** 한 번에 먹는 양(g). serving 정보가 있으면 그것을, 없으면 100g을 기본으로 본다. */
export function portionGrams(profile: NutrientProfile, servings = 1): number {
  const base = profile.servingGrams && profile.servingGrams > 0 ? profile.servingGrams : 100;
  return base * servings;
}

/** 100g 기준 프로필 → 실제 섭취량으로 환산. */
export function amountsFor(profile: NutrientProfile, grams: number): NutrientAmounts {
  const factor = grams / 100;
  const out: NutrientAmounts = {};
  for (const [k, v] of Object.entries(profile.per100) as [NutrientKey, number][]) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[k] = round1(v * factor);
    }
  }
  return out;
}

/** 여러 섭취 기록의 영양소를 합산 (하루 누적용). */
export function sumAmounts(list: NutrientAmounts[]): NutrientAmounts {
  const out: NutrientAmounts = {};
  for (const a of list) {
    for (const [k, v] of Object.entries(a) as [NutrientKey, number][]) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        out[k] = round1((out[k] ?? 0) + v);
      }
    }
  }
  return out;
}

/**
 * 섭취량을 개인 기준치와 대조해 영양소별로 판정한다.
 *
 * limit 계열(당·소금·포화지방 등)은 "한 번에 하루 상한의 절반 이상"이면 high 로 본다.
 * 하루 상한을 한 끼가 절반 넘게 먹어버리면 나머지 끼니에서 회복이 어렵기 때문이다.
 */
export function assess(amounts: NutrientAmounts, ref: DailyReference): NutrientAssessment[] {
  const out: NutrientAssessment[] = [];

  for (const [k, amount] of Object.entries(amounts) as [NutrientKey, number][]) {
    const kind = NUTRIENT_KIND[k];
    const reference = kind === 'limit' ? ref.limits[k] : ref.targets[k];
    if (reference === undefined || reference <= 0) continue;

    const pct = round1((amount / reference) * 100);
    const level =
      kind === 'limit'
        ? pct >= 50 ? 'high' : pct >= 25 ? 'moderate' : 'low'
        : pct >= 25 ? 'good' : pct >= 10 ? 'some' : 'low';

    out.push({ key: k, kind, amount, reference, pct, level });
  }

  // 경고가 될 수 있는 것부터 (초과율 높은 순)
  return out.sort((a, b) => (a.kind === b.kind ? b.pct - a.pct : a.kind === 'limit' ? -1 : 1));
}

/**
 * OpenFoodFacts allergens_tags → 앱의 ItemFlag. 태그는 'en:peanuts' 형태.
 *
 * 주의: OFF에서 땅콩은 'en:peanuts', 견과류는 'en:nuts' 로 분리돼 있다.
 * 의학적으로도 다른 알레르겐이므로 각각 다른 플래그로 매핑한다.
 * peanut 규칙을 먼저 평가하고, tree_nuts 는 'peanut' 이 포함되지 않은 태그에만 적용한다.
 */
const ALLERGEN_FLAG: { match: RegExp; flag: ItemFlag }[] = [
  { match: /peanut/i, flag: 'peanut' },
  { match: /(?<!pea)nuts?\b|almond|hazelnut|walnut|cashew|pistachio|pecan/i, flag: 'tree_nuts' },
  { match: /gluten|wheat|barley|rye/i, flag: 'gluten' },
  { match: /milk|lactose|dairy/i, flag: 'lactose' },
  { match: /crustacean|shellfish|mollusc/i, flag: 'shellfish' },
  { match: /\begg/i, flag: 'egg' },
  { match: /soy|soja/i, flag: 'soy' },
  { match: /sesame|참깨/i, flag: 'sesame' },
];

/** 하루 상한의 이 비율 이상을 한 번에 채우면 "높음"으로 본다. */
const HIGH_RATIO = 0.5;

/**
 * 아이템 플래그를 **계산으로** 도출한다.
 *
 * 기존에는 카탈로그에 'high_sugar' 를 손으로 박아뒀지만,
 * 이제 그 사람의 하루 당 상한 대비 50% 이상일 때만 붙는다 —
 * 같은 제품이라도 7살 아이에게는 high_sugar 이고 성인에게는 아닐 수 있다.
 */
export function deriveFlags(
  profile: NutrientProfile,
  amounts: NutrientAmounts,
  ref: DailyReference,
): ItemFlag[] {
  const flags = new Set<ItemFlag>();

  for (const tag of profile.allergenTags ?? []) {
    for (const { match, flag } of ALLERGEN_FLAG) {
      if (match.test(tag)) flags.add(flag);
    }
  }

  // 수치 기반 플래그 — 개인 상한 대비로 판단하므로 사람마다 결과가 다를 수 있다.
  const numeric: { key: 'sugars' | 'salt' | 'saturatedFat'; flag: ItemFlag }[] = [
    { key: 'sugars', flag: 'high_sugar' },
    { key: 'salt', flag: 'high_salt' },
    { key: 'saturatedFat', flag: 'high_sat_fat' },
  ];
  for (const { key, flag } of numeric) {
    const limit = ref.limits[key];
    const amount = amounts[key];
    if (limit && amount !== undefined && amount >= limit * HIGH_RATIO) {
      flags.add(flag);
    }
  }

  return [...flags];
}

/**
 * 프로필 + 구성원 → 그 사람 기준으로 계산된 플래그.
 * 1회 제공량을 그 사람의 하루 상한과 대조하므로 구성원마다 결과가 다를 수 있다.
 */
export function flagsForMember(profile: NutrientProfile, member: Member): ItemFlag[] {
  const ref = referenceFor(member);
  const amounts = amountsFor(profile, portionGrams(profile));
  return deriveFlags(profile, amounts, ref);
}

/** 프로필 + 구성원 → 그 사람 기준 1회 섭취량 판정. */
export function assessForMember(profile: NutrientProfile, member: Member): NutrientAssessment[] {
  const ref = referenceFor(member);
  return assess(amountsFor(profile, portionGrams(profile)), ref);
}

/** 화면·음성에 쓸 한 줄 요약. 수치를 읽지 못하는 사용자를 위해 문장으로 만든다. */
export function summarize(assessments: NutrientAssessment[]): string | null {
  const over = assessments.filter((a) => a.kind === 'limit' && a.level === 'high');
  if (over.length > 0) {
    const names = over.map((a) => a.key === 'saturatedFat' ? 'saturated fat' : a.key);
    return `High in ${names.join(' and ')} — this one serving covers over half of the daily limit.`;
  }
  const good = assessments.filter((a) => a.kind === 'target' && a.level === 'good');
  if (good.length > 0) {
    return `Good source of ${good.map((a) => a.key).join(' and ')}.`;
  }
  return null;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
