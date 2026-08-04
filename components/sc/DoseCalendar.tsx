'use client';

import { DAY_PARTS, MAX_SEGMENTS, PART_WORD, type CalendarDay, type DayPart, daySentence, leadingBlanks } from '@/lib/history/calendar';
import { sayable } from './Say';
import { MiddayIcon, SunriseIcon, SunsetIcon } from '@/components/icons';

/**
 * 때마다 그림 하나.
 *
 * 범례가 글자였다 — `MORNING` · `MIDDAY` · `EVENING`. 글을 못 읽으면 색이 무엇을
 * 뜻하는지 알 방법이 없었고, 그러면 **색을 나눈 일 자체가 헛일**이 된다. 읽을 수
 * 있는 사람에게만 읽히는 범례를 달아 놓고 색으로 때를 말했다고 한 셈이다.
 *
 * 셋을 가르는 것은 지평선에 대한 해의 자리와 화살표 방향이다. 뜨는 해와 지는 해는
 * 자리가 같아서 화살표 없이는 안 갈린다.
 */
const PART_ICON: Record<DayPart, (p: { size?: number | string }) => React.ReactNode> = {
  morning: SunriseIcon,
  midday: MiddayIcon,
  evening: SunsetIcon,
  unknown: MiddayIcon,
};

/**
 * 때마다 한 색. 밝기 순으로 늘어놓은 한 갈래다 — 값은 `globals.css` 에 있고,
 * 왜 무지개가 아니라 한 줄인지도 거기 적혀 있다.
 */
const PART_COLOR: Record<DayPart, string> = {
  morning: 'var(--color-part-morning)',
  midday: 'var(--color-part-midday)',
  evening: 'var(--color-part-evening)',
  // 때가 아니라 "때를 모른다" 다. 갈래 밖의 회색이라야 갈래로 안 읽힌다.
  unknown: 'var(--color-sc-muted)',
};

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
 * 한 조각이 무엇을 말하는가 — 두 가지를 두 채널로
 * ------------------------------------------------
 * 색은 **때**를 말한다 — 아침·점심·저녁 셋. 채웠느냐 비웠느냐는 **먹었느냐**를
 * 말한다. 두 사실이 두 채널을 하나씩 갖고, 서로 섞이지 않는다.
 *
 * 예전에는 색이 "먹었나" 를 맡고 있었고(초록·주황) 때는 아무데도 없었다. 그래서
 * 세 조각짜리 날을 보면서도 어느 것이 아침인지 알 수 없었고 — 더 나쁘게는, 먹은
 * 것을 위에서부터 채우고 있어서 **아침을 거르고 저녁을 먹은 날이 아침을 먹고
 * 저녁을 거른 날과 똑같이 생겼다.** 두 날은 전혀 다른 날이다.
 *
 * 차례는 이제 자료가 정한다(`calendar.ts` 의 `slots`, 시각 오름차순). 위가 이르고
 * 아래가 늦다 — **순서는 자리가 지고 색은 안 진다.** 한때 색을 밝기 순으로 늘어놓아
 * 순서까지 지게 했는데, 그러면 셋이 너무 닮아서 정작 갈리지가 않았다. 색은 서로
 * 멀어지는 데 쓰고, 순서는 이미 자리가 말한다.
 *
 * 초록·주황·빨강을 안 쓰는 이유는 그 셋이 이 앱에서 **판정**이기 때문이다. 판정이
 * 아닌 것에 판정의 색을 쓰면 두 뜻이 한 색을 나눠 갖는다.
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

      <Legend days={days} />
    </div>
  );
}

/**
 * 범례 — 어느 색이 어느 때인가.
 *
 * **그 달에 실제로 나온 때만** 싣는다. 밤에 먹는 약이 없는 사람에게 밤 색을 보여
 * 주면, 달력에 없는 색을 찾느라 한 번 헤매고 그 다음부터 범례를 안 읽는다.
 *
 * 채운 것과 비운 것도 여기서 한 번 말한다. 그것이 이 그림의 나머지 절반인데
 * 색만 설명하면 반만 읽힌다.
 */
function Legend({ days }: { days: CalendarDay[] }) {
  const present = DAY_PARTS.filter((p) => days.some((d) => d.slots.some((s) => s.part === p)));
  if (present.length < 2) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      {present.map((part) => {
        const Icon = PART_ICON[part];
        return (
          /*
            글자를 지운 것이 아니라 **그림을 앞에 세웠다.** 읽을 수 있는 사람에게
            낱말은 여전히 가장 빠른 길이고, 그림만 남기면 그 사람이 이번에는 그림을
            배워야 한다. 둘을 나란히 두면 각자 아는 쪽으로 읽는다.
          */
          <span key={part} className="flex items-center gap-1 text-[10px] font-bold tracking-wide"
                style={{ color: 'var(--color-sc-muted)' }}
                {...sayable(`${PART_WORD[part]} doses are this colour.`)}>
            <span aria-hidden className="flex items-center justify-center text-sm leading-none"
                  style={{ color: PART_COLOR[part] }}>
              <Icon />
            </span>
            {PART_WORD[part].toUpperCase()}
          </span>
        );
      })}
      <span className="flex items-center gap-1 text-[10px] font-bold tracking-wide"
            style={{ color: 'var(--color-sc-muted)' }}
            {...sayable('A hollow block is a dose that was not taken.')}>
        <span aria-hidden className="h-2.5 w-2.5 rounded-[2px]"
              style={{ border: '1.5px solid var(--color-sc-muted)' }} />
        MISSED
      </span>
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
        {day.slots.map((slot, i) => (
          <span key={i} className="flex-1 rounded-[2px]"
                style={slot.taken
                  ? { background: PART_COLOR[slot.part] }
                  : { border: `1.5px solid ${PART_COLOR[slot.part]}` }} />
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
      {/*
        쪼개기를 그만둔 칸. 때 색을 못 쓴다 — 일곱 조각 이상을 색으로 갈라 봐야
        1px 짜리 띠 일곱 개일 뿐이다. 여기서는 그 날 **가장 이른 복용**의 색으로
        칸 전체를 칠한다. 뜻이 얇아지는 것은 맞지만, 아무 색이나 쓰는 것보다는
        그 날이 언제 시작했는지라도 남는다.
      */}
      <span className="w-full"
            style={{ height: `${filled}%`,
                     background: PART_COLOR[day.slots[0]?.part ?? 'midday'] }} />
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
