/**
 * 패스키에서 열쇠를 뽑아 기기 안의 건강 정보를 암호화한다.
 *
 * 무엇을 고치는가
 * ---------------
 * 지금 알레르기·조건·처방 이력이 localStorage 에 **평문으로** 있다. 폰을 잃거나
 * 빌려주면 그대로 읽힌다. 오프라인 우선 mHealth 문헌이 반복해서 지적하는 자리이기도
 * 하다 — 기기에 두는 것 자체는 옳지만, 두려면 암호화하라는 것.
 *
 * 왜 비밀번호가 아니라 패스키인가
 * -------------------------------
 * 이 앱은 글을 못 읽는 사람을 위한 것이다. 비밀번호도, 이메일도 쓸 수 없다.
 * 그래서 그림 4개를 순서대로 누르는 픽처키를 썼는데, 경우의 수가 20,736 이라
 * 잠금으로는 몰라도 암호 열쇠로는 쓸 수 없다.
 *
 * 패스키는 사용자가 **폰을 쳐다보거나 센서를 만지는 것**이 전부다. 누를 것도 외울
 * 것도 없어서 픽처키보다 오히려 적다. 그리고 열쇠가 운영체제 금고에 살기 때문에
 * 브라우저 데이터를 지워도, 사파리가 저장소를 비워도 살아남는다.
 *
 * PRF 확장이 핵심이다: 같은 패스키에 같은 소금을 넣으면 **항상 같은 32바이트**가
 * 나온다. 그 값은 디스크 어디에도 저장되지 않고 인증할 때마다 보안 하드웨어에서
 * 다시 만들어진다. 우리는 그것으로 AES-GCM 열쇠를 만든다.
 *
 * 안 되는 기기가 있다
 * -------------------
 * 화면 잠금을 안 걸어둔 폰은 패스키를 만들 수 없고, PRF 를 지원하지 않는 조합도
 * 있다. 우리 대상 사용자에게 가장 흔할 실패 지점이라, 그때는 암호화 없이 지금처럼
 * 동작한다. 보호 수준이 낮아지는 것이지 앱이 안 켜지는 것이 아니다 — 읽지 못하는
 * 사람 앞에서 "지원하지 않는 기기입니다" 는 아무 뜻도 없는 화면이다.
 */

/** PRF 에 넣는 소금. 고정값이어야 매번 같은 열쇠가 나온다. */
const SALT = new TextEncoder().encode('snapcare/vault/v1');

/** 이 기기에서 패스키를 만든 적이 있는지. 자료가 아니라 표시라 평문으로 둔다. */
const ENROLLED_KEY = 'snapcare-vault-enrolled';

export type VaultState =
  | { kind: 'unsupported' }        // 이 브라우저·기기로는 안 된다
  | { kind: 'none' }               // 쓸 수 있는데 아직 안 만들었다
  | { kind: 'locked' }             // 만들었고, 열어야 한다
  | { kind: 'open'; key: CryptoKey };

/**
 * 이 기기에서 쓸 수 있는가.
 *
 * 두 가지를 본다: WebAuthn 이 있는가, 그리고 **기기 자체에 붙은 인증기**(얼굴·지문·
 * 화면잠금)가 있는가. 두 번째가 없으면 보안키를 꽂으라는 뜻이 되는데, 그건 우리
 * 사용자에게 존재하지 않는 선택지다.
 */
export async function isSupported(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function isEnrolled(): boolean {
  return typeof localStorage !== 'undefined' && localStorage.getItem(ENROLLED_KEY) === '1';
}

async function keyFrom(bytes: ArrayBuffer): Promise<CryptoKey> {
  // PRF 출력을 그대로 열쇠로 쓰지 않고 한 번 더 유도한다. 같은 패스키를 다른
  // 용도로도 쓰게 될 때 서로 다른 열쇠가 나오도록 하기 위해서다.
  const base = await crypto.subtle.importKey('raw', bytes, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: SALT, info: new TextEncoder().encode('aes-gcm') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function prfOutput(cred: PublicKeyCredential): ArrayBuffer | null {
  const ext = cred.getClientExtensionResults() as {
    prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } };
  };
  return ext.prf?.results?.first ?? null;
}

/**
 * 패스키를 만든다. 사용자는 폰을 보거나 센서를 만지는 것이 전부다.
 *
 * 검색 가능한 자격증명(residentKey)으로 만드는 이유: 그래야 나중에 열 때 우리가
 * 자격증명 ID 를 들고 있지 않아도 된다. 그 ID 를 localStorage 에 넣어두면 브라우저
 * 데이터를 지우는 순간 열 방법이 사라진다 — 자료를 지키려고 만든 것이 자료와 같이
 * 사라지는 셈이다.
 */
export async function enroll(): Promise<CryptoKey | null> {
  if (!(await isSupported())) return null;
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));
  try {
    await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'SnapCare' },
        user: { id: userId, name: 'SnapCare', displayName: 'SnapCare' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          residentKey: 'required',
          userVerification: 'required',
        },
        timeout: 60_000,
        extensions: { prf: {} },
      } as PublicKeyCredentialCreationOptions,
    });
  } catch {
    return null;   // 사용자가 취소했거나 기기가 거절했다
  }
  localStorage.setItem(ENROLLED_KEY, '1');
  // 만들자마자 한 번 열어 PRF 값을 받는다. 생성 응답에서 바로 주는 인증기도 있지만
  // 그렇지 않은 쪽이 더 많아서, 열어서 받는 경로 하나만 쓴다.
  return unlock();
}

/** 패스키로 열쇠를 얻는다. 취소하거나 PRF 를 못 쓰면 null. */
export async function unlock(): Promise<CryptoKey | null> {
  if (!(await isSupported())) return null;
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  try {
    const cred = (await navigator.credentials.get({
      publicKey: {
        challenge,
        // allowCredentials 를 비워 두면 기기가 자기가 가진 패스키를 보여준다.
        userVerification: 'required',
        timeout: 60_000,
        extensions: { prf: { eval: { first: SALT } } },
      } as PublicKeyCredentialRequestOptions,
    })) as PublicKeyCredential | null;
    if (!cred) return null;
    const out = prfOutput(cred);
    if (!out) return null;   // 패스키는 있는데 PRF 를 지원하지 않는 조합
    return await keyFrom(out);
  } catch {
    return null;
  }
}

/** 암호화. 매번 새 IV 를 쓰고 결과 앞에 붙인다. */
export async function seal(key: CryptoKey, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
  const out = new Uint8Array(iv.length + body.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(body), iv.length);
  return btoa(String.fromCharCode(...out));
}

/** 복호화. 열쇠가 다르거나 내용이 변조됐으면 null (AES-GCM 이 잡아낸다). */
export async function open(key: CryptoKey, sealed: string): Promise<string | null> {
  try {
    const raw = Uint8Array.from(atob(sealed), (c) => c.charCodeAt(0));
    const body = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: raw.slice(0, 12) }, key, raw.slice(12));
    return new TextDecoder().decode(body);
  } catch {
    return null;
  }
}
