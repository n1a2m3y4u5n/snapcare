import { createSign, createPublicKey, createPrivateKey, type KeyObject } from 'node:crypto';

/**
 * Web Push 를 보내기 위한 VAPID 서명.
 *
 * 왜 라이브러리를 안 쓰는가
 * ------------------------
 * `web-push` 패키지가 하는 일의 대부분은 **본문 암호화**(RFC 8291)다. 우리는 본문을
 * 안 싣는다. 무엇을 먹는 약인지는 이 앱이 밖으로 내보내지 않기로 한 것이고, 푸시
 * 서비스는 구글이거나 애플이거나 모질라다. 본문이 없으면 암호화할 것도 없고, 남는
 * 것은 VAPID 서명 하나인데 그건 ES256 JWT 라 node:crypto 가 이미 한다.
 *
 * 그래서 이 파일은 의존성을 늘리지 않는다. 릴레이가 표준 라이브러리만 쓰는 것과
 * 같은 이유다 — 2년 뒤에 이 프로젝트를 물려받는 사람이 설치할 것이 하나라도 적어야 한다.
 *
 * 내용 없는 푸시로 무엇을 하나
 * ---------------------------
 * 서비스워커가 push 이벤트를 받으면 "약이 준비됐습니다" 를 띄우고, 누르면 앱이 열린다.
 * 무슨 약인지는 앱이 열린 뒤 릴레이에서 직접 받아 온다. 폰이 그 봉투를 열 수 있는
 * 유일한 곳이므로, 이게 원래 정보가 흐르던 길 그대로다.
 */

/**
 * 푸시 서비스가 우리를 알아보는 이름. 우리 쪽에 문제가 생겼을 때 찾아올 자리다.
 *
 * 명세는 `mailto:` 와 `https:` 를 둘 다 받는다. 주소를 쓴다 — 이 프로젝트에는 아직
 * 담당 메일함이 없고, 없는 메일 주소를 적어 두면 구글이 우리에게 연락할 방법이
 * **있다고 잘못 알리는** 셈이 된다. 배포 주소는 실재하고, 그 페이지에 팀이 적혀 있다.
 * 팀 메일함이 생기면 SNAPCARE_VAPID_SUBJECT 로 덮어쓰면 된다.
 */
const SUBJECT = process.env.SNAPCARE_VAPID_SUBJECT || 'https://snapcare.fly.dev';

/** 서명의 유효 시간. 명세 상한은 24시간이고, 짧을수록 새어 나간 서명의 값이 작다. */
const TTL_SECONDS = 12 * 60 * 60;

function b64url(buf: Buffer | Uint8Array): string {
  return Buffer.from(buf).toString('base64url');
}

/**
 * ECDSA 서명은 DER(SEQUENCE of two INTEGERs)로 나오는데 JWS 는 r‖s 64바이트를 원한다.
 *
 * 길이를 그냥 자르거나 채우면 안 된다. DER 의 INTEGER 는 부호가 있어서 최상위 비트가
 * 1이면 앞에 0x00 이 하나 붙고(33바이트), 반대로 앞자리가 0이면 짧아진다(31바이트 이하).
 * 32바이트 오른쪽 정렬로 다시 맞춘다. 이 처리를 빼면 **256번에 한 번쯤** 서명이
 * 거절되는데, 그 빈도의 실패는 "가끔 알림이 안 온다" 로만 보여서 원인을 못 찾는다.
 */
export function derToJose(der: Buffer): Buffer {
  if (der[0] !== 0x30) throw new Error('DER 서명이 아니다');
  let i = 2;
  // 전체 길이가 0x80 이상이면 길이 바이트가 하나 더 붙는다
  if (der[1] & 0x80) i += der[1] & 0x7f;

  const read = (): Buffer => {
    if (der[i] !== 0x02) throw new Error('DER INTEGER 가 아니다');
    const len = der[i + 1];
    const start = i + 2;
    i = start + len;
    let v = der.subarray(start, start + len);
    // 부호용 0x00 을 떼고, 32바이트에 오른쪽 정렬한다
    while (v.length > 32 && v[0] === 0x00) v = v.subarray(1);
    if (v.length > 32) throw new Error('INTEGER 가 32바이트를 넘는다');
    const out = Buffer.alloc(32);
    v.copy(out, 32 - v.length);
    return out;
  };

  return Buffer.concat([read(), read()]);
}

/** 구독 주소에서 푸시 서비스의 출처만 남긴다. 서명은 서비스 단위로 만든다. */
export function audienceFor(endpoint: string): string {
  return new URL(endpoint).origin;
}

export interface VapidKeys {
  /** base64url 로 인코딩한 비압축 P-256 공개점(65바이트, 0x04 로 시작) */
  publicKey: string;
  privateKey: KeyObject;
}

/**
 * 개인키를 읽어 공개키까지 뽑는다.
 *
 * 공개키를 따로 저장하지 않는 이유: 두 값을 따로 두면 어긋날 수 있고, 어긋나면
 * 구독은 성공하는데 발송만 401 로 조용히 실패한다. 하나에서 유도하면 그럴 일이 없다.
 *
 * 두 가지 모양을 받는다:
 *
 *  - PKCS#8 **PEM** — 로컬에서 `.env` 에 넣기 편한 모양
 *  - PKCS#8 **DER 을 base64 한 한 줄** — `fly secrets import` 가 `NAME=VALUE` 를
 *    줄 단위로 읽어서, 여러 줄인 PEM 을 그대로는 못 넣는다
 *
 * 한 줄 모양을 받는 것은 편의가 아니라 **값을 안 보고 넣기 위해서**다. 여러 줄이
 * 안 되면 개인키를 파일로 떨구거나 화면에 찍어 손으로 옮기게 되는데, 둘 다 지워지지
 * 않는 자리에 개인키를 남긴다.
 */
export function keysFrom(secret: string): VapidKeys {
  const trimmed = secret.trim();
  const privateKey = trimmed.includes('BEGIN')
    ? createPrivateKey(trimmed)
    : createPrivateKey({ key: Buffer.from(trimmed, 'base64'), format: 'der', type: 'pkcs8' });
  const jwk = createPublicKey(privateKey).export({ format: 'jwk' }) as { x: string; y: string };
  const point = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(jwk.x, 'base64url'),
    Buffer.from(jwk.y, 'base64url'),
  ]);
  return { publicKey: b64url(point), privateKey };
}

/**
 * 이 푸시 서비스에 보낼 Authorization 헤더 한 줄.
 *
 * `now` 를 받는 이유는 시험 때문이다. 만료 시각이 들어가는 값이라 고정하지 않으면
 * 결과를 단언할 수가 없다.
 */
export function authorizationFor(
  endpoint: string,
  keys: VapidKeys,
  now: number = Date.now(),
): string {
  const header = b64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(Buffer.from(JSON.stringify({
    aud: audienceFor(endpoint),
    exp: Math.floor(now / 1000) + TTL_SECONDS,
    sub: SUBJECT,
  })));

  const signer = createSign('SHA256');
  signer.update(`${header}.${claims}`);
  const signature = b64url(derToJose(signer.sign(keys.privateKey)));

  return `vapid t=${header}.${claims}.${signature}, k=${keys.publicKey}`;
}
