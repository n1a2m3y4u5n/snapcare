import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REASK_AFTER } from '../../stores/suggestions.ts';

/**
 * "아니라고 했으면 언제 다시 물어도 되는가" 의 규칙.
 *
 * 화면(zustand 스토어)이 아니라 규칙 자체를 고정한다. 영원히 안 묻는 것과 매번 묻는
 * 것 사이의 선인데, 어느 쪽으로 밀려도 조용히 나빠진다 — 앞은 새 근거를 놓치고,
 * 뒤는 성가셔서 아무거나 눌러 치우게 만든다.
 */
function shouldAsk(dismissedAt: number | undefined, now: number): boolean {
  return dismissedAt === undefined || now >= dismissedAt + REASK_AFTER;
}

test('물린 적 없으면 묻는다', () => {
  assert.equal(shouldAsk(undefined, 3), true);
});

test('물린 뒤 근거가 그대로면 다시 묻지 않는다', () => {
  // 홈에 들어올 때마다 같은 것을 다시 물으면, 사용자는 읽지 않고 누르기 시작한다.
  assert.equal(shouldAsk(4, 4), false);
  assert.equal(shouldAsk(4, 5), false);
});

test('근거가 눈에 띄게 늘면 다시 묻는다', () => {
  // 아니라고 한 판단은 존중하되, 그 판단이 딛고 선 근거가 달라졌으면 얘기가 다르다.
  assert.equal(shouldAsk(4, 4 + REASK_AFTER), true);
  assert.equal(shouldAsk(4, 10), true);
});

test('다시 물을 문턱이 한두 건은 아니다', () => {
  // 1 이면 한 끼니마다 다시 묻는 것과 다르지 않다.
  assert.ok(REASK_AFTER >= 3, `REASK_AFTER=${REASK_AFTER} 은 너무 낮다`);
});
