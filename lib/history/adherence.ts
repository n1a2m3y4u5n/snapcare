import { spanOf } from './window.ts';
import type { ScanRecord } from '../snapcare/types.ts';

/**
 * 이번 주에 몇 번 걸렀나.
 *
 * 왜 이것이 필요한가
 * ------------------
 * 약통은 놓친 복용까지 보고한다. 트레이를 내밀었는데 아무도 안 눌렀으면 그 사실이
 * `taken: false` 로 올라오고, 앱은 그것을 기록에 남긴다. 그런데 **아무 데도 안
 * 보였다.** 남겨 놓고 아무도 안 보는 자료였다.
 *
 * 이 수가 필요한 사람은 둘이다. 딸은 어머니가 이번 주에 두 번 걸렀다는 것을 알아야
 * 하고, 의사는 "약을 드시고 계셨나요" 를 물어봐서 답을 얻지 못한다 — 그 질문에
 * 사람은 대체로 "네" 라고 답한다. 상자가 센 수는 다르다.
 *
 * 무엇을 세지 않는가
 * ------------------
 * 상자에서 오지 않은 기록은 세지 않는다. 사람이 직접 찍어 남긴 복약 기록은 "먹었다"
 * 는 것만 말하고 **거른 것은 말하지 않으므로**, 그것을 분모에 넣으면 순응도가 늘
 * 100% 가 된다. 안 먹은 날에는 아무도 앱을 켜지 않는다.
 *
 * 그래서 이 수는 **짝지은 상자를 쓰는 사람의 수**다. 그 사실을 화면에도 적는다.
 */

/** 지금을 `'HHMM'` 으로. 부르는 쪽이 넘기면 그것을 쓴다 — 시험이 시계를 안 읽게. */
function nowClock(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
}

export interface DoseRow {
  dayKey: string;
  /** 예정 시각 `'0800'` */
  due: string;
  taken: boolean;
  tray: number;
  reason: string;
  name: string;
}

/** 상자가 보고한 복용만 골라 낸다. 사람이 찍어 남긴 것은 분모가 될 수 없다. */
/**
 * 시연 자료에만 붙는 이름표.
 *
 * `demoHistory` 가 뿌리는 기록은 전부 `demo_` 로 시작하고, 상자가 실제로 배출해서
 * 생긴 기록은 `dev_` 로 시작한다(`lib/dispenser/doseLog.ts` 의 `eventId`). 두 갈래를
 * 가르는 표시가 이미 있으므로 새로 만들 것이 없다.
 */
const SEEDED = 'demo_';

export function doseRows(scans: ScanRecord[], memberId?: string, seededOnly = false): DoseRow[] {
  return scans
    .filter((s) => s.dose && (!memberId || s.memberId === memberId))
    /*
      시연 계정의 통계는 **지어낸 이야기**다. 진짜 배출을 거기 섞으면 이야기가 틀어진다.

      발표 콘솔에서 `Open 1` 을 누를 때마다 상자가 사건을 하나 만들고 그것이 기록
      한 줄이 된다. 리허설을 한 번 돌면 오늘 칸에만 스물몇 건이 쌓이고, 그 칸은
      조각을 그만두고 게이지로 바뀌면서 오른쪽 위에 `29` 를 적는다. 자료는 맞는데
      화면이 말하려던 이야기가 아니다.

      **거르는 것은 세는 자리뿐이다.** 홈 화면은 그대로 진짜 배출을 보여 준다 —
      "눌렀더니 앱에 떴다" 가 이 콘솔을 만든 이유이고, 그것까지 지우면 시연할 것이
      없어진다. 통계는 이야기를, 홈은 방금 일어난 일을 말한다.
    */
    .filter((s) => !seededOnly || s.id.startsWith(SEEDED))
    .map((s) => ({
      dayKey: s.dayKey,
      due: s.dose!.due,
      taken: s.dose!.taken,
      tray: s.dose!.tray,
      reason: s.dose!.reason,
      name: s.name,
    }));
}

export interface Adherence {
  /** 상자가 내밀었거나 내밀었어야 하는 횟수 */
  offered: number;
  taken: number;
  missed: number;
  /** 0–1. offered 가 0이면 null — 0% 가 아니다 */
  rate: number | null;
  /** 오늘부터 거슬러 하루도 안 거른 날 수 */
  streak: number;
  /** 가장 자주 거르는 예정 시각 (`'0800'`). 하나로 못 좁히면 null */
  worstTime: string | null;
}

/** `'0800'` → `'8:00 AM'`. 화면과 음성이 같이 쓴다. */
export function clockOf(due: string): string {
  const h = Number(due.slice(0, 2));
  const m = due.slice(2, 4);
  if (!Number.isFinite(h)) return due;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${((h + 11) % 12) + 1}:${m} ${ampm}`;
}

/** 오늘부터 과거로 며칠치를 볼 것인가. 이 날짜들만 분모에 들어간다. */
export function windowDays(today: string, days: number): string[] {
  const out: string[] = [];
  const base = new Date(`${today}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) return [today];
  for (let i = 0; i < days; i++) {
    const d = new Date(base.getTime() - i * 86400000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * @param anchor 볼 창. `'YYYY-MM'`(그 달) 또는 `'YYYY-MM-DD'`(거기서 거슬러 `days` 일치).
 * @param todayKey 진짜 오늘. 창과 갈라 둔다 — 지난달을 넘겨 봐도 "아직 안 온 복용" 은
 *   오늘에만 있고, 창을 달로 바꾸면서 `anchor` 만으로는 그것을 가릴 수 없게 됐다.
 */
export function adherence(rows: DoseRow[], anchor: string, days = 7,
                          nowHHMM = nowClock(), todayKey = anchor): Adherence {
  const today = todayKey;
  // 창의 뜻은 한 곳에서 정한다(`window.ts` 의 `spanOf`) — 달력과 어긋나면 안 된다.
  const window = new Set(spanOf(anchor, days));
  /*
    **아직 시각이 안 온 복용은 안 센다.**

    분모에서 뺀다. 안 빼면 매일 자정에 그 날 몫이 통째로 실패로 들어오고, 하루가
    지나면서 조금씩 회복된다 — 즉 **아침마다 순응도가 가장 낮게 보인다.** 실제로
    나빠진 것이 없는데 숫자가 떨어지고, 그것을 매일 아침 보는 사람에게는 앱이 자기를
    나무라는 것으로 읽힌다.

    달력이 같은 판단을 하고 있다(`calendar.ts` 의 `pending`). 한쪽만 고치면 같은
    화면에서 그림은 "아직" 이라고 하고 숫자는 "실패" 라고 한다.
  */
  const inWindow = rows.filter((r) => window.has(r.dayKey)
    && !(r.dayKey === today && !r.taken && r.due > nowHHMM));

  const offered = inWindow.length;
  const taken = inWindow.filter((r) => r.taken).length;

  /*
    연속 복용일.

    "거른 것이 없는 날" 을 센다. **기록이 아예 없는 날은 끊지 않는다** — 상자를
    잠깐 꺼 두었거나 여행을 갔을 수 있고, 그 날을 실패로 세면 연속일이 아무 뜻도
    없는 수가 된다. 오늘은 아직 안 지났으므로, 오늘 걸렀어도 어제까지의 연속을
    깎지 않는다.
  */
  const missedDays = new Set(inWindow.filter((r) => !r.taken).map((r) => r.dayKey));
  const all = spanOf(anchor, days);
  let streak = 0;
  for (const day of all) {
    if (missedDays.has(day)) {
      if (day === today) continue;    // 오늘은 아직 끝나지 않았다
      break;
    }
    if (rows.some((r) => r.dayKey === day)) streak++;
  }

  /*
    어느 시각을 가장 자주 거르는가.

    아침을 거르는 사람과 저녁을 거르는 사람은 고칠 곳이 다르다 — 앞은 일어나는
    시각의 문제이고 뒤는 저녁 일과의 문제다. 동점이면 null 을 낸다. 둘 중 하나를
    고르면 없는 규칙을 있다고 말하는 것이 된다.
  */
  const missedBy = new Map<string, number>();
  for (const r of inWindow) if (!r.taken) missedBy.set(r.due, (missedBy.get(r.due) ?? 0) + 1);
  let worstTime: string | null = null;
  let worstCount = 0;
  let tied = false;
  for (const [due, n] of missedBy) {
    if (n > worstCount) { worstTime = due; worstCount = n; tied = false; }
    else if (n === worstCount) tied = true;
  }
  if (tied || worstCount === 0) worstTime = null;

  return {
    offered,
    taken,
    missed: offered - taken,
    rate: offered === 0 ? null : taken / offered,
    streak,
    worstTime,
  };
}

/**
 * 사람에게 읽어 줄 한 문장.
 *
 * 숫자를 못 읽는 사람에게 "86%" 는 도착하지 않는다. 횟수로 말한다 — "일곱 번 중
 * 한 번을 걸렀습니다" 는 셀 수 있는 말이다.
 *
 * 잘하고 있을 때도 말한다. 알림이 실패했을 때만 말하는 앱은 잔소리가 되고, 잔소리는
 * 꺼진다.
 */
export function adherenceSentence(a: Adherence): string {
  if (a.rate === null) return 'The box has not reported any doses yet.';
  if (a.missed === 0) {
    return a.streak > 1
      ? `You have taken every dose for ${a.streak} days.`
      : 'You have taken every dose.';
  }
  const times = a.missed === 1 ? 'once' : `${a.missed} times`;
  const tail = a.worstTime ? ` Most often at ${clockOf(a.worstTime)}.` : '';
  return `Out of ${a.offered} doses, you missed ${times}.${tail}`;
}
