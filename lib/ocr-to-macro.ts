import { fuzzyHasAny } from './fuzzyWord.ts';
/**
 * OCR 텍스트 → .p 매크로 소스 변환기
 * 한국어 처방전/설명서 텍스트를 eicon 픽토그램 DSL로 변환한다.
 * 부가적으로 구조화된 처방 정보(StructuredRxInfo)를 추출한다.
 */

// ──────────────────────────────────────────────────────────────────────────────
// 구조화된 처방 정보
// ──────────────────────────────────────────────────────────────────────────────

export interface StructuredRxInfo {
  /** 추출된 약품명 */
  drugName: string;
  /** 약 형태 (TTS 동사·UI 분기용) */
  drugForm: DrugForm;
  /** 약 형태 이모지 */
  drugEmoji: string;
  /** 1일 복용 횟수 */
  frequency: number;
  /** 복용 시간대 목록 */
  timings: ('morning' | 'noon' | 'evening' | 'night')[];
  /** 식전/식후 여부 */
  mealContext: 'before' | 'after' | null;
  /** 식전/식후 N분 */
  mealMinutes: number | null;
  /** 1회 복용량 텍스트 (예: "1회 7.5mL") */
  amountText: string;
  /** 투약 기간(일) */
  durationDays: number | null;
  /** 주의사항 항목 배열 */
  warnings: string[];
  /** 보관 방법 */
  storageType: 'room' | 'refrigerator' | null;
  /** 보관 방법 원문 텍스트 */
  storageText: string;
  /** 금기 사항 */
  contraindications: ('pregnant' | 'breastfeeding')[];
  /** 손 씻기 필요 여부 (안약·귀약·연고) */
  needsHandwash: boolean;
  /** 렌즈 착용 금지 여부 */
  lensRestriction: boolean;
  /** 쓰기 전에 흔들어야 하는가 (현탁액·시럽). 흔들지 않으면 용량이 달라진다. */
  needsShake: boolean;
}

type DrugForm =
  | 'capsule' | 'syrup' | 'eyedrop' | 'cream'
  | 'inhaler' | 'tablet' | 'sachet' | 'injection'
  | 'suppository' | 'unknown';

const FORM_EMOJI: Record<DrugForm, string> = {
  eyedrop:     '👁️',
  syrup:       '🧴',
  capsule:     '💊',
  cream:       '🧴',
  inhaler:     '💨',
  tablet:      '💊',
  sachet:      '📦',
  injection:   '💉',
  suppository: '⚕️',
  unknown:     '💊',
};

/** OCR 텍스트에서 구조화된 처방 정보를 추출한다 */
export function extractRxInfo(rawText: string): StructuredRxInfo {
  const t = (rawText ?? '').replace(/\s+/g, ' ').trim();

  // ── 약 형태 ──────────────────────────────────────────────────────────────
  let drugForm: DrugForm = 'unknown';
  // 영어 패턴이 없어 "Eye Drops" 처방이 unknown 으로 떨어지고 있었다.
  // 그 여파가 둘이었다: 음성이 "드세요"라고 말했고(제형별 동사가 form 을 본다),
  // 픽토그램 머리도 골라지지 않아 안약만 그림이 한 장도 안 나왔다.
  if      (/안약|점안액|점안|eye\s*drops?|ophthalmic|instil{1,2}/i.test(t)) drugForm = 'eyedrop';
  else if (/시럽|액제|현탁액|syrup|suspension/i.test(t))   drugForm = 'syrup';
  else if (/캡슐|캅셀|capsule/i.test(t))                   drugForm = 'capsule';
  else if (/연고|크림|겔|ointment|cream/i.test(t))         drugForm = 'cream';
  else if (/흡입기|흡입제|inhaler/i.test(t))               drugForm = 'inhaler';
  else if (/주사|injection/i.test(t))                      drugForm = 'injection';
  else if (/좌약|suppository/i.test(t))                    drugForm = 'suppository';
  else if (/과립|분말|가루|sachet/i.test(t))               drugForm = 'sachet';
  else if (/정\b|알\b|tablet|pill/i.test(t))               drugForm = 'tablet';

  // ── 복용 횟수 ────────────────────────────────────────────────────────────
  let frequency = 1;
  if      (/1일\s*4회|하루\s*4번|four\s*times/i.test(t))   frequency = 4;
  else if (/1일\s*3회|하루\s*3번|three\s*times/i.test(t))  frequency = 3;
  else if (/1일\s*2회|하루\s*2번|twice|두\s*번/i.test(t))  frequency = 2;

  // ── 복용 시간대 ──────────────────────────────────────────────────────────
  // 시간대는 오독에 관대해야 한다. Tesseract 는 "Morning" 을 "Moming" 으로 읽고
  // (rn 이 m 으로 붙어 보인다), 그러면 아침 복용이 목록에서 통째로 사라진다.
  // 관측된 결과: "하루 세 번" 이라 안내하면서 시각은 두 개만 열거되는 불일치.
  const timings: StructuredRxInfo['timings'] = [];
  if (/아침|오전/.test(t) || fuzzyHasAny(t, ['morning']))       timings.push('morning');
  if (/점심/.test(t) || fuzzyHasAny(t, ['noon', 'lunch']))      timings.push('noon');
  if (/저녁|오후/.test(t) || fuzzyHasAny(t, ['evening', 'dinner'])) timings.push('evening');
  if (/취침|자기\s*전|밤/.test(t) || fuzzyHasAny(t, ['night', 'bedtime'])) timings.push('night');

  // ── 식전/식후 ────────────────────────────────────────────────────────────
  let mealContext: StructuredRxInfo['mealContext'] = null;
  if      (/식전|공복|빈속|before\s*meal/i.test(t))        mealContext = 'before';
  else if (/식후|식사\s*후|after\s*meal/i.test(t))         mealContext = 'after';

  const mealMinMatch = t.match(/식(?:전|후)\s*(\d+)\s*분/);
  const mealMinutes  = mealMinMatch ? parseInt(mealMinMatch[1]) : null;

  // ── 1회 복용량 ───────────────────────────────────────────────────────────
  // 한국어 처방전과 영어 처방전이 둘 다 들어온다. 대회 공식 언어는 영어지만
  // 현장에서 카메라에 잡히는 종이는 그 지역 언어라, 한쪽만 읽으면 반쪽짜리가 된다.
  const amountMatch = t.match(/1회\s*([\d.]+\s*(?:mL|정|알|캡슐|방울|패치|g|mg))/i)
    ?? t.match(/\b(?:take|use|apply|instil{1,2})\s+([\d.]+\s*(?:mL|mg|g|capsules?|tablets?|drops?|puffs?|patch(?:es)?))/i)
    ?? t.match(/\b([\d.]+\s*(?:mL|capsules?|tablets?|drops?|puffs?))\s+(?:per|each)\s+(?:dose|time)/i);
  const amountText  = amountMatch ? amountMatch[1].trim() : '';

  // ── 투약 기간 ────────────────────────────────────────────────────────────
  // "이내"(처방 유효 기간) 뒤에 오는 것은 제외
  const durationCandidates: number[] = [];
  const dayMatches = [...t.matchAll(/(\d+)\s*일/g)];
  for (const m of dayMatches) {
    const after = t.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 4);
    const n = parseInt(m[1]);
    if (!/이내/.test(after) && n >= 1 && n <= 60) durationCandidates.push(n);
  }
  // 영어: "for 7 days", "7-day course". 'within 3 days'(처방 유효기간)는 기간이 아니다.
  for (const m of t.matchAll(/(?:for|course\s+of)\s+(\d+)\s*days?|\b(\d+)[-\s]day\s+course/gi)) {
    const n = parseInt(m[1] ?? m[2]);
    if (n >= 1 && n <= 60) durationCandidates.push(n);
  }
  const durationDays = durationCandidates.length > 0
    ? Math.min(...durationCandidates)
    : null;

  // ── 주의사항 ─────────────────────────────────────────────────────────────
  const warnings: string[] = [];
  const warnMatch = t.match(/주의사항[：:\s⚠️\s]+(.+?)(?=처방의사|$)/i);
  if (warnMatch) {
    warnMatch[1]
      .split(/[·•·,]/)
      .map((w) => w.replace(/^[⚠️\s:]+/, '').trim())
      .filter((w) => w.length > 2 && w.length < 60)
      .forEach((w) => warnings.push(w));
  }

  // ── 보관 방법 ────────────────────────────────────────────────────────────
  let storageType: StructuredRxInfo['storageType'] = null;
  let storageText = '';
  /**
   * "Do not refrigerate" 는 냉장 지시가 아니라 **그 반대다.**
   *
   * 아래 긍정 검사가 'refrigerat' 만 보고 있어서, 실온 보관 약이 냉장으로 읽혔다.
   * 보관 지시가 통째로 뒤집히는 것이고, 그 뒤집힘은 그림(storage_fridge)과 음성
   * ("Keep it in the fridge.") 양쪽으로 그대로 나간다.
   *
   * 냉동 금지는 다르다 — "Keep refrigerated. Do not freeze." 는 냉장이 맞고, 냉장이
   * 필요한 제품에 거의 늘 함께 적힌다. 그래서 부정하는 것은 refrigerate 하나뿐이다.
   */
  const NO_FRIDGE = /(?:do\s*not|don'?t|never)\s+refrigerate|냉장\s*(?:하지|금지)/i;
  const noFridge = NO_FRIDGE.test(t);
  // 부정된 구절을 지운 뒤에 긍정 검사를 돌린다. 둘 다 적힌 처방전에서는 냉장이 이긴다.
  const tStorage = t.replace(new RegExp(NO_FRIDGE.source, 'gi'), ' ');

  const storageMatch = t.match(/(냉장보관|실온보관|상온보관)[^a-z가-힣]*([\(（][^)\）]+[\)）])?/i);
  if (storageMatch) {
    storageText = (storageMatch[0] ?? '').trim();
    storageType = /냉장/.test(storageText) ? 'refrigerator' : 'room';
  } else if (/냉장|refrigerat|keep\s+cold|2\s*[-–~]\s*8\s*°?C/i.test(tStorage)) {
    storageType = 'refrigerator'; storageText = 'Keep refrigerated';
  } else if (noFridge || /실온|상온|room\s*temperature|(?:store|keep)\s+below\s*\d+\s*°?\s*C/i.test(t)) {
    storageType = 'room'; storageText = 'Store at room temperature';
  }

  // ── 금기 ─────────────────────────────────────────────────────────────────
  const contraindications: StructuredRxInfo['contraindications'] = [];
  // 금기는 이 파일에서 가장 중요한 추출이다 — 판정 엔진이 이걸 받아 'avoid' 를 낸다.
  // 영어 처방전에서 안 잡히면 임신부에게 'Safe' 가 뜬다.
  // 금기는 오독에 가장 관대해야 하는 자리다. 여기서 놓치면 임신부·수유부에게
  // 'Safe' 가 뜬다. 실측: "breastfeeding" 이 "breastizeding" 으로 읽혀 수유 금기가
  // 판정 엔진에 도달하지 못하고 있었다.
  if (/임산부|임신.*금기/.test(t) || fuzzyHasAny(t, ['pregnancy', 'pregnant'])) {
    contraindications.push('pregnant');
  }
  if (/수유부|수유.*(?:금기|주의)/.test(t)
      || fuzzyHasAny(t, ['breastfeeding', 'breastfeed', 'nursing'])) {
    contraindications.push('breastfeeding');
  }

  // ── 특이 주의 ────────────────────────────────────────────────────────────
  /*
    손을 씻고 시작하는 약.

    글자만 보던 자리였고, 그래서 **제형 판별과 어긋났다.** "Instil 1 drop into each
    eye" 는 위에서 안약으로 잡히는데(`instil` 이 있다) 이 정규식에는 "eye drop" 이라는
    말이 없어서 손 씻기가 빠졌다. 같은 종이 한 장에서 그림은 안약이 뜨고 손 씻으라는
    말만 사라진다.

    조사에서 간호·보건 응답자가 "wash hands before use 를 **동작의 순서**로 전달하는
    것" 을 그림만으로 보장되지 않는 임상 정보의 예로 들었다. 순서를 전달할지 이전에
    그 말이 나오기라도 해야 한다.

    이제 제형이 먼저 판단한다. 눈·피부에 직접 닿는 제형이면 글자에 뭐라고 적혀 있든
    손을 씻는다. 글자 검사는 그 위에 남긴다 — 제형을 못 알아낸 종이에서도 "연고" 라는
    말이 있으면 잡아야 한다.
  */
  const HANDWASH_FORMS: DrugForm[] = ['eyedrop', 'cream'];
  const needsHandwash = HANDWASH_FORMS.includes(drugForm)
    || /안약|점안|귀약|연고|eye\s*drop|ear\s*drop|ointment|cream/i.test(t);
  const lensRestriction  = /렌즈.*(?:금지|착용.*금지)|contact\s*lens/i.test(t);
  /*
    쓰기 전에 흔들 것.

    2026년 8월 조사에서 약국 실무 응답자가 빠진 특별 지시로 처음 꼽은 것이다
    (위스콘신 문해력 협회의 special instructions 목록을 함께 보내 왔다).

    현탁액에서 이것은 예의가 아니라 용량이다. 가라앉은 채로 따르면 앞쪽 몇 회분은
    묽고 바닥 쪽은 진하다. 같은 5 mL 를 재도 들어가는 약의 양이 달라지는데, 그 차이가
    그림에도 소리에도 안 나타났다.

    그림은 이미 있었다(`shake_bottle`). 만들어 놓고 부르는 곳이 없었던 형태소다.
  */
  const needsShake = /흔들|현탁|shake|suspension/i.test(t);

  // ── 약품명 ───────────────────────────────────────────────────────────────
  // 용량이나 제형이 적힌 짧은 줄을 약품명으로 본다. 언어는 가리지 않는다 —
  // 예전에는 "영문·숫자만인 줄" 을 건너뛰었는데(한국어 처방전의 영문 부제를 거르려던
  // 규칙이다) 영어 처방전은 모든 줄이 그래서 이름을 하나도 못 찾았다.
  const META_LINE = /^(처방전|PRESCRIPTION|환자\s*정보|성명|생년월일|성별|약품명|용법|투약|보관|주의사항|처방의사|처방번호|발행일|면허번호|Rx\b|처방\s*의약품|이\s*처방전|서울|경기|분당|성남|연세|서대문|patient|date\s+of\s+birth|prescriber|warnings?|take|use|instil|apply|morning|for\s+\d|keep\s+refrigerated|store\s+at|do\s+not|not\s+for|caution|centre|center|clinic|hospital|lic\.)/i;

  const hasDose      = (s: string) => /\d+\s*(?:mg|mL|g|%)/i.test(s);
  const hasDrugForm  = (s: string) =>
    /캡슐|현탁액|점안액|연고|크림|흡입기|시럽|과립|정제|점이액|좌약/.test(s)
    || /\b(capsules?|tablets?|suspension|eye\s*drops?|ear\s*drops?|ointment|cream|inhaler|syrup|granules?|suppositor)/i.test(s);

  let drugName = '';

  const rawLines = (rawText ?? '').split(/\n/).map((l) => l.trim());
  for (const line of rawLines) {
    if (line.length < 3 || line.length > 45)   continue; // 너무 짧거나 긴 줄 건너뜀
    if (META_LINE.test(line))                   continue; // 메타데이터 줄 건너뜀
    if (hasDose(line) || hasDrugForm(line)) {
      drugName = line.replace(/\s+/g, ' ').trim();
      break;
    }
  }

  // ② 줄 탐색 실패 시: 표 헤더 "보관" 이후 패턴으로 탐색 (OCR이 한 줄로 붙은 경우)
  //    패턴: "약품명 ... 보관 [약품명][용량]"
  if (!drugName) {
    const afterHeaders = t.match(
      /(?:약품명|처방\s*의약품).{0,60}보관\s+([가-힣][가-힣\s]{1,15}[\d.\/]+\s*(?:mg|mL|g|%)\S*)/,
    );
    if (afterHeaders) {
      drugName = afterHeaders[1].trim().replace(/\s+/g, ' ');
    }
  }

  if (!drugName) drugName = 'Prescription';
  if (drugName.length > 38) drugName = drugName.slice(0, 38) + '…';

  return {
    drugName,
    drugForm,
    drugEmoji:         FORM_EMOJI[drugForm],
    frequency,
    timings,
    mealContext,
    mealMinutes,
    amountText,
    durationDays,
    warnings,
    storageType,
    storageText,
    contraindications,
    needsHandwash,
    lensRestriction,
    needsShake,
  };
}
/*
 * composePrescriptionTts() 와 ocrToMacro() 를 여기서 덜어냈다.
 *
 * 둘 다 한국어 음성 문장과 한국어 매크로를 만들던 함수인데, 앱은 extractRxInfo 만
 * 쓰고 화면·음성 문구는 lib/snapcare/fromOcr.ts 가 영어로 만든다. 아무도 부르지 않는
 * 한국어 문장 생성기가 남아 있으면, 이 파일을 다시 여는 사람이 앱이 한국어로 말한다고
 * 읽게 된다. 필요해지면 git 히스토리에 있다.
 */
