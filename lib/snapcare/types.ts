// SnapCare 코어 도메인 타입
// 사진 1장 → 의도 판별 → 가족 구성원별 신호등 판정 (blend: 접근성 코어 + 와이어프레임 UX)

export type Level = 'safe' | 'caution' | 'avoid';

export type ItemKind = 'food' | 'drink' | 'medicine' | 'prescription';

/** 스캔 대상이 가진 속성 플래그 (컨디션과 대조하는 열쇠) */
export type ItemFlag =
  | 'peanut' | 'gluten' | 'lactose' | 'shellfish'
  | 'high_sugar' | 'caffeine' | 'nsaid_bleed' | 'alcohol';

/** 가족 구성원이 가진 건강 컨디션 정의 */
export interface ConditionDef {
  id: string;
  label: string;
  emoji: string;
  kind: 'allergen' | 'diet' | 'med';
  /** 이 플래그를 가진 아이템이면 발동 */
  trigger: ItemFlag;
  /** 발동 시 심각도 */
  severity: Level;
  /** 판정 사유 문구 (구성원 이름은 호출부에서 합성) */
  reason: string;
}

/** 스캔되어 판정 대상이 되는 아이템 */
export interface ScanItem {
  id: string;
  name: string;
  kind: ItemKind;
  emoji: string;
  /** "Detected via …" — 어떻게 인식했는지 */
  detectedVia: string;
  flags: ItemFlag[];
  /** 음식/음료 영양 요약 (정성 가이드용) */
  nutrition?: { kcal?: number; protein?: string; sugar?: string; note?: string };
  /** 대체품 제안 */
  alt?: { name: string; note: string };
  /** 결과 화면 칩 (예: ⚡ 80mg caffeine) */
  chips?: { emoji: string; label: string }[];
  /** 처방/약 스케줄 */
  rx?: {
    dosageText: string;
    durationText: string;
    schedule: { time: string; label: string; emoji: string }[];
  };
}

export interface Member {
  id: string;
  name: string;
  /** 예: 'Adult', 'Child · age 7' */
  role: string;
  emoji: string;
  /** 아바타 배경색 (hex) */
  color: string;
  conditionIds: string[];
}

export interface VerdictReason {
  level: Level;
  text: string;
  conditionId?: string;
}

export interface Verdict {
  level: Level;
  /** 예: 'Safe to drink', 'Caution for Mia' */
  headline: string;
  /** 한 줄 요약 배지 문구 */
  summary: string;
  reasons: VerdictReason[];
  member: Member;
}

/** 최근 스캔 기록 항목 */
export interface ScanRecord {
  id: string;
  itemId: string;
  name: string;
  kind: ItemKind;
  emoji: string;
  memberId: string;
  level: Level;
  /** 표시용 시각 라벨 (예: '2:14 PM', 'Yesterday') — 렌더 중 포맷팅 회피 */
  timeLabel: string;
}
