import type { DoseRow } from './adherence.ts';
import { windowDays } from './adherence.ts';

/**
 * 복약을 **달력**으로.
 *
 * 왜 달력인가
 * -----------
 * 이 앱에는 이미 순응도 카드가 있고, 그것은 복용 한 번을 칸 하나로 그린다. 한 주에
 * 스물한 번쯤이면 셀 만한 그림이지만 그 수는 위로 열려 있다 — 벤치에서 하루 시험한
 * 끝에 칸 128개가 한 줄로 흘렀다. 그리고 세로로 늘어난 칸들은 "얼마나 잘 하고
 * 있나" 는 말해도 **"언제 걸렀나" 는 말하지 못한다.**
 *
 * 달력은 둘 다 한다. 한 칸이 하루라서 개수가 날짜에 묶여 위로 안 열리고, 빈 자리가
 * 요일 위에 있으니 "주말마다 저녁을 거른다" 같은 것이 보인다. 그것이 진료실에서
 * 실제로 나오는 물음이다.
 *
 * 하루를 어떻게 그리는가
 * ----------------------
 * 그 날 몇 번 중 몇 번인지를 **칸을 쪼개서** 보인다. 세 번이면 셋으로 나뉘고, 먹은
 * 만큼 채워진다. 백분율이나 분수가 아니라 세면 되는 그림이고, 그것이 이 앱의 규칙이다.
 *
 * 다만 쪼갤 수 있는 데에는 한계가 있다. 2.8인치도 아닌 폰 화면이라도 한 칸에 여섯
 * 조각이 들어가면 조각 하나가 몇 픽셀이 된다. 그 위로는 쪼개기를 그만두고 **이어진
 * 게이지**로 채운다 — 셀 수 없게 된 것을 세는 척하지 않는 편이 낫고, 그 정도로 많은
 * 날은 비율만 보여도 알아야 할 것은 다 보인다.
 */

/** 한 칸을 몇 조각까지 쪼갤 것인가. 이보다 많으면 이어진 게이지로 바뀐다. */
export const MAX_SEGMENTS = 6;

export interface CalendarDay {
  /** `YYYY-MM-DD`. */
  dayKey: string;
  /** 그 날 상자가 내밀었거나 내밀었어야 한 횟수. */
  offered: number;
  /** 그중 사람이 가져간 횟수. */
  taken: number;
  /** 오늘인가. 오늘은 아직 안 지났으므로 빈 자리가 실패가 아니다. */
  today: boolean;
  /**
   * 쪼개서 그릴 수 있는가. `false` 면 이어진 게이지로 그린다.
   *
   * 그리는 쪽이 정하지 않고 여기서 정하는 이유는, 이 판단이 **자료에 대한 것**이지
   * 화면 넓이에 대한 것이 아니어서다. 같은 날을 두 화면이 다르게 세면 안 된다.
   */
  countable: boolean;
}

/**
 * 오늘부터 거슬러 `days` 일치를, **오래된 날이 앞에** 오도록.
 *
 * 달력은 왼쪽 위에서 오른쪽 아래로 읽으므로 시간 순서도 그래야 한다. `windowDays`
 * 는 오늘부터 거꾸로 주는데, 그쪽은 "이 날짜가 창 안인가" 를 묻는 용도라 순서가
 * 상관없다. 여기서 뒤집어 두면 그리는 쪽이 매번 뒤집지 않아도 된다.
 */
export function calendar(rows: DoseRow[], today: string, days = 28): CalendarDay[] {
  const byDay = new Map<string, { offered: number; taken: number }>();
  for (const row of rows) {
    const cell = byDay.get(row.dayKey) ?? { offered: 0, taken: 0 };
    cell.offered += 1;
    if (row.taken) cell.taken += 1;
    byDay.set(row.dayKey, cell);
  }

  return windowDays(today, days)
    .slice()
    .reverse()
    .map((dayKey) => {
      const cell = byDay.get(dayKey) ?? { offered: 0, taken: 0 };
      return {
        dayKey,
        offered: cell.offered,
        taken: cell.taken,
        today: dayKey === today,
        countable: cell.offered > 0 && cell.offered <= MAX_SEGMENTS,
      };
    });
}

/**
 * 달력 앞에 붙일 빈 칸의 수 — 첫 날을 제 요일 아래로 밀어 놓기 위한 것.
 *
 * 요일이 맞지 않으면 달력이 아니라 그냥 격자다. "주말마다 걸린다" 는 요일이 세로로
 * 줄지어야만 보이는 것이고, 그게 이 화면을 달력으로 만든 이유의 절반이다.
 *
 * 일요일이 0. 자료의 날짜를 UTC 로 읽는 것은 `windowDays` 와 같은 이유다 — 지역
 * 시간으로 읽으면 자정 근처에서 하루가 밀린다.
 */
export function leadingBlanks(first: string): number {
  const d = new Date(`${first}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? 0 : d.getUTCDay();
}

/**
 * 그 날을 소리로. 읽지 못하는 사람에게 달력은 그림일 뿐이라, 칸마다 말이 필요하다.
 */
export function daySentence(day: CalendarDay): string {
  const when = day.today ? 'Today' : day.dayKey;
  if (day.offered === 0) return `${when}: nothing from the box.`;
  if (day.taken === day.offered) {
    return day.offered === 1
      ? `${when}: the one dose was taken.`
      : `${when}: all ${day.offered} doses were taken.`;
  }
  return `${when}: ${day.taken} of ${day.offered} doses were taken.`;
}
