import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ingredientsOf, checkInteractions } from './interactions.ts';
import type { ScanItem } from '../snapcare/types.ts';

const med = (name: string, dosageText = ''): ScanItem => ({
  id: name, name, kind: 'medicine', emoji: '💊', detectedVia: 'test', flags: [],
  rx: dosageText ? { dosageText, durationText: '', schedule: [] } : undefined,
});

test('상품명이 달라도 같은 성분으로 묶는다', () => {
  // 글을 못 읽는 사용자가 스스로 알아낼 수 없는 부분이다.
  assert.deepEqual(ingredientsOf(med('Tylenol 500mg')), ['acetaminophen']);
  assert.deepEqual(ingredientsOf(med('타이레놀 500mg')), ['acetaminophen']);
  assert.deepEqual(ingredientsOf(med('Paracetamol')), ['acetaminophen']);
  assert.deepEqual(ingredientsOf(med('부루펜 시럽')), ['ibuprofen']);
});

test('같은 성분을 두 번 먹으면 막는다', () => {
  const w = checkInteractions(med('Tylenol'), [med('아세트아미노펜 정')]);
  assert.equal(w.length, 1);
  assert.equal(w[0].level, 'avoid');
  assert.match(w[0].text, /doubles the dose/);
});

test('NSAID 끼리 겹치면 출혈 위험을 알린다', () => {
  const w = checkInteractions(med('Naproxen 250mg'), [med('이부프로펜 200mg')]);
  assert.equal(w[0].level, 'avoid');
  assert.match(w[0].text, /stomach bleeding/);
});

test('항응고제와 NSAID 는 양방향으로 잡는다', () => {
  assert.match(checkInteractions(med('Ibuprofen'), [med('와파린')])[0].text, /blood thinner/);
  assert.match(checkInteractions(med('Warfarin'), [med('아스피린')])[0].text, /bleeding/);
});

test('관계 없는 조합은 경고하지 않는다', () => {
  assert.deepEqual(checkInteractions(med('아목시실린캡슐 250mg'), [med('메트포르민')]), []);
  // 아는 성분이 하나도 없으면 판단을 내리지 않는다 — 모른다는 것과 안전하다는 것은 다르다.
  assert.deepEqual(checkInteractions(med('Unknown syrup'), [med('Tylenol')]), []);
});
