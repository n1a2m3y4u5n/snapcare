'use client';

import type { NutrientProfile } from './types';

/**
 * 바코드 → 영양 프로필 클라이언트 캐시.
 *
 * 프로필은 사람과 무관하므로 바코드 1개당 한 번만 받는다.
 * 한 화면에서 여러 기록의 프로필이 동시에 필요할 때(하루 누적 분석) 중복 요청을 막는 것이 목적.
 */

export interface LoadedProfile {
  profile: NutrientProfile;
  servedFrom: string;
}

const cache = new Map<string, Promise<LoadedProfile | null>>();

export function loadProfile(barcode: string): Promise<LoadedProfile | null> {
  let p = cache.get(barcode);
  if (!p) {
    p = fetch(`/api/nutrition?barcode=${encodeURIComponent(barcode)}`)
      .then((r) => (r.ok ? (r.json() as Promise<LoadedProfile>) : null))
      .catch(() => null);
    cache.set(barcode, p);
  }
  return p;
}

/** 여러 바코드를 한 번에. 실패한 것은 결과 맵에서 빠진다. */
export async function loadProfiles(barcodes: string[]): Promise<Map<string, NutrientProfile>> {
  const unique = [...new Set(barcodes)];
  const loaded = await Promise.all(unique.map(loadProfile));

  const out = new Map<string, NutrientProfile>();
  unique.forEach((code, i) => {
    const res = loaded[i];
    if (res) out.set(code, res.profile);
  });
  return out;
}
