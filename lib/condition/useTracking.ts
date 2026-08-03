'use client';

import { useEffect, useState } from 'react';
import type { Member, ScanRecord } from '@/lib/snapcare/types';
import type { NutrientKey } from '@/lib/nutrition/types';
import type { NutrientProfile } from '@/lib/nutrition/types';
import { getItem } from '@/lib/snapcare/catalog';
import { todayKey } from '@/stores/scans';
import { referenceFor } from '@/lib/nutrition/reference';
import { loadProfiles } from '@/lib/nutrition/profileCache';
import { amountsFor, portionGrams } from '@/lib/nutrition/compute';
import {
  recentDays, recentWeeks, dailySeries, weeklySeries, summarize, watchedFor,
  type DayPoint, type TrackingSummary, type WeekPoint,
} from './tracking';

/**
 * 조건별 며칠치 추이.
 *
 * useDailyIntake 는 오늘 하루만 답한다. 여기서는 같은 재료(제품 프로필 캐시, 개인
 * 기준치)를 그대로 쓰되 날짜별로 나눠 센다. 계산을 복사하지 않고 재사용하는 이유는
 * 두 화면이 다른 숫자를 말하면 어느 쪽을 믿어야 하는지 사용자가 알 수 없어서다.
 */

export interface TrackedSeries {
  conditionId: string;
  key: NutrientKey;
  label: string;
  glyph: string;
  limit: number;
  points: DayPoint[];
  summary: TrackingSummary;
  /** 주별 요약 — 오래된 주가 앞. 기록이 얕으면 빈 배열이다. */
  weeks: WeekPoint[];
}

export interface TrackingResult {
  state: 'loading' | 'ready' | 'none';
  span: number;
  /** 주별 화면을 그릴 만한가 — 최소 두 주에 기록이 있어야 방향을 말할 수 있다. */
  weeksWorthShowing: number;
  series: TrackedSeries[];
}

const SPAN = 7;

/*
  얼마나 거슬러 볼 것인가.

  기록 보관이 90일이므로(lib/snapcare/retention.ts) 그 이상은 물어도 빈칸이다.
  열두 주가 그 한계에 맞고, 폰 화면에서 손가락만 한 칸 열둘이 들어가는 한계이기도 하다.
*/
const WEEKS = 12;

function barcodeOf(rec: ScanRecord): string | undefined {
  return rec.barcode ?? getItem(rec.itemId)?.barcode;
}

/** 시드 기록의 'today'·'yesterday' 센티널을 실제 날짜로 옮긴다. */
function dayOf(rec: ScanRecord, today: string): string | undefined {
  if (!rec.dayKey) return undefined;
  if (rec.dayKey === 'today') return today;
  if (rec.dayKey === 'yesterday') {
    const [y, m, d] = today.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d - 1));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
  }
  return rec.dayKey;
}

export function useTracking(scans: ScanRecord[], member: Member | undefined): TrackingResult {
  const [state, setState] = useState<{ today: string; profiles: Map<string, NutrientProfile> } | null>(null);

  // scans 배열은 매 렌더 새 참조일 수 있어, 실제로 조회가 달라지는 경우만 dep 으로 쓴다.
  const barcodeKey = scans.map((r) => (r.item?.profile ? 'inline' : barcodeOf(r) ?? '')).join(',');

  useEffect(() => {
    let alive = true;
    const codes = scans.map(barcodeOf).filter((c): c is string => Boolean(c));
    loadProfiles(codes).then((profiles) => {
      // todayKey() 는 렌더가 아닌 여기서 읽는다 (SSR 불일치·불순 렌더 회피).
      if (alive) setState({ today: todayKey(), profiles });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barcodeKey]);

  const watched = watchedFor(member?.conditionIds ?? []);
  if (watched.length === 0) return { state: 'none', span: SPAN, weeksWorthShowing: 0, series: [] };
  if (!member || !state) return { state: 'loading', span: SPAN, weeksWorthShowing: 0, series: [] };

  // 하루 막대는 최근 이레, 주 막대는 최대 열두 주. 둘을 같은 합산에서 뽑으므로
  // 넓은 쪽 날짜를 먼저 만들고 좁은 쪽은 그 꼬리를 쓴다.
  const weeks = recentWeeks(state.today, WEEKS);
  const allDays = weeks.flat();
  const days = recentDays(state.today, SPAN);
  const reference = referenceFor(member);

  // 날짜 → 그날 먹은 것들의 영양소 합
  const byDay = new Map<string, { amounts: Partial<Record<NutrientKey, number>>; count: number }>();
  for (const rec of scans) {
    if (rec.kind !== 'food' && rec.kind !== 'drink') continue;
    const day = dayOf(rec, state.today);
    if (!day || !allDays.includes(day)) continue;

    const inline = rec.item?.profile;
    const code = barcodeOf(rec);
    const profile = inline ?? (code ? state.profiles.get(code) : undefined);
    if (!profile) continue;

    const grams = rec.grams ?? portionGrams(profile);
    const a = amountsFor(profile, grams);
    const slot = byDay.get(day) ?? { amounts: {}, count: 0 };
    for (const [k, v] of Object.entries(a) as [NutrientKey, number][]) {
      slot.amounts[k] = (slot.amounts[k] ?? 0) + v;
    }
    slot.count++;
    byDay.set(day, slot);
  }

  const amountOn = (key: NutrientKey) => (day: string) => byDay.get(day)?.amounts[key] ?? null;

  const series = watched.map((w) => {
    const limit = reference.limits[w.key] ?? 0;
    const points = dailySeries(scans, w.key, limit, days, amountOn(w.key));
    return {
      conditionId: w.id, key: w.key, label: w.label, glyph: w.glyph,
      limit, points, summary: summarize(points),
      weeks: weeklySeries(weeks, limit, amountOn(w.key)),
    };
  });

  /*
    주 막대를 그릴 만한가.

    기록이 있는 주가 둘은 되어야 "요즘 어떤가" 를 말할 수 있다. 한 주뿐이면 그것은
    추세가 아니라 이번 주이고, 그건 위의 하루 막대가 이미 답한다. 빈 칸 열둘을 그려
    놓고 추세라고 부르면 화면이 무엇을 아는지 사용자가 잘못 짐작한다.
  */
  const weeksWorthShowing = Math.max(
    0,
    ...series.map((s2) => s2.weeks.filter((w) => w.average !== null).length),
  );

  return { state: 'ready', span: SPAN, weeksWorthShowing, series };
}
