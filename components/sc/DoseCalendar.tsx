'use client';

import { MAX_SEGMENTS, type CalendarDay, daySentence, leadingBlanks } from '@/lib/history/calendar';
import { sayable } from './Say';

/**
 * 복약 달력. 한 칸이 하루이고, 칸 안이 그 날의 횟수다.
 *
 * 읽을 것이 없다
 * --------------
 * 날짜 숫자를 칸에 안 쓴다. 이 앱의 사용자는 글을 못 읽을 수 있고, 달력이 답해야
 * 하는 물음 — "요즘 잘 먹고 있나", "어느 요일에 빠지나" — 은 **자리와 색으로**
 * 답이 된다. 몇 일인지가 필요한 사람은 아래 날짜별 목록에서 본다.
 *
 * 요일 머리글자만 남긴다. 그것이 없으면 세로줄이 무슨 요일인지 알 수 없고, 세로줄을
 * 읽는 것이 이 그림의 요점이다.
 *
 * 색이 두 가지뿐이다
 * ------------------
 * 채워진 조각은 먹은 것, 테두리만 있는 조각은 거른 것. 이 앱이 이미 쓰는 초록과
 * 주황 그대로다 — 순응도 카드에서 배운 뜻을 여기서 다시 배우게 하지 않는다.
 *
 * 기록이 없는 날은 **회색 바탕 하나**이고 거른 것과 구별된다. 상자를 꺼 두었거나
 * 여행을 간 날을 실패로 칠하면, 사람이 보는 그림이 조용히 자기를 나무라게 된다.
 */
export function DoseCalendar({ days, picked, onPick }: {
  days: CalendarDay[];
  /**
   * 지금 펼쳐 놓은 날. 달력이 **목록의 선택기**로도 쓰인다.
   *
   * 예전에는 스물여덟 날을 그대로 아래에 늘어놓았다. 한 달이면 읽을 만하지만 이
   * 앱은 몇 달을 쓰라고 만든 것이고, 반년이면 그 목록은 아무도 안 내리는 벽이 된다.
   * 달력은 이미 화면에 있고 이미 날짜를 가리키고 있으니, 그것을 누르게 하면 목록이
   * 늘 한 날이면 된다.
   */
  picked?: string;
  onPick?: (dayKey: string) => void;
}) {
  if (!days.length) return null;
  const blanks = leadingBlanks(days[0].dayKey);

  return (
    <div>
      <div aria-hidden className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold"
           style={{ color: 'var(--color-sc-muted)' }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: blanks }, (_, i) => <span key={`b${i}`} aria-hidden />)}
        {days.map((day) => (
          <Cell key={day.dayKey} day={day}
                picked={day.dayKey === picked} onPick={onPick} />
        ))}
      </div>
    </div>
  );
}

/**
 * 하루.
 *
 * 오늘은 테두리로 표시한다. 색을 하나 더 쓰면 세 번째 뜻이 생기고, 이 그림에서
 * 뜻은 둘이어야 한다 — 먹었다와 안 먹었다.
 */
function Cell({ day, picked, onPick }: {
  day: CalendarDay;
  picked: boolean;
  onPick?: (dayKey: string) => void;
}) {
  const say = daySentence(day);
  /*
    고른 날은 굵은 테두리, 오늘은 얇은 테두리. 둘이 겹치면 굵은 쪽이 이긴다 —
    "지금 보고 있는 것" 이 "오늘" 보다 먼저 알아야 하는 사실이다.
  */
  const ring = picked
    ? { boxShadow: '0 0 0 3px var(--color-sc-primary)' }
    : day.today
      ? { boxShadow: '0 0 0 2px var(--color-sc-ink)' }
      : undefined;
  const pick = onPick ? { onClick: () => onPick(day.dayKey), role: 'button', tabIndex: 0 } : {};

  if (day.offered === 0) {
    return (
      <span {...pick} {...sayable(say)} title={say}
            className="aspect-square rounded-md"
            style={{ background: 'var(--color-sc-bg)', ...ring }} />
    );
  }

  // 셀 수 있는 날: 횟수만큼 쪼갠다. 가로로 눕히지 않고 세로로 쌓는 이유는 칸이
  // 정사각형이고 조각이 넷을 넘어가면 가로 조각이 실오라기가 되기 때문이다.
  if (day.countable) {
    return (
      <span {...pick} {...sayable(say)} title={say}
            className="flex aspect-square flex-col gap-[2px] overflow-hidden rounded-md p-[2px]"
            style={{ background: 'var(--color-sc-bg)', ...ring }}>
        {Array.from({ length: day.offered }, (_, i) => (
          <span key={i} className="flex-1 rounded-[2px]"
                style={i < day.taken
                  ? { background: 'var(--color-safe)' }
                  : { border: '1.5px solid var(--color-caution)' }} />
        ))}
      </span>
    );
  }

  // 너무 많아 못 세는 날: 이어진 게이지. 세는 척하지 않는다.
  const filled = Math.round((day.taken / day.offered) * 100);
  return (
    <span {...pick} {...sayable(say)} title={say}
          className="relative flex aspect-square items-end overflow-hidden rounded-md"
          style={{ background: 'var(--color-sc-bg)', ...ring }}>
      <span className="w-full" style={{ height: `${filled}%`, background: 'var(--color-safe)' }} />
      {/*
        게이지로 바뀌었다는 것을 한 눈에 알리는 표시. 없으면 "하루 한 번 먹고 반쯤
        채워진 칸" 과 "하루 스무 번 중 열 번" 이 똑같이 생긴다.
      */}
      <span aria-hidden className="absolute right-[2px] top-[1px] text-[8px] font-bold"
            style={{ color: 'var(--color-sc-muted)' }}>
        {day.offered > 99 ? '99+' : day.offered}
      </span>
    </span>
  );
}

export { MAX_SEGMENTS };
