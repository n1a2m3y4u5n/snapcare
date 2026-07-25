import type { ConditionDef } from './types';

/**
 * 판정에 쓰이는 개인 조건.
 *
 * 배열 순서가 곧 화면 순서이고, `knownBy` 로 묶어서 보여준다.
 * 이 축이 필요한 이유: 대상 지역(사하라 이남·남아시아 농촌)에는 알레르기 검사 인프라가
 * 사실상 없다. "당신은 무슨 알레르기가 있습니까"라고 물으면 대부분 답할 수 없고,
 * 프로필이 비면 판정도 못 한다.
 *
 * 그래서 순서를 뒤집었다 — 진단명을 묻는 대신, 그 사람이 실제로 알 수 있는 것부터 묻는다.
 *   now        지금 본인 상태 (임신·수유) — 검사도 진료도 필요 없다
 *   experience 먹고 탈이 났던 기억 — 진단서 없이도 안다
 *   diagnosis  진료를 받은 사람만 아는 것 — 있으면 쓰고, 없어도 앱은 동작한다
 *
 * 임신·수유를 맨 앞에 둔 근거는 우리 예선 페르소나 시뮬레이션이다:
 * 텍스트만 준 대조군에서 "가임기 페르소나 4명 전원이 임신 금기를 인지하지 못했다".
 * 그런데 정작 조건 목록에는 임신이 없었다 — 가장 흔하고, 가장 알기 쉽고,
 * 가장 위험한 항목이 빠져 있었던 셈이다.
 */
export const CONDITIONS: ConditionDef[] = [
  // ── 지금 본인 상태 — 인프라가 필요 없다 ────────────────
  {
    id: 'pregnant',
    label: 'Pregnant',
    emoji: '🤰',
    kind: 'med',
    knownBy: 'now',
    trigger: 'unsafe_pregnancy',
    severity: 'avoid',
    reason: 'Not safe during pregnancy',
  },
  {
    id: 'breastfeeding',
    label: 'Breastfeeding',
    emoji: '🤱',
    kind: 'med',
    knownBy: 'now',
    trigger: 'unsafe_breastfeeding',
    severity: 'avoid',
    reason: 'Not safe while breastfeeding',
  },

  // ── 먹고 탈이 났던 기억으로 아는 것 ─────────────────────
  {
    id: 'peanut_allergy',
    label: 'Peanuts',
    emoji: '🥜',
    kind: 'allergen',
    knownBy: 'experience',
    trigger: 'peanut',
    severity: 'avoid',
    reason: 'Contains peanuts',
  },
  {
    // 땅콩(en:peanuts)과 견과류(en:nuts)는 데이터에서도 의학적으로도 별개다.
    id: 'tree_nut_allergy',
    label: 'Nuts',
    emoji: '🌰',
    kind: 'allergen',
    knownBy: 'experience',
    trigger: 'tree_nuts',
    severity: 'avoid',
    reason: 'Contains tree nuts',
  },
  {
    id: 'lactose_intolerant',
    label: 'Milk',
    emoji: '🥛',
    kind: 'diet',
    knownBy: 'experience',
    trigger: 'lactose',
    severity: 'caution',
    reason: 'Contains dairy',
  },
  {
    id: 'egg_allergy',
    label: 'Egg',
    emoji: '🥚',
    kind: 'allergen',
    knownBy: 'experience',
    trigger: 'egg',
    severity: 'avoid',
    reason: 'Contains egg',
  },
  {
    id: 'shellfish_allergy',
    label: 'Shellfish',
    emoji: '🦐',
    kind: 'allergen',
    knownBy: 'experience',
    trigger: 'shellfish',
    severity: 'avoid',
    reason: 'Contains shellfish',
  },

  // ── 진료를 받은 사람만 아는 것 ──────────────────────────
  {
    id: 'diabetic',
    label: 'Diabetes',
    emoji: '🩸',
    kind: 'diet',
    knownBy: 'diagnosis',
    trigger: 'high_sugar',
    severity: 'caution',
    reason: 'High in sugar',
  },
  {
    id: 'hypertension',
    label: 'Blood pressure',
    emoji: '🫀',
    kind: 'diet',
    knownBy: 'diagnosis',
    trigger: 'high_salt',
    severity: 'caution',
    reason: 'High in salt',
  },
  {
    id: 'gluten_sensitivity',
    label: 'Gluten',
    emoji: '🌾',
    kind: 'diet',
    knownBy: 'diagnosis',
    trigger: 'gluten',
    severity: 'caution',
    reason: 'Contains gluten',
  },
  {
    id: 'blood_thinner_conflict',
    label: 'Blood thinner',
    emoji: '💊',
    kind: 'med',
    knownBy: 'diagnosis',
    trigger: 'nsaid_bleed',
    severity: 'avoid',
    reason: 'May interact with blood thinners',
  },
];

export const CONDITIONS_BY_ID: Record<string, ConditionDef> = Object.fromEntries(
  CONDITIONS.map((c) => [c.id, c]),
);

export function getCondition(id: string): ConditionDef | undefined {
  return CONDITIONS_BY_ID[id];
}
