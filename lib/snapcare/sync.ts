import type { Member, ScanRecord } from './types';
import type { Reminder } from '@/stores/reminders';

/**
 * 서버 blob 스키마 버전.
 *
 * localStorage 는 zustand persist 의 migrate 가 지켜주지만, 서버에서 받아온 데이터는
 * setState 로 곧장 덮어쓰기 때문에 그 경로를 타지 않는다. 그래서 스키마를 바꾸면
 * 서버에 남아 있던 옛 모양이 조용히 되살아난다 (구버전 알람·유령 구성원 등).
 * 버전이 다르면 서버 데이터를 버리고 로컬로 다시 시드한다.
 *
 * 올릴 때: Member / ScanRecord / Reminder 모양이 바뀌면 +1.
 */
export const SYNC_VERSION = 3;

export interface SyncBlob {
  version?: number;
  /**
   * 쓰는 사람 한 명. 예전 blob 에는 members 배열과 activeMemberId 가 있었는데,
   * 가족 명단을 없애면서 하나로 줄었다. 버전이 올라가 옛 blob 은 isUsable 에서
   * 걸러지므로 여기 옛 필드를 남겨둘 필요가 없다.
   */
  profile?: Member;
  scans?: ScanRecord[];
  reminders?: Reminder[];
}

/** 서버 데이터를 신뢰해도 되는가 (버전 일치 + 최소 형태 검사). */
export function isUsable(blob: SyncBlob | null): blob is SyncBlob {
  if (!blob || blob.version !== SYNC_VERSION) return false;
  if (blob.profile && (!blob.profile.id || !blob.profile.name)) return false;
  if (blob.reminders && blob.reminders.some((r) => !r?.item?.name)) return false;
  return true;
}

/** 서버에서 household 데이터를 가져온다 (없으면 null) */
export async function pullBlob(key: string): Promise<SyncBlob | null> {
  try {
    const res = await fetch(`/api/store?key=${encodeURIComponent(key)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const { data } = (await res.json()) as { data: SyncBlob | null };
    return data;
  } catch {
    return null; // 오프라인 — localStorage 폴백
  }
}

/** 서버에 household 데이터를 저장한다 */
export async function pushBlob(key: string, data: SyncBlob): Promise<boolean> {
  try {
    const res = await fetch('/api/store', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key, data }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
