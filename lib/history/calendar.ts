import type { DoseRow } from './adherence.ts';
import { windowDays } from './adherence.ts';
import { monthDays } from './window.ts';

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

/**
 * 하루의 어느 때인가.
 *
 * 경계는 `lib/snapcare/clock.ts` 의 `dayPart` 와 같다. 같은 8시를 두 화면이 다른
 * 때로 부르면 안 된다 — 홈에서 "아침" 이라고 말한 복용이 달력에서 다른 색으로
 * 앉아 있으면, 그 둘이 같은 복용이라는 것을 알 방법이 없다.
 *
 * 셋인 이유
 * ---------
 * 넷이었다 — 밤을 따로 두었다. 6×12px 짜리 조각에서 **넷을 서로 갈라내는 것은 눈이
 * 안정적으로 못 하는 일**이고, 범례가 배워지지 않으면 색을 나눈 일 자체가 헛일이
 * 된다. 밤에 먹는 약은 드물고 — 안압약 처방(`G. Xalatan nocte`)처럼 실제로 있기는
 * 하다 — 그것을 "저녁" 으로 부르는 것은 틀린 말이 아니다.
 *
 * 그래서 `clock.ts` 의 `dayPart` 와 갈린다. 그쪽은 넷이고 여기는 셋이다. 실수가
 * 아니라 하는 일이 달라서다 — 저쪽은 **문장**을 만들고("밤에 드세요") 하나 더
 * 있어도 사람이 외울 것이 안 늘지만, 여기는 색을 외워야 하는 자리다.
 *
 * `unknown` 은 때가 아니다 — **때를 모른다**는 뜻이다. 그것을 아무 때로나 넣지
 * 않는 것이 이 타입에서 제일 중요한 값이다. 처음 쓸 때 못 읽는 값을 `night` 으로
 * 떨어뜨렸는데, 그러면 시각이 비어 온 기록이 화면에서 **밤에 먹은 약**이 되고
 * 그것을 알아챌 방법이 없다. 이 저장소가 세 군데에서 되풀이해 적어 둔 규칙이
 * 그것이다: 그럴듯한 틀린 값이 물음표보다 나쁘다.
 */
export type DayPart = 'morning' | 'midday' | 'evening' | 'unknown';

/** 실제 하루의 때들, 이른 것부터. `unknown` 은 여기 없다 — 때가 아니니까. */
export const DAY_PARTS = ['morning', 'midday', 'evening'] as const;

/** `'0800'` → `'morning'`. 못 읽으면 `'unknown'`. */
export function partOf(due: string): DayPart {
  const text = String(due ?? '');
  // 네 자리 숫자여야 한다. `'8'`, `''`, `'8 PM'` 은 이 자료원이 내는 모양이 아니고,
  // 그런 것이 왔다는 것은 위쪽 어딘가가 이미 틀렸다는 뜻이다.
  if (!/^\d{4}$/.test(text)) return 'unknown';
  const hour = Number(text.slice(0, 2));
  if (hour > 23) return 'unknown';
  // 셋이 하루를 다 덮는다. 밤(20시 이후와 새벽)은 저녁에 든다 — 위 머리말 참고.
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'midday';
  return 'evening';
}

/** 그 날의 복용 하나. 달력 칸 안의 조각 하나이기도 하다. */
export interface DoseSlot {
  /** 예정 시각 `'0800'`. 칸 안의 **차례를 정하는 값**이다. */
  due: string;
  part: DayPart;
  taken: boolean;
  /**
   * 아직 그 시각이 안 왔다.
   *
   * `taken: false` 를 전부 "걸렀다" 로 그리고 있었다. 그래서 아침에 앱을 열면 **오늘
   * 저녁 약이 이미 실패로 칠해져 있었다.** 아직 일어나지도 않은 일을 나무라는 화면이고,
   * 매일 아침 그것을 보는 사람에게는 앱이 자기를 못 미더워하는 것으로 읽힌다.
   *
   * 여기서 정하는 이유는 `countable` 과 같다 — 이것은 **자료에 대한 판단**이지 화면
   * 넓이에 대한 것이 아니다. 그리는 쪽이 각자 정하면 두 화면이 같은 날을 다르게 센다.
   */
  pending: boolean;
}

export interface CalendarDay {
  /** `YYYY-MM-DD`. */
  dayKey: string;
  /** 그 날 상자가 내밀었거나 내밀었어야 한 횟수. */
  offered: number;
  /** 그중 사람이 가져간 횟수. */
  taken: number;
  /** 아직 시각이 안 온 횟수. `offered` 에는 들지만 실패로 세면 안 된다. */
  pending: number;
  /** 오늘인가. 오늘은 아직 안 지났으므로 빈 자리가 실패가 아니다. */
  today: boolean;
  /**
   * 쪼개서 그릴 수 있는가. `false` 면 이어진 게이지로 그린다.
   *
   * 그리는 쪽이 정하지 않고 여기서 정하는 이유는, 이 판단이 **자료에 대한 것**이지
   * 화면 넓이에 대한 것이 아니어서다. 같은 날을 두 화면이 다르게 세면 안 된다.
   */
  countable: boolean;
  /**
   * 그 날의 복용들, **시각 순으로**.
   *
   * 예전에는 이 자리가 숫자 둘뿐이었다(`offered`, `taken`). 그리는 쪽은 먹은 것을
   * 위에서부터 채웠고, 그래서 아침을 거르고 저녁을 먹은 날이 **아침을 먹고 저녁을
   * 거른 날과 똑같이 생겼다.** 두 날은 전혀 다른 날이고, 어느 쪽인지가 이 화면을
   * 보는 이유다.
   *
   * 차례는 자료가 정한다. 그리는 쪽이 정렬하게 두면 다른 화면이 다르게 정렬한다.
   */
  slots: DoseSlot[];
}

/** 지금을 `'HHMM'` 으로. 부르는 쪽이 넘기면 그것을 쓴다 — 시험이 시계를 안 읽게. */
function nowClock(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * `anchor` 부터 거슬러 `days` 일치를, **오래된 날이 앞에** 오도록.
 *
 * `anchor` 와 `today` 를 따로 받는다. 지난 달을 넘겨 보려면 창을 옮겨야 하는데,
 * 그때도 "오늘" 표시는 진짜 오늘에 붙어 있어야 한다 — 넘긴 화면에서 옛날 어느 날이
 * 오늘로 표시되면 그 화면은 거짓말을 한다.
 *
 * 달력은 왼쪽 위에서 오른쪽 아래로 읽으므로 시간 순서도 그래야 한다. `windowDays`
 * 는 오늘부터 거꾸로 주는데, 그쪽은 "이 날짜가 창 안인가" 를 묻는 용도라 순서가
 * 상관없다. 여기서 뒤집어 두면 그리는 쪽이 매번 뒤집지 않아도 된다.
 */
export function calendar(rows: DoseRow[], anchor: string, days = 28,
                         today = anchor, nowHHMM = nowClock()): CalendarDay[] {
  const byDay = new Map<string, DoseSlot[]>();
  for (const row of rows) {
    const cell = byDay.get(row.dayKey) ?? [];
    // 아직 안 온 시각은 오늘에만 있다. 지난 날의 빈 자리는 그냥 거른 것이다.
    const pending = row.dayKey === today && !row.taken && row.due > nowHHMM;
    cell.push({ due: row.due, part: partOf(row.due), taken: row.taken, pending });
    byDay.set(row.dayKey, cell);
  }
  // 시각 순. `'0800'` 은 자리수가 고정이라 글자 비교가 곧 시각 비교다.
  for (const cell of byDay.values()) cell.sort((a, b) => a.due.localeCompare(b.due));

  /*
    창이 **달**이다. `anchor` 가 `'YYYY-MM'` 이면 그 달의 모든 날을 쓴다.

    넉 주짜리 창이었다. 산수로는 낫지만(같은 요일이 정확히 네 번, 길이가 늘 같다)
    화면에서 그것이 달로 읽힌다 — 일곱 칸 격자에 요일 머리글자가 붙어 있으면 사람은
    1일에서 시작해 말일에서 끝나는 것을 본다. 게다가 이 앱은 칸에 날짜 숫자를 안
    쓰므로(글을 못 읽는 사람이 쓴다) 어긋난 것을 바로잡을 단서가 화면에 없다.

    `'YYYY-MM-DD'` 도 그대로 받는다 — 옛 부름과 시험이 그 모양이고, 창의 뜻만 달라졌지
    나머지 계산은 같다.
  */
  const span = /^\d{4}-\d{2}$/.test(anchor)
    ? monthDays(anchor)
    : windowDays(anchor, days).slice().reverse();

  return span
    .map((dayKey) => {
      const slots = byDay.get(dayKey) ?? [];
      return {
        dayKey,
        offered: slots.length,
        taken: slots.filter((s) => s.taken).length,
        // 아직 안 온 것은 성공도 실패도 아니다. 순응도 계산이 이 수를 빼고 세도록.
        pending: slots.filter((s) => s.pending).length,
        today: dayKey === today,
        countable: slots.length > 0 && slots.length <= MAX_SEGMENTS,
        slots,
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
 * 마지막 날 뒤에 남는 그 주의 빈 칸 수.
 *
 * 창이 **오늘에서 끝난다.** 그래서 마지막 줄이 주 중간에서 뚝 끊겼고, 달력이 달력으로
 * 안 보였다 — 수요일까지 그려진 격자를 보면 사람은 "이 달력이 잘못됐다" 고 읽는다.
 * 실제로 그 말을 들었다.
 *
 * 앞의 빈 칸은 이미 그리고 있었다(`leadingBlanks`). 같은 이유가 뒤에도 있었는데
 * 한쪽만 하고 있었던 셈이다.
 *
 * 아직 안 온 날은 **칸으로는 있고 내용은 없다.** 지워 버리면 이번 주가 사흘밖에
 * 없는 것처럼 보이고, 색을 칠하면 안 일어난 일을 그린 것이 된다.
 */
export function trailingBlanks(last: string): number {
  const d = new Date(`${last}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? 0 : 6 - d.getUTCDay();
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
  /*
    거른 것이 **어느 때**였는지 말한다.

    "3번 중 2번" 은 숫자만 맞고 아무것도 알려주지 않는다. 이 화면을 보는 사람이
    알고 싶은 것은 "저녁을 자꾸 거른다" 이고, 색으로 그것을 보이기로 한 이상 소리도
    같은 것을 말해야 한다 — 눈으로 읽는 사람과 귀로 듣는 사람이 다른 사실을 받으면
    그 둘은 같은 화면을 본 것이 아니다.
  */
  const missed = day.slots
    .filter((s) => !s.taken && s.part !== 'unknown')
    .map((s) => PART_WORD[s.part]);
  const unique = [...new Set(missed)];
  if (unique.length > 0 && unique.length <= 2) {
    return `${when}: ${day.taken} of ${day.offered} doses were taken. The ${unique.join(' and ')} one was missed.`;
  }
  return `${when}: ${day.taken} of ${day.offered} doses were taken.`;
}

/** 때를 사람이 듣는 말로. */
export const PART_WORD: Record<DayPart, string> = {
  morning: 'morning',
  midday: 'midday',
  evening: 'evening',
  unknown: 'unrecorded',
};
