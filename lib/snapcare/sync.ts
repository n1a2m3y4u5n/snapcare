import type { Member, ScanRecord } from './types.ts';
import type { Reminder } from '@/stores/reminders';
import { isSupported, openBlob, publicKey, sealBlob, sign } from './deviceKey.ts';   // 확장자 필수 — 시험이 --experimental-strip-types 로 돈다
import { activeAccountId, listAccounts, mergeRoster, type Account } from './accounts.ts';
import { isDemo } from './demo.ts';

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
 * v5 — 시연 자료가 실제 자리(`me`)에 저장되던 것을 시연 전용 표(`demo_me`,
 *      `demo_kid`)로 옮겼다. 올리지 않으면 로컬을 아무리 치워도 다음에 받아올 때
 *      서버에 남은 시연 자료가 실제 자리로 되돌아온다.
 */
export const SYNC_VERSION = 5;

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
  /**
   * **시연 전용.** 약통 짝짓기 코드.
   *
   * 이 저장소는 코드를 안 남기기로 했고(`lib/dispenser/paired.ts`), 그 판단은 그대로
   * 옳다 — 열 자리 코드는 의료기기에 일정을 쓰고 트레이를 여는 권한이다.
   *
   * 시연에서는 반대 요구가 선다. 심사장에서 폰이 바뀌고, 그때마다 상자 화면의 코드를
   * 다시 읽게 하면 시연이 끊긴다. 그래서 **시연 모드에서만** 코드를 함께 둔다.
   *
   * 무엇이 이것을 받아들일 만하게 하는가: 시연 블롭은 우리 대회용 상자 하나만
   * 가리키고, 그 안의 사람 자료는 전부 지어낸 것이다. 실제 사용자의 블롭에는 이
   * 칸이 절대 안 들어간다 — 넣는 쪽도 읽는 쪽도 `isDemo()` 안에 있다.
   */
  demoBox?: { claim: string; relayUrl: string };
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
  /*
    시연은 **다른 파일**을 쓴다.

    파일 이름은 공개키에서 유도되므로 기기마다 다르다. 그것이 이 앱의 접근 통제인데,
    시연에서는 정확히 그 성질 때문에 폰을 바꾸면 아무것도 안 보인다. 시연 모드에서는
    모두가 같은 이름 하나(`demo`)를 쓴다.

    범위를 **서명 대상에 넣는다**(`PUT!demo`). 헤더로만 보내면 서명은 그대로 둔 채
    헤더만 바꿔치기할 수 있고, 그러면 남의 실제 요청을 시연 파일 쓰기로 돌려쓸 수
    있다. 잃을 것이 큰 방향은 아니지만, 서명이 지키는 범위에 구멍을 내는 것은 그
    자체로 나쁜 습관이다.
  */
  const scope = isDemo() ? 'demo' : null;
  return {
    'content-type': 'application/json',
    'x-device': await publicKey(),
    'x-ts': String(ts),
    'x-sig': await sign(scope ? `${method}!${scope}` : method, body, ts),
    ...(scope ? { 'x-scope': scope } : {}),
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

/**
 * 올릴 blob 을 만든다 — **내 자리만 갈아 끼우고 나머지 사람은 그대로 둔다.**
 *
 * 이 파일에서 가장 위험한 두 줄이라 따로 꺼내 두었다. 화면은 지금 사람 것밖에
 * 모르는데 서버 파일 하나에 모두가 들어 있어서, `remote` 를 읽지 않고 그대로 올리면
 * **올릴 때마다 나머지 사람이 지워진다.** 그리고 그 실패는 화면에 아무 표시도 내지
 * 않는다 — 지워진 사람이 다음에 앱을 열어야 알고, 그때는 서버에도 없다.
 *
 * 명단은 서버 것이 아니라 **로컬 것**을 올린다. 이 기기가 자기 사람 목록의 주인이고,
 * 서버 것을 되올리면 방금 지운 사람이 다시 붙는다.
 */
export function withPerson(
  seen: SyncBlob | null, roster: Account[], id: string, mine: PersonBlob,
): SyncBlob {
  return {
    version: SYNC_VERSION,
    roster,
    people: { ...(seen?.people ?? {}), [id]: mine },
    // 받아 둔 것을 그대로 되올린다. 사람 몫과 같은 이유다 — 여기서 빠뜨리면 다음에
    // 여는 폰이 상자를 못 찾고, 그 실패는 화면에 아무 표시도 안 낸다.
    ...(seen?.demoBox ? { demoBox: seen.demoBox } : {}),
  };
}

/** 한 사람을 뺀 blob. 나머지는 손대지 않는다. */
export function withoutPerson(seen: SyncBlob | null, roster: Account[], id: string): SyncBlob {
  const people = { ...(seen?.people ?? {}) };
  delete people[id];
  return { version: SYNC_VERSION, roster, people,
           ...(seen?.demoBox ? { demoBox: seen.demoBox } : {}) };
}

/**
 * 시연 블롭이 들고 있는 약통. 마지막으로 받아 온 것에서 읽는다.
 *
 * 따로 받아오지 않는 이유: 이 값을 쓰는 자리(`sync-provider`)는 `pull()` 바로 뒤이고,
 * 한 번 받은 것을 두 번 받을 이유가 없다.
 */
export function demoBox(): { claim: string; relayUrl: string } | null {
  return remote?.demoBox ?? null;
}

/** 시연 블롭에 약통을 적어 둔다. 다음에 여는 폰이 이것으로 스스로 짝짓는다. */
export async function setDemoBox(claim: string, relayUrl: string): Promise<boolean> {
  const seen = remote ?? { version: SYNC_VERSION };
  remote = { ...seen, version: SYNC_VERSION, demoBox: { claim, relayUrl } };
  return pushBlob(remote);
}

/** 지금 사람 몫을 올린다. 나머지 사람은 받아 둔 것을 그대로 되올린다. */
export async function push(mine: PersonBlob): Promise<boolean> {
  return pushBlob(withPerson(remote, listAccounts(), activeAccountId(), mine));
}

/**
 * 지운 사람을 서버에서도 지운다.
 *
 * 이것이 없으면 다음 pull 에서 명단이 되살아난다 — 지웠는데 다시 나타나는 것은
 * 자료가 안 지워진 것보다 나쁘다. 지운 줄 알고 넘어가기 때문이다.
 */
export async function forget(id: string): Promise<void> {
  if (!remote?.people) return;
  remote = withoutPerson(remote, listAccounts(), id);
  await pushBlob(remote);
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
    /*
      시연 블롭은 **안 봉한다.**

      `sealBlob` 은 기기 열쇠로 잠근다. 그것이 실제 자료를 지키는 방식이고 — fly 볼륨에
      침입해도 알레르기·처방을 못 읽는다 — 동시에 다른 폰이 절대 못 여는 이유다.
      시연에서 원하는 것이 정확히 "다른 폰에서 열리는 것"이라, 여기서는 잠그지 않는다.
      잠글 것이 없기도 하다: 시연 자료는 우리가 지어낸 끼니와 약이다.
    */
    const body = isDemo()
      ? JSON.stringify(data)
      : JSON.stringify(await sealBlob(JSON.stringify(data)));
    const res = await fetch('/api/store', {
      method: 'PUT', headers: await signedHeaders('PUT', body), body,
    });
    return res.ok;
  } catch (err) {
    console.warn('[sync] 올리지 못했다 (오프라인이면 정상):', err);
    return false;
  }
}
