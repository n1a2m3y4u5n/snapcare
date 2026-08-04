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

/**
 * 색이 무슨 뜻인지 그림으로 적어 둔다.
 *
 * 복약 달력은 색을 배울 필요가 없다 — 채워진 것이 먹은 것이고 빈 것이 안 먹은
 * 것이라, 모양만으로 답이 나온다. 음식은 그렇지 않다. 초록·주황·빨강이 무슨 뜻인지
 * 아는 사람에게만 이 그림이 읽히고, **그 앎을 화면 밖에 두면 안 된다.**
 *
 * 그래서 이모지를 쓴다. 이 앱이 판정 화면에서 이미 쓰는 얼굴 그대로라, 여기서
 * 새로 배울 것이 없고 저기서 배운 것이 여기서 다시 쓰인다.
 */
const LEGEND: { level: string; emoji: string; say: string }[] = [
  { level: 'safe', emoji: '🙂', say: 'Fine' },
  { level: 'caution', emoji: '😐', say: 'Careful' },
  { level: 'avoid', emoji: '🚫', say: 'Avoid' },
];

export function FoodCalendar({ days, picked, onPick }: {
  days: FoodDay[];
  /** 지금 펼쳐 놓은 날. 달력이 아래 목록의 선택기로도 쓰인다. */
  picked?: string;
  onPick?: (dayKey: string) => void;
}) {
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
        {days.map((day) => (
          <Cell key={day.dayKey} day={day}
                picked={day.dayKey === picked} onPick={onPick} />
        ))}
      </div>

      <div className="mt-3 flex items-center justify-center gap-4">
        {LEGEND.map((l) => (
          <span key={l.level} className="flex items-center gap-1.5 text-[11px]"
                style={{ color: 'var(--color-sc-muted)' }}
                {...sayable(l.say)}>
            <span aria-hidden className="h-3 w-3 rounded-[3px]"
                  style={{ background: LEVEL_COLOR[l.level] }} />
            <span aria-hidden>{l.emoji}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Cell({ day, picked, onPick }: {
  day: FoodDay;
  picked: boolean;
  onPick?: (dayKey: string) => void;
}) {
  const say = foodDaySentence(day);
  const ring = picked
    ? { boxShadow: '0 0 0 3px var(--color-sc-primary)' }
    : day.today
      ? { boxShadow: '0 0 0 2px var(--color-sc-ink)' }
      : undefined;
  const pick = onPick ? { onClick: () => onPick(day.dayKey), role: 'button', tabIndex: 0 } : {};

  if (!day.levels.length) {
    return (
      <span {...pick} {...sayable(say)} title={say} className="aspect-square rounded-md"
            style={{ background: 'var(--color-sc-bg)', ...ring }} />
    );
  }

  if (day.countable) {
    return (
      <span {...pick} {...sayable(say)} title={say}
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
    <span {...pick} {...sayable(say)} title={say}
          className="relative flex aspect-square items-center justify-center rounded-md"
          style={{ background: LEVEL_COLOR[worst] ?? 'var(--color-sc-bg)', ...ring }}>
      <span aria-hidden className="text-[9px] font-bold" style={{ color: '#fff' }}>
        {day.levels.length > 99 ? '99+' : day.levels.length}
      </span>
    </span>
  );
}
