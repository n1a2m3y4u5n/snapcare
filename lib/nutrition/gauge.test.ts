import test from 'node:test';
import assert from 'node:assert/strict';

import { gaugeOf, gaugeSentence } from './gauge.ts';

test('절반이면 절반이 찬다', () => {
  assert.deepEqual(gaugeOf(50, 'limit'), { filled: 5, segments: 10, over: 0 });
  assert.deepEqual(gaugeOf(30, 'target'), { filled: 3, segments: 10, over: 0 });
});

test('먹었으면 적어도 한 칸은 찬다', () => {
  // 0칸은 "안 먹었다" 로 읽히고, 실제로 안 먹은 날과 구별되지 않는다.
  assert.equal(gaugeOf(2, 'limit').filled, 1);
  assert.equal(gaugeOf(0.4, 'limit').filled, 1);
  assert.equal(gaugeOf(0, 'limit').filled, 0, '진짜 안 먹었으면 0칸이다');
});

test('100% 미만은 꽉 차지 않는다', () => {
  // 96% 를 열 칸으로 그리면 "다 됐다" 로 읽힌다. 목표 영양소에서 그것은 아직
  // 모자란 사람에게 다 먹었다고 말하는 것이다.
  assert.equal(gaugeOf(96, 'target').filled, 9);
  assert.equal(gaugeOf(99.9, 'target').filled, 9);
  assert.equal(gaugeOf(100, 'target').filled, 10);
});

test('한도를 넘으면 넘친 칸이 따로 센다', () => {
  assert.deepEqual(gaugeOf(130, 'limit'), { filled: 10, segments: 10, over: 3 });
  assert.equal(gaugeOf(105, 'limit').over, 1, '조금만 넘어도 한 칸은 보인다');
});

test('넘친 칸은 다섯에서 멈춘다', () => {
  // 300% 를 그대로 그리면 화면이 넘친 칸으로 뒤덮인다. 그 이상은 "많이 넘었다"
  // 하나로 족하다.
  assert.equal(gaugeOf(300, 'limit').over, 5);
  assert.equal(gaugeOf(1000, 'limit').over, 5);
});

test('목표 영양소는 많이 먹어도 넘친 칸이 없다', () => {
  // 단백질을 많이 먹은 것은 경고할 일이 아니다.
  assert.equal(gaugeOf(180, 'target').over, 0);
  assert.equal(gaugeOf(180, 'target').filled, 10);
});

test('칸 수를 바꿀 수 있다', () => {
  assert.deepEqual(gaugeOf(60, 'limit', 5), { filled: 3, segments: 5, over: 0 });
});

test('셀 수 없는 값은 그리지 않는다', () => {
  // NaN·Infinity 는 계산이 깨졌다는 뜻이다. 그것을 "꽉 찼다" 로 그리면 아직
  // 모자란 사람에게 다 먹었다고 말하게 되고, 그 말은 깨진 계산에서 나왔다는
  // 표시가 화면 어디에도 없다. 0칸이 낫다 — 적어도 무언가 이상하다고 보인다.
  assert.equal(gaugeOf(Number.NaN, 'limit').filled, 0);
  assert.equal(gaugeOf(Infinity, 'limit').filled, 0);
  assert.equal(gaugeOf(-10, 'limit').filled, 0, '음수도 마찬가지다');
});

test('말이 화면과 같은 것을 가리킨다', () => {
  // 백분율로 말하면 듣고 나서 화면을 봐도 대응이 안 된다. 칸으로 말한다.
  assert.match(gaugeSentence(gaugeOf(60, 'limit'), 'Sugar', 'limit'), /6 of 10/);
  assert.ok(!gaugeSentence(gaugeOf(60, 'limit'), 'Sugar', 'limit').includes('%'));
});

test('모자란 목표는 더 먹으라고 말한다', () => {
  assert.match(gaugeSentence(gaugeOf(40, 'target'), 'Protein', 'target'), /Try to have more/);
});

test('채운 목표는 채웠다고 말한다', () => {
  assert.match(gaugeSentence(gaugeOf(100, 'target'), 'Protein', 'target'), /had enough/);
});

test('넘긴 한도는 넘겼다고 말한다', () => {
  assert.match(gaugeSentence(gaugeOf(140, 'limit'), 'Salt', 'limit'), /over by/);
});

test('아직 안 먹었으면 없다고 말한다', () => {
  assert.match(gaugeSentence(gaugeOf(0, 'limit'), 'Salt', 'limit'), /none yet/);
});
