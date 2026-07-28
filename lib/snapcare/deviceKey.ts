/**
 * 이 기기의 신원. 꺼낼 수 없는 열쇠 한 쌍으로 만든다.
 *
 * 무엇이 문제였나
 * ---------------
 * 지금은 `h_01075a74...` 같은 무작위 문자열을 localStorage 에 두고, 서버는 그 값을
 * 그대로 믿는다. 두 가지가 나쁘다:
 *
 *   - 그 값이 **주소창(URL 쿼리)에 실려** 다닌다. 서버 기록·프록시 기록에 열쇠가
 *     그대로 남는다. 열쇠를 방명록에 적어두는 셈이다.
 *   - 값을 한 번 본 사람은 그대로 흉내 낼 수 있다. 아이디를 비밀번호로 쓰는 것과 같다.
 *
 * 어떻게 바꾸는가
 * ---------------
 * 문자열 대신 **열쇠 한 쌍**을 만든다. 개인키는 `extractable: false` 로 만들어
 * IndexedDB 에 두는데, 이렇게 하면 **우리 코드조차 값을 읽을 수 없다.** 브라우저에게
 * "이걸로 서명해줘" 라고 시킬 수만 있다.
 *
 * 그래서 저장소를 통째로 훔쳐봐도 가져갈 것이 없다. 관찰해서 흉내 낼 수 있는 값이
 * 아니라, 가지고 있어야만 쓸 수 있는 것이 된다.
 *
 * 가구 ID 는 **공개키에서 유도한다.** 등록 단계가 없어지고, 남의 파일을 요구하려면
 * 그 사람의 개인키가 있어야 하는데 그것은 그 기기 밖으로 나갈 수 없다.
 *
 * 패스키와 무엇이 다른가
 * ----------------------
 * 패스키는 운영체제 금고를 쓰므로 브라우저 기록을 지워도 살아남고 폰을 바꿔도
 * 따라온다. 대신 화면 잠금이 걸린 최신 기기여야 하고, 열 때마다 지문 확인이 뜬다.
 *
 * 이쪽은 그 둘 다 안 된다 — 기록을 지우면 같이 사라지고 폰을 바꾸면 새로 만들어진다.
 * 대신 **모든 브라우저에서 되고 사용자가 하는 일이 없다.** 우리가 필요한 것은
 * "서버가 이 기기를 확인하는 것" 이지 "기기를 옮겨 다니는 것" 이 아니므로 이쪽이 맞다.
 */

const DB = 'snapcare';
const STORE = 'device';
const ID = 'signing-key';

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return idb().then((db) => new Promise<T>((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

const ALG = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const;

let cached: CryptoKeyPair | null = null;

/** 이 기기의 열쇠 한 쌍. 없으면 만든다. 개인키는 만들어진 뒤로 값을 읽을 수 없다. */
export async function keyPair(): Promise<CryptoKeyPair> {
  if (cached) return cached;
  const found = await tx<CryptoKeyPair | undefined>('readonly', (s) => s.get(ID));
  if (found?.privateKey) {
    cached = found;
    return found;
  }
  // extractable: false — 이 한 글자가 요점이다. true 면 저장소를 읽은 사람이 열쇠를
  // 그대로 가져가고, 그러면 지금 문자열을 쓰는 것과 다를 바가 없다.
  const pair = await crypto.subtle.generateKey(ALG, false, ['sign', 'verify']);
  await tx('readwrite', (s) => s.put(pair, ID));
  cached = pair;
  return pair;
}

function b64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

/** 서버에 보낼 공개키 (base64 raw). 이 값이 곧 신원이므로 숨길 필요가 없다. */
export async function publicKey(): Promise<string> {
  const { publicKey: pub } = await keyPair();
  return b64(await crypto.subtle.exportKey('raw', pub));
}

/**
 * 서명. 무엇에 서명하는지가 중요하다.
 *
 * 시각을 포함하는 이유: 서명 하나를 가로챈 사람이 나중에 다시 써먹지 못하게 하려면
 * 그 서명이 언제 것인지가 서명 안에 들어 있어야 한다. 서버가 오래된 것을 거절한다.
 *
 * 본문 해시를 포함하는 이유: 서명만 가져다 **다른 내용**에 붙이지 못하게.
 */
export async function sign(method: string, body: string, ts: number): Promise<string> {
  const { privateKey } = await keyPair();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  const payload = `${ts}.${method}.${b64(digest)}`;
  return b64(await crypto.subtle.sign(SIGN, privateKey, new TextEncoder().encode(payload)));
}

/** 이 기기가 쓸 수 있는가. 안 되면 부르는 쪽이 동기화를 건너뛴다. */
export function isSupported(): boolean {
  return typeof indexedDB !== 'undefined'
    && typeof crypto !== 'undefined'
    && typeof crypto.subtle !== 'undefined';
}

/* ── 자료 암호화 ────────────────────────────────────────────────────────────
 *
 * 서버(fly 볼륨)에 자료가 평문으로 있었다. 디스크 자체는 암호화돼 있지만 그 열쇠는
 * fly 가 들고 있어서, 막아 주는 것은 디스크를 물리적으로 훔쳐가는 경우뿐이다.
 * 우리도, fly 도, 서버에 침입한 사람도 그냥 읽는다.
 *
 * 그래서 올리기 전에 기기에서 잠근다. 여는 열쇠는 신원 열쇠와 같은 방식으로
 * **꺼낼 수 없게** 만들어 이 기기에만 둔다 — 우리 코드조차 값을 읽을 수 없다.
 *
 * 열쇠를 잃으면 서버의 암호문을 못 여는데, 그때는 신원 열쇠도 같이 사라져서 어차피
 * 그 파일에 접근할 수 없다. 잃는 것이 없다.
 */

const DATA_ID = 'data-key';
/** 암호문 앞에 붙는 표시. 예전에 올라간 평문과 구별하기 위한 것. */
const ENVELOPE = 'scb1:';

let cachedData: CryptoKey | null = null;

async function dataKey(): Promise<CryptoKey> {
  if (cachedData) return cachedData;
  const found = await tx<CryptoKey | undefined>('readonly', (s) => s.get(DATA_ID));
  if (found) {
    cachedData = found;
    return found;
  }
  const k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false,
    ['encrypt', 'decrypt']);
  await tx('readwrite', (s) => s.put(k, DATA_ID));
  cachedData = k;
  return k;
}

/** 올리기 전에 잠근다. 매번 새 IV 를 쓰고 앞에 붙인다. */
export async function sealBlob(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await dataKey(),
    new TextEncoder().encode(plain));
  const out = new Uint8Array(iv.length + body.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(body), iv.length);
  return ENVELOPE + btoa(String.fromCharCode(...out));
}

/**
 * 받아서 연다.
 *
 * 표시가 없으면 **예전에 평문으로 올라간 것**이다. 그대로 돌려주고, 다음에 올릴 때
 * 암호문이 된다 — 켜는 순간 기존 사용자의 자료가 사라지면 안 된다.
 *
 * 표시가 있는데 열리지 않으면 그것은 진짜 실패다(열쇠가 다르거나 변조됐다).
 * 이때 억지로 돌려주면 쓰레기를 자료로 넘기게 되므로 null 을 준다.
 */
export async function openBlob(stored: string): Promise<string | null> {
  if (!stored.startsWith(ENVELOPE)) return stored;
  try {
    const raw = Uint8Array.from(atob(stored.slice(ENVELOPE.length)), (c) => c.charCodeAt(0));
    const body = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) },
      await dataKey(), raw.slice(12));
    return new TextDecoder().decode(body);
  } catch {
    return null;
  }
}
