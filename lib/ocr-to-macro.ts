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
  const amountMatch = t.match(/1회\s*([\d.]+\s*(?:mL|정|알|캡슐|방울|패치|g|mg))/i);
  const amountText  = amountMatch ? `1회 ${amountMatch[1].trim()}` : '';

  // ── 투약 기간 ────────────────────────────────────────────────────────────
  // "이내"(처방 유효 기간) 뒤에 오는 것은 제외
  const durationCandidates: number[] = [];
  const dayMatches = [...t.matchAll(/(\d+)\s*일/g)];
  for (const m of dayMatches) {
    const after = t.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 4);
    const n = parseInt(m[1]);
    if (!/이내/.test(after) && n >= 1 && n <= 60) durationCandidates.push(n);
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
  } else if (/냉장|refrigerat/i.test(t)) {
    storageType = 'refrigerator'; storageText = '냉장 보관';
  } else if (/실온|상온/i.test(t)) {
    storageType = 'room'; storageText = '실온 보관';
  }

  // ── 금기 ─────────────────────────────────────────────────────────────────
  const contraindications: StructuredRxInfo['contraindications'] = [];
  if (/임산부|임신.*금기/i.test(t))  contraindications.push('pregnant');
  if (/수유부|수유.*(?:금기|주의)/i.test(t)) contraindications.push('breastfeeding');

  // ── 특이 주의 ────────────────────────────────────────────────────────────
  const needsHandwash    = /안약|점안|귀약|연고/i.test(t);
  const lensRestriction  = /렌즈.*(?:금지|착용.*금지)/i.test(t);

  // ── 약품명 ───────────────────────────────────────────────────────────────
  // ① 개행 기준 한 줄씩 탐색 — 짧고 한글 + 용량단위/약형 패턴인 줄을 약품명으로 채택
  //    (rawText 원본 줄 구조를 유지해야 greedy 오매칭을 방지할 수 있다)
  const META_LINE = /^(처방전|PRESCRIPTION|환자\s*정보|성명|생년월일|성별|약품명|용법|투약|보관|주의사항|처방의사|처방번호|발행일|면허번호|Rx\b|처방\s*의약품|이\s*처방전|서울|경기|분당|성남|연세|서대문)/i;
  const SKIP_ONLY_ALPHA = /^[A-Za-z\s\d.%/]+$/; // 영문·숫자만인 줄 (약 영문명 제외)

  const hasDose      = (s: string) => /\d+\s*(?:mg|mL|g|%)/i.test(s);
  const hasDrugForm  = (s: string) => /캡슐|현탁액|점안액|연고|크림|흡입기|시럽|과립|정제|점이액|좌약/.test(s);
  const hasKorean    = (s: string) => /[가-힣]{2,}/.test(s);

  let drugName = '처방 의약품';

  const rawLines = (rawText ?? '').split(/\n/).map((l) => l.trim());
  for (const line of rawLines) {
    if (line.length < 3 || line.length > 45)   continue; // 너무 짧거나 긴 줄 건너뜀
    if (META_LINE.test(line))                   continue; // 메타데이터 줄 건너뜀
    if (SKIP_ONLY_ALPHA.test(line))             continue; // 영문 전용 줄 건너뜀
    if (!hasKorean(line))                       continue; // 한글 없으면 건너뜀
    if (hasDose(line) || hasDrugForm(line)) {
      drugName = line.replace(/\s+/g, ' ').trim();
      break;
    }
  }

  // ② 줄 탐색 실패 시: 표 헤더 "보관" 이후 패턴으로 탐색 (OCR이 한 줄로 붙은 경우)
  //    패턴: "약품명 ... 보관 [약품명][용량]"
  if (drugName === '처방 의약품') {
    const afterHeaders = t.match(
      /(?:약품명|처방\s*의약품).{0,60}보관\s+([가-힣][가-힣\s]{1,15}[\d.\/]+\s*(?:mg|mL|g|%)\S*)/,
    );
    if (afterHeaders) {
      drugName = afterHeaders[1].trim().replace(/\s+/g, ' ');
    }
  }

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

// ──────────────────────────────────────────────────────────────────────────────
// TTS 스크립트 합성
// ──────────────────────────────────────────────────────────────────────────────

const FREQ_LABEL: Record<number, string> = {
  1: '하루 한 번',
  2: '하루 두 번',
  3: '하루 세 번',
  4: '하루 네 번',
};

const TIMING_LABEL: Record<string, string> = {
  morning: '아침',
  noon:    '점심',
  evening: '저녁',
  night:   '취침 전',
};

/** 약 형태별 복용 동사 */
const USE_VERB: Record<DrugForm, string> = {
  eyedrop:     '점안하세요',
  cream:       '바르세요',
  inhaler:     '흡입하세요',
  suppository: '사용하세요',
  injection:   '맞으세요',
  capsule:     '드세요',
  syrup:       '드세요',
  tablet:      '드세요',
  sachet:      '드세요',
  unknown:     '복용하세요',
};

/**
 * 구조화된 처방 정보를 간결한 TTS 스크립트로 변환한다.
 * 전체 텍스트를 읽는 대신 핵심 수치(횟수·시간·기간·금기·보관)만 추린다.
 */
export function composePrescriptionTts(rxInfo: StructuredRxInfo): string {
  const parts: string[] = [];

  // 1. 약품명
  if (rxInfo.drugName && rxInfo.drugName !== '처방 의약품') {
    parts.push(`${rxInfo.drugName}입니다.`);
  }

  // 2. 복용 횟수 · 시간대 · 식전후 · 1회량
  const freqStr = FREQ_LABEL[rxInfo.frequency] ?? `하루 ${rxInfo.frequency}번`;
  let dosage    = freqStr;

  if (rxInfo.timings.length > 0) {
    dosage += ` ${rxInfo.timings.map((t) => TIMING_LABEL[t] ?? t).join(', ')}`;
  }

  const mealStr =
    rxInfo.mealContext === 'after'
      ? `식후${rxInfo.mealMinutes ? ` ${rxInfo.mealMinutes}분` : ''}`
      : rxInfo.mealContext === 'before'
      ? `식전${rxInfo.mealMinutes ? ` ${rxInfo.mealMinutes}분` : ''}`
      : null;

  if (mealStr) dosage += ` ${mealStr}에`;

  if (rxInfo.amountText) dosage += ` ${rxInfo.amountText}씩`;

  dosage += ` ${USE_VERB[rxInfo.drugForm] ?? '복용하세요'}.`;
  parts.push(dosage);

  // 3. 투약 기간
  if (rxInfo.durationDays) {
    parts.push(`${rxInfo.durationDays}일치입니다.`);
  }

  // 4. 금기 · 특이 주의 (치명적인 것만)
  if (rxInfo.contraindications.includes('pregnant'))      parts.push('임산부는 복용하면 안 됩니다.');
  if (rxInfo.contraindications.includes('breastfeeding')) parts.push('수유 중에는 주의하세요.');
  if (rxInfo.needsHandwash)   parts.push('사용 전 반드시 손을 씻으세요.');
  if (rxInfo.lensRestriction) parts.push('렌즈 착용은 금지입니다.');

  // 5. 보관 (냉장인 경우만 — 실온은 묵시적 기본값)
  if (rxInfo.storageType === 'refrigerator') parts.push('냉장 보관하세요.');

  return parts.join(' ');
}

// 약 형태 감지 규칙
const FORM_RULES: { re: RegExp; head: string; bodyMod?: string }[] = [
  { re: /안약|점안액|점안/i,                     head: 'dropper_bottle', bodyMod: 'body_eye' },
  { re: /귀약|점이액|이약/i,                     head: 'dropper_bottle', bodyMod: 'body_ear' },
  { re: /연고|크림|겔|ointment|cream/i,         head: 'cream_tube',     bodyMod: 'body_skin' },
  { re: /흡입기|흡입제|흡입|MDI|inhaler/i,       head: 'inhaler' },
  { re: /좌약|좌제|suppository/i,               head: 'suppository' },
  { re: /주사|injection/i,                      head: 'syringe' },
  { re: /시럽|액제|syrup/i,                      head: 'liquid_bottle' },
  { re: /캡슐|캅셀|capsule/i,                   head: 'capsule_strip' },
  { re: /과립|분말|가루|sachet/i,                head: 'sachet' },
  { re: /정|알|tablet|pill/i,                   head: 'pill_bottle' },
];

// 시간대 감지
const TIME_RULES: { re: RegExp; mod: string }[] = [
  { re: /아침|오전|morning/i,                   mod: 'time_morning' },
  { re: /점심|noon|lunch/i,                     mod: 'time_noon' },
  { re: /저녁|오후|evening|dinner/i,            mod: 'time_evening' },
  { re: /취침|자기\s*전|밤|night|bedtime/i,     mod: 'time_night' },
];

// 복용 컨텍스트 감지
const CONTEXT_RULES: { re: RegExp; mod: string }[] = [
  { re: /식전|공복|빈속|before\s*meal/i,        mod: 'food_empty_bowl' },
  { re: /식후|식사\s*후|after\s*meal/i,         mod: 'food_bowl' },
  { re: /물과|물로|with\s*water/i,              mod: 'water_glass' },
  { re: /냉장|refrigerat/i,                     mod: 'storage_fridge' },
];

function detectFrequency(text: string): number {
  if (/1일\s*4회|하루\s*4번|four\s*times/i.test(text)) return 4;
  if (/1일\s*3회|하루\s*3번|three\s*times/i.test(text)) return 3;
  if (/1일\s*2회|하루\s*2번|twice|두\s*번/i.test(text)) return 2;
  return 1;
}

function buildCore(
  head: string,
  mod1: string | undefined,
  mod2: string | undefined,
  freq: number,
  half: boolean,
): string {
  let core = `\\${head}`;
  if (mod1) core += `{\\${mod1}}`;
  if (mod2) core += `{\\${mod2}}`;

  if (half) core = `\\half{${core}}`;

  const cadence: Record<number, string> = {
    2: 'twice_daily',
    3: 'three_times_daily',
    4: 'four_times_daily',
  };
  if (cadence[freq]) core = `\\${cadence[freq]}{${core}}`;

  return core;
}

/** OCR 텍스트를 .p 소스 문자열로 변환한다 */
export function ocrToMacro(text: string): string {
  const labels: string[] = [];
  const safeText = (text ?? '').trim();

  // 텍스트가 너무 짧으면 엔진이 안전하게 표시할 최소 라벨 한 줄을 돌려준다
  if (safeText.length < 3) {
    return '\\pill_bottle';
  }

  // 금기 사항 (별도 라벨)
  if (/임산부|임신.*금기|pregnant.*contra/i.test(safeText)) {
    labels.push('\\no{\\state_pregnant}');
  }
  if (/수유.*금기|breastfeed.*contra/i.test(safeText)) {
    labels.push('\\no{\\state_breastfeeding}');
  }

  // 약 형태
  let head = 'pill_bottle';
  let bodyMod: string | undefined;
  for (const rule of FORM_RULES) {
    if (rule.re.test(safeText)) {
      head = rule.head;
      bodyMod = rule.bodyMod;
      break;
    }
  }

  // 컨텍스트 모디파이어
  const contextMod = CONTEXT_RULES.find((r) => r.re.test(safeText))?.mod;

  // 슬롯 배치: bodyMod 있으면 slot1=bodyMod, slot2=contextMod
  // bodyMod 없으면 slot1=contextMod
  const mod1 = bodyMod ?? contextMod;
  const mod2 = bodyMod && contextMod ? contextMod : undefined;

  // 빈도 + 반정
  const freq = detectFrequency(safeText);
  const isHalf = /반\s*정|1\/2\s*정|0\.5\s*정/i.test(safeText);

  // 시간대
  const times = TIME_RULES.filter(({ re }) => re.test(safeText)).map(({ mod }) => mod);

  let mainLabel: string;
  if (times.length > 0 && freq === 1) {
    // 특정 시간대 명시 + 1회 → 시간대를 두 번째 슬롯에
    const timeMod = times[0];
    const m1 = mod1 ?? timeMod;
    const m2 = mod1 ? timeMod : undefined;
    mainLabel = buildCore(head, m1, m2, 1, isHalf);
  } else {
    mainLabel = buildCore(head, mod1, mod2, freq, isHalf);
  }

  // 손 씻기 필요 여부 (안약/귀약/연고)
  const needsHandWash = /안약|점안|귀약|연고/i.test(safeText);
  labels.push(needsHandWash ? `\\hand_wash ${mainLabel}` : mainLabel);

  // 냉장 보관 표시가 있고 컨텍스트 슬롯에 들어가지 못한 경우 별도 라벨 추가
  if (/냉장|refrigerat/i.test(safeText) && contextMod !== 'storage_fridge') {
    labels.push(`\\${head}{\\storage_fridge}`);
  }

  return labels.filter(Boolean).join('\n');
}
