'use client';

import { MAX_SEGMENTS, type CalendarDay, daySentence, leadingBlanks } from '@/lib/history/calendar';
import { sayable } from './Say';

/**
 * 한 조각이 무슨 색인가 — **셋뿐이고, 때와 무관하다.**
 *
 * 전에는 색이 때를 말했다(아침·점심·저녁이 각각 다른 색). 그 생각의 근거는 옳았다 —
 * 아침을 거르고 저녁을 먹은 날과 그 반대인 날은 전혀 다른 날이다. 그런데 그 구별은
 * **자리가 이미 하고 있다**: 조각은 시각 순으로 위에서 아래로 쌓이므로 첫 조각이
 * 언제나 그 날의 첫 복용이다. 색까지 그 일을 하면 같은 사실을 두 번 말하면서, 정작
 * 이 화면이 답해야 할 물음 — **잘 먹고 있나** — 에는 아무 색도 안 남는다.
 *
 * 그리고 음식 달력이 바로 옆 탭에 있다. 거기서는 색이 판정이다(초록·주황·빨강).
 * 두 달력이 같은 격자에 같은 크기로 나란히 있으면서 색의 뜻이 다르면, 한 번 배운
 * 그림이 다른 탭에서 안 통한다. 배우는 값을 두 번 치르게 하는 셈이다.
 *
 * 그래서 여기도 판정으로 칠한다:
 *
 *   먹었다        초록   음식 달력의 `safe` 와 같은 색
 *   걸렀다        주황   `caution`. 빨강이 아닌 이유는 한 번 거른 것이 위험이 아니라
 *                        살펴볼 일이어서다 — 빨강은 먹으면 안 되는 것에 쓴다.
 *   아직 안 왔다  빈 칸  성공도 실패도 아니다
 */
const SLOT_COLOR = {
  taken: 'var(--color-safe)',
  missed: 'var(--color-caution)',
} as const;

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
 * 범례 — 색 둘과 빈 칸 하나.
 *
 * 옛 범례는 어느 색이 어느 때인지를 설명했다. 색이 때를 안 말하게 됐으니 그 설명도
 * 없어진다. 남은 것은 음식 달력의 범례와 같은 모양이다 — 색칠한 네모와 그 뜻.
 *
 * 빈 칸도 싣는다. 그것이 이 그림에서 가장 헷갈리는 자리이기 때문이다: 아무것도 없는
 * 칸이 "거른 날" 인지 "아직 안 온 것" 인지가 안 보이면, 오늘 칸을 보고 실패했다고
 * 읽는다.
 */
function Legend({ days }: { days: CalendarDay[] }) {
  const anyPending = days.some((d) => d.pending > 0);

  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
      <span className="flex items-center gap-1.5 text-[11px]"
            style={{ color: SLOT_COLOR.taken }} {...sayable('Taken')}>
        <span aria-hidden className="h-3 w-3 rounded-[3px]" style={{ background: SLOT_COLOR.taken }} />
        TAKEN
      </span>
      <span className="flex items-center gap-1.5 text-[11px]"
            style={{ color: SLOT_COLOR.missed }} {...sayable('Missed')}>
        <span aria-hidden className="h-3 w-3 rounded-[3px]" style={{ background: SLOT_COLOR.missed }} />
        MISSED
      </span>
      {anyPending && (
        <span className="flex items-center gap-1.5 text-[11px]"
              style={{ color: 'var(--color-sc-muted)' }} {...sayable('Not due yet')}>
          <span aria-hidden className="h-3 w-3 rounded-[3px]"
                style={{ boxShadow: 'inset 0 0 0 1.5px var(--color-sc-muted)' }} />
          NOT YET
        </span>
      )}
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
  /*
    빈 칸에도 **테두리를 그린다.**

    빈 날의 바탕이 화면 바탕과 같은 색이라, 아무것도 안 찍은 날은 칸이 아예 없는 것
    처럼 보였다. 그러면 격자가 안 보이고, 격자가 안 보이면 "이 조각이 어느 날인가" 를
    셀 수가 없다 — 달력이 달력으로 안 읽힌다.

    안쪽에 긋는다(`inset`). 바깥에 그으면 4px 사이 간격을 잡아먹어 칸끼리 붙어 보이고,
    색이 찬 날에는 안쪽 선이 조각과 테두리를 갈라 주기까지 한다.

    색은 `--color-sc-line`(#ECEBE6) 이었다. 배경(#F4F3EF)과 2% 차이라 **화면에서 안
    보였다** — 격자를 그어 놓고 격자가 없는 것과 같았다. 글자색을 20% 섞어 쓴다.
    옅은 회색이지만 배경과는 확실히 갈리고, 칸 안의 색조각보다는 확실히 약하다.

    고른 날과 오늘의 굵은 테두리가 이것을 덮는다. 셋이 겹칠 때의 순서는 그대로다.
  */
  const ring = picked
    ? { boxShadow: '0 0 0 3px var(--color-sc-primary)' }
    : day.today
      ? { boxShadow: '0 0 0 2px var(--color-sc-ink)' }
      : { boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-sc-ink) 20%, transparent)' };
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
                  ? { background: SLOT_COLOR.taken }
                  // 아직 안 온 것은 **비운다.** 옛 코드는 이것도 걸른 것과 같은 모양
                  // 으로 그려서, 아침에 앱을 열면 오늘 저녁 약이 이미 실패로 보였다.
                  : slot.pending
                    ? { boxShadow: 'inset 0 0 0 1.5px color-mix(in srgb, var(--color-sc-ink) 22%, transparent)' }
                    : { background: SLOT_COLOR.missed }} />
        ))}
      </span>
    );
  }

  // 너무 많아 못 세는 날: 이어진 게이지. 세는 척하지 않는다.
  // 아직 안 온 것은 분모에서 뺀다. 안 빼면 하루가 시작할 때마다 게이지가 바닥이고,
  // 그것은 "오늘 다 걸렀다" 로 읽힌다.
  const settled = Math.max(1, day.offered - day.pending);
  const filled = Math.round((day.taken / settled) * 100);
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
            style={{ height: `${filled}%`, background: SLOT_COLOR.taken }} />
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
