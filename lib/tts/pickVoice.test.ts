import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickVoice, scoreVoice } from './pickVoice.ts';
import type { VoiceLike } from './pickVoice.ts';

const v = (name: string, lang = 'en-US', localService = true, isDefault = false): VoiceLike =>
  ({ name, lang, localService, default: isDefault });

test('장난감 음성은 절대 고르지 않는다', () => {
  // macOS 는 Zarvox·Trinoids 같은 것들을 en-US 로 깔아둔다. 판정 결과를 이런 목소리로
  // 듣게 되면 접근성이 아니라 조롱이 된다 — 후보가 그것뿐이면 차라리 기본값에 맡긴다.
  for (const bad of ['Zarvox', 'Trinoids', 'Bad News', 'Bubbles', 'Albert', 'Whisper']) {
    assert.equal(scoreVoice(v(bad)), -Infinity, bad);
  }
  assert.equal(pickVoice([v('Zarvox'), v('Bells')]), null);
});

test('제조사가 붙인 고품질 표시를 우선한다', () => {
  const best = pickVoice([v('Fred'), v('Samantha'), v('Ava (Premium)')]);
  assert.equal(best!.name, 'Ava (Premium)');
});

test('같은 이름의 저용량 판을 피한다', () => {
  // Apple 은 같은 이름으로 compact 판을 함께 깐다. 이름만 보면 구분이 안 된다.
  const best = pickVoice([v('Samantha (Compact)'), v('Samantha')]);
  assert.equal(best!.name, 'Samantha');
});

test('오프라인이 걸린 만큼 네트워크 음성 가중치는 낮게 둔다', () => {
  // 네트워크 음성이 대체로 낫지만, 이 앱의 음성은 인터넷이 끊겨도 나와야 한다.
  // 그래서 로컬 고품질 음성이 있으면 그쪽이 이겨야 한다.
  const best = pickVoice([v('Google US English', 'en-US', false), v('Ava (Enhanced)')]);
  assert.equal(best!.name, 'Ava (Enhanced)');

  // 다만 평범한 로컬 음성보다는 네트워크 음성이 낫다.
  assert.equal(pickVoice([v('Fred'), v('Google US English', 'en-US', false)])!.name, 'Google US English');
});

test('다른 언어의 음성으로 영어를 읽지 않는다', () => {
  // 한국어 음성으로 영어 문장을 읽히면 발음이 무너진다 (화면 문구는 전부 영어다).
  assert.equal(scoreVoice(v('Yuna', 'ko-KR')), -Infinity);
  assert.equal(pickVoice([v('Yuna', 'ko-KR'), v('Fred', 'en-US')])!.name, 'Fred');

  // 지역이 달라도 같은 언어면 쓴다 — 영국 영어가 없는 것보다 낫다.
  assert.equal(pickVoice([v('Daniel', 'en-GB')])!.name, 'Daniel');
});

test('고를 것이 없으면 기본값에 맡긴다', () => {
  assert.equal(pickVoice([]), null);
  assert.equal(pickVoice([v('Yuna', 'ko-KR')]), null);
});

test('완전 동점일 때만 브라우저 기본값을 따른다', () => {
  const best = pickVoice([v('Voice A'), v('Voice B', 'en-US', true, true)]);
  assert.equal(best!.name, 'Voice B');
});
