'use client';

import { useEffect, useState } from 'react';
import type { Member, ScanRecord } from '@/lib/snapcare/types';
import { getItem } from '@/lib/snapcare/catalog';
import { isToday, todayKey } from '@/stores/scans';
import { referenceFor } from './reference';
import { loadProfiles } from './profileCache';
import { amountsFor, assess, portionGrams, sumAmounts } from './compute';
import type { DailyReference, NutrientAmounts, NutrientAssessment, NutrientProfile } from './types';

export interface DailyIntakeEntry {
  record: ScanRecord;
  amounts: NutrientAmounts;
}

export interface DailyIntakeResult {
  state: 'loading' | 'ready' | 'unavailable';
  entries: DailyIntakeEntry[];
  totals?: NutrientAmounts;
  assessments?: NutrientAssessment[];
  reference?: DailyReference;
}

/**
 * 오늘 하루 섭취 누적 — 한 구성원이 오늘 먹은 것들을 합산해 기준치와 대조한다.
 *
 * 섭취량을 기록에 복사해두지 않고 바코드 + 먹은 양만 남긴 뒤
 * 캐시된 프로필로 매번 다시 계산한다. 제품 데이터가 갱신되면 과거 기록도 같이 정확해지고,
 * 저장소에 같은 수치가 중복되지 않는다.
 */
/**
 * 기록의 바코드. 없으면 itemId 로 카탈로그에서 되찾는다.
 * 기록은 어차피 itemId 를 들고 있으므로 바코드는 파생 가능한 정보다 —
 * 저장 스키마가 바뀌기 전에 쌓인 기록도 이 경로로 살아난다.
 */
function barcodeOf(rec: ScanRecord): string | undefined {
  return rec.barcode ?? getItem(rec.itemId)?.barcode;
}

export function useDailyIntake(scans: ScanRecord[], member: Member | undefined): DailyIntakeResult {
  const [state, setState] = useState<{ today: string; profiles: Map<string, NutrientProfile> } | null>(null);

  // scans 배열은 매 렌더 새 참조일 수 있어, 실제로 조회가 달라지는 경우만 dep으로 쓴다.
  const barcodeKey = scans.map((r) => (r.item?.profile ? 'inline' : barcodeOf(r) ?? '')).join(',');

  useEffect(() => {
    let alive = true;
    const codes = scans.map(barcodeOf).filter((c): c is string => Boolean(c));
    loadProfiles(codes).then((profiles) => {
      // todayKey()는 렌더가 아닌 여기서 읽는다 (SSR 불일치·불순 렌더 회피).
      if (alive) setState({ today: todayKey(), profiles });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barcodeKey]);

  if (!member) return { state: 'unavailable', entries: [] };
  if (!state) return { state: 'loading', entries: [] };

  const entries: DailyIntakeEntry[] = [];
  for (const rec of scans) {
    if (rec.memberId !== member.id) continue;
    if (rec.kind !== 'food' && rec.kind !== 'drink') continue;
    if (!isToday(rec, state.today)) continue;

    // 기록에 프로필이 들어 있으면(성분표 OCR·사진 판별) 조회 없이 그대로 쓴다.
    // 이게 없으면 바코드가 있는 포장식품만 누적되고, 정작 대상 지역에서 더 흔한
    // 라벨 촬영·조리 음식은 하루 합계에서 통째로 빠진다.
    const inline = rec.item?.profile;
    const code = barcodeOf(rec);
    const profile = inline ?? (code ? state.profiles.get(code) : undefined);
    if (!profile) continue;

    // 먹은 양이 기록에 없으면(구버전 기록) 제품의 1회 제공량으로 본다.
    const grams = rec.grams ?? portionGrams(profile);
    entries.push({ record: { ...rec, grams }, amounts: amountsFor(profile, grams) });
  }

  const reference = referenceFor(member);
  const totals = sumAmounts(entries.map((e) => e.amounts));

  return {
    state: 'ready',
    entries,
    totals,
    reference,
    assessments: assess(totals, reference),
  };
}
