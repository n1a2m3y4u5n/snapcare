'use client';

import { sayable } from './Say';

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
export function MonthNav({ back, onBack, label }: {
  /** 몇 창 뒤로 와 있는가. 0 이면 오늘이 든 창. */
  back: number;
  onBack: (next: number) => void;
  /** 지금 보고 있는 구간, 사람이 읽을 말로. */
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onBack(back + 1)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
        style={{ background: 'var(--color-sc-bg)', color: 'var(--color-sc-ink)' }}
        aria-label="Show the four weeks before this"
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
        aria-label="Show the four weeks after this"
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
export function anchorFor(today: string, back: number, days = 28): string {
  if (!today || back <= 0) return today;
  const [y, m, d] = today.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d - back * days));
  return at.toISOString().slice(0, 10);
}

/** "지난 넉 주" / "그 앞 넉 주" — 지금 보고 있는 구간을 짧게. */
export function windowLabel(back: number): string {
  if (back === 0) return 'THE LAST FOUR WEEKS';
  if (back === 1) return 'THE FOUR WEEKS BEFORE';
  return `${back * 4} WEEKS BACK`;
}
