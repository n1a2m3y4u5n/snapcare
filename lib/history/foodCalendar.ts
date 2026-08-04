import { windowDays } from './adherence.ts';
import type { Level, ScanRecord } from '../snapcare/types.ts';

/**
 * 음식을 **복약과 같은 달력으로.**
 *
 * 왜 같은 모양인가
 * ----------------
 * 화면이 둘로 갈렸다 — 영양과 복약. 두 화면이 같은 물음("요즘 어떻게 지내고
 * 있나")에 답하는데 그림이 서로 다르면, 사람은 두 가지를 배워야 한다. 한 번 배운
 * 것이 두 번 쓰이는 편이 낫고, 그게 이 앱이 칸과 색을 쓰는 이유다.
 *
 * 하루 한 칸, 칸 안이 그 날 확인한 음식들. 복약에서 한 칸이 한 번의 복용이었던
 * 것과 같다. 다른 것은 **무엇이 칸을 칠하는가** 하나다.
 *
 * 복약은 먹었나 걸렀나, 둘 중 하나다. 음식은 판정이 셋이라(안전·주의·회피) 조각
 * 하나가 그 판정의 색을 그대로 입는다. 그러면 "빨간 조각이 있는 날" 이 세로로
 * 줄지어 보이고, 그것이 이 그림이 답할 수 있는 물음이다 — 주말마다 무너지는가.
 */

export interface FoodDay {
  dayKey: string;
  /** 그 날 확인한 것들의 판정, 나쁜 것부터. */
  levels: Level[];
  today: boolean;
  /** 쪼개서 그릴 수 있는가. 복약 달력과 같은 한도를 쓴다. */
  countable: boolean;
}

/** 한 칸을 몇 조각까지 쪼갤 것인가. `calendar.ts` 와 같은 값이어야 한다. */
export const MAX_SEGMENTS = 6;

/** 나쁜 것이 위로. 하루에 하나만 보이더라도 그것이 회피여야 한다. */
const RANK: Record<Level, number> = { avoid: 0, caution: 1, safe: 2 };

export function foodCalendar(scans: ScanRecord[], today: string,
                             memberId?: string, days = 28): FoodDay[] {
  const byDay = new Map<string, Level[]>();
  for (const s of scans) {
    // 약은 뺀다. 이 달력은 음식에 대한 것이고, 복약은 자기 달력을 갖고 있다.
    if (s.kind === 'medicine') continue;
    if (memberId && s.memberId !== memberId) continue;
    const found = byDay.get(s.dayKey) ?? [];
    found.push(s.level);
    byDay.set(s.dayKey, found);
  }

  return windowDays(today, days)
    .slice()
    .reverse()
    .map((dayKey) => {
      const levels = (byDay.get(dayKey) ?? [])
        .slice()
        .sort((a, b) => RANK[a] - RANK[b]);
      return {
        dayKey,
        levels,
        today: dayKey === today,
        countable: levels.length > 0 && levels.length <= MAX_SEGMENTS,
      };
    });
}

/** 그 날을 소리로. 달력은 그림이라, 칸마다 말이 필요하다. */
export function foodDaySentence(day: FoodDay): string {
  const when = day.today ? 'Today' : day.dayKey;
  if (!day.levels.length) return `${when}: nothing checked.`;
  const avoid = day.levels.filter((l) => l === 'avoid').length;
  const caution = day.levels.filter((l) => l === 'caution').length;
  const n = day.levels.length;
  const what = n === 1 ? 'one thing' : `${n} things`;
  if (avoid) return `${when}: ${what} checked, ${avoid} to avoid.`;
  if (caution) return `${when}: ${what} checked, ${caution} to be careful with.`;
  return `${when}: ${what} checked, all fine.`;
}
