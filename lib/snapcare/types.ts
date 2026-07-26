import type { NutrientProfile } from '@/lib/nutrition/types';

// SnapCare 코어 도메인 타입
// 사진 1장 → 의도 판별 → 가족 구성원별 신호등 판정 (blend: 접근성 코어 + 와이어프레임 UX)

export type Level = 'safe' | 'caution' | 'avoid';

export type ItemKind = 'food' | 'drink' | 'medicine' | 'prescription';

/** 스캔 대상이 가진 속성 플래그 (컨디션과 대조하는 열쇠) */
export type ItemFlag =
  | 'peanut' | 'tree_nuts' | 'gluten' | 'lactose' | 'shellfish' | 'egg' | 'soy' | 'sesame'
  | 'high_sugar' | 'high_salt' | 'high_sat_fat'
  | 'unsafe_pregnancy' | 'unsafe_breastfeeding'
  | 'caffeine' | 'nsaid_bleed' | 'alcohol';

/** 가족 구성원이 가진 건강 컨디션 정의 */
export interface ConditionDef {
  id: string;
  label: string;
  emoji: string;
  kind: 'allergen' | 'diet' | 'med';
  /**
   * 사용자가 이 사실을 어떻게 알 수 있는가.
   *  now        — 지금 본인 상태 (인프라 불필요)
   *  experience — 먹고 아팠던 경험으로 안다 (진단 불필요)
   *  diagnosis  — 진료를 받아야 안다
   * 대상 지역엔 알레르기 검사 인프라가 거의 없어서, 진단을 전제하면 프로필이 비어버린다.
   * 화면은 이 축으로 묶어 "당신이 알 수 있는 것"만 묻는다.
   */
  /**
   * 이 조건을 사용자가 어떻게 알 수 있는가 — 자가보고 화면의 묶음 축이다.
   * 'pattern' 은 스스로는 알 수 없고 식사 기록의 누적으로만 드러나는 것이라
   * 목록에 띄우지 않는다 (lib/pattern/infer.ts 가 제안한다).
   */
  knownBy: 'now' | 'experience' | 'diagnosis' | 'pattern';
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
  /**
   * 제품 바코드. 있으면 영양 엔진이 OpenFoodFacts 프로필을 받아
   * 구성원별 기준치와 대조한 실제 수치 판정을 낸다 (없으면 정성 판정만).
   */
  barcode?: string;
  /**
   * 조회 없이 이미 확보한 영양 프로필 (성분표 OCR·사진 판별 결과).
   * 바코드가 없어도 — 즉 제품 DB에 없는 로컬 식품이어도 — 계산 엔진이 그대로 돈다.
   */
  profile?: NutrientProfile;
  /**
   * 무엇인지 알아내지 못했다.
   *
   * 자체 모델은 회귀라서 '모르겠다' 를 말할 수 없다 — 벽을 찍어도 다섯 숫자를 낸다.
   * 그래서 숫자가 나왔다는 것이 알아봤다는 뜻이 아니고, 알아보지 못했으면 알레르기를
   * 대조할 대상 자체가 없으므로 'safe' 는 근거 없는 말이 된다.
   */
  unidentified?: boolean;
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
    /**
     * 제형. OCR 이 이미 알아내는 값인데(extractRxInfo.drugForm) 여기까지 오지 않아서,
     * 안약을 찍어도 픽토그램은 알약통이 나왔다. 그림 엔진이 이 값으로 머리를 고른다.
     */
    form?: 'tablet' | 'capsule' | 'syrup' | 'eyedrop' | 'cream' | 'inhaler'
      | 'injection' | 'suppository' | 'sachet';
    /** 쓰기 전에 손을 씻어야 하는가 (안약·연고 등). OCR 이 이미 판단하는 값이다. */
    handwash?: boolean;
  };
}

/** 기준치 산출용 나이대. 타이핑 없이 그림으로 고르게 하려고 연속값 대신 구간을 쓴다. */
export type AgeBand = 'child' | 'teen' | 'adult' | 'senior';

export interface Member {
  id: string;
  name: string;
  /** 예: 'Adult', 'Child · age 7' */
  role: string;
  /** 없으면 role 문자열에서 추정한다 (구버전 저장분 호환) */
  ageBand?: AgeBand;
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

/**
 * 먹고 난 뒤 몸이 어땠는지. 글자 없이 아이콘으로 입력받는다.
 * 이 기록이 쌓이면 lib/pattern/infer.ts 가 어떤 성분에서 반복되는지 찾는다.
 */
export type Reaction = 'fine' | 'unwell';

/** 어디가 불편했는지. 알레르기(즉시형)와 소화 불내성을 가르는 단서다. */
export type Symptom = 'skin' | 'gut' | 'breath' | 'mouth';

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
  /**
   * 하루 경계 키 (YYYY-MM-DD). 하루 누적 분석이 "오늘"을 고르는 기준.
   * 데모 시드 기록은 'today' 라는 센티널을 쓴다 — 모듈 로드 시점에 Date를 읽으면
   * 서버·클라이언트 렌더가 어긋나기 때문이다.
   */
  dayKey: string;
  /** 영양 누적용 — 있으면 캐시된 프로필로 섭취량을 재계산할 수 있다. */
  barcode?: string;
  /** 그때 먹은 양(g) */
  grams?: number;
  /**
   * 그때 판정한 대상 전체.
   * itemId 만으로는 카탈로그에 있는 것만 되살릴 수 있어서, OCR·라벨·사진으로 만든
   * 아이템은 기록을 눌러도 열리지 않았고 하루 누적에도 잡히지 않았다.
   */
  item?: ScanItem;
  /**
   * 그때 이 음식에 들어 있다고 본 알레르겐 태그 ('en:peanuts').
   *
   * item 에서 유도하지 않고 따로 남긴다 — 식이 일지는 "그때 무엇이라고 알고 있었는가"의
   * 기록이어야 하고, 나중에 카탈로그나 판별 결과가 바뀌면 지난 끼니의 해석까지 조용히
   * 달라진다. 추론이 딛고 서는 근거가 흔들리면 안 된다.
   */
  tags?: string[];
  /** 먹고 난 뒤의 몸 상태. 사용자가 나중에 아이콘으로 답한다. */
  reaction?: Reaction;
  /** reaction='unwell' 일 때 어디가 불편했는지 */
  symptoms?: Symptom[];
}
