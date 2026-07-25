import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeVerdict } from './verdict.ts';
import type { ItemFlag, Member, ScanItem } from './types.ts';
import type { NutrientAssessment } from '../nutrition/types.ts';

const member = (conditionIds: string[] = [], over: Partial<Member> = {}): Member => ({
  id: 'm', name: 'Amina', role: 'Adult', emoji: '🙂', color: '#000', conditionIds, ...over,
});

const item = (flags: ItemFlag[] = [], over: Partial<ScanItem> = {}): ScanItem => ({
  id: 'i', name: 'Test', kind: 'food', emoji: '🍚', detectedVia: 'test', flags, ...over,
});

const limit = (key: NutrientAssessment['key'], pct: number): NutrientAssessment => ({
  key, kind: 'limit', amount: 0, reference: 0, pct, level: 'high',
});

test('조건과 맞는 플래그가 없으면 안전이다', () => {
  const v = computeVerdict(item(['gluten']), member(['peanut_allergy']));
  assert.equal(v.level, 'safe');
  assert.equal(v.headline, 'Safe to eat');
  assert.deepEqual(v.reasons, []);
});

test('알레르기가 걸리면 먹지 말라고 말한다', () => {
  const v = computeVerdict(item(['peanut']), member(['peanut_allergy']));
  assert.equal(v.level, 'avoid');
  assert.match(v.headline, /Not safe for Amina/);
  assert.match(v.summary, /Do not eat/);
  assert.equal(v.reasons[0].conditionId, 'peanut_allergy');
});

test('여러 이유가 겹치면 가장 심한 쪽으로 판정한다', () => {
  // 주의 하나와 회피 하나가 같이 나오면 결과는 회피여야 한다 — 색이 하나뿐이라 섞을 수 없다.
  const v = computeVerdict(item(['high_sugar', 'peanut']), member(['diabetic', 'peanut_allergy']));
  assert.equal(v.level, 'avoid');
  assert.equal(v.reasons.length, 2);
});

test('종류에 따라 동사가 바뀐다', () => {
  assert.equal(computeVerdict(item([], { kind: 'drink' }), member()).headline, 'Safe to drink');
  assert.equal(computeVerdict(item([], { kind: 'medicine' }), member()).headline, 'Safe to take');
  assert.match(computeVerdict(item(['peanut'], { kind: 'drink' }), member(['peanut_allergy'])).summary, /Do not drink/);
});

test('등록된 조건이 없어도 하루치를 한 끼에 넘기면 경고한다', () => {
  // 비빔밥 실측에서 나온 경우다. 조건 매칭에만 의존하면 진단 없는 아이가 한 끼에
  // 하루 소금의 1.7배를 먹어도 'Safe' 가 뜬다.
  const v = computeVerdict(item(), member([], { ageBand: 'child' }), [limit('salt', 133)]);
  assert.equal(v.level, 'caution');
  assert.match(v.summary, /A whole day's salt in one serving/);
});

test('하루치에 못 미치면 그 이유로는 경고하지 않는다', () => {
  const v = computeVerdict(item(), member(), [limit('salt', 99)]);
  assert.equal(v.level, 'safe');
});

test('경고 문구에 변수명이 그대로 나가지 않는다', () => {
  const v = computeVerdict(item(), member(), [limit('saturatedFat', 120)]);
  assert.match(v.summary, /saturated fat/);
  assert.doesNotMatch(v.summary, /saturatedFat/);
});

test('임신 금기는 조건이 등록돼 있을 때 회피로 나온다', () => {
  // 처방전 OCR → 픽토그램까지는 가는데 판정 엔진에 안 닿던 구간이 있었다.
  const v = computeVerdict(item(['unsafe_pregnancy'], { kind: 'medicine' }), member(['pregnant']));
  assert.equal(v.level, 'avoid');
  assert.match(v.summary, /Do not take/);
});

test('모르는 조건 id 는 조용히 건너뛴다', () => {
  // 저장된 프로필이 코드보다 오래됐을 수 있다 — 그때 화면이 죽으면 안 된다.
  const v = computeVerdict(item(['peanut']), member(['peanut_allergy', 'removed_condition']));
  assert.equal(v.level, 'avoid');
  assert.equal(v.reasons.length, 1);
});
