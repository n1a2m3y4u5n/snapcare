import type { ScanItem, ItemFlag } from './types';
import { extractRxInfo, type StructuredRxInfo } from '@/lib/ocr-to-macro';

const FREQ_WORD: Record<number, string> = { 1: 'Once', 2: 'Twice', 3: 'Three times', 4: 'Four times' };
const TIME_SLOT: Record<string, { time: string; label: string; emoji: string }> = {
  morning: { time: '8:00 AM', label: 'Morning', emoji: '🌅' },
  noon: { time: '12:00 PM', label: 'Noon', emoji: '☀️' },
  evening: { time: '6:00 PM', label: 'Evening', emoji: '🌙' },
  night: { time: '9:00 PM', label: 'Night', emoji: '🌙' },
};

/** OCR 텍스트에서 위험 플래그 추정 (알레르기/상호작용 키워드) */
function flagsFromText(t: string): ItemFlag[] {
  const flags: ItemFlag[] = [];
  if (/이부프로펜|ibuprofen|아스피린|aspirin|naproxen|nsaid/i.test(t)) flags.push('nsaid_bleed');
  if (/땅콩|peanut/i.test(t)) flags.push('peanut');
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
    name: rx.drugName && rx.drugName !== '처방 의약품' ? rx.drugName : 'Prescription',
    kind: 'prescription',
    emoji: rx.drugEmoji || '💊',
    detectedVia: 'prescription OCR (Tesseract)',
    flags: flagsFromText(ocrText),
    rx: {
      dosageText,
      durationText: rx.durationDays ? `${rx.durationDays} days` : 'ongoing',
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
