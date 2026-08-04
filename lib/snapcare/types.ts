import type { NutrientProfile } from '@/lib/nutrition/types';

// SnapCare 코어 도메인 타입
// 사진 1장 → 의도 판별 → 가족 구성원별 신호등 판정 (blend: 접근성 코어 + 와이어프레임 UX)

export type Level = 'safe' | 'caution' | 'avoid';

export type ItemKind = 'food' | 'drink' | 'medicine' | 'prescription';

/**
 * 약에 딸린 주의 — 그림으로 그릴 수 있는 것만.
 *
 * 목록이 짧은 것은 의도다. 이 앱이 하는 약속은 **글을 못 읽어도 지시가 도착한다**
 * 이고, 그림이 없는 주의를 자료에 넣으면 그 약속을 못 지키는 자리가 조용히 생긴다.
 * 그림이 없는 것은 넣지 않는다 — 넣고 싶으면 형태소를 먼저 만든다.
 */
export type Precaution =
  /** 식후 · 음식과 함께 */
  | 'with_food'
  /** 공복 */
  | 'empty_stomach'
  /** 물 한 컵과 함께 — 식도에 걸리면 헐 수 있는 약들 */
  | 'full_glass'
  /** 졸릴 수 있다 */
  | 'drowsy'
  /** 운전하지 말 것 */
  | 'no_driving'
  /** 속이 불편할 수 있다 */
  | 'upset_stomach'
  /** 아이에게 주지 말 것 */
  | 'not_for_children'
  /** 냉장 보관 */
  | 'fridge'
  /** 빛을 피해 보관 */
  | 'keep_dark';

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
  /**
   * 지시가 **손으로 쓰여 있다.**
   *
   * 프리토리아 대학교 Celia 교수가 2026년 8월 조사에서 손글씨 처방전에서는 동작하지
   * 않을 것이라고 적었다. 우리는 인쇄된 표본으로만 시험했었다. 그래서 실제로 넣어 봤다 —
   * 라고스 안과 병원의 공개(CC0) 처방전 사진 한 장이다.
   *
   *   종이:  G. Azopt 8hrly / G. Combigan 12hrly / G. Xalatan nocte
   *   앱:    G. Azopt 8mg  / G. Combigan 12mg  / G. Xalatan nocte
   *          일정 = 아침·오후·밤, 판정 = 초록 "Take as prescribed"
   *
   * **빈도가 용량이 됐다.** 8시간마다가 8밀리그램으로, 12시간마다가 12밀리그램으로.
   * 종이에 없는 시각 세 개를 지어냈고, 그 위에 초록불을 켰다. 못 읽는 것과 다르다 —
   * 못 읽으면 사용자가 다시 묻지만, 이렇게 읽으면 사용자는 확신을 갖고 틀린다. 이 앱이
   * 막으려는 실패가 정확히 그것이다(§2.1 의 거짓 확신).
   *
   * 그래서 손글씨는 **판정을 확신하지 않는다.** 그림과 문장은 그대로 보여주되, 사람에게
   * 확인하라고 말하고 초록을 켜지 않는다. 알람도 자동으로 만들지 않는다.
   *
   * 한 장으로는 사례이지 측정이 아니라, 공개 자료로 다시 쟀다
   * (RxHandBD, Zenodo 18478741, MIT — 방글라데시 실제 처방전에서 잘라낸 손글씨
   * 약 이름. 방글라데시는 조사 응답자 icddr,b Aliya Naheed 의 나라다).
   * 500장 전부(실패 0), `scripts/handwriting-eval.mjs`:
   *
   *   정확히 읽음        45%
   *   한두 글자 어긋남   28%   ← 이쪽이 더 위험하다
   *   전혀 다르게 읽음   27%
   *
   * 가운데 줄이 요점이다. Escilex → Eslilex, Voligel → Voltigel, clavutil → Clavuxil.
   * 한 글자다. 그리고 그 한 글자 건너편에 **실제로 존재하는 다른 약**이 있을 수 있다 —
   * 이 데이터셋 안에도 Inderen 과 Indever 가 나란히 있다.
   *
   * 확신도로 걸러낼 수 있는지도 함께 쟀다. 답은 아니다:
   *
   *   문턱 0.5 → 20% 가 남고 그중 83% 정확  ← 꼭대기
   *   문턱 0.6 →  8% 가 남고 그중 80% 정확
   *   문턱 0.7 →  3% 가 남고 그중 77% 정확
   *
   * 문턱을 올려도 정확도가 더 오르지 않고 오히려 떨어진다 — 높은 확신이 정확의
   * 증거가 아니라는 뜻이다. "확신 있는
   * 것만 통과시키자" 는 길이 닫혀 있고, 손글씨 전체를 확신 없이 다루는 지금 방식이
   * 남는 유일한 정직한 선택이다.
   *
   * **표본을 늘리자 결론 하나가 뒤집혔다.** 200장에서는 확신 0.8 이상을 붙이고 틀린
   * 것이 0건이라 "모델이 허풍은 떨지 않는다" 고 적었었다. 500장에서는 나왔다:
   *
   *   종이 Folzin (엽산)  →  앱 Naprosyn (나프록센)  확신 0.85
   *
   * 근접 오류가 아니라 완전히 다른 약이고, 그 위에 0.85 가 붙었다. 드물지만(0.2%)
   * 있고, 있는 이상 확신도를 안전장치로 쓸 수 없다. 작은 표본에서 나온 안심을 그대로
   * 두었으면 그 위에 설계를 쌓았을 것이다.
   */
  handwritten?: boolean;
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
    /**
     * 쓰기 전에 흔들어야 하는가 (현탁액·시럽).
     *
     * 현탁액에서 이것은 예의가 아니라 용량이다. 가라앉은 채로 따르면 앞쪽 몇 회분은
     * 묽고 바닥 쪽은 진하다. 같은 5 mL 를 재도 들어가는 약의 양이 달라진다.
     * 2026년 8월 조사에서 약국 실무 응답자가 빠진 특별 지시로 처음 꼽았다.
     */
    shake?: boolean;
    /** 보관 방법. 냉장이라고 적힌 처방전이 그림에는 나오지 않고 있었다. */
    storage?: 'refrigerator' | 'room';
    /** 1회 복용 개수 (정·캡슐·방울). 세는 그림이 있는데 부르는 곳이 없었다. */
    doseCount?: number;
    /**
     * 1회 복용량 원문 ("1 capsule", "5 mL", "2 drops").
     *
     * doseCount 는 셀 수 있는 것만 담는다 — 시럽의 "5 mL" 는 개수가 아니라서 버려진다.
     * 그런데 형성 평가에서 처방 16시행 전부에 1회 용량이 음성·문자 어디에도 없는 것이
     * 드러났다. 값은 추출되어 픽토그램에만 쓰이고 있었고, 그림이 통하지 않는 사용자에게는
     * 정보가 통째로 사라진다 — 삼중 채널을 둔 이유와 정면으로 어긋난다.
     * 그래서 원문을 그대로 실어 음성과 문자가 함께 말하게 한다.
     */
    doseText?: string;
    /** 보관 방법 원문 ("Keep refrigerated"). storage 와 같은 이유로 문장이 필요하다. */
    storageText?: string;
    /** 렌즈 착용 금지 (안약). OCR 이 lensRestriction 으로 이미 뽑는다. */
    noLens?: boolean;
    /**
     * 이 **약에** 딸린 주의. 이 사람의 일정이 아니라 약의 성질이다.
     *
     * 종이에는 이 칸이 없고, 있어서도 안 된다 — "식후에 먹어라" 는 의사가 매번 같은
     * 값을 채워야 하는 것이고, 안 채운 날 그 지시가 통째로 사라진다. 약마다 고정된
     * 것은 약품표가 지고(`lib/formulary/who.ts`), 종이는 사람마다 다른 것만 진다.
     *
     * 이름은 개념이지 그림이 아니다. 어느 형태소로 그릴지는 `sigil.ts` 가 정한다 —
     * 그림 어휘가 이 타입까지 새어 나오면 형태소 하나가 바뀔 때마다 자료가 같이
     * 바뀌어야 한다.
     */
    care?: Precaution[];
    /**
     * 종이에 적혀 있는데 **우리가 그림으로 못 그리는** 주의.
     *
     * 버리지 않는다. 조용히 버리면 종이에는 있고 화면에는 없는 지시가 생기고, 그것은
     * 주의가 아예 없는 것보다 나쁘다 — 사람은 화면을 봤으니 다 봤다고 여긴다.
     * 화면이 글자와 소리로 낸다.
     */
    notes?: string[];
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
   * 그때 나온 복용량 원문 ("1 tablet", "5 mL").
   *
   * 약 기록에만 붙는다. 상자는 트레이 번호와 시각만 보고하고 — 그것이 상자가 아는
   * 전부다 — 이름도 용량도 앱이 처방에서 붙인다. 이름은 붙이고 있었고 용량은 아니어서,
   * "이번 주에 아목시실린을 몇 정 먹었나" 를 물어볼 수가 없었다. 처방에는 있던 값이
   * 기록으로 넘어오는 자리에서만 사라지고 있었다.
   *
   * 개수가 아니라 원문인 이유는 `ScanItem.rx.doseText` 와 같다 — 시럽의 "5 mL" 는
   * 셀 수 있는 것이 아니고, 셀 수 있는 것만 남기면 시럽을 먹는 사람의 기록이 빈다.
   */
  doseText?: string;
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
  /**
   * 약통이 말한 사실. 상자에서 온 기록에만 있다.
   *
   * 왜 따로 남기는가
   * ----------------
   * 지금까지 이 기록에서 "먹었나 걸렀나" 는 `level` 하나로만 남았다 — 먹었으면
   * safe, 걸렀으면 caution. 그런데 caution 은 음식 판정에도 쓰인다. 설탕이 많은
   * 과자와 놓친 항생제가 저장소에서 **같은 값**이 되고, 그러면 "이번 주에 몇 번
   * 걸렀나" 를 셀 방법이 없어진다. 상자는 그 사실을 보고했는데 앱이 세는 자리에서
   * 잃어버리고 있었다.
   *
   * 놓친 복용은 지워야 할 실패가 아니라 돌보는 사람이 알아야 하는 사실이다.
   */
  dose?: {
    /** 트레이가 열렸고 사람이 가져갔는가 */
    taken: boolean;
    /** 예정 시각 (`'0800'`). 일어난 시각이 아니라 **정해져 있던** 시각이다 */
    due: string;
    tray: number;
    /**
     * 상자가 붙인 이유. `not-released` 는 내밀었는데 아무도 안 누른 것이고,
     * `window-closed` 는 아예 내밀지도 못한 것이다 — 사람에게는 둘 다 "못 먹었다"
     * 지만, 앞의 것은 알림이 닿았고 뒤의 것은 안 닿았다는 뜻이라 고칠 곳이 다르다.
     */
    reason: string;
  };
  /** 먹고 난 뒤의 몸 상태. 사용자가 나중에 아이콘으로 답한다. */
  reaction?: Reaction;
  /** reaction='unwell' 일 때 어디가 불편했는지 */
  symptoms?: Symptom[];
}
