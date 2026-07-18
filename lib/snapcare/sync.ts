import type { Member, ScanRecord } from './types';
import type { Reminder } from '@/stores/reminders';

export interface SyncBlob {
  members?: Member[];
  activeMemberId?: string;
  scans?: ScanRecord[];
  reminders?: Reminder[];
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
