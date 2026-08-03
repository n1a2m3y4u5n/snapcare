import type { ScanRecord } from '@/lib/snapcare/types';
import type { NutrientKey } from '@/lib/nutrition/types';

/**
 * 조건 추적 — 식이와 직결된 질환을 며칠 단위로 본다.
 *
 * 왜 필요한가: 하루 누적 화면은 오늘 하루만 답한다. 그런데 당뇨나 고혈압처럼
 * 식이와 직결된 조건은 하루가 아니라 흐름으로 관리해야 하고, 그 흐름을 스스로
 * 기억하는 것은 글을 읽는 사람에게도 어렵다. 어제 넘겼는지, 이번 주에 몇 번
 * 넘겼는지는 이미 기록에 다 들어 있는데 아무도 그것을 되짚어 주지 않았다.
 *
 * 왜 조건에 묶는가: 모든 영양소를 며칠씩 보여주면 다시 '읽어야 하는 표' 가 된다.
 * 당뇨가 있으면 당류, 고혈압이 있으면 나트륨 — 그 사람의 조건이 무엇을 볼지
 * 정한다. 조건이 없으면 이 화면 자체가 뜨지 않는다.
 *
 * 이것은 진단도 처방도 아니다. 이미 진단받은 사람이 자기 기록을 되짚는 도구다.
 */

/** 조건 → 그 조건이 지켜봐야 하는 영양소. conditions.ts 의 id 를 쓴다. */
export const WATCHED: Record<string, { key: NutrientKey; label: string; glyph: string }> = {
  diabetic:     { key: 'sugars', label: 'Sugar', glyph: 'food_sugar' },
  hypertension: { key: 'salt', label: 'Salt', glyph: 'food_salt' },
};

export interface DayPoint {
  /** YYYY-MM-DD */
  day: string;
  /** 그날 섭취량 (g). 기록이 없으면 null — 0 과 구별해야 한다. */
  amount: number | null;
  /** 그날 상한 대비 비율 (%). amount 가 null 이면 null. */
  pct: number | null;
  /** 상한의 절반을 넘겼는가 (compute.assess 의 'high' 와 같은 문턱) */
  over: boolean;
}

/**
 * 최근 N일의 하루별 값.
 *
 * 기록이 없는 날을 0 으로 채우지 않는 이유: "먹은 게 없다" 와 "찍지 않았다" 는
 * 전혀 다른 뜻이고, 둘을 같게 그리면 안 찍은 날이 잘 지킨 날로 보인다.
 * 그 오해는 이 화면이 하려는 일과 정반대다.
 */
export function dailySeries(
  records: ScanRecord[],
  key: NutrientKey,
  limit: number,
  days: string[],
  amountOn: (day: string) => number | null,
): DayPoint[] {
  return days.map((day) => {
    const amount = amountOn(day);
    if (amount === null) return { day, amount: null, pct: null, over: false };
    const pct = limit > 0 ? (amount / limit) * 100 : 0;
    return { day, amount, pct, over: pct >= 50 };
  });
}

/** 오늘부터 거슬러 n일치 날짜 키 (오래된 것부터). */
export function recentDays(todayKey: string, n: number): string[] {
  const [y, m, d] = todayKey.split('-').map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date(Date.UTC(y, m - 1, d - i));
    out.push(
      `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`,
    );
  }
  return out;
}

export interface TrackingSummary {
  /** 기록이 있는 날 수 */
  logged: number;
  /** 그중 상한 절반을 넘긴 날 수 */
  over: number;
  /** 오늘을 포함해 연속으로 지킨 날 수 (기록이 있는 날만 센다) */
  streak: number;
}

/**
 * 한 줄로 요약한다.
 *
 * 연속 일수를 세는 이유: 숫자 여러 개보다 "며칠째" 하나가 행동을 바꾼다.
 * 다만 기록이 없는 날은 끊지도 잇지도 않는다 — 안 찍은 날을 실패로 세면
 * 앱을 며칠 안 쓴 사람에게 벌을 주는 것이 되고, 성공으로 세면 거짓이 된다.
 */
export function summarize(points: DayPoint[]): TrackingSummary {
  const logged = points.filter((p) => p.amount !== null).length;
  const over = points.filter((p) => p.over).length;
  let streak = 0;
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    if (p.amount === null) continue;   // 안 찍은 날은 건너뛴다
    if (p.over) break;
    streak++;
  }
  return { logged, over, streak };
}

/** 화면·음성에 쓸 한 문장. 수치를 읽지 못하는 사용자를 위해 문장으로 만든다. */
export function trackingSentence(label: string, s: TrackingSummary, span: number): string {
  if (s.logged === 0) return `No ${label.toLowerCase()} recorded in the last ${span} days.`;
  if (s.over === 0) return `${label} stayed within the limit on all ${s.logged} recorded days.`;
  const dayWord = s.over === 1 ? 'day' : 'days';
  const tail = s.streak > 0 ? ` Within the limit for the last ${s.streak}.` : '';
  return `${label} went over on ${s.over} of ${s.logged} recorded ${dayWord}.${tail}`;
}

/**
 * 조건이 없는 사람이 지켜볼 것.
 *
 * 예전에는 조건이 없으면 추세 화면이 통째로 안 떴다. 이유는 있었다 — 영양소 여덟 개를
 * 며칠씩 늘어놓으면 이 앱이 대체하려던 그 표가 다시 생긴다. 그런데 그 이유가 정당화하는
 * 것은 "적게 보여준다" 이지 "아무것도 안 보여준다" 가 아니었다. 진단이 없는 사람도
 * 어제보다 오늘 설탕을 덜 먹었는지는 알 수 있어야 하고, 그게 진단을 늦추는 길이다.
 *
 * 둘만 고른다. 설탕과 소금은 WHO 가 상한을 정해 둔 것 중 이 앱이 가장 자주 만나는
 * 둘이고(§2.4), 포장 식품에서 값이 실제로 채워져 오는 둘이기도 하다.
 */
const DEFAULT_WATCHED: { id: string; key: NutrientKey; label: string; glyph: string }[] = [
  { id: 'default_sugars', key: 'sugars', label: 'Sugar', glyph: 'food_sugar' },
  { id: 'default_salt', key: 'salt', label: 'Salt', glyph: 'food_salt' },
];

/**
 * 이 사람이 지켜봐야 할 것들.
 *
 * 조건이 있으면 그 조건이 정한다 — 당뇨면 설탕, 고혈압이면 소금. 없으면 기본 둘.
 * 조건이 정한 것과 기본이 겹치면 조건 쪽만 남긴다(같은 영양소를 두 줄로 그리지 않는다).
 */
export function watchedFor(conditionIds: string[]): { id: string; key: NutrientKey; label: string; glyph: string }[] {
  const byCondition = conditionIds
    .filter((id) => WATCHED[id])
    .map((id) => ({ id, ...WATCHED[id] }));
  if (byCondition.length > 0) return byCondition;
  return DEFAULT_WATCHED;
}

/**
 * 최근 n주. 각 주는 그 주에 속한 날짜들이고, 오래된 주가 앞이다.
 *
 * 왜 주 단위인가: 90일을 하루 막대로 그리면 폰 화면에서 한 칸이 3px 이 된다. 글을 못
 * 읽는 사람에게 높낮이로 읽히려면 칸이 손가락만 해야 하고, 그러면 열두 칸이 한계다.
 * 열두 주가 정확히 우리 보관 기간(90일)에 맞는다.
 *
 * 주의 경계는 오늘부터 7일씩 거슬러 자른다. 달력의 월요일에 맞추지 않는 이유는, 이
 * 화면이 답하는 질문이 "지난주에 어땠나" 가 아니라 "요즘 어떤가" 이기 때문이다.
 */
export function recentWeeks(todayKey: string, weeks: number): string[][] {
  const days = recentDays(todayKey, weeks * 7);
  const out: string[][] = [];
  for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
  return out;
}

export interface WeekPoint {
  /** 그 주의 첫 날 (YYYY-MM-DD) */
  from: string;
  /** 기록이 있는 날의 하루 평균. 한 날도 없으면 null. */
  average: number | null;
  /** 상한 대비 비율. average 가 null 이면 null. */
  pct: number | null;
  /** 기록이 있는 날 수 */
  logged: number;
  /** 그 주에 상한을 넘긴 날 수 */
  over: number;
}

/**
 * 주별 요약.
 *
 * 합이 아니라 **평균**이다. 사흘 찍은 주와 이레 찍은 주를 합으로 견주면 많이 찍은 주가
 * 나쁜 주로 보인다 — 앱을 열심히 쓴 것에 벌을 주는 셈이고, 그러면 다음 주에 덜 찍는다.
 */
export function weeklySeries(
  weeks: string[][],
  limit: number,
  amountOn: (day: string) => number | null,
): WeekPoint[] {
  return weeks.map((days) => {
    const amounts = days.map(amountOn).filter((v): v is number => v !== null);
    const over = days.filter((d) => {
      const v = amountOn(d);
      return v !== null && limit > 0 && (v / limit) * 100 >= 50;
    }).length;
    if (amounts.length === 0) {
      return { from: days[0], average: null, pct: null, logged: 0, over: 0 };
    }
    const average = amounts.reduce((s, v) => s + v, 0) / amounts.length;
    return {
      from: days[0],
      average,
      pct: limit > 0 ? (average / limit) * 100 : 0,
      logged: amounts.length,
      over,
    };
  });
}

/** 장기 추세를 한 문장으로. 방향을 말한다 — 숫자 열둘보다 "나아지고 있다" 가 먼저다. */
export function weeklySentence(label: string, points: WeekPoint[]): string {
  const known = points.filter((p) => p.pct !== null);
  if (known.length < 2) return `Not enough ${label.toLowerCase()} history yet.`;
  const half = Math.floor(known.length / 2);
  const older = known.slice(0, half);
  const newer = known.slice(half);
  const mean = (xs: WeekPoint[]) => xs.reduce((s, p) => s + (p.pct ?? 0), 0) / xs.length;
  const change = mean(newer) - mean(older);
  // 10 퍼센트포인트 미만은 방향이라고 말하지 않는다 — 재는 값의 흔들림 안이다.
  if (Math.abs(change) < 10) return `${label} has stayed about the same over ${known.length} weeks.`;
  return change < 0
    ? `${label} has been going down over ${known.length} weeks.`
    : `${label} has been going up over ${known.length} weeks.`;
}

