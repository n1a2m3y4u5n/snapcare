import type { Member, ScanRecord } from './types';
import type { Reminder } from '@/stores/reminders';
import { isSupported, openBlob, publicKey, sealBlob, sign } from './deviceKey';
import { activeAccountId, listAccounts, mergeRoster, type Account } from './accounts';

/**
 * 서버 blob 스키마 버전.
 *
 * localStorage 는 zustand persist 의 migrate 가 지켜주지만, 서버에서 받아온 데이터는
 * setState 로 곧장 덮어쓰기 때문에 그 경로를 타지 않는다. 그래서 스키마를 바꾸면
 * 서버에 남아 있던 옛 모양이 조용히 되살아난다 (구버전 알람·유령 구성원 등).
 * 버전이 다르면 서버 데이터를 버리고 로컬로 다시 시드한다.
 *
 * 올릴 때: Member / ScanRecord / Reminder 모양이 바뀌면 +1.
 *
 * v4 — 한 폰을 여럿이 쓸 수 있게 되면서 blob 이 사람별로 갈렸다. 서버 파일은 기기
 *      공개키에서 유도하므로 여전히 기기당 하나이고, 그 안이 사람 수만큼 나뉜다.
 */
export const SYNC_VERSION = 4;

/** 한 사람 몫. */
export interface PersonBlob {
  profile?: Member;
  scans?: ScanRecord[];
  reminders?: Reminder[];
}

export interface SyncBlob {
  version?: number;
  /** 이 폰에 누가 있었는지. 저장소만 지워졌을 때 자료를 도로 꺼낼 유일한 단서다. */
  roster?: Account[];
  /** 사람 표 → 그 사람 몫. */
  people?: Record<string, PersonBlob>;
}

/** 서버 데이터를 신뢰해도 되는가 (버전 일치 + 최소 형태 검사). */
export function isUsable(blob: SyncBlob | null): blob is SyncBlob {
  if (!blob || blob.version !== SYNC_VERSION) return false;
  if (blob.people && typeof blob.people !== 'object') return false;
  for (const p of Object.values(blob.people ?? {})) {
    if (p?.profile && (!p.profile.id || !p.profile.name)) return false;
    if (p?.reminders && p.reminders.some((r) => !r?.item?.name)) return false;
  }
  return true;
}

/**
 * 서버가 마지막으로 갖고 있던 것.
 *
 * 왜 들고 있어야 하는가: 이 화면은 **지금 사람** 것밖에 모르는데, 서버 파일 하나에
 * 모두가 들어 있다. 그대로 올리면 올릴 때마다 나머지 사람이 지워진다. 받아 둔 것에
 * 내 자리만 갈아 끼워 올린다.
 */
let remote: SyncBlob | null = null;

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
 * 서버에서 이 기기의 자료를 가져와 **지금 사람 몫**을 돌려준다 (없으면 null).
 *
 * 어느 파일을 줄지는 우리가 고르지 않는다 — 서버가 **공개키에서 유도**한다. 그래서
 * 남의 자료를 달라고 요청할 방법이 없다.
 *
 * 명단도 여기서 되살린다. 브라우저 저장소만 지워지고 기기 열쇠(IndexedDB)는 남는
 * 경우가 있는데, 그때 서버에는 자료가 그대로 있어도 **누가 있었는지**를 모르면 꺼낼
 * 수가 없다. 모르는 사람만 더하므로 지운 사람이 되살아나지는 않는다.
 */
export async function pull(): Promise<PersonBlob | null> {
  const blob = await pullBlob();
  if (!isUsable(blob)) return null;
  remote = blob;
  if (blob.roster?.length) mergeRoster(blob.roster);
  return blob.people?.[activeAccountId()] ?? null;
}

/** 지금 사람 몫을 올린다. 나머지 사람은 받아 둔 것을 그대로 되올린다. */
export async function push(mine: PersonBlob): Promise<boolean> {
  return pushBlob({
    version: SYNC_VERSION,
    roster: listAccounts(),
    people: { ...(remote?.people ?? {}), [activeAccountId()]: mine },
  });
}

/**
 * 지운 사람을 서버에서도 지운다.
 *
 * 이것이 없으면 다음 pull 에서 명단이 되살아난다 — 지웠는데 다시 나타나는 것은
 * 자료가 안 지워진 것보다 나쁘다. 지운 줄 알고 넘어가기 때문이다.
 */
export async function forget(id: string): Promise<void> {
  if (!remote?.people) return;
  const people = { ...remote.people };
  delete people[id];
  remote = { ...remote, people };
  await pushBlob({ version: SYNC_VERSION, roster: listAccounts(), people });
}

/**
 * 서버에서 이 기기의 자료를 통째로 가져온다 (없으면 null).
 */
async function pullBlob(): Promise<SyncBlob | null> {
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
async function pushBlob(data: SyncBlob): Promise<boolean> {
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
