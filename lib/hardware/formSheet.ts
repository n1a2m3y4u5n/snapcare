import type { SlotSchedule } from './protocol';

/**
 * 폼시트 판독 결과 → 기기 일정.
 *
 * 시트는 칸(layer) 하나에 대해 요일·기간·시각을 표시하게 돼 있다.
 * 기기 프로토콜은 하루 안의 시각만 다루므로(요일 반복은 기기의 RTC 가 처리한다),
 * 여기서는 칸과 시각만 뽑고 요일·기간은 화면 안내로 넘긴다.
 */

export interface FormSheetValues {
  layer: string | null;
  days: string[];
  duration: string | null;
  hour: string | null;
}

export interface FormSheetReading {
  schedule: SlotSchedule[];
  /** 사용자에게 보여줄 요약 (요일·기간은 프로토콜에 안 들어가므로 화면에서만 쓴다) */
  summary: string;
  /** 판독이 불완전해 되물어야 하는 항목 */
  missing: string[];
}

export function toSchedule(values: FormSheetValues): FormSheetReading {
  const missing: string[] = [];
  if (!values.layer) missing.push('compartment');
  if (values.hour === null) missing.push('time');
  if (values.days.length === 0) missing.push('days');

  const slot = Number(values.layer);
  const hour = Number(values.hour);
  const schedule: SlotSchedule[] =
    Number.isInteger(slot) && slot >= 1 && Number.isInteger(hour) && hour >= 0 && hour <= 23
      ? [{ slot, times: [`${String(hour).padStart(2, '0')}00`] }]
      : [];

  const parts: string[] = [];
  if (values.layer) parts.push(`Compartment ${values.layer}`);
  if (values.hour !== null) parts.push(`${String(hour).padStart(2, '0')}:00`);
  if (values.days.length === 7) parts.push('every day');
  else if (values.days.length > 0) parts.push(values.days.join(' '));
  if (values.duration) parts.push(values.duration === 'ongoing' ? 'ongoing' : `for ${values.duration}`);

  return { schedule, summary: parts.join(' · '), missing };
}
