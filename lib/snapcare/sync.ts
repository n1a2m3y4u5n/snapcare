import type { Member, ScanRecord } from './types';
import type { Reminder } from '@/stores/reminders';
import { isSupported, openBlob, publicKey, sealBlob, sign } from './deviceKey';

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

/**
 * 서명을 붙인 요청 머리말.
 *
 * 열쇠를 주소창에 싣지 않는 것이 요점이다. 예전에는 `?key=...` 였고, 그러면 건강
 * 정보에 접근하는 열쇠가 서버·프록시 기록에 그대로 쌓인다.
 */
async function signedHeaders(method: string, body: string): Promise<HeadersInit> {
  const ts = Date.now();
  return {
    'content-type': 'application/json',
    'x-device': await publicKey(),
    'x-ts': String(ts),
    'x-sig': await sign(method, body, ts),
  };
}

/**
 * 서버에서 이 기기의 자료를 가져온다 (없으면 null).
 *
 * 어느 파일을 줄지는 우리가 고르지 않는다 — 서버가 **공개키에서 유도**한다. 그래서
 * 남의 자료를 달라고 요청할 방법이 없다.
 */
export async function pullBlob(): Promise<SyncBlob | null> {
  if (!isSupported()) return null;
  try {
    const res = await fetch('/api/store', {
      cache: 'no-store', headers: await signedHeaders('GET', ''),
    });
    if (!res.ok) return null;
    const { data } = (await res.json()) as { data: unknown };
    if (data === null || data === undefined) return null;
    // 암호화를 켜기 전에 올라간 것은 **객체**로 저장돼 있다. 그대로 읽어 쓰고, 다음
    // 저장에서 암호문이 되게 한다 — 켜는 순간 기존 사용자의 자료가 사라지면 안 된다.
    if (typeof data !== 'string') return data as SyncBlob;
    const plain = await openBlob(data);
    return plain === null ? null : (JSON.parse(plain) as SyncBlob);
  } catch (err) {
    // 오프라인이면 정상이다. 그렇지 않은데 계속 실패하면 동기화가 아예 안 되고
    // 있다는 뜻인데, 조용하면 그것을 알 방법이 없다.
    console.warn('[sync] 받아오지 못했다 (오프라인이면 정상):', err);
    return null;
  }
}

/** 서버에 이 기기의 자료를 저장한다 */
export async function pushBlob(data: SyncBlob): Promise<boolean> {
  if (!isSupported()) return false;
  try {
    // 올리기 전에 기기에서 잠근다. 서버는 열 수 없는 덩어리만 받는다 — fly 볼륨에
    // 침입해도, 우리가 ssh 로 들어가도 알레르기·처방 기록을 읽을 수 없다.
    const body = JSON.stringify(await sealBlob(JSON.stringify(data)));
    const res = await fetch('/api/store', {
      method: 'PUT', headers: await signedHeaders('PUT', body), body,
    });
    return res.ok;
  } catch (err) {
    console.warn('[sync] 올리지 못했다 (오프라인이면 정상):', err);
    return false;
  }
}
