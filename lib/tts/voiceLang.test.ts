import test from 'node:test';
import assert from 'node:assert/strict';

import { voiceLangFor } from './voiceLang.ts';
import { pickVoice, scoreVoice, type VoiceLike } from './pickVoice.ts';

/**
 * 실제로 났던 소리: 한국어 음성이 영어 문장을 읽어 "한국 사람이 영어를 읽는" 소리가
 * 났다. 원인은 둘이었고 시험도 둘이다 — 목소리를 못 골라 기본값으로 떨어지는 것과,
 * 골랐는데 문장과 문자 체계가 어긋나는 것.
 */

test('한국어로 읽으라 해도 영어 문장이면 영어 목소리로 읽는다', () => {
  // 사전에 없는 문장은 영어 원문 그대로 나간다. 그것을 한국어 목소리가 읽으면
  // 소리 나는 대로 읽어서 알아들을 수 없다.
  assert.equal(voiceLangFor('Take one capsule three times a day.', 'ko'), 'en-US');
  assert.equal(voiceLangFor('Amoxicillin 250mg', 'ko-KR'), 'en-US');
});

test('한국어 문장은 한국어 목소리로 읽는다', () => {
  assert.equal(voiceLangFor('하루 세 번 한 알씩 드세요.', 'ko'), 'ko');
  assert.equal(voiceLangFor('먼저 손을 씻으세요.', 'ko-KR'), 'ko-KR');
});

test('섞인 문장은 고른 언어를 따른다', () => {
  // "Amoxicillin 250mg 을 드세요" 처럼 약 이름만 영어인 경우. 한글이 있으므로
  // 한국어 목소리가 맞다 — 문장의 뼈대가 한국어다.
  assert.equal(voiceLangFor('Amoxicillin 250mg 을 하루 세 번 드세요.', 'ko'), 'ko');
});

test('숫자·기호뿐이면 굳이 바꾸지 않는다', () => {
  assert.equal(voiceLangFor('8:00', 'ko'), 'ko');
  assert.equal(voiceLangFor('250', 'ko-KR'), 'ko-KR');
});

test('벵골어·우르두어도 같은 규칙이다', () => {
  assert.equal(voiceLangFor('Take one capsule', 'bn'), 'en-US');
  assert.equal(voiceLangFor('দিনে তিনবার', 'bn'), 'bn');
  assert.equal(voiceLangFor('Take one capsule', 'ur'), 'en-US');
  assert.equal(voiceLangFor('دن میں تین بار', 'ur'), 'ur');
});

test('라틴 문자를 쓰는 언어는 건드리지 않는다', () => {
  // 하우사·인도네시아어·루마니아어는 영어와 글자만으로 구별되지 않는다. 더 잘
  // 가르려면 사전을 통째로 뒤져야 하고, 그 값이 이득보다 크다. 루마니아어 목소리가
  // 영어를 읽는 것은 한국어 목소리가 읽는 것보다 훨씬 가깝다.
  for (const lang of ['ro', 'id', 'ha', 'en', 'en-US']) {
    assert.equal(voiceLangFor('Take one capsule', lang), lang);
  }
});

// ── 목소리 고르기 ────────────────────────────────────────────────────────────

const V = (name: string, lang: string, over: Partial<VoiceLike> = {}): VoiceLike =>
  ({ name, lang, localService: true, ...over });

test('영어를 읽는데 한국어 목소리를 고르지 않는다', () => {
  // 이 기기의 기본 음성이 '유나' [ko-KR] 다. 기본값에 맡기면 그것이 영어를 읽는다.
  const voices = [V('유나', 'ko-KR', { default: true }), V('Samantha', 'en-US')];
  assert.equal(pickVoice(voices, 'en-US')?.name, 'Samantha');
  assert.equal(pickVoice(voices, 'en')?.name, 'Samantha', "'en' 처럼 지역 없는 태그도 맞아야 한다");
});

test('장난감 음성은 절대 안 고른다', () => {
  // macOS 는 Zarvox·Trinoids 같은 것을 en-US 로 깔아 둔다. 복약 지시를 그 소리로
  // 들으면 접근성이 아니라 조롱이 된다.
  const voices = [V('Zarvox', 'en-US', { default: true }), V('Bad News', 'en-US'), V('Fred', 'en-US')];
  assert.equal(pickVoice(voices, 'en-US')?.name, 'Fred');
  assert.equal(scoreVoice(V('Trinoids', 'en-US')), -Infinity);
});

test('쓸 음성이 하나도 없으면 null 이다', () => {
  // 이때 브라우저 기본값에 맡기는데, 그 기본값이 한국어 음성일 수 있다. 그래서
  // lib/voice.ts 는 이 null 을 **기억하지 않는다** — 목록이 늦게 차는 경우
  // 세션 내내 기본 음성으로 떨어지던 것이 실제 결함이었다.
  assert.equal(pickVoice([], 'en-US'), null);
  assert.equal(pickVoice([V('유나', 'ko-KR')], 'en-US'), null);
});

test('품질 등급이 붙은 음성이 이긴다', () => {
  const voices = [V('Fred', 'en-US'), V('Ava (Premium)', 'en-US')];
  assert.equal(pickVoice(voices, 'en-US')?.name, 'Ava (Premium)');
});
