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

/**
 * 조회 순서: 정적 파일 → API.
 *
 * `/api/nutrition` 은 서버에서 `public/nutrition/<바코드>.json` 을 먼저 읽고, 없을 때만
 * OpenFoodFacts 로 나간다. 그래서 **이미 받아 둔 제품도 인터넷이 없으면 못 봤다** —
 * 파일은 기기가 받을 수 있는 자리에 있는데, 그것을 꺼내 주는 유일한 창구가 서버였다.
 * 서비스워커가 `/api/` 를 일부러 안 잡으니(오래된 판정을 주느니 실패하는 편이 낫다)
 * 오프라인에서는 그 창구가 통째로 닫힌다.
 *
 * 그래서 정적 파일을 먼저 직접 부른다. 서비스워커가 `/nutrition/` 을 캐시 우선으로
 * 다루므로 한 번 본 제품은 그다음부터 망 없이 뜨고, 없는 바코드는 404 로 떨어져
 * 예전과 같은 API 경로를 탄다. (그 규칙은 지금까지 아무도 그 주소를 부르지 않아
 * 죽어 있었다.)
 */
export function loadProfile(barcode: string): Promise<LoadedProfile | null> {
  let p = cache.get(barcode);
  if (!p) {
    p = fromStatic(barcode).then((hit) => hit ?? fromApi(barcode));
    cache.set(barcode, p);
  }
  return p;
}

/** 바코드 모양을 확인한다 — 기록에서 온 값이 그대로 주소가 된다. */
function looksLikeBarcode(barcode: string): boolean {
  return /^\d{6,14}$/.test(barcode);
}

async function fromStatic(barcode: string): Promise<LoadedProfile | null> {
  if (!looksLikeBarcode(barcode)) return null;
  try {
    const res = await fetch(`/nutrition/${barcode}.json`);
    if (!res.ok) return null;
    const profile = (await res.json()) as NutrientProfile;
    // 404 가 HTML 로 오거나 파일이 깨졌을 때 그것을 프로필로 삼지 않는다.
    if (!profile || typeof profile !== 'object' || !profile.per100) return null;
    return { profile, servedFrom: 'cache' };
  } catch {
    return null;
  }
}

function fromApi(barcode: string): Promise<LoadedProfile | null> {
  return fetch(`/api/nutrition?barcode=${encodeURIComponent(barcode)}`)
    .then((r) => (r.ok ? (r.json() as Promise<LoadedProfile>) : null))
    .catch(() => null);
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
