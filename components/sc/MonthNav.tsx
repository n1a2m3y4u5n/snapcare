'use client';

import { sayable } from './Say';
import { MAX_MONTHS_BACK, monthOf } from '@/lib/history/window';

/**
 * 넉 주짜리 창을 앞뒤로 옮기는 줄.
 *
 * 왜 필요한가
 * -----------
 * 달력이 늘 오늘로 끝나 있었다. 그러면 이 앱이 석 달을 들고 있어도 사람이 볼 수
 * 있는 것은 마지막 넉 주뿐이고, "지난달에는 어땠나" 를 물을 방법이 없다 — 그 물음이
 * 진료실에서 실제로 나오는 물음인데.
 *
 * 왜 화살표 둘뿐인가
 * ------------------
 * 날짜를 고르는 자리를 만들면 달력을 보러 온 사람에게 또 하나의 달력을 내미는 꼴이
 * 된다. 뒤로·앞으로만 있으면 누를 것이 둘이고, 그 둘은 읽지 않아도 뜻이 선다.
 *
 * 앞으로 가는 쪽은 **오늘에서 멈춘다.** 미래는 빈 격자라 보여줄 것이 없고, 눌러도
 * 아무 일이 없는 버튼은 고장으로 읽힌다. 그래서 못 누를 때는 흐려 둔다.
 */
export function MonthNav({ back, onBack, label, max = MAX_MONTHS_BACK }: {
  /** 몇 창 뒤로 와 있는가. 0 이면 오늘이 든 창. */
  back: number;
  onBack: (next: number) => void;
  /** 지금 보고 있는 구간, 사람이 읽을 말로. */
  label: string;
  /**
   * 얼마나 뒤까지 갈 수 있나.
   *
   * 앞으로 가는 쪽이 오늘에서 멈추는 것과 같은 이유로 뒤로 가는 쪽도 멈춘다 —
   * 그 너머에는 보여줄 것이 **있을 수가 없다.** 기록은 90일에서 잘리므로
   * (`retention.ts`), 그보다 뒤는 늘 빈 격자다.
   *
   * 이 상한이 없을 때 실제로 일어난 일: 빈 창에서 카드가 통째로 안 그려지면서
   * **화살표까지 같이 사라졌다.** 돌아올 길이 화면에서 지워졌고, 사람은 뒤로 갈
   * 수도 앞으로 올 수도 없었다. 벤치에서 그대로 나온 말 — "이전 달로 가는 화살표
   * 누르면 오류 발생".
   */
  max?: number;
}) {
  const atEnd = back >= max;
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onBack(Math.min(max, back + 1))}
        disabled={atEnd}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold disabled:opacity-30"
        style={{ background: 'var(--color-sc-bg)', color: 'var(--color-sc-ink)' }}
        aria-label="Show the month before this"
        {...sayable('Earlier')}
      >
        ‹
      </button>
      <span className="flex-1 text-center text-[11px] font-bold tracking-wide"
            style={{ color: 'var(--color-sc-muted)' }}
            {...sayable(label)}>
        {label}
      </span>
      <button
        onClick={() => onBack(Math.max(0, back - 1))}
        disabled={back === 0}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold disabled:opacity-30"
        style={{ background: 'var(--color-sc-bg)', color: 'var(--color-sc-ink)' }}
        aria-label="Show the month after this"
        {...sayable('Later')}
      >
        ›
      </button>
    </div>
  );
}

/**
 * 그 창의 기준일 — 오늘에서 `back` 창만큼 물러난 날.
 *
 * UTC 로 센다. 지역 시간으로 빼면 자정 근처에서 하루가 밀리고, 그 하루는 달력의
 * 요일 정렬을 통째로 어긋나게 한다.
 */
/**
 * 지금 보고 있는 창 — 이제 **달**이다(`'YYYY-MM'`).
 *
 * 넉 주짜리 창이 화면에서 달로 읽혔다. 일곱 칸 격자에 요일 머리글자가 붙어 있으면
 * 사람은 1일에서 시작해 말일에서 끝나는 것을 보는데, 이 앱은 칸에 날짜 숫자를 안
 * 쓰므로(글을 못 읽는 사람이 쓴다) 어긋난 것을 바로잡을 단서가 없다. 실제로 나온
 * 말 — "지금 8월 5일인데 월말처럼 나온다".
 */
export function anchorFor(today: string, back: number): string {
  return monthOf(today, Math.max(0, back));
}

/** "지난 넉 주" / "그 앞 넉 주" — 지금 보고 있는 구간을 짧게. */
const MONTH = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

/**
 * 지금 보고 있는 달, 사람이 읽을 말로.
 *
 * 달 이름을 쓴다. "4 WEEKS BACK" 은 지금이 언제인지 알아야 뜻이 서는데, 이 화면을
 * 보는 사람에게 그 셈을 시키면 안 된다. 그리고 진료실에서 오가는 말이 "지난달" 이지
 * "넉 주 전" 이 아니다.
 *
 * 해는 이번 해가 아닐 때만 붙인다. 늘 붙이면 읽을 것이 하나 늘고, 대개는 이번 해다.
 */
export function windowLabel(back: number, today = ''): string {
  const month = today ? anchorFor(today, back) : '';
  if (!month) return back === 0 ? 'THIS MONTH' : 'EARLIER';
  const [y, m] = month.split('-').map(Number);
  const thisYear = Number(today.slice(0, 4));
  return y === thisYear ? MONTH[m - 1] : `${MONTH[m - 1]} ${y}`;
}
