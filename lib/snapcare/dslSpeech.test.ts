import test from 'node:test';
import assert from 'node:assert/strict';
import { dslSentence, parseDslLine } from './dslSpeech.ts';

/**
 * 여기서 지키는 것: **그림이 뜻하는 것과 말이 어긋나지 않는가.**
 *
 * 어긋나면 거짓 확신이 된다 — 그림을 잘못 알아본 사람에게 확인할 길을 주려고 만든
 * 것인데, 그 확인이 틀리면 잘못을 굳혀 준다. 그림이 없는 것보다 나쁘다.
 */

test('맨 개념 한 장', () => {
  assert.equal(dslSentence('\\allergen_peanut'), 'It has peanuts.');
  assert.equal(dslSentence('\\hand_wash'), 'Wash your hands first.');
});

test('부정은 개념마다 다르게 말한다', () => {
  // 알레르겐은 고르는 기준이고 약은 금지다. 한 틀로 찍으면 하나가 어색해진다.
  assert.equal(dslSentence('\\no{\\allergen_peanut}'), 'Do not eat this. It has peanuts.');
  assert.equal(dslSentence('\\no{\\tablet_blister}'), 'Do not take this tablet.');
});

test('머리 + 슬롯', () => {
  assert.equal(dslSentence('\\dropper_bottle{\\body_eye}'), 'The drops, in the eye.');
  assert.equal(dslSentence('\\tablet_blister{\\food_empty_bowl}'), 'A tablet, on an empty stomach.');
  assert.equal(dslSentence('\\pill_bottle{\\qty_two}'), 'This medicine, two at a time.');
});

test('하루 몇 번은 겉을 한 겹 더 싼다', () => {
  assert.equal(
    dslSentence('\\three_times_daily{\\tablet_blister{\\food_bowl}}'),
    'A tablet, with food, three times a day.',
  );
  assert.equal(dslSentence('\\twice_daily{\\capsule_strip}'), 'A capsule, twice a day.');
});

test('그림이 없는 개념은 없다고 말한다', () => {
  // 조용히 넘기면 화면의 빈 칸이 무엇인지 알 방법이 없다.
  assert.equal(dslSentence('\\?nebuliser'), 'We have no picture for this one.');
});

test('모르는 개념은 지어내지 않는다', () => {
  // 틀린 설명이 거짓 확신을 만든다 — 이 그림들이 막으려는 바로 그 실패다.
  assert.equal(dslSentence('\\some_new_glyph'), null);
  assert.equal(dslSentence('not a label'), null);
});

test('중첩을 끝까지 벗긴다', () => {
  const p = parseDslLine('\\no{\\three_times_daily{\\tablet_blister{\\food_bowl}}}');
  assert.deepEqual(p, {
    head: 'tablet_blister', modifier: 'food_bowl',
    cadence: 'three_times_daily', negated: true,
  });
});
