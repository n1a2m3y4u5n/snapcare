import type { ScanItem, ItemFlag } from './types';
// 상대경로 + 확장자: 이 모듈을 node --test 로 번들러 없이 직접 돌린다 (@/ 는 해석되지 않는다).
import { extractRxInfo, type StructuredRxInfo } from '../ocr-to-macro.ts';

const FREQ_WORD: Record<number, string> = { 1: 'Once', 2: 'Twice', 3: 'Three times', 4: 'Four times' };
const TIME_SLOT: Record<string, { time: string; label: string; emoji: string }> = {
  morning: { time: '8:00 AM', label: 'Morning', emoji: '🌅' },
  noon: { time: '12:00 PM', label: 'Noon', emoji: '☀️' },
  evening: { time: '6:00 PM', label: 'Evening', emoji: '🌙' },
  night: { time: '9:00 PM', label: 'Night', emoji: '🌙' },
};

/**
 * 1회 복용량 문자열 → 셀 수 있는 개수.
 *
 * '1 capsule' 은 점 하나로 그릴 수 있지만 '5 mL' 는 그릴 수 없다 — 부피는 개수가 아니고,
 * 점 다섯 개를 그리면 다섯 알로 읽힌다. 세어지는 단위일 때만 숫자를 돌려준다.
 */
function countFromAmount(text: string): number | undefined {
  const m = text.match(/^([\d.]+)\s*(capsules?|tablets?|drops?|puffs?|정|알|캡슐|방울)/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : undefined;
}

/** OCR 텍스트에서 위험 플래그 추정 (알레르기/상호작용 키워드) */
function flagsFromText(t: string): ItemFlag[] {
  const flags: ItemFlag[] = [];
  if (/이부프로펜|ibuprofen|아스피린|aspirin|naproxen|nsaid/i.test(t)) flags.push('nsaid_bleed');
  if (/땅콩|peanut/i.test(t)) flags.push('peanut');
  // 처방전에 'No alcohol' 이라고 적혀 있는데 이 플래그를 만드는 코드가 없었다.
  // 타입에도 있고 픽토그램도 있는데 어떤 경로도 붙이지 않아, 있으나 마나 한 상태였다.
  if (/알코올|음주|술.*(금지|피)|no\s*alcohol|avoid\s*alcohol/i.test(t)) flags.push('alcohol');
  if (/카페인|caffeine/i.test(t)) flags.push('caffeine');
  return flags;
}

/**
 * OCR 텍스트 → ScanItem (실제 스캔 경로).
 * IlliHealth 예선 엔진(extractRxInfo)을 그대로 재사용해 구조화한다.
 */
export function ocrToScanItem(ocrText: string): { item: ScanItem; rxInfo: StructuredRxInfo } {
  const rx = extractRxInfo(ocrText);

  const schedule = rx.timings
    .map((t) => TIME_SLOT[t])
    .filter(Boolean);
  // 시간대 표기가 없으면 빈도만큼 슬롯을 만든다
  if (schedule.length === 0) {
    const order = ['morning', 'noon', 'evening', 'night'] as const;
    for (let i = 0; i < Math.min(rx.frequency, 4); i++) schedule.push(TIME_SLOT[order[i]]);
  }

  const withFood = rx.mealContext === 'after' ? ' with food' : rx.mealContext === 'before' ? ' before meals' : '';
  const dosageText = `${FREQ_WORD[rx.frequency] ?? rx.frequency + '×'} daily${withFood}${rx.durationDays ? `, for ${rx.durationDays} days` : ''}`;

  const item: ScanItem = {
    id: `ocr_${Math.abs(hash(ocrText))}`,
    name: rx.drugName || 'Prescription',
    kind: 'prescription',
    emoji: rx.drugEmoji || '💊',
    detectedVia: 'prescription OCR (Tesseract)',
    // VOCA가 뽑아둔 금기를 판정 엔진이 볼 수 있는 플래그로 넘긴다.
    // 이 연결이 없으면 처방전에서 임신 금기를 읽어놓고도 판정은 '안전'이 나온다.
    flags: [
      ...flagsFromText(ocrText),
      ...(rx.contraindications.includes('pregnant') ? ['unsafe_pregnancy' as ItemFlag] : []),
      ...(rx.contraindications.includes('breastfeeding') ? ['unsafe_breastfeeding' as ItemFlag] : []),
    ],
    rx: {
      dosageText,
      durationText: rx.durationDays ? `${rx.durationDays} days` : 'ongoing',
      // 'unknown' 은 제형을 못 알아냈다는 뜻이므로 넘기지 않는다 — 그림 엔진이 기본형을 쓴다
      form: rx.drugForm === 'unknown' ? undefined : rx.drugForm,
      handwash: rx.needsHandwash,
      shake: rx.needsShake,
      storage: rx.storageType ?? undefined,
      // "Take 1 capsule" · "5 mL" 의 앞 숫자. 셀 수 있는 개수일 때만 그림으로 옮긴다.
      doseCount: countFromAmount(rx.amountText),
      // 그림으로 못 옮기는 경우까지 포함해 원문을 함께 넘긴다 — 음성·문자가 이걸 읽는다.
      doseText: rx.amountText || undefined,
      storageText: rx.storageText || undefined,
      noLens: rx.lensRestriction,
      schedule,
    },
  };
  return { item, rxInfo: rx };
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
