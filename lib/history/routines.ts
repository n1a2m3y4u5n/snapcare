import { lastDay, running } from '../snapcare/course.ts';
import { planTrays } from '../hardware/dispenser.ts';
import type { Reminder } from '../../stores/reminders.ts';

/**
 * **지금 정해져 있는 것.** 무엇을, 하루 몇 번, 언제까지.
 *
 * 왜 필요한가
 * -----------
 * 이 앱은 "무엇이 일어났나" 는 잘 보여준다 — 달력, 게이지, 날짜별 목록. 그런데
 * 그것을 읽으려면 **무엇이 일어났어야 하는지**를 이미 알고 있어야 한다. 거른 칸이
 * 두 개인 것은 하루 두 번짜리 처방에서는 하루를 통째로 건너뛴 것이고, 하루 다섯
 * 번짜리에서는 한 끼를 늦게 먹은 것이다. 같은 그림이 다른 뜻이 된다.
 *
 * 벤치에서 그대로 나온 말: "지금 어떤 약은 어떤 주기로 먹게 루틴이 설정되어 있는지
 * 리스트를 보여주는 것도 필요할 듯."
 *
 * 왜 알람을 그대로 못 쓰는가
 * --------------------------
 * 알람은 **약 × 시각**으로 하나씩 있다. 하루 두 번 먹는 약은 알람 둘이고, 그 둘은
 * 사람에게 두 가지 일이 아니라 한 가지 일이다. 사람이 아는 단위는 약이고, 화면도
 * 그 단위로 말해야 한다.
 *
 * 끝난 처방은 빼는가
 * ------------------
 * 뺀다. 이 목록의 물음은 "지금 무엇을 먹기로 되어 있나" 이고, 지난달에 끝난
 * 항생제는 그 물음의 답이 아니다. 지난 것은 아래 기록에 그대로 남아 있다.
 */

export interface Routine {
  /** 약 이름. 같은 이름의 알람들이 하나로 묶인다. */
  name: string;
  emoji: string;
  /** 하루 중 언제들. 표시용 문자열 그대로(`'8:00 AM'`), 시각순. */
  times: string[];
  /** 이 약이 들어 있는 상자의 칸. 배정을 못 받았으면 null. */
  tray: number | null;
  /** 마지막 날 (`YYYY-MM-DD`), 또는 null 이면 끝을 정하지 않은 것. */
  endsOn: string | null;
}

/** `'8:00 AM'` → `'08:00'`. 정렬에만 쓴다. */
function to24h(label: string): string {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(label);
  if (!m) return label;
  let h = Number(m[1]);
  const ampm = m[3]?.toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

export function routines(reminders: Reminder[], today: string, maxTrays?: number): Routine[] {
  const live = running(reminders, today);

  /*
    칸 배정은 상자에 보내는 것과 **같은 함수**로 구한다. 여기서 따로 세면 화면이
    말하는 칸과 약이 실제로 나오는 칸이 갈라질 수 있고, 그 어긋남은 사람이 엉뚱한
    칸에 약을 채워 넣는 모습으로만 드러난다.
  */
  const trayOf = new Map<string, number>();
  for (const t of planTrays(live, maxTrays).plan) {
    if (t.source?.id) trayOf.set(t.source.id, t.tray);
  }

  const byName = new Map<string, Routine & { _sort: string[] }>();
  for (const r of live) {
    const key = r.item.name;
    const found = byName.get(key) ?? {
      name: r.item.name,
      emoji: r.item.emoji ?? '💊',
      times: [],
      tray: trayOf.get(r.id) ?? null,
      endsOn: r.startedOn && r.days ? lastDay(r.startedOn, r.days) : null,
      _sort: [],
    };
    found.times.push(r.time);
    found._sort.push(to24h(r.time));
    // 한 약이 여러 칸에 걸릴 수 있다. 첫 칸을 쓴다 — 이 줄이 답하는 물음은 "어디에
    // 채워 넣나" 이고, 그 답이 없는 것보다는 첫 칸이라도 있는 편이 낫다.
    if (found.tray === null) found.tray = trayOf.get(r.id) ?? null;
    byName.set(key, found);
  }

  return [...byName.values()]
    .map((r) => {
      const order = r._sort
        .map((t, i) => [t, r.times[i]] as const)
        .sort((a, b) => a[0].localeCompare(b[0]));
      return {
        name: r.name, emoji: r.emoji, tray: r.tray, endsOn: r.endsOn,
        times: order.map(([, label]) => label),
      };
    })
    // 하루 중 첫 복용이 이른 것부터. 사람이 하루를 읽는 순서다.
    .sort((a, b) => to24h(a.times[0] ?? '').localeCompare(to24h(b.times[0] ?? '')));
}

/** 한 줄을 소리로. 글을 못 읽는 사람에게 목록은 그림일 뿐이다. */
export function routineSentence(r: Routine): string {
  const how = r.times.length === 1
    ? `once a day, at ${r.times[0]}`
    : `${r.times.length} times a day, at ${r.times.join(' and ')}`;
  const until = r.endsOn ? `, until ${r.endsOn}` : '';
  return `${r.name}: ${how}${until}.`;
}
