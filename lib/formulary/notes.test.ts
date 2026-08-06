import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readNotes } from './notes.ts';

test('약사가 적은 짧은 표시를 알아듣는다', () => {
  const r = readNotes('After food. May cause drowsiness. Do not drive.');
  assert.deepEqual(r.care, ['with_food', 'drowsy', 'no_driving']);
  assert.deepEqual(r.unknown, []);
});

test('한 칸에 여러 주의가 들어온다', () => {
  // 구절 단위로 가르는 이유다. 통째로 견주면 첫 번째만 잡히고 나머지가 사라진다.
  const r = readNotes('Take with a full glass of water; keep refrigerated');
  assert.ok(r.care.includes('full_glass'));
  assert.ok(r.care.includes('fridge'));
});

test('판정까지 가야 하는 것은 플래그로 넘긴다', () => {
  /*
    금주와 임신·수유 금기는 그림만의 일이 아니다. 판정 엔진이 이 사람의 조건과
    대조해야 빨간 화면이 뜨고, 그러려면 플래그로 도착해야 한다.
  */
  const r = readNotes('No alcohol. Not in pregnancy.');
  assert.ok(r.flags.includes('alcohol'));
  assert.ok(r.flags.includes('unsafe_pregnancy'));
});

test('쓰기 전에 하는 일들', () => {
  const r = readNotes('Shake well. Wash your hands. Remove contact lenses.');
  assert.equal(r.shake, true);
  assert.equal(r.handwash, true);
  assert.equal(r.noLens, true);
});

test('OCR 오독을 견딘다', () => {
  // 이 저장소가 실측한 오독이다 — rn 이 m 으로 붙어 보인다. 정확한 철자를 요구하면
  // 주의가 통째로 사라지고, 사라진 것을 화면이 말해 주지도 않는다.
  assert.ok(readNotes('may cause drowsiness').care.includes('drowsy'));
  assert.ok(readNotes('keep refrigerated').care.includes('fridge'));
});

test('부정을 반대로 읽지 않는다', () => {
  /*
    `no driving` 과 `driving` 은 편집거리 셋이다. 흐리게 맞추면 뜻이 뒤집히는 자리라
    이런 구절은 정확히 맞춘다 — 이 저장소가 픽토그램에서 이미 겪은 실패의 같은
    종류다. 사선 하나가 "드세요" 와 "드시지 마세요" 를 가른다.
  */
  assert.ok(readNotes('Do not drive').care.includes('no_driving'));
  assert.ok(readNotes('운전 금지').care.includes('no_driving'));
});

test('못 알아들은 것을 버리지 않는다', () => {
  /*
    이 파일에서 제일 중요한 시험이다. 약사가 적었는데 우리가 못 그리는 주의는 반드시
    있고, 그때 조용히 버리면 **종이에는 있고 화면에는 없는 지시**가 생긴다. 주의가
    아예 없는 것보다 나쁘다 — 사람은 화면을 봤으니 다 봤다고 여긴다.
  */
  const r = readNotes('After food. Check blood sugar weekly.');
  assert.deepEqual(r.care, ['with_food']);
  assert.deepEqual(r.unknown, ['Check blood sugar weekly']);
});

test('빈 칸의 잡음을 사람이 쓴 것으로 치지 않는다', () => {
  // OCR 은 빈 줄에서도 두세 글자를 내놓는다. 그것을 "못 읽은 주의" 로 보이면
  // 화면이 매번 쓰레기를 달고 뜨고, 그러면 진짜 못 읽은 것도 같이 무시된다.
  assert.deepEqual(readNotes('').unknown, []);
  assert.deepEqual(readNotes('~ . -- ,').unknown, []);
  assert.deepEqual(readNotes('a1 b2').unknown, []);
});

test('식전과 식후를 섞지 않는다', () => {
  // 공복에 먹어야 하는 약을 밥과 함께 먹으면 흡수가 달라진다.
  assert.deepEqual(readNotes('before meals').care, ['empty_stomach']);
  assert.deepEqual(readNotes('after meals').care, ['with_food']);
});

/*
  부정과 시점이 뜻을 뒤집는 자리.

  `with_food` 가 `words: ['food']` 였고 `unsafe_pregnancy` 가 'pregnancy' 라는 낱말만
  봤다. 그래서 공복 지시가 밥그릇 그림이 되고, "임신 중 안전" 이 빨간 "먹지 마세요" 가
  됐다. 둘 다 화면에서는 멀쩡해 보인다 — 그림도 문장도 정상적으로 생겼고, 다만 사실과
  반대다.

  같은 파일의 `no_driving`·`alcohol` 은 부정을 정규식에 넣어 이미 막고 있었다. 이 둘만
  규칙에서 빠져 있었다.
*/
test('음식과 함께가 아닌 지시를 밥그릇으로 그리지 않는다', () => {
  for (const piece of [
    'Do not take with food',
    'Not to be taken with food',
    'Take 30 minutes before food',
    'Avoid food for 2 hours',
    'No food restriction',
    'Take on an empty stomach',
  ]) {
    assert.ok(!readNotes(piece).care.includes('with_food'), `"${piece}" 가 with_food 로 잡힌다`);
  }
});

test('음식과 함께 먹으라는 지시는 그대로 잡는다', () => {
  for (const piece of ['Take with food', 'After a meal', 'with meals', '식후 복용']) {
    assert.ok(readNotes(piece).care.includes('with_food'), `"${piece}" 를 놓친다`);
  }
});

test('공복 지시가 빈 그릇으로 간다', () => {
  for (const piece of ['Take 30 minutes before food', 'Avoid food for 2 hours', 'empty stomach']) {
    assert.ok(readNotes(piece).care.includes('empty_stomach'), `"${piece}" 를 놓친다`);
  }
  // 둘이 같이 붙으면 빈 그릇과 밥그릇이 나란히 그려진다.
  assert.ok(!readNotes('empty stomach, no food').care.includes('with_food'));
});

test('임신 중 안전하다는 말을 금기로 뒤집지 않는다', () => {
  for (const piece of [
    'Safe in pregnancy',
    'May be used by pregnant women',
    'Can be taken while pregnant',
    'Ask about pregnancy',
  ]) {
    assert.ok(!readNotes(piece).flags.includes('unsafe_pregnancy'), `"${piece}" 가 금기로 잡힌다`);
  }
  assert.ok(!readNotes('Safe while breastfeeding').flags.includes('unsafe_breastfeeding'));
});

test('진짜 금기는 그대로 잡는다', () => {
  /* 부정이 걸린 안전 표현은 안전 표현이 아니다. 이쪽이 뒤집히면 사람이 다친다. */
  for (const piece of [
    'Not safe in pregnancy',
    'Unsafe in pregnancy',
    'Do not use if pregnant',
    'Contraindicated in pregnancy',
    '임신 중 금기',
  ]) {
    assert.ok(readNotes(piece).flags.includes('unsafe_pregnancy'), `"${piece}" 를 놓친다`);
  }
  assert.ok(readNotes('Not safe while breastfeeding').flags.includes('unsafe_breastfeeding'));
});
