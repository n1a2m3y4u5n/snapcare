import type { ScanItem } from './types';

/**
 * ScanItem → SIGIL DSL (.p 소스) 변환.
 * 데모/구조화 데이터에서 자체 픽토그램 엔진(SIGIL)이 소비할 DSL을 만든다.
 * (OCR 경로는 lib/ocr-to-macro.ocrToMacro 를 그대로 사용 — 여기선 구조화 아이템용)
 */
const CADENCE: Record<number, string> = {
  2: 'twice_daily',
  3: 'three_times_daily',
  4: 'four_times_daily',
};

const TIME_MOD: Record<string, string> = {
  Morning: 'time_morning',
  Noon: 'time_noon',
  Evening: 'time_evening',
  Night: 'time_night',
};

/** 약/처방 아이템 → 픽토그램 시퀀스 DSL. avoid면 금지 픽토그램을 앞세운다. */
export function itemToDsl(item: ScanItem, avoid: boolean): string {
  const labels: string[] = [];
  const rx = item.rx;
  const withFood = /food/i.test(rx?.dosageText ?? '');
  const freq = rx?.schedule.length ?? 1;

  if (avoid) labels.push('\\no{\\pill_bottle}');

  let core = withFood ? '\\pill_bottle{\\food_bowl}' : '\\pill_bottle';
  if (CADENCE[freq]) core = `\\${CADENCE[freq]}{${core}}`;
  labels.push(core);

  for (const s of rx?.schedule ?? []) {
    const tm = TIME_MOD[s.label];
    if (tm) labels.push(`\\pill_bottle{\\${tm}}`);
  }

  return labels.join('\n');
}
