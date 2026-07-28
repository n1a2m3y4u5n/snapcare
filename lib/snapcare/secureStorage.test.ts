import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secureStorage, useKey, sealExisting } from './secureStorage.ts';
import { seal } from './vault.ts';

/** 브라우저가 아니므로 localStorage 를 흉내 낸다. */
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

async function aKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

test('열쇠가 없으면 평문으로 읽고 쓴다 — 잠금을 못 만드는 기기에서도 앱은 돌아야 한다', async () => {
  store.clear();
  useKey(null);
  await secureStorage.setItem('a', '{"v":1}');
  assert.equal(store.get('a'), '{"v":1}');
  assert.equal(await secureStorage.getItem('a'), '{"v":1}');
});

test('예전 평문 저장분은 열쇠가 생겨도 그대로 읽힌다 — 켜는 순간 자료가 사라지면 안 된다', async () => {
  store.clear();
  store.set('old', '{"legacy":true}');
  useKey(await aKey());
  assert.equal(await secureStorage.getItem('old'), '{"legacy":true}');
});

test('열쇠가 있으면 암호화해 저장하고, 저장된 것은 원문이 아니다', async () => {
  store.clear();
  useKey(await aKey());
  await secureStorage.setItem('b', '{"secret":"peanut allergy"}');
  const raw = store.get('b')!;
  assert.ok(raw.startsWith('scv1:'));
  assert.ok(!raw.includes('peanut'));
  assert.equal(await secureStorage.getItem('b'), '{"secret":"peanut allergy"}');
});

test('암호문인데 열쇠가 없으면 없는 것으로 본다 — 암호문을 자료로 넘기면 파싱이 터진다', async () => {
  store.clear();
  useKey(await aKey());
  await secureStorage.setItem('c', '{"v":1}');
  useKey(null);
  assert.equal(await secureStorage.getItem('c'), null);
});

test('다른 열쇠로는 열리지 않는다', async () => {
  store.clear();
  const k1 = await aKey();
  useKey(k1);
  await secureStorage.setItem('d', '{"v":1}');
  useKey(await aKey());
  assert.equal(await secureStorage.getItem('d'), null);
});

test('잠금을 만든 뒤 옛 평문 저장분을 암호문으로 옮긴다', async () => {
  store.clear();
  store.set('p1', '{"a":1}');
  store.set('p2', '{"b":2}');
  const k = await aKey();
  store.set('p3', 'scv1:' + (await seal(k, '{"c":3}')));   // 이미 옮겨진 것은 건드리지 않는다
  useKey(k);

  assert.equal(await sealExisting(['p1', 'p2', 'p3', 'none']), 2);
  assert.ok(store.get('p1')!.startsWith('scv1:'));
  assert.equal(await secureStorage.getItem('p1'), '{"a":1}');
  assert.equal(await secureStorage.getItem('p3'), '{"c":3}');
});
