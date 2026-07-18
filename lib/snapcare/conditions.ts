import type { ConditionDef } from './types';

/**
 * 건강 컨디션 카탈로그 (와이어프레임 "Mia" 프로필 편집 화면 기준).
 * 타이핑 없이 픽토그램 토글로 선택 → 스캔 아이템의 flags와 대조해 판정한다.
 */
export const CONDITIONS: ConditionDef[] = [
  {
    id: 'peanut_allergy',
    label: 'Peanut allergy',
    emoji: '🥜',
    kind: 'allergen',
    trigger: 'peanut',
    severity: 'avoid',
    reason: 'Contains peanuts',
  },
  {
    id: 'gluten_sensitivity',
    label: 'Gluten sensitivity',
    emoji: '🌾',
    kind: 'diet',
    trigger: 'gluten',
    severity: 'caution',
    reason: 'Contains gluten',
  },
  {
    id: 'lactose_intolerant',
    label: 'Lactose intolerant',
    emoji: '🥛',
    kind: 'diet',
    trigger: 'lactose',
    severity: 'caution',
    reason: 'Contains dairy',
  },
  {
    id: 'shellfish_allergy',
    label: 'Shellfish allergy',
    emoji: '🦐',
    kind: 'allergen',
    trigger: 'shellfish',
    severity: 'avoid',
    reason: 'Contains shellfish',
  },
  {
    id: 'blood_thinner_conflict',
    label: 'Blood thinner conflict',
    emoji: '💊',
    kind: 'med',
    trigger: 'nsaid_bleed',
    severity: 'avoid',
    reason: 'May interact with blood thinners',
  },
  {
    id: 'diabetic',
    label: 'Diabetic',
    emoji: '🩸',
    kind: 'diet',
    trigger: 'high_sugar',
    severity: 'caution',
    reason: 'High in sugar',
  },
];

export const CONDITIONS_BY_ID: Record<string, ConditionDef> = Object.fromEntries(
  CONDITIONS.map((c) => [c.id, c]),
);

export function getCondition(id: string): ConditionDef | undefined {
  return CONDITIONS_BY_ID[id];
}
