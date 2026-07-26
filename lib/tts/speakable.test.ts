import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isEnglishSpeakable, spokenName } from './speakable.ts';

test('라틴 문자 이름은 그대로 읽는다', () => {
  assert.equal(isEnglishSpeakable('Amoxicillin 500mg'), true);
  assert.equal(isEnglishSpeakable('Bowl of jollof rice'), true);
  // 라틴 확장까지 허용한다 — 몰도바·프랑스어 이름이 잡음으로 바뀌면 안 된다
  assert.equal(isEnglishSpeakable('Café au lait'), true);
  assert.equal(isEnglishSpeakable('Ştefan biscuits'), true);
});

test('영어 음성이 읽지 못하는 글자는 걸러낸다', () => {
  assert.equal(isEnglishSpeakable('아목시실린캡슐'), false);
  assert.equal(isEnglishSpeakable('과자 영양정보'), false);
  // 한 글자만 섞여도 문장 한가운데서 발음이 무너진다
  assert.equal(isEnglishSpeakable('Vitamin 정'), false);
});

test('읽을 수 없는 이름은 종류를 가리키는 말로 바꾼다', () => {
  // 화면에는 원래 이름이 남는다. 바뀌는 것은 음성 스크립트뿐이다.
  assert.equal(spokenName('아목시실린캡슐', 'medicine'), 'this medicine');
  assert.equal(spokenName('처방 의약품', 'prescription'), 'this medicine');
  assert.equal(spokenName('과자', 'food'), 'this food');
  assert.equal(spokenName('음료', 'drink'), 'this drink');
  assert.equal(spokenName('무언가'), 'this product');
});

test('읽을 수 있는 이름은 건드리지 않는다', () => {
  assert.equal(spokenName('Red Bull', 'drink'), 'Red Bull');
  assert.equal(spokenName('Ibuprofen 200mg', 'medicine'), 'Ibuprofen 200mg');
});
