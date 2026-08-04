'use client';

import { DispenserClient } from './relay.ts';
import { deriveKeys } from './derive.ts';
import { normaliseClaim } from './claim.ts';

/**
 * 짝지은 디스펜서를 기기 안에 기억한다 — **페어링 코드는 남기지 않고.**
 *
 * 왜 코드를 안 남기는가
 * ---------------------
 * 열 자리 코드는 의료기기에 일정을 쓰고 트레이를 여는 권한이다. dh 의 통합 문서가
 * 그 결정을 우리에게 넘기면서 이렇게 적었다 — 릴레이의 실험 페이지는 그것을
 * localStorage 에 두는데, "노트북에서 돌리는 디버깅 도구에는 맞고 프로덕션 앱에는
 * 아마 아닐 것"이고, `deviceKey.ts` 의 ECDSA 열쇠와 달리 **우리 출처에서 스크립트를
 * 돌릴 수 있는 무엇이든 읽어 갈 수 있다.**
 *
 * 그래서 코드는 한 번만 쓰고 버린다. 남기는 것은 파생 결과이고, 그중 상자 열쇠는
 * `extractable: false` 인 CryptoKey 그대로 IndexedDB 에 들어간다 — 구조화 복제는
 * 그 성질을 지키므로 저장소를 통째로 읽어도 값이 나오지 않는다. deviceKey.ts 가
 * 개인키에 쓰는 것과 같은 자세다.
 *
 * 기기 id 와 접근 토큰은 주소와 헤더라 문자열로 남을 수밖에 없다. 그 둘을 가져간
 * 쪽은 사서함에 쓰레기를 넣을 수 있지만 봉투를 만들 수는 없고, 기기는 열지 못한
 * 것을 무시한다. 읽는 쪽도 마찬가지다 — 암호문만 보인다.
 */

const DB = 'snapcare-dispenser';
const STORE = 'paired';
const KEY = 'device';

export interface PairedDevice {
  relayUrl: string;
  deviceId: string;
  accessToken: string;
  boxKey: CryptoKey;
  /** 언제 짝지었나 — 화면에 "언제부터 쓰고 있는지" 를 보여줄 때. */
  pairedAt: string;
}

export function isSupported(): boolean {
  return typeof indexedDB !== 'undefined' && typeof crypto !== 'undefined' && !!crypto.subtle;
}

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then((handle) => new Promise<T>((resolve, reject) => {
    const request = run(handle.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}

/**
 * 코드로 한 번 짝짓는다. 성공하면 코드는 이 함수 밖으로 나가지 않는다.
 *
 * 짧은 코드는 여기서 막는다. 한 글자가 빠진 코드는 **없는 사서함의 완벽하게 유효한
 * 열쇠**를 만들어 내고, 증상은 "기기가 전원이 뽑힌 것처럼 보인다" 하나뿐이다 —
 * 어느 쪽에서도 오류가 나지 않는다. 사람이 아직 코드를 보고 있을 때 거절해야 한다.
 */
export async function pairWith(claim: string, relayUrl: string): Promise<PairedDevice> {
  if (!normaliseClaim(claim)) throw new Error('열 자리 코드가 아니다');
  const keys = await deriveKeys(claim);
  const paired: PairedDevice = {
    relayUrl: relayUrl.replace(/\/+$/, ''),
    deviceId: keys.deviceId,
    accessToken: keys.accessToken,
    boxKey: keys.boxKey,
    pairedAt: new Date().toISOString(),
  };
  await tx('readwrite', (s) => s.put(paired, KEY));

  /*
    상자에게 "네 주인이 생겼다" 를 알린다.

    **여기 있는 이유**: 짝을 맺는 자리가 셋이다 — 카메라, 설정의 코드 입력, 그리고
    QR 이 여는 /pair. 세 곳에서 각자 부르게 하면 한 곳이 빠지고, 그 한 곳으로 짝을
    맺은 사람만 상자가 계속 QR 을 띄운다. 그건 원인을 짐작할 수 없는 종류의 버그다.

    **기다리지 않는다**: 짝은 이미 이 기기에 저장됐고 화면은 넘어가야 한다. 이 한마디는
    상자 화면을 바꾸는 것이 전부라, 망이 느리다고 사람을 세워 둘 이유가 없다. 실패해도
    잃는 것은 없다 — 처방이나 명령이 오면 상자는 어차피 같은 결론에 이른다.
  */
  void clientFor(paired).hello().catch((err) => {
    console.warn('[dispenser] 상자에게 인사를 못 보냈다 (짝짓기는 됐다):', err);
  });

  return paired;
}

/** 기억해 둔 짝. 없으면 null. */
export async function loadPaired(): Promise<PairedDevice | null> {
  if (!isSupported()) return null;
  try {
    return (await tx<PairedDevice | undefined>('readonly', (s) => s.get(KEY))) ?? null;
  } catch {
    return null;
  }
}

/** 짝을 잊는다. 다시 쓰려면 코드를 다시 읽어야 한다. */
export async function forgetPaired(): Promise<void> {
  if (!isSupported()) return;

  /*
    상자에게 먼저 말하고 나서 잊는다. 순서가 바뀌면 말할 수단이 없어진다 — 봉투는
    상자 열쇠로 봉하는데, 그 열쇠가 지금 지우려는 것이다.

    **기다린다.** `hello` 와 반대다. 저쪽은 화면이 이미 넘어가는 중이라 사람을 세워
    둘 이유가 없었지만, 이쪽은 이 한마디가 실패하면 상자가 **아무도 가지지 않은 채
    짝짓기 코드를 영영 안 띄우는** 상태로 남는다. 다음 사람이 그 앞에서 할 수 있는
    일이 없어지므로, 몇백 밀리초는 치를 값이다.

    실패해도 짝은 푼다. 망이 없는 자리에서 폰을 정리하지 못하게 막는 것은 더 나쁘고,
    상자는 다음 `hello` 로 어차피 주인이 바뀐다.
  */
  try {
    const paired = await loadPaired();
    if (paired) await clientFor(paired).goodbye();
  } catch (err) {
    console.warn('[dispenser] 상자에게 작별을 못 보냈다 (짝은 푼다):', err);
  }

  try {
    await tx('readwrite', (s) => s.delete(KEY));
  } catch {
    /* 지울 것이 없으면 그것으로 됐다 */
  }
}

/** 기억해 둔 짝으로 붙는다. */
export function clientFor(paired: PairedDevice): DispenserClient {
  return DispenserClient.fromKeys({
    relayUrl: paired.relayUrl,
    keys: { deviceId: paired.deviceId, accessToken: paired.accessToken, boxKey: paired.boxKey },
  });
}
