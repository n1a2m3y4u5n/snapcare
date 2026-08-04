'use client';

import { type FoodDay, foodDaySentence } from '@/lib/history/foodCalendar';
import { leadingBlanks } from '@/lib/history/calendar';
import { sayable } from './Say';

/**
 * 음식 달력. 복약 달력과 **같은 격자, 같은 규칙.**
 *
 * 다른 것은 무엇이 칸을 칠하는가 하나다. 복약은 먹었나 걸렀나 둘 중 하나라 초록과
 * 주황 테두리였고, 음식은 판정이 셋이라 조각이 그 색을 그대로 입는다.
 *
 * 요일 머리글자와 오늘 테두리, 기록 없는 날의 회색, 못 셀 만큼 많은 날의 처리까지
 * 복약 쪽과 똑같이 둔다. 한 번 배운 그림이 두 화면에서 그대로 읽혀야 한다.
 */
const LEVEL_COLOR: Record<string, string> = {
  safe: 'var(--color-safe)',
  caution: 'var(--color-caution)',
  avoid: 'var(--color-avoid)',
};

export function FoodCalendar({ days }: { days: FoodDay[] }) {
  if (!days.length) return null;
  const blanks = leadingBlanks(days[0].dayKey);

  return (
    <div>
      <div aria-hidden className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold"
           style={{ color: 'var(--color-sc-muted)' }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i}>{d}</span>)}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: blanks }, (_, i) => <span key={`b${i}`} aria-hidden />)}
        {days.map((day) => <Cell key={day.dayKey} day={day} />)}
      </div>
    </div>
  );
}

function Cell({ day }: { day: FoodDay }) {
  const say = foodDaySentence(day);
  const ring = day.today ? { boxShadow: '0 0 0 2px var(--color-sc-ink)' } : undefined;

  if (!day.levels.length) {
    return (
      <span {...sayable(say)} title={say} className="aspect-square rounded-md"
            style={{ background: 'var(--color-sc-bg)', ...ring }} />
    );
  }

  if (day.countable) {
    return (
      <span {...sayable(say)} title={say}
            className="flex aspect-square flex-col gap-[2px] overflow-hidden rounded-md p-[2px]"
            style={{ background: 'var(--color-sc-bg)', ...ring }}>
        {day.levels.map((level, i) => (
          <span key={i} className="flex-1 rounded-[2px]"
                style={{ background: LEVEL_COLOR[level] ?? 'var(--color-sc-muted)' }} />
        ))}
      </span>
    );
  }

  /*
    못 셀 만큼 많은 날. 조각을 그리지 않고 **그 날의 최악**으로 칸을 통째로 칠하고
    개수를 작게 적는다.

    최악을 쓰는 이유는 이 그림이 답하는 물음이 "그 날 조심할 것이 있었나" 라서다.
    평균이나 다수결로 칠하면 회피 하나가 안전 여덟에 묻히는데, 묻히면 안 되는 것이
    정확히 그 하나다.
  */
  const worst = day.levels[0];
  return (
    <span {...sayable(say)} title={say}
          className="relative flex aspect-square items-center justify-center rounded-md"
          style={{ background: LEVEL_COLOR[worst] ?? 'var(--color-sc-bg)', ...ring }}>
      <span aria-hidden className="text-[9px] font-bold" style={{ color: '#fff' }}>
        {day.levels.length > 99 ? '99+' : day.levels.length}
      </span>
    </span>
  );
}
