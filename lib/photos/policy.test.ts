import test from 'node:test';
import assert from 'node:assert/strict';

import { fitBox, toEvict, THUMB_MAX, MAX_PHOTOS } from './policy.ts';

// ── 크기 ─────────────────────────────────────────────────────────────────────

test('긴 변을 한도에 맞추고 비율을 지킨다', () => {
  const a = fitBox(4000, 3000);
  assert.equal(a.w, THUMB_MAX);
  assert.equal(a.h, Math.round(THUMB_MAX * 3 / 4));

  const b = fitBox(3000, 4000);   // 세로 사진
  assert.equal(b.h, THUMB_MAX);
  assert.equal(b.w, Math.round(THUMB_MAX * 3 / 4));
});

test('원본이 이미 작으면 늘리지 않는다', () => {
  // 늘려 봐야 흐릿한 큰 그림이고 용량만 는다.
  assert.deepEqual(fitBox(80, 60), { w: 80, h: 60 });
});

test('아주 납작한 사진도 최소 1px 은 남는다', () => {
  const r = fitBox(4000, 3);
  assert.equal(r.w, THUMB_MAX);
  assert.ok(r.h >= 1, '0px 짜리 캔버스는 그릴 수가 없다');
});

test('말이 안 되는 크기에는 0을 준다', () => {
  // 이미지 로딩이 실패하면 naturalWidth 가 0 이다. 그대로 캔버스에 넘기면 던진다.
  assert.deepEqual(fitBox(0, 100), { w: 0, h: 0 });
  assert.deepEqual(fitBox(Number.NaN, 100), { w: 0, h: 0 });
});

// ── 무엇을 버릴 것인가 ───────────────────────────────────────────────────────

const P = (id: string, at: number) => ({ id, at });

test('가리킬 기록이 없는 사진을 먼저 버린다', () => {
  // 기록이 지워졌으면 그 사진은 아무도 못 본다. 나이와 상관없이 먼저 버려야
  // 지워진 기록의 사진이 자리를 차지한 채 최근 사진이 밀려나지 않는다.
  const evict = toEvict([P('a', 3), P('b', 2), P('c', 1)], new Set(['a', 'c']), 10);
  assert.deepEqual(evict, ['b']);
});

test('한도를 넘으면 오래된 것부터 버린다', () => {
  const stored = [P('new', 30), P('mid', 20), P('old', 10)];
  assert.deepEqual(toEvict(stored, new Set(['new', 'mid', 'old']), 2), ['old']);
});

test('한도 안이면 아무것도 안 버린다', () => {
  const stored = [P('a', 2), P('b', 1)];
  assert.deepEqual(toEvict(stored, new Set(['a', 'b']), 200), []);
});

test('기본 한도가 기록 보관 수와 어긋나지 않는다', () => {
  // 기록이 200개·90일에서 잘린다(retention.ts). 사진을 그보다 많이 들고 있어 봐야
  // 가리킬 기록이 없고, 적게 들고 있으면 남은 기록에 그림이 빈다.
  assert.equal(MAX_PHOTOS, 200);
});

test('저장 순서가 뒤죽박죽이어도 오래된 것을 고른다', () => {
  const stored = [P('old', 1), P('new', 9), P('mid', 5)];
  assert.deepEqual(toEvict(stored, new Set(['old', 'new', 'mid']), 1), ['mid', 'old']);
});
