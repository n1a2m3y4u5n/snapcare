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
  if      (/안약|점안액|점안/i.test(t))                    drugForm = 'eyedrop';
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
  const timings: StructuredRxInfo['timings'] = [];
  if (/아침|오전|morning/i.test(t))                         timings.push('morning');
  if (/점심|noon|lunch/i.test(t))                          timings.push('noon');
  if (/저녁|오후|evening|dinner/i.test(t))                 timings.push('evening');
  if (/취침|자기\s*전|밤|night|bedtime/i.test(t))          timings.push('night');

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
  const storageMatch = t.match(/(냉장보관|실온보관|상온보관)[^a-z가-힣]*([\(（][^)\）]+[\)）])?/i);
  if (storageMatch) {
    storageText = (storageMatch[0] ?? '').trim();
    storageType = /냉장/.test(storageText) ? 'refrigerator' : 'room';
  } else if (/냉장|refrigerat|keep\s+cold|2\s*[-–~]\s*8\s*°?C/i.test(t)) {
    storageType = 'refrigerator'; storageText = 'Keep refrigerated';
  } else if (/실온|상온|room\s*temperature/i.test(t)) {
    storageType = 'room'; storageText = 'Store at room temperature';
  }

  // ── 금기 ─────────────────────────────────────────────────────────────────
  const contraindications: StructuredRxInfo['contraindications'] = [];
  // 금기는 이 파일에서 가장 중요한 추출이다 — 판정 엔진이 이걸 받아 'avoid' 를 낸다.
  // 영어 처방전에서 안 잡히면 임신부에게 'Safe' 가 뜬다.
  if (/임산부|임신.*금기|pregnan/i.test(t)) contraindications.push('pregnant');
  if (/수유부|수유.*(?:금기|주의)|breast[-\s]?feed|nursing\s+mother/i.test(t)) {
    contraindications.push('breastfeeding');
  }

  // ── 특이 주의 ────────────────────────────────────────────────────────────
  const needsHandwash    = /안약|점안|귀약|연고|eye\s*drop|ear\s*drop|ointment|cream/i.test(t);
  const lensRestriction  = /렌즈.*(?:금지|착용.*금지)|contact\s*lens/i.test(t);

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
