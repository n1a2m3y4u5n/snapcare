import type { ScanRecord } from '../snapcare/types.ts';

/**
 * 지난 기록을 날짜별로 되짚는다.
 *
 * 지금까지 지난 것을 볼 수 있는 자리는 홈의 최근 몇 줄과 오늘 누적뿐이었다.
 * "지난주 화요일에 뭘 먹었나" 를 볼 길이 없었고, 그 물음은 진료실에서 실제로
 * 나오는 물음이다 — 두드러기가 났던 날 무엇을 먹었는지, 약을 언제부터 걸렀는지.
 *
 * 자료는 이미 다 있었다. 기록마다 `dayKey` 가 붙어 있고 상자에서 온 복용도 같은
 * 자리에 쌓인다. 모아서 보여주는 화면만 없었다.
 */

export interface DaySummary {
  dayKey: string;
  /** 그날 기록 전부, 늦은 것부터 */
  records: ScanRecord[];
  /** 그날 먹은 것 (약이 아닌 것) */
  foods: ScanRecord[];
  /** 그날의 복용 — 상자에서 온 것만 */
  doses: ScanRecord[];
  /** 상자가 내민 복용 중 실제로 가져간 수 */
  taken: number;
  missed: number;
  /** 회피 판정이 하나라도 있었나. 그날 줄에 표시가 붙는다 */
  hadAvoid: boolean;
  /** 몸이 안 좋았다고 답한 것이 있나 */
  hadReaction: boolean;
}

/**
 * 시드 기록의 날짜 센티널을 실제 날짜로 바꾼다.
 *
 * 스토어는 데모 자료에 `'today'` 와 `'yesterday'` 를 쓴다 — 모듈을 읽는 시점에
 * `new Date()` 를 부르면 서버가 그린 화면과 브라우저가 그린 화면이 어긋나기 때문이다.
 * 그대로 두면 이 화면에서 그 둘이 **날짜 이름을 가진 날**로 따로 앉는다. 문자열
 * 정렬에서 't' 와 'y' 는 숫자보다 뒤라 목록 맨 아래로 가고, 화면에서는 1970년보다
 * 오래된 날처럼 보인다.
 *
 * `'today'` 만 옮기고 `'yesterday'` 를 빠뜨렸다가 데모 계정에서 그 줄 하나가
 * 목록 끝에 떨어져 앉는 것을 보고 알았다. 시험이 `'today'` 만 확인하고 있었다.
 */
function realDay(dayKey: string, today: string): string {
  if (dayKey === 'today') return today;
  if (dayKey === 'yesterday') {
    const t = new Date(`${today}T00:00:00Z`).getTime();
    if (Number.isFinite(t)) return new Date(t - 86400000).toISOString().slice(0, 10);
  }
  return dayKey;
}

/**
 * 날짜별로 묶는다. 최근 날이 먼저다.
 */
export function byDay(scans: ScanRecord[], today: string, memberId?: string): DaySummary[] {
  const mine = memberId ? scans.filter((s) => s.memberId === memberId) : scans;

  const groups = new Map<string, ScanRecord[]>();
  for (const s of mine) {
    const day = realDay(s.dayKey, today);
    const list = groups.get(day) ?? [];
    list.push(s);
    groups.set(day, list);
  }

  const days = [...groups.entries()].map(([dayKey, records]) => {
    const doses = records.filter((r) => r.dose);
    return {
      dayKey,
      records,
      foods: records.filter((r) => !r.dose && r.kind !== 'medicine' && r.kind !== 'prescription'),
      doses,
      taken: doses.filter((r) => r.dose!.taken).length,
      missed: doses.filter((r) => !r.dose!.taken).length,
      hadAvoid: records.some((r) => r.level === 'avoid'),
      hadReaction: records.some((r) => r.reaction === 'unwell'),
    };
  });

  return days.sort((a, b) => (a.dayKey < b.dayKey ? 1 : a.dayKey > b.dayKey ? -1 : 0));
}

/**
 * 날짜를 사람이 읽는 말로.
 *
 * 어제까지는 이름으로 부른다. 날짜를 못 읽는 사람에게 `2026-07-28` 은 아무것도
 * 아니고, "어제" 는 그 사람도 안다.
 */
export function dayLabel(dayKey: string, today: string): string {
  if (dayKey === today) return 'Today';
  const t = new Date(`${today}T00:00:00Z`).getTime();
  const d = new Date(`${dayKey}T00:00:00Z`).getTime();
  if (!Number.isFinite(t) || !Number.isFinite(d)) return dayKey;
  const days = Math.round((t - d) / 86400000);
  if (days === 1) return 'Yesterday';
  if (days > 1 && days < 7) return `${days} days ago`;
  // 그보다 오래된 것은 날짜를 낸다. "23일 전" 은 세어 보지 않으면 언제인지 모른다.
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/**
 * 하루를 한 문장으로. 듣기 버튼이 이걸 읽는다.
 *
 * 세 가지를 한 문장에 담는다: 몇 가지를 확인했는지, 약은 어땠는지, 몸은 어땠는지.
 * 그 이상은 한 번 듣고 기억할 수 없다.
 */
export function daySentence(day: DaySummary, label: string): string {
  const parts: string[] = [];

  if (day.foods.length > 0) {
    parts.push(day.foods.length === 1
      ? `you checked one thing to eat`
      : `you checked ${day.foods.length} things to eat`);
  }
  if (day.doses.length > 0) {
    if (day.missed === 0) parts.push(`you took all ${day.doses.length} of your medicines`);
    else if (day.taken === 0) parts.push(`you missed all ${day.doses.length} of your medicines`);
    else parts.push(`you took ${day.taken} medicines and missed ${day.missed}`);
  }
  if (parts.length === 0) return `${label}. Nothing was recorded.`;

  const body = parts.join(', and ');
  const tail = day.hadReaction ? ' You said you felt unwell that day.' : '';
  return `${label}. ${body[0].toUpperCase()}${body.slice(1)}.${tail}`;
}
