// 확장자를 붙이는 이유: 이 모듈을 node --test 로 번들러 없이 직접 돌린다.
import { EVERY_DAY, type WeeklySlot } from './protocol.ts';

/**
 * 폼시트 판독 결과 → 기기 일정.
 *
 * 시트는 칸(layer) 하나에 대해 요일·기간·시각을 표시하게 돼 있다. 예전에는 여기서
 * 칸과 시각만 뽑고 요일·기간은 화면 안내로 넘겼다 — 기기 프로토콜에 실을 자리가
 * 없었기 때문이다. 그래서 월/수/금 30일로 표시된 시트가 '매일 무기한' 과 똑같이
 * 인코딩됐고, 일정은 맞아 보이는데 아무도 요청하지 않은 나흘에 약이 나갔다.
 *
 * SC1*W* 가 그 자리를 만들었으니 이제 네 값을 전부 싣는다. 시트에 표시된 것과
 * 기기가 받는 것이 어긋나지 않는다.
 */

/** 시트의 요일 칸 → 비트 위치. bit 0 = 월요일, 종이의 좌→우 순서와 같다. */
const DAY_BIT: Record<string, number> = {
  MON: 1 << 0, TUE: 1 << 1, WED: 1 << 2, THU: 1 << 3,
  FRI: 1 << 4, SAT: 1 << 5, SUN: 1 << 6,
};

/** 시트의 기간 칸 → 일수. 'ongoing' 은 0 (무기한). */
const DURATION_DAYS: Record<string, number> = {
  '7d': 7, '14d': 14, '30d': 30, '90d': 90, ongoing: 0,
};

export interface FormSheetValues {
  layer: string | null;
  days: string[];
  duration: string | null;
  hour: string | null;
}

export interface FormSheetReading {
  /** 요일·기간까지 실은 일정. 기기에는 SC1*W* 로 나간다. */
  schedule: WeeklySlot[];
  /** 사용자에게 보여줄 요약 */
  summary: string;
  /** 판독이 불완전해 되물어야 하는 항목 */
  missing: string[];
}

/** 시트에 표시된 요일들 → 비트마스크. 아무것도 없으면 0. */
export function dayMask(days: string[]): number {
  return days.reduce((m, d) => m | (DAY_BIT[d.toUpperCase()] ?? 0), 0);
}

export function toSchedule(values: FormSheetValues): FormSheetReading {
  const missing: string[] = [];
  if (!values.layer) missing.push('compartment');
  if (values.hour === null) missing.push('time');
  if (values.days.length === 0) missing.push('days');

  const slot = Number(values.layer);
  const hour = Number(values.hour);
  const mask = dayMask(values.days);

  // 요일이 하나도 안 읽히면 일정을 만들지 않는다. 예전에는 이 경우에도 시각만으로
  // 일정을 만들었고, 기기는 그것을 매일로 받았다 — 되물어야 할 자리에서 추측한 셈이다.
  const schedule: WeeklySlot[] =
    Number.isInteger(slot) && slot >= 1
    && Number.isInteger(hour) && hour >= 0 && hour <= 23
    && mask > 0
      ? [{
          slot,
          times: [`${String(hour).padStart(2, '0')}00`],
          days: mask,
          durationDays: DURATION_DAYS[values.duration ?? ''] ?? 0,
        }]
      : [];

  const parts: string[] = [];
  if (values.layer) parts.push(`Compartment ${values.layer}`);
  if (values.hour !== null) parts.push(`${String(hour).padStart(2, '0')}:00`);
  if (mask === EVERY_DAY) parts.push('every day');
  else if (values.days.length > 0) parts.push(values.days.join(' '));
  if (values.duration) parts.push(values.duration === 'ongoing' ? 'ongoing' : `for ${values.duration}`);

  return { schedule, summary: parts.join(' · '), missing };
}
