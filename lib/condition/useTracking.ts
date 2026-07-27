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
import { recentDays, dailySeries, summarize, watchedFor, type DayPoint, type TrackingSummary } from './tracking';

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
}

export interface TrackingResult {
  state: 'loading' | 'ready' | 'none';
  span: number;
  series: TrackedSeries[];
}

const SPAN = 7;

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
  if (watched.length === 0) return { state: 'none', span: SPAN, series: [] };
  if (!member || !state) return { state: 'loading', span: SPAN, series: [] };

  const days = recentDays(state.today, SPAN);
  const reference = referenceFor(member);

  // 날짜 → 그날 먹은 것들의 영양소 합
  const byDay = new Map<string, { amounts: Partial<Record<NutrientKey, number>>; count: number }>();
  for (const rec of scans) {
    if (rec.kind !== 'food' && rec.kind !== 'drink') continue;
    const day = dayOf(rec, state.today);
    if (!day || !days.includes(day)) continue;

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

  const series = watched.map((w) => {
    const limit = reference.limits[w.key] ?? 0;
    const points = dailySeries(scans, w.key, limit, days,
      (day) => byDay.get(day)?.amounts[w.key] ?? null);
    return {
      conditionId: w.id, key: w.key, label: w.label, glyph: w.glyph,
      limit, points, summary: summarize(points),
    };
  });

  return { state: 'ready', span: SPAN, series };
}
