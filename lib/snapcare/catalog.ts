import type { ScanItem } from './types';

/**
 * 데모 스캔 아이템 카탈로그 (와이어프레임 RECENT/데모칩 기준).
 * Vision LLM 없이도 "데모 아이템 스캔 → 판정" 루프가 오프라인으로 도는 근거 데이터.
 * 실제 사진 스캔 시엔 /api/analyze 가 같은 ScanItem 스키마로 결과를 채운다.
 */
export const CATALOG: ScanItem[] = [
  {
    id: 'energy_drink',
    name: 'Energy Drink',
    kind: 'drink',
    emoji: '🥤',
    detectedVia: 'barcode lookup',
    flags: ['high_sugar', 'caffeine'],
    chips: [
      { emoji: '✅', label: 'No allergens' },
      { emoji: '⚡', label: '80mg caffeine' },
    ],
  },
  {
    id: 'granola_bar',
    name: 'Granola Bar',
    kind: 'food',
    emoji: '🍫',
    detectedVia: 'ingredient label OCR',
    flags: ['peanut', 'gluten', 'high_sugar'],
    nutrition: {
      kcal: 210,
      protein: '4g protein',
      sugar: '12g sugar',
      note: 'High in sugar for a snack — pair with protein to keep blood sugar steady.',
    },
    alt: { name: 'SunButter granola bar', note: 'peanut-free' },
    chips: [{ emoji: '⚠️', label: 'Contains peanuts' }],
  },
  {
    id: 'amoxicillin',
    name: 'Amoxicillin 500mg',
    kind: 'prescription',
    emoji: '💊',
    detectedVia: 'prescription OCR',
    flags: [],
    rx: {
      dosageText: 'Twice daily with food, for 7 days',
      durationText: '7 days',
      schedule: [
        { time: '8:00 AM', label: 'Morning', emoji: '🌅' },
        { time: '8:00 PM', label: 'Evening', emoji: '🌙' },
      ],
    },
  },
  {
    id: 'ibuprofen',
    name: 'Ibuprofen 200mg',
    kind: 'medicine',
    emoji: '💊',
    detectedVia: 'medicine label OCR',
    flags: ['nsaid_bleed'],
    rx: {
      dosageText: 'As needed for pain, with food',
      durationText: 'as needed',
      schedule: [{ time: 'as needed', label: 'With food', emoji: '🍽️' }],
    },
  },
  {
    id: 'metformin',
    name: 'Metformin 500mg',
    kind: 'prescription',
    emoji: '💊',
    detectedVia: 'prescription OCR',
    flags: [],
    rx: {
      dosageText: 'Twice daily with food',
      durationText: 'ongoing',
      schedule: [
        { time: '8:00 AM', label: 'Morning', emoji: '🌅' },
        { time: '6:00 PM', label: 'Evening', emoji: '🌙' },
      ],
    },
  },
];

export const CATALOG_BY_ID: Record<string, ScanItem> = Object.fromEntries(
  CATALOG.map((i) => [i.id, i]),
);

export function getItem(id: string): ScanItem | undefined {
  return CATALOG_BY_ID[id];
}
