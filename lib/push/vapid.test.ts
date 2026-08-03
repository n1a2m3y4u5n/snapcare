import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify, createPrivateKey, createSign } from 'node:crypto';

import { derToJose, audienceFor, keysFrom, authorizationFor } from './vapid.ts';
import { sendPush, sendToAll, type PushSubscriptionJSON } from './send.ts';

function newKeys() {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return keysFrom(privateKey.export({ type: 'pkcs8', format: 'pem' }) as string);
}

test('공개키는 비압축 P-256 점 65바이트다', () => {
  const { publicKey } = newKeys();
  const raw = Buffer.from(publicKey, 'base64url');
  assert.equal(raw.length, 65);
  assert.equal(raw[0], 0x04);
});

test('개인키 하나에서 공개키가 늘 같게 나온다', () => {
  // 두 값을 따로 저장하면 어긋날 수 있고, 어긋나면 구독은 성공하는데 발송만 401 로
  // 조용히 실패한다. 유도로 묶어 두는 이유다.
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  assert.equal(keysFrom(pem).publicKey, keysFrom(pem).publicKey);
});

test('DER 서명을 r‖s 64바이트로 바꾼다', () => {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  for (let i = 0; i < 200; i++) {
    const s = createSign('SHA256');
    s.update(`시도 ${i}`);
    assert.equal(derToJose(s.sign(privateKey)).length, 64);
  }
});

test('부호용 0x00 이 붙은 DER 도 32바이트로 맞춘다', () => {
  // r 의 최상위 비트가 1이면 DER 이 앞에 0x00 을 붙여 33바이트가 된다. 그대로 자르면
  // 값이 통째로 밀려서 서명이 깨진다. 200번 돌리는 위의 시험이 확률로 이 경우를
  // 밟지만, 여기서는 그 모양을 직접 만들어 확실히 짚는다.
  const r = Buffer.concat([Buffer.from([0x00]), Buffer.alloc(32, 0xff)]);  // 33바이트
  const s = Buffer.alloc(32, 0x11);
  const der = Buffer.concat([
    Buffer.from([0x30, 2 + r.length + 2 + s.length]),
    Buffer.from([0x02, r.length]), r,
    Buffer.from([0x02, s.length]), s,
  ]);
  const jose = derToJose(der);
  assert.equal(jose.length, 64);
  assert.deepEqual(jose.subarray(0, 32), Buffer.alloc(32, 0xff));
  assert.deepEqual(jose.subarray(32), s);
});

test('짧은 INTEGER 는 왼쪽을 0으로 채운다', () => {
  const r = Buffer.alloc(30, 0xab);   // 앞자리가 0이라 DER 이 짧게 낸 경우
  const s = Buffer.alloc(32, 0x22);
  const der = Buffer.concat([
    Buffer.from([0x30, 2 + r.length + 2 + s.length]),
    Buffer.from([0x02, r.length]), r,
    Buffer.from([0x02, s.length]), s,
  ]);
  const jose = derToJose(der);
  assert.equal(jose.length, 64);
  assert.deepEqual(jose.subarray(0, 2), Buffer.alloc(2, 0x00));
  assert.deepEqual(jose.subarray(2, 32), r);
});

test('푸시 서비스가 실제로 검증할 수 있는 서명을 만든다', () => {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  const keys = keysFrom(pem);

  const header = authorizationFor('https://fcm.googleapis.com/fcm/send/abc', keys, 1_800_000_000_000);
  const jwt = header.match(/t=([^,]+)/)![1];
  const [h, c, sig] = jwt.split('.');

  const v = createVerify('SHA256');
  v.update(`${h}.${c}`);
  assert.ok(
    v.verify({ key: createPrivateKey(pem), dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url')),
    '우리 서명을 우리 키로도 검증 못 하면 푸시 서비스는 더더욱 못 한다',
  );

  const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
  assert.equal(claims.aud, 'https://fcm.googleapis.com', '대상은 출처만, 경로는 빼야 한다');
  assert.equal(claims.exp, 1_800_000_000 + 12 * 60 * 60);
  assert.ok(claims.sub.startsWith('https://') || claims.sub.startsWith('mailto:'));
});

test('PEM 과 한 줄 base64 가 같은 키로 읽힌다', () => {
  // fly secrets import 는 NAME=VALUE 를 줄 단위로 읽어서 여러 줄인 PEM 을 못 넣는다.
  // 한 줄 모양을 받는 것은 편의가 아니라 값을 안 보고 넣기 위해서다 — 여러 줄이
  // 안 되면 개인키를 파일로 떨구거나 화면에 찍어 손으로 옮기게 된다.
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  const line = (privateKey.export({ type: 'pkcs8', format: 'der' }) as Buffer).toString('base64');

  assert.equal(keysFrom(line).publicKey, keysFrom(pem).publicKey);
  // 줄바꿈이나 공백이 붙어 와도 같아야 한다. 비밀을 옮기다 보면 붙는다.
  assert.equal(keysFrom(`  ${line}\n`).publicKey, keysFrom(pem).publicKey);
});

test('키가 쓰레기면 던진다', () => {
  // 조용히 넘어가면 배포는 성공하고 알림만 안 온다. 시작할 때 터지는 편이 낫다.
  assert.throws(() => keysFrom('여기 키 없음'));
});

test('대상은 구독 주소의 출처만 남긴다', () => {
  assert.equal(audienceFor('https://fcm.googleapis.com/fcm/send/x?y=1'), 'https://fcm.googleapis.com');
  assert.equal(audienceFor('https://updates.push.services.mozilla.com/wpush/v2/z'),
    'https://updates.push.services.mozilla.com');
});

// ── 보내기 ────────────────────────────────────────────────────────────────

const SUB = (n: string): PushSubscriptionJSON => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${n}` });

function stubFetch(reply: (url: string) => number) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, headers: (init?.headers ?? {}) as Record<string, string> });
    const status = reply(u);
    return { ok: status >= 200 && status < 300, status } as Response;
  }) as unknown as typeof fetch;
  return { calls, f };
}

test('본문을 싣지 않는다', async () => {
  // 이 시험이 이 기능의 사생활 약속이다. 약 이름이 구글을 지나가면 안 된다.
  const { calls, f } = stubFetch(() => 201);
  await sendPush(SUB('a'), newKeys(), { fetcher: f });
  assert.equal(calls[0].headers['Content-Length'], '0');
  assert.ok(calls[0].headers.Authorization.startsWith('vapid t='));
});

test('410 과 404 는 죽은 구독이라 지운다', async () => {
  for (const status of [404, 410]) {
    const { f } = stubFetch(() => status);
    assert.deepEqual(await sendPush(SUB('a'), newKeys(), { fetcher: f }), { state: 'gone', status });
  }
});

test('일시적 실패로는 구독을 지우지 않는다', async () => {
  // 망이 나쁜 것과 구독이 죽은 것은 다르다. 전자로 지우면 사용자는 아무것도 안
  // 했는데 알림이 영영 끊기고, 그 사실을 알 방법도 없다.
  const { f } = stubFetch(() => 503);
  const out = await sendToAll([SUB('a'), SUB('b')], newKeys(), { fetcher: f });
  assert.equal(out.sent, 0);
  assert.equal(out.kept.length, 2);
  assert.deepEqual(out.dropped, []);
});

test('망이 아예 끊겨도 던지지 않는다', async () => {
  const f = (async () => { throw new Error('끊김'); }) as unknown as typeof fetch;
  assert.deepEqual(await sendPush(SUB('a'), newKeys(), { fetcher: f }), { state: 'failed', status: 0 });
});

test('여러 기기 중 죽은 것만 골라낸다', async () => {
  const { f } = stubFetch((u) => (u.endsWith('/dead') ? 410 : 201));
  const out = await sendToAll([SUB('phone'), SUB('dead'), SUB('tablet')], newKeys(), { fetcher: f });
  assert.equal(out.sent, 2);
  assert.deepEqual(out.kept.map((s) => s.endpoint.split('/').pop()), ['phone', 'tablet']);
  assert.deepEqual(out.dropped.map((e) => e.split('/').pop()), ['dead']);
});

test('TTL 이 짧다', async () => {
  // 09시에 받았어야 할 알림이 14시에 도착하면 사람은 지금 먹을 약이라고 읽는다.
  // 늦은 알림은 없는 알림보다 나쁘다.
  const { calls, f } = stubFetch(() => 201);
  await sendPush(SUB('a'), newKeys(), { fetcher: f });
  assert.ok(Number(calls[0].headers.TTL) <= 3600, `TTL 이 ${calls[0].headers.TTL} 초나 된다`);
});
