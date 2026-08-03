import { createHash, webcrypto } from 'node:crypto';

/**
 * 서버 저장소의 인증. 기기가 꺼낼 수 없는 개인키로 서명해 보낸 요청인지 확인한다.
 *
 * 이 함수 하나가 저장된 건강 정보 전부의 문지기다. `app/api/store/route.ts` 안에
 * 들어 있었고 시험이 하나도 없었다 — route.ts 는 next/server 를 불러서 앱의 시험
 * 러너로 열리지 않고, 그래서 "열 수 없으니 안 쟀다" 가 "안 재도 되는 것" 처럼
 * 굳어 있었다. 밖으로 꺼내면 열린다. 푸시 구독도 같은 문을 쓴다.
 *
 * 서명 대상에 시각과 본문 해시가 함께 들어간다. 시각이 없으면 가로챈 서명을 나중에
 * 다시 쓸 수 있고, 본문 해시가 없으면 서명만 떼어 다른 내용에 붙일 수 있다.
 */

/** 서명이 이보다 오래됐으면 거절한다. */
export const MAX_AGE_MS = 5 * 60 * 1000;

/**
 * 공개키 → 가구 이름. 이 유도가 곧 접근 통제다.
 *
 * 등록 절차가 없는 이유이기도 하다. 남의 파일을 요구하려면 그 사람의 개인키가
 * 있어야 하는데, 그것은 그 기기 밖으로 나올 수 없다.
 */
export function householdFor(publicKeyB64: string): string {
  const h = createHash('sha256').update(Buffer.from(publicKeyB64, 'base64')).digest();
  return h.toString('base64url').slice(0, 32);
}

export interface SignedHeaders {
  /** base64 공개키 (raw P-256 점) */
  device: string | null;
  /** base64 ECDSA 서명 */
  sig: string | null;
  /** 서명한 시각 (ms) */
  ts: string | null;
}

/**
 * 통과하면 가구 이름, 아니면 null.
 *
 * `now` 를 받는 것은 시험 때문이다. 시각이 들어가는 검사는 고정하지 않으면
 * 단언할 수가 없고, 단언할 수 없는 검사는 결국 안 재게 된다.
 */
export async function verifySigned(
  headers: SignedHeaders,
  method: string,
  body: string,
  now: number = Date.now(),
): Promise<string | null> {
  const { device: pub, sig } = headers;
  const ts = Number(headers.ts);
  if (!pub || !sig || !Number.isFinite(ts)) return null;
  if (Math.abs(now - ts) > MAX_AGE_MS) return null;

  try {
    const key = await webcrypto.subtle.importKey(
      'raw', Buffer.from(pub, 'base64'),
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'],
    );
    const digest = createHash('sha256').update(body).digest().toString('base64');
    const payload = `${ts}.${method}.${digest}`;
    const ok = await webcrypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' }, key,
      Buffer.from(sig, 'base64'), Buffer.from(payload, 'utf8'),
    );
    return ok ? householdFor(pub) : null;
  } catch {
    return null;   // 공개키 형식이 틀렸거나 서명이 깨졌다
  }
}

/**
 * 약통 기기 id 를 파일 이름으로 쓸 수 있는지 본다.
 *
 * id 는 청구 코드의 HKDF 라 base64url 22자다. 그런데 이 값은 **요청 본문에서**
 * 오므로 그 모양이라고 믿을 수 없다. `../../etc/passwd` 가 오면 그대로 경로가 된다.
 * 정규식으로 좁히는 편이 경로를 정규화해 검사하는 것보다 낫다 — 틀릴 여지가 적다.
 */
export function isDeviceId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(value);
}
