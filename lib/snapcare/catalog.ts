import type { ScanItem } from './types';

/**
 * 데모 스캔 아이템 카탈로그 (와이어프레임 RECENT/데모칩 기준).
 * Vision LLM 없이도 "데모 아이템 스캔 → 판정" 루프가 오프라인으로 도는 근거 데이터.
 * 실제 사진 스캔 시엔 /api/analyze 가 같은 ScanItem 스키마로 결과를 채운다.
 */
export const CATALOG: ScanItem[] = [
  {
    // 실제 제품 — 바코드로 OpenFoodFacts 프로필을 받아 수치 판정까지 간다.
    // flags 는 초기값일 뿐이고, 영양 엔진이 구성원 기준치로 다시 계산해 덮어쓴다.
    id: 'energy_drink',
    name: 'Energy drink 250 mL',
    kind: 'drink',
    emoji: '🥤',
    detectedVia: 'barcode lookup',
    barcode: '9002490100070',
    flags: ['caffeine'],
    chips: [{ emoji: '⚡', label: '80mg caffeine' }],
  },
  {
    id: 'granola_bar',
    name: 'Peanut chocolate bar',
    kind: 'food',
    emoji: '🍫',
    detectedVia: 'barcode lookup',
    barcode: '5000159461122',
    // 이름이 '땅콩' 이고 대체품 설명이 'peanut-free' 인데 표시가 비어 있었다. 땅콩
    // 표시는 바코드 조회(OpenFoodFacts)나 성분표 판독으로 붙는데, 둘 다 못 하는
    // 상황 — 인터넷이 없거나 사진이 흐릴 때 — 에서는 이 목록이 전부다. 그러면 땅콩
    // 알레르기가 있는 사람이 이것을 찍어도 아무 경고가 안 뜬다.
    flags: ['peanut'],
    alt: { name: 'Oat bar', note: 'peanut-free' },
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
