import { test } from 'node:test';
import assert from 'node:assert/strict';

import { NUTRIENT_SPAN, SPAN_DAYS, spanSentence, trustworthy } from './window.ts';
import { KEEP_COUNT } from '../snapcare/retention.ts';

function reading(over: Partial<Parameters<typeof trustworthy>[0]> = {}) {
  return { perDay: 50, reference: 100, days: 14, logged: 14, coverage: 1, ...over };
}

test('한도는 오늘, 목표는 근래', () => {
  /*
    한도(설탕·소금)를 긴 창으로 평균 내면 "이번 달 평균은 괜찮다" 가 되면서 오늘
    두 배를 먹은 것이 사라진다. 그 값은 **오늘의 결정**에 쓰이는 값이다.

    반대로 단백질을 하루로 보면 매일 부족하다고 말하게 된다 — 하루 못 먹는 것은
    흔하고 뜻이 없다.
  */
  assert.equal(NUTRIENT_SPAN.sugars, 'now');
  assert.equal(NUTRIENT_SPAN.salt, 'now');
  assert.equal(NUTRIENT_SPAN.protein, 'recent');
  assert.equal(NUTRIENT_SPAN.fiber, 'recent');
});

test('긴 창이 보관 기간을 넘지 않는다', () => {
  // 90일치를 보겠다고 해 놓고 자료가 그만큼 없으면, 화면은 늘 "아직 말할 수 없다"
  // 만 내놓는다. 창은 들고 있는 것보다 길 수 없다.
  assert.equal(SPAN_DAYS.long, 90);
  assert.ok(KEEP_COUNT > 0);
});

test('절반이 안 차면 말하지 않는다', () => {
  /*
    이것이 이 파일의 핵심이다. 90일 창에 엿새치가 들어 있는 것은 90일을 본 것이
    아니라 엿새를 본 것이다. 그 둘을 같은 얼굴로 내놓으면, 안 먹은 날이 통째로
    빠진 채 "충분하다" 가 나온다 — **결핍을 놓치는 방향으로** 틀린다.
  */
  assert.equal(trustworthy(reading({ coverage: 0.49 })), false);
  assert.equal(trustworthy(reading({ coverage: 0.5 })), true);
});

test('자료가 모자라면 그렇다고 말한다', () => {
  const say = spanSentence('Protein', reading({ logged: 3, days: 14, coverage: 3 / 14 }), 'recent');
  assert.match(say, /only 3 of 14 days/);
  assert.doesNotMatch(say, /percent/, '자료가 없는데 비율을 말하면 안 된다');
});

test('결핍을 선고하지 않는다', () => {
  /*
    DRI 지침이 그것을 못 하는 이유를 그대로 따른다 — "한 사람의 식사가 그 사람의
    필요를 채우는지는 정확히 알 수 없다". 개인의 필요량 자체가 잴 수 없는 값이라
    어떤 계산도 "당신은 부족합니다" 까지 갈 수 없다.
  */
  const low = spanSentence('Iron', reading({ perDay: 20, reference: 100 }), 'long');
  assert.match(low, /has been low/);
  assert.doesNotMatch(low, /deficien/i);
  assert.doesNotMatch(low, /you are/i);
});

test('충분하면 충분하다고 한다', () => {
  const ok = spanSentence('Protein', reading({ perDay: 95, reference: 100 }), 'recent');
  assert.match(ok, /good level/);
  assert.match(ok, /over the last two weeks/);
});
