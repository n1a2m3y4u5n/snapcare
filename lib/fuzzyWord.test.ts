import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fuzzyHasWord, fuzzyHasAny, allowedEdits } from './fuzzyWord.ts';

/**
 * 실측 오독을 회귀로 고정한다. 여기 있는 잘못된 철자들은 지어낸 것이 아니라
 * 표본 처방전을 Tesseract 로 읽었을 때 실제로 나온 출력이다.
 */

test('실측 오독을 잡는다', () => {
  // "Morning, noon and evening." → "Moming, noon and evening."
  assert.ok(fuzzyHasWord('+ Moming, noon and evening.', 'morning'));
  // "Caution if breastfeeding." → "Caution if breastizeding."
  assert.ok(fuzzyHasWord('Caution if breastizeding. No alcohol', 'breastfeeding'));
});

test('정상 철자는 당연히 잡는다', () => {
  assert.ok(fuzzyHasWord('Morning, noon and evening', 'morning'));
  assert.ok(fuzzyHasWord('Caution if breastfeeding', 'breastfeeding'));
  assert.ok(fuzzyHasWord('Not for use in pregnancy', 'pregnancy'));
});

test('짧은 낱말은 관용을 주지 않는다 — 다른 낱말이 걸린다', () => {
  // 'noon' 에 편집 1을 주면 soon·moon·noun 이 전부 걸린다.
  assert.equal(allowedEdits('noon'), 0);
  assert.ok(!fuzzyHasWord('coming soon', 'noon'));
  assert.ok(!fuzzyHasWord('the moon is bright', 'noon'));
  assert.ok(fuzzyHasWord('take at noon', 'noon'));
});

test('무관한 낱말은 걸리지 않는다', () => {
  assert.ok(!fuzzyHasWord('evening dose only', 'morning'));
  assert.ok(!fuzzyHasWord('feeding tube', 'breastfeeding'));
  assert.ok(!fuzzyHasWord('pregnancy test not required here', 'breastfeeding'));
});

test('붙어버린 토큰 안에서도 찾는다', () => {
  // "Not for use" → "Notfor use" 처럼 공백이 사라지는 오독이 실제로 있었다.
  assert.ok(fuzzyHasWord('Notfor use in pregnancy', 'pregnancy'));
});

test('fuzzyHasAny 는 하나라도 맞으면 참', () => {
  assert.ok(fuzzyHasAny('Moming and evening', ['morning', 'bedtime']));
  assert.ok(!fuzzyHasAny('afternoon only', ['bedtime', 'breakfast']));
});
