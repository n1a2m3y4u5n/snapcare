import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';

import { verifySigned, householdFor, isDeviceId, MAX_AGE_MS } from './auth.ts';

/** 폰이 하는 일을 그대로 흉내낸다 — 시험이 진짜 경로를 지나야 의미가 있다. */
async function signer() {
  const pair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'],
  );
  const raw = Buffer.from(await webcrypto.subtle.exportKey('raw', pair.publicKey));
  const device = raw.toString('base64');

  const sign = async (method: string, body: string, ts: number) => {
    const digest = createHash('sha256').update(body).digest().toString('base64');
    const sig = Buffer.from(await webcrypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey,
      Buffer.from(`${ts}.${method}.${digest}`, 'utf8'),
    )).toString('base64');
    return { device, sig, ts: String(ts) };
  };
  return { device, sign };
}

const NOW = 1_800_000_000_000;

test('제대로 서명한 요청은 통과하고 가구 이름을 준다', async () => {
  const { device, sign } = await signer();
  const body = JSON.stringify({ scans: [] });
  const id = await verifySigned(await sign('PUT', body, NOW), 'PUT', body, NOW);
  assert.equal(id, householdFor(device));
  assert.match(id!, /^[A-Za-z0-9_-]{32}$/);
});

test('서명이 없으면 거절한다', async () => {
  assert.equal(await verifySigned({ device: null, sig: null, ts: null }, 'GET', '', NOW), null);
});

test('본문을 바꾸면 서명이 안 맞는다', async () => {
  // 서명 대상에 본문 해시가 들어가는 이유. 없으면 서명만 떼어 다른 내용에 붙일 수 있다.
  const { sign } = await signer();
  const headers = await sign('PUT', '{"scans":[]}', NOW);
  assert.equal(await verifySigned(headers, 'PUT', '{"scans":["몰래 넣은 것"]}', NOW), null);
});

test('메서드를 바꾸면 서명이 안 맞는다', async () => {
  // GET 용 서명을 주워서 PUT 에 쓰면 남의 자료를 덮어쓸 수 있다.
  const { sign } = await signer();
  const headers = await sign('GET', '', NOW);
  assert.equal(await verifySigned(headers, 'PUT', '', NOW), null);
});

test('오래된 서명은 거절한다', async () => {
  const { sign } = await signer();
  const headers = await sign('GET', '', NOW);
  assert.ok(await verifySigned(headers, 'GET', '', NOW + MAX_AGE_MS - 1000));
  assert.equal(await verifySigned(headers, 'GET', '', NOW + MAX_AGE_MS + 1000), null);
});

test('미래에서 온 서명도 거절한다', async () => {
  // 시계를 앞으로 돌려 서명해 두면 만료 검사를 우회할 수 있다. 양쪽을 다 본다.
  const { sign } = await signer();
  const headers = await sign('GET', '', NOW + MAX_AGE_MS + 1000);
  assert.equal(await verifySigned(headers, 'GET', '', NOW), null);
});

test('남의 서명으로는 내 가구가 안 나온다', async () => {
  const a = await signer();
  const b = await signer();
  const headers = await a.sign('GET', '', NOW);
  // 서명은 a 것인데 공개키만 b 것으로 바꿔치기
  const forged = { ...headers, device: b.device };
  assert.equal(await verifySigned(forged, 'GET', '', NOW), null);
});

test('공개키가 쓰레기면 던지지 않고 거절한다', async () => {
  const { sign } = await signer();
  const headers = await sign('GET', '', NOW);
  for (const device of ['', 'not-base64!!', Buffer.alloc(10).toString('base64')]) {
    assert.equal(await verifySigned({ ...headers, device }, 'GET', '', NOW), null);
  }
});

test('가구 이름은 공개키에서만 나오고 늘 같다', async () => {
  const { device } = await signer();
  assert.equal(householdFor(device), householdFor(device));
  const other = await signer();
  assert.notEqual(householdFor(device), householdFor(other.device));
});

test('기기 id 는 경로가 될 수 있는 것을 거른다', () => {
  // 이 값은 요청 본문에서 온다. 그대로 파일 이름에 붙이면 경로가 된다.
  assert.ok(isDeviceId('kmPLb2W8Zx1NEc1bdYQgXw'));
  for (const bad of ['../../etc/passwd', 'a/b', '..', '', 'short', 'x'.repeat(65), 'has space', null, 42]) {
    assert.equal(isDeviceId(bad), false, `${String(bad)} 를 통과시켰다`);
  }
});
