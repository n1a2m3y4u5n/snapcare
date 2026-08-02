import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PACKS } from './index.ts';
import { LANGUAGES, voiceAvailable } from './languages.ts';
import { dslSentence } from '../snapcare/dslSpeech.ts';

/**
 * 번역이 **비어 있지 않은지** 본다.
 *
 * 반쯤 번역된 꾸러미가 위험한 종류다. 화면은 그 언어를 고를 수 있다고 말해 놓고 절반은
 * 영어로 나가는데, 소리로만 듣는 사람은 그 절반이 자기가 못 알아듣는 언어라는 것조차
 * 모른다 — 그냥 "말이 안 되는 소리" 로 들리고, 그 자리가 하필 복용량일 수 있다.
 *
 * 그래서 영어 원문(dslSpeech.ts 의 CONCEPT)에 있는 열쇠는 모든 꾸러미에 있어야 한다.
 */

const SRC = readFileSync(join(process.cwd(), 'lib', 'snapcare', 'dslSpeech.ts'), 'utf8');

/** 영어 원문에서 열쇠를 뽑는다 — 손으로 적은 목록은 반드시 어긋난다. */
function englishKeys(): string[] {
  const body = SRC.split('const CONCEPT')[1].split('\n};')[0];
  const keys: string[] = [];
  for (const m of body.matchAll(/^ {2}([a-z_]+): \{(.+)\},\s*$/gm)) {
    for (const f of m[2].matchAll(/(yes|no|alone):/g)) keys.push(`${m[1]}.${f[1]}`);
  }
  const cadence = SRC.split('const CADENCE_SAY')[1].split('\n};')[0];
  for (const m of cadence.matchAll(/^ {2}([a-z_]+):/gm)) keys.push(`cadence.${m[1]}`);
  keys.push('missing');
  return keys;
}

const KEYS = englishKeys();

test('영어 원문에서 열쇠를 실제로 뽑아냈다', () => {
  // 이 시험 자신이 조용히 빈 목록을 재고 있으면 나머지가 전부 무의미하다.
  assert.ok(KEYS.length > 60, `열쇠가 ${KEYS.length}개뿐이다`);
  assert.ok(KEYS.includes('qty_two.yes'));
  assert.ok(KEYS.includes('cadence.three_times_daily'));
});

for (const [code, pack] of Object.entries(PACKS)) {
  test(`${code}: 영어에 있는 문장이 하나도 빠지지 않았다`, () => {
    const missing = KEYS.filter((k) => !pack.phrases[k]);
    assert.deepEqual(missing, [], `${code} 에 없는 것: ${missing.join(', ')}`);
  });

  test(`${code}: 영어 문장을 그대로 베껴 두지 않았다`, () => {
    // 번역을 못 한 자리를 영어로 채워 두면 위 시험은 통과하면서 사용자는 못 알아듣는다.
    const en = new Set(
      [...SRC.matchAll(/(?:yes|no|alone): '((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]),
    );
    const copied = Object.entries(pack.phrases).filter(([, v]) => en.has(v));
    assert.deepEqual(copied.map(([k]) => k), [], `${code} 가 영어를 그대로 쓴 자리`);
  });

  test(`${code}: 빈 문장이 없다`, () => {
    const empty = Object.entries(pack.phrases).filter(([, v]) => !v.trim());
    assert.deepEqual(empty.map(([k]) => k), []);
  });
}

test('고를 수 있는 언어는 전부 꾸러미가 있다 (영어 빼고)', () => {
  for (const l of LANGUAGES) {
    if (l.code === 'en') continue;
    assert.ok(PACKS[l.code], `${l.code} 를 고를 수 있는데 꾸러미가 없다`);
  }
});

test('문장이 그 언어의 어순으로 조립된다', () => {
  // 한국어는 꾸밈말이 앞. "하루 세 번, 식사와 함께 캡슐을 드세요."
  const ko = dslSentence('\\three_times_daily{\\capsule_strip{\\food_bowl}}', 'ko');
  assert.ok(ko, '한국어 문장이 안 나왔다');
  assert.ok(ko!.indexOf('하루 세 번') < ko!.indexOf('캡슐'), ko!);
  assert.ok(ko!.indexOf('식사와 함께') < ko!.indexOf('캡슐'), ko!);

  // 영어는 머리가 앞.
  const en = dslSentence('\\three_times_daily{\\capsule_strip{\\food_bowl}}');
  assert.ok(en!.indexOf('capsule') < en!.indexOf('with food'), en!);
});

test('번역이 없는 언어는 영어로 떨어진다', () => {
  // 지어내지 않는 것이 요점이다. 못 알아듣고 끝나는 편이, 알아듣고 틀리는 것보다 낫다.
  assert.equal(dslSentence('\\hand_wash', 'zz'), 'Wash your hands first.');
});

test('혼자 선 시각도 그 언어로 말한다', () => {
  assert.equal(dslSentence('\\time_morning', 'ko'), '아침에 드세요.');
  assert.equal(dslSentence('\\time_night', 'id'), 'Minum pada malam hari.');
});

test('목소리가 있는지 없는지 가려낸다', () => {
  // 없는 언어를 고르게 두면 소리가 아예 안 나거나 영어 목소리가 그 글자를 읽는다.
  const voices = [{ lang: 'en-US' }, { lang: 'ko-KR' }, { lang: 'id_ID' }];
  assert.equal(voiceAvailable('ko-KR', voices), true);
  assert.equal(voiceAvailable('id-ID', voices), true, '밑줄로 오는 태그도 같은 것으로 봐야 한다');
  assert.equal(voiceAvailable('ur-PK', voices), false);
  assert.equal(voiceAvailable('en-GB', voices), true, '지역이 달라도 같은 언어면 읽을 수 있다');
});

test('보관은 뒤에 따로 선다 — 서술어 둘인 문장이 나오지 않게', () => {
  // 한국어에서 실제로 이렇게 나왔다: "뜨거운 곳을 피해 마른 곳에 두세요 캡슐을 드세요."
  const ko = dslSentence('\\capsule_strip{\\storage_dry}', 'ko');
  assert.equal(ko, '캡슐을 드세요. 뜨거운 곳을 피해 마른 곳에 두세요.');

  // 영어도 같이 나아진다 — 쉼표가 어색함을 가려 주고 있었을 뿐이다.
  assert.equal(dslSentence('\\capsule_strip{\\storage_dry}'), 'A capsule. Keep it dry, away from heat.');
});
