import type { ScanItem, Verdict } from './types';
import { getCondition } from './conditions.ts';

/**
 * "그럼 뭘 먹어야 하나" 에 답한다.
 *
 * 왜 제품 이름을 대지 않는가: 카탈로그에 손으로 적어둔 대체품(SunButter oat bar)은
 * 바코드로 알아본 몇 개 품목에만 붙어 있어서, 라벨을 촬영해 들어온 경로에서는
 * 아무것도 뜨지 않았다(형성 평가: 라벨 12시행 전부). 그렇다고 OCR 로 읽은 제품에
 * 우리가 대체 상품명을 지어 붙일 수는 없다 — 그 지역 상점에 그 물건이 있는지
 * 우리는 모르고, 없는 물건을 권하는 것은 답이 아니라 소음이다.
 *
 * 대신 **찾아야 할 조건**을 말한다. "땅콩이 들어 있지 않은 것" 은 어느 상점에서도
 * 성립하고, 픽토그램으로도 그릴 수 있다(회피 형태소에 부정 연산자를 씌우면 된다).
 */

export interface Alternative {
  /** 화면·음성에 쓸 한 문장 */
  text: string;
  /** 함께 보일 형태소 (부정 연산자를 씌워 쓴다). 없으면 그림 없이 문장만. */
  glyph?: string;
}

/**
 * 조건 → 무엇을 피해 고를 것인가.
 *
 * conditions.ts 의 id 를 그대로 쓴다. 조건이 늘어나면 여기 한 줄을 더하면 되고,
 * 빠뜨리면 대체 제안이 안 뜰 뿐 잘못된 제안이 뜨지는 않는다.
 */
const BY_CONDITION: Record<string, Alternative> = {
  peanut_allergy:     { text: 'Look for something without peanuts.',   glyph: 'allergen_peanut' },
  tree_nut_allergy:   { text: 'Look for something without nuts.',      glyph: 'allergen_tree_nut' },
  lactose_intolerant: { text: 'Look for something without milk.',      glyph: 'allergen_milk' },
  gluten_sensitivity: { text: 'Look for something without wheat.',     glyph: 'allergen_gluten' },
  egg_allergy:        { text: 'Look for something without egg.',       glyph: 'allergen_egg' },
  soy_allergy:        { text: 'Look for something without soy.',       glyph: 'allergen_soy' },
  shellfish_allergy:  { text: 'Look for something without shellfish.', glyph: 'allergen_shellfish' },
  sesame_allergy:     { text: 'Look for something without sesame.',    glyph: 'allergen_sesame' },
  diabetic:           { text: 'Look for something with less sugar.',   glyph: 'food_sugar' },
  hypertension:       { text: 'Look for something with less salt.',    glyph: 'food_salt' },
};

/** 영양 기준 초과가 이유일 때. 조건과 달리 사람이 아니라 수치에서 나온다. */
const BY_FLAG: Record<string, Alternative> = {
  high_sugar:   { text: 'Look for something with less sugar.', glyph: 'food_sugar' },
  high_salt:    { text: 'Look for something with less salt.',  glyph: 'food_salt' },
  high_sat_fat: { text: 'Look for something with less fat.',   glyph: 'food_oil' },
};

/**
 * 이 판정에 대해 제시할 대체 기준.
 *
 * 카탈로그에 손으로 적힌 대체품이 있으면 그것을 우선한다 — 실재하는 제품을 아는
 * 경우가 지역 조건보다 낫다. 없으면 회피 사유에서 유도한다.
 */
export function alternativeFor(item: ScanItem, verdict: Verdict): Alternative | null {
  // 먹는 것이 아니면 대체를 말할 자리가 아니다.
  if (item.kind !== 'food' && item.kind !== 'drink') return null;
  // 안전하다고 판정된 것에 대체를 권하면 판정을 스스로 뒤집는 셈이다.
  if (verdict.level === 'safe') return null;

  const derived = deriveAlternative(item, verdict);

  // 이름은 카탈로그 것을 쓰되 **그림은 유도한 것을 빌려온다.**
  //
  // 전에는 카탈로그 대체품이 있으면 그림 없이 문장만 나갔다. 화면에서는 ✓ 쪽 칸이
  // 비어서 장바구니 아이콘으로 떨어졌는데, 이 칸의 일이 "그럼 뭘 고르나" 를 그림으로
  // 말하는 것이라 정작 그림이 필요한 자리에서 그림이 사라진 셈이다. 이름이 있든
  // 없든 피해야 할 것은 같으므로, 그림은 그대로 쓸 수 있다.
  if (item.alt) return { text: `${item.alt.name} — ${item.alt.note}`, glyph: derived?.glyph };
  return derived;
}

function deriveAlternative(item: ScanItem, verdict: Verdict): Alternative | null {
  // 판정 이유로 걸린 조건부터 본다. 이유가 여럿이면 가장 무거운 것 하나만 —
  // 듣는 사람에게 회피 목록을 읽어주는 것은 도움이 아니라 부담이다.
  const ordered = [...verdict.reasons].sort(
    (a, b) => (a.level === 'avoid' ? -1 : 1) - (b.level === 'avoid' ? -1 : 1),
  );
  for (const r of ordered) {
    if (r.conditionId && BY_CONDITION[r.conditionId]) return BY_CONDITION[r.conditionId];
    // conditionId 가 없는 이유(영양 기준 초과)는 아이템 플래그에서 찾는다.
    if (!r.conditionId) {
      for (const f of item.flags) {
        if (BY_FLAG[f]) return BY_FLAG[f];
      }
    }
  }

  // 조건에 걸리지 않았는데 주의가 뜬 경우는 대개 영양 기준이다.
  for (const f of item.flags) {
    if (BY_FLAG[f]) return BY_FLAG[f];
  }
  return null;
}

/** 조건 id 가 실제로 존재하는지 — 표를 손으로 관리하다 오타가 나면 조용히 안 뜬다. */
export function knownConditionIds(): string[] {
  return Object.keys(BY_CONDITION).filter((id) => getCondition(id) !== undefined);
}
