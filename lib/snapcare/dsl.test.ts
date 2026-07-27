import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dslKey, splitDslLines, cachedPictogramPath } from './dsl.ts';

test('주석과 빈 줄을 걷어내고 줄을 나눈다', () => {
  assert.deepEqual(
    splitDslLines('\\pill_bottle  % 아침\n\n  \\finish_course\n# 주석만 있는 줄'),
    ['\\pill_bottle', '\\finish_course'],
  );
});

test('캐시 키는 8자리 16진수이고 같은 줄에는 같은 값', () => {
  const k = dslKey('\\capsule_strip{\\time_morning}');
  assert.match(k, /^[0-9a-f]{8}$/);
  assert.equal(k, dslKey('\\capsule_strip{\\time_morning}'));
  assert.notEqual(k, dslKey('\\capsule_strip{\\time_evening}'));
});

test('캐시 경로는 키에서 나온다', () => {
  assert.equal(cachedPictogramPath('\\finish_course'),
    `/pictograms/${dslKey('\\finish_course')}.png`);
});

/**
 * 사전 렌더 스크립트(scripts/prewarm-pictograms.mjs)가 같은 키를 만드는지 확인한다.
 * 그 스크립트는 빌드 전에 도는 순수 .mjs 라 이 모듈을 불러올 수 없어 키를 다시
 * 구현했다. 둘이 어긋나면 캐시를 데워도 하나도 적중하지 않는다 — 화면은 멀쩡히
 * 뜨고 느려지기만 하므로 아무도 눈치채지 못하는 종류의 실패다.
 */
test('사전 렌더 스크립트와 캐시 키가 일치한다', async () => {
  const { dslKey: other } = await import('../../scripts/prewarm-pictograms.mjs');
  for (const line of [
    '\\capsule_strip',
    '\\capsule_strip{\\time_morning}',
    '\\no{\\allergen_peanut}',
    '\\finish_course',
    '\\dropper_bottle{\\body_eye}',
  ]) {
    assert.equal(other(line), dslKey(line), line);
  }
});
