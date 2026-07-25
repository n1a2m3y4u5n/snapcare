'use client';

import { useEffect, useState } from 'react';
import type { ItemFlag, Member } from '@/lib/snapcare/types';
import { referenceFor } from './reference';
import { loadProfile } from './profileCache';
import { amountsFor, assess, deriveFlags, portionGrams, summarize } from './compute';
import type { DailyReference, NutrientAmounts, NutrientAssessment, NutrientProfile } from './types';

export interface NutritionResult {
  state: 'loading' | 'ready' | 'unavailable';
  profile?: NutrientProfile;
  reference?: DailyReference;
  grams?: number;
  amounts?: NutrientAmounts;
  assessments?: NutrientAssessment[];
  flags?: ItemFlag[];
  summary?: string | null;
  /** 캐시에서 왔는지 — 오프라인 동작을 화면에 드러내기 위해 보관 */
  servedFrom?: string;
}

/**
 * 바코드 + 구성원 → 그 사람 기준으로 계산된 영양 판정.
 *
 * 프로필(외부 데이터)만 비동기고, 기준 산출·환산·판정은 전부 동기 순수 함수라
 * 구성원을 바꾸면 네트워크 없이 즉시 다시 계산된다.
 */
export function useNutrition(
  source: { barcode?: string; profile?: NutrientProfile } | undefined,
  member: Member | undefined,
): NutritionResult {
  const barcode = source?.profile ? undefined : source?.barcode;
  const inline = source?.profile;
  // 어떤 바코드의 결과인지 함께 들고 있으면, 바코드가 바뀔 때 상태를 되돌릴 필요가 없다.
  const [loaded, setLoaded] = useState<{
    barcode: string;
    res: { profile: NutrientProfile; servedFrom: string } | null;
  } | null>(null);

  useEffect(() => {
    if (!barcode) return;
    let alive = true;
    loadProfile(barcode).then((res) => {
      if (alive) setLoaded({ barcode, res });
    });
    return () => {
      alive = false;
    };
  }, [barcode]);

  if (!member) return { state: 'unavailable' };

  let profile: NutrientProfile;
  let servedFrom: string;
  if (inline) {
    // 성분표 OCR·사진 판별로 이미 프로필이 있으면 네트워크를 타지 않는다
    profile = inline;
    servedFrom = inline.source;
  } else {
    if (!barcode) return { state: 'unavailable' };
    if (!loaded || loaded.barcode !== barcode) return { state: 'loading' };
    if (loaded.res === null) return { state: 'unavailable' };
    profile = loaded.res.profile;
    servedFrom = loaded.res.servedFrom;
  }
  const reference = referenceFor(member);
  const grams = portionGrams(profile);
  const amounts = amountsFor(profile, grams);
  const assessments = assess(amounts, reference);

  return {
    state: 'ready',
    profile,
    reference,
    grams,
    amounts,
    assessments,
    flags: deriveFlags(profile, amounts, reference),
    summary: summarize(assessments),
    servedFrom,
  };
}
