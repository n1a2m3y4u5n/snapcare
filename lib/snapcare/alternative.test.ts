import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alternativeFor, knownConditionIds } from './alternative.ts';
import type { ScanItem, Verdict, Member } from './types.ts';

const member = { id: 'm', name: 'M', role: 'Adult', emoji: '🙂', color: '#000',
  conditionIds: [] } as unknown as Member;
const food = (flags: string[] = [], alt?: { name: string; note: string }): ScanItem =>
  ({ id: 'i', name: 'Bar', kind: 'food', emoji: '🍫', flags, alt } as unknown as ScanItem);
const verdict = (level: string, reasons: unknown[] = []): Verdict =>
  ({ level, headline: '', summary: '', reasons, member } as unknown as Verdict);

test('표에 적은 조건 id 는 실제로 존재하는 것들이다', () => {
  // 오타가 나면 대체 제안이 조용히 안 뜬다 — 그래서 표를 대조한다.
  assert.equal(knownConditionIds().length, 10);
});

test('조건이 이유면 그 조건에서 유도한다', () => {
  const a = alternativeFor(food(['peanut']),
    verdict('avoid', [{ level: 'avoid', text: 'x', conditionId: 'peanut_allergy' }]));
  assert.equal(a?.text, 'Look for something without peanuts.');
  assert.equal(a?.glyph, 'allergen_peanut');
});

test('조건이 없고 영양 기준이면 플래그에서 유도한다', () => {
  const a = alternativeFor(food(['high_sugar']),
    verdict('caution', [{ level: 'caution', text: '당류 많음' }]));
  assert.equal(a?.text, 'Look for something with less sugar.');
});

test('카탈로그에 손으로 적은 대체품이 있으면 그것을 우선한다', () => {
  const a = alternativeFor(food(['peanut'], { name: 'SunButter oat bar', note: 'peanut-free' }),
    verdict('avoid', [{ level: 'avoid', text: 'x', conditionId: 'peanut_allergy' }]));
  assert.equal(a?.text, 'SunButter oat bar — peanut-free');
});

test('안전 판정에는 대체를 권하지 않는다', () => {
  assert.equal(alternativeFor(food([]), verdict('safe')), null);
});

test('약에는 대체를 권하지 않는다 — 처방을 바꾸라는 말이 된다', () => {
  const rx = { id: 'r', name: 'Rx', kind: 'prescription', emoji: '💊',
    flags: ['nsaid_bleed'] } as unknown as ScanItem;
  assert.equal(alternativeFor(rx, verdict('avoid', [{ level: 'avoid', text: 'x',
    conditionId: 'blood_thinner_conflict' }])), null);
});

test('짚을 이유가 없으면 아무것도 권하지 않는다', () => {
  assert.equal(alternativeFor(food([]), verdict('caution', [{ level: 'caution', text: '?' }])), null);
});
