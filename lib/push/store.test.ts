import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  readSubscribers, writeSubscribers, withSubscription, isSubscription, fileFor,
} from './store.ts';
import type { PushSubscriptionJSON } from './send.ts';

const SUB = (n: string): PushSubscriptionJSON => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/${n}`,
  keys: { p256dh: 'p', auth: 'a' },
});

async function dir() {
  return mkdtemp(join(tmpdir(), 'snapcare-push-'));
}

test('없는 약통은 빈 목록으로 읽힌다', async () => {
  assert.deepEqual((await readSubscribers(await dir(), 'nobody')).subscriptions, []);
});

test('쓴 것을 그대로 읽는다', async () => {
  const d = await dir();
  await writeSubscribers(d, 'dev1', [SUB('a'), SUB('b')], '2026-08-03T00:00:00Z');
  const got = await readSubscribers(d, 'dev1');
  assert.equal(got.subscriptions.length, 2);
  assert.equal(got.updatedAt, '2026-08-03T00:00:00Z');
});

test('약통이 다르면 섞이지 않는다', async () => {
  const d = await dir();
  await writeSubscribers(d, 'dev1', [SUB('a')], 'x');
  await writeSubscribers(d, 'dev2', [SUB('b')], 'x');
  assert.equal((await readSubscribers(d, 'dev1')).subscriptions[0].endpoint, SUB('a').endpoint);
  assert.equal((await readSubscribers(d, 'dev2')).subscriptions[0].endpoint, SUB('b').endpoint);
});

test('깨진 파일은 "구독 없음" 으로 읽는다', async () => {
  const d = await dir();
  await writeSubscribers(d, 'dev1', [SUB('a')], 'x');
  const { writeFile } = await import('node:fs/promises');
  await writeFile(fileFor(d, 'dev1'), '{"subscriptions": [잘린', 'utf-8');
  assert.deepEqual((await readSubscribers(d, 'dev1')).subscriptions, []);
});

test('저장에 약 이름이 섞여 들어가지 않는다', async () => {
  // 이 파일이 새어도 새는 것은 "이 약통에 폰 몇 대가 붙어 있다" 까지여야 한다.
  const d = await dir();
  await writeSubscribers(d, 'dev1', [SUB('a')], 'x');
  const raw = await readFile(fileFor(d, 'dev1'), 'utf-8');
  assert.deepEqual(Object.keys(JSON.parse(raw)).sort(), ['subscriptions', 'updatedAt']);
});

test('같은 주소를 두 번 담지 않는다', () => {
  // 브라우저는 앱을 열 때마다 같은 구독을 그대로 돌려준다. 그냥 밀어 넣으면
  // 목록이 방문 횟수만큼 늘고 알림도 그만큼 겹친다.
  let list = [SUB('a')];
  list = withSubscription(list, SUB('a'));
  list = withSubscription(list, SUB('a'));
  assert.equal(list.length, 1);
});

test('새 기기는 더한다', () => {
  const list = withSubscription([SUB('phone')], SUB('tablet'));
  assert.deepEqual(list.map((s) => s.endpoint.split('/').pop()), ['phone', 'tablet']);
});

test('같은 주소로 다시 오면 새 것으로 갈아끼운다', () => {
  // 열쇠는 브라우저가 갱신할 수 있다. 옛 열쇠를 들고 있으면 발송이 조용히 실패한다.
  const old = { ...SUB('a'), keys: { p256dh: '옛것', auth: '옛것' } };
  const fresh = { ...SUB('a'), keys: { p256dh: '새것', auth: '새것' } };
  const list = withSubscription([old], fresh);
  assert.equal(list.length, 1);
  assert.equal(list[0].keys?.p256dh, '새것');
});

test('구독처럼 안 생긴 것은 거른다', () => {
  for (const bad of [null, 42, {}, { endpoint: 5 }, { endpoint: 'not a url' },
                     { endpoint: 'http://fcm.googleapis.com/x' },
                     { endpoint: 'https://x.com/' + 'y'.repeat(3000) }]) {
    assert.equal(isSubscription(bad), false, `${JSON.stringify(bad)?.slice(0, 40)} 를 통과시켰다`);
  }
});

test('우리 사설망을 두드리게 시킬 수 없다', () => {
  // 서명을 가진 사람이 우리 서버에게 아무 주소나 두드리게 시키는 길(SSRF).
  // fly.io 에서는 <앱이름>.internal 이 곧 사설망이고 릴레이가 거기 있다.
  for (const host of ['snapcare-relay.internal', 'localhost', 'app.localhost',
                      'printer.local', '127.0.0.1', '169.254.169.254', '10.0.0.1',
                      'metadata']) {
    assert.equal(isSubscription({ endpoint: `https://${host}/push` }), false,
      `${host} 를 통과시켰다`);
  }
});

test('실제 푸시 서비스는 전부 통과한다', () => {
  for (const e of [
    'https://fcm.googleapis.com/fcm/send/abc123',
    'https://updates.push.services.mozilla.com/wpush/v2/gAAAA',
    'https://wns2-par02p.notify.windows.com/w/?token=xyz',
    'https://web.push.apple.com/QF1r0-abc',
  ]) {
    assert.ok(isSubscription({ endpoint: e }), `${e} 를 막았다`);
  }
});
