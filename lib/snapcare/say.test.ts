import test from 'node:test';
import assert from 'node:assert/strict';
import { doseSentence, itemVoiceScript, storageSentence } from './say.ts';
import type { Member, ScanItem, Verdict } from './types.ts';

/**
 * VOCA 음성 스크립트.
 *
 * 이 파일에는 지금까지 시험이 없었다. 화면을 눈으로 보는 것이 유일한 검증이었는데,
 * **음성은 눈으로 볼 수 없다.** 픽토그램은 틀리면 이상해 보이기라도 하지만, 음성은
 * 틀린 채로 흘러가고 듣는 사람은 그것이 틀렸다는 것을 알 방법이 없다. sigil.ts 에서
 * 임신 금기가 2년 가까이 반대로 읽히고 있었던 것과 같은 자리다.
 *
 * 여기서 재는 것은 문구의 예쁨이 아니라 **지시가 지시대로 도착하는가**다.
 */

const member: Member = {
  id: 'me', name: 'Mia', role: 'Adult', emoji: '🧑', color: '#000', conditionIds: [],
};

const verdict = (level: Verdict['level'], summary = 'Summary.'): Verdict => ({
  level, headline: 'H', summary, reasons: [], member,
});

const item = (over: Partial<ScanItem> = {}): ScanItem => ({
  id: 'i', name: 'Amoxicillin', kind: 'prescription', emoji: '💊',
  detectedVia: 'test', flags: [],
  ...over,
});

const rx = (over: Partial<NonNullable<ScanItem['rx']>> = {}): NonNullable<ScanItem['rx']> => ({
  dosageText: 'after food', durationText: '7 days', schedule: [], ...over,
});

// ── 1회 용량 ────────────────────────────────────────────────────────────────

test('1회 용량이 복용법보다 먼저 나온다', () => {
  // 형성 평가에서 이 항목이 처방 16시행 전부에 빠져 있었다. 인용한 실패 유형과 같다 —
  // 복용 시점은 알고 용량은 모르는 상태(Davis et al. 2006: 지시를 말할 수 있는 70.7%
  // 중 실제 알약 수를 제시한 것은 34.7%). 듣는 사람은 되감을 수 없으므로 순서가 곧
  // 중요도다.
  const said = itemVoiceScript(
    item({ rx: rx({ doseText: '1 capsule', dosageText: 'three times daily after food' }) }),
    verdict('safe'), member,
  );
  const lower = said.toLowerCase();
  assert.ok(lower.indexOf('1 capsule') < lower.indexOf('three times daily'), said);
});

test('처방전에서 온 조각도 문장으로 세워 읽는다', () => {
  // "after food" 를 그대로 끼우면 "... each time. after food. ..." 가 되어 앞 문장의
  // 꼬리처럼 읽힌다. 듣는 사람에게 문장 경계는 쉼표 하나만큼의 차이가 아니다.
  const said = itemVoiceScript(
    item({ rx: rx({ doseText: '1 capsule', dosageText: 'after food' }) }), verdict('safe'), member,
  );
  assert.ok(said.includes('After food.'), said);
});

test('용량 원문을 우리가 다시 쓰지 않는다', () => {
  // 처방전이 mL 로 적었는데 우리가 '숟가락' 으로 바꿔 말하면 그 순간 우리가 처방을
  // 해석한 것이 되고, 틀리면 용량 오류가 된다.
  assert.equal(doseSentence(rx({ doseText: '5 mL', form: 'syrup' })), 'Take 5 mL each time.');
});

test('용량을 못 읽었으면 지어내지 않는다', () => {
  assert.equal(doseSentence(rx()), null);
  assert.equal(doseSentence(rx({ doseText: '   ' })), null);
});

// ── 제형별 동사 ─────────────────────────────────────────────────────────────

test('제형마다 투여 동사가 다르다', () => {
  // "복용" 이라는 한 낱말이 제형마다 다른 행위를 뜻한다. 안약을 "드세요" 라고 말하는
  // 것은 어색한 표현이 아니라 **잘못된 지시**다.
  assert.equal(doseSentence(rx({ doseText: '2 drops', form: 'eyedrop' })), 'Put 2 drops in the eye each time.');
  assert.equal(doseSentence(rx({ doseText: 'a thin layer', form: 'cream' })), 'Apply a thin layer on the skin each time.');
  assert.equal(doseSentence(rx({ doseText: '1 puff', form: 'inhaler' })), 'Breathe in 1 puff each time.');
  assert.equal(doseSentence(rx({ doseText: '1 tablet', form: 'tablet' })), 'Take 1 tablet each time.');
});

test('먹는 약이 아니면 마무리 문장도 먹으라고 하지 않는다', () => {
  // 위에서 동사를 갈라 놓고도 그 뒤에 "Take as prescribed." 를 붙이고 있었다.
  // 안약 한 번에 "Put 2 drops in the eye" 와 "Take as prescribed" 가 함께 나가면,
  // 갈라 놓은 이유가 그 자리에서 무너진다.
  const eye = itemVoiceScript(
    item({ rx: rx({ doseText: '2 drops', form: 'eyedrop' }) }), verdict('safe'), member,
  );
  assert.ok(!/Take as prescribed/.test(eye), eye);
  assert.ok(/as prescribed/.test(eye), `마무리 문장 자체는 있어야 한다: ${eye}`);

  const pill = itemVoiceScript(
    item({ rx: rx({ doseText: '1 tablet', form: 'tablet' }) }), verdict('safe'), member,
  );
  assert.ok(/Take as prescribed/.test(pill), pill);
});

// ── 보관 ────────────────────────────────────────────────────────────────────

test('냉장일 때만 보관을 말한다', () => {
  // 실온은 기본값이라 한 문장을 더 얹을 만한 정보가 아니다.
  assert.equal(storageSentence(rx({ storage: 'refrigerator' })), 'Keep it in the fridge.');
  assert.equal(storageSentence(rx({ storage: 'room' })), null);
  assert.equal(storageSentence(rx()), null);
});

// ── 회피 ────────────────────────────────────────────────────────────────────

test('먹지 말라는 말을 두 번 하지 않는다', () => {
  // summary 가 이미 "Do not take." 로 시작한다. 앞에 한 번 더 붙이면 같은 말을 두 번
  // 듣게 되고, 듣는 사람의 주의는 그만큼 낭비된다.
  const said = itemVoiceScript(
    item({ rx: rx({ doseText: '1 capsule' }) }),
    verdict('avoid', 'Do not take. Not safe while pregnant.'), member,
  );
  assert.equal(said.match(/Do not take/g)?.length, 1, said);
});

test('회피면 복용 지시를 읽지 않는다', () => {
  // 먹지 말라고 해 놓고 어떻게 먹는지를 이어 읽으면 앞의 말이 지워진다.
  const said = itemVoiceScript(
    item({ rx: rx({ doseText: '1 capsule', storage: 'refrigerator' }) }),
    verdict('avoid', 'Do not take.'), member,
  );
  assert.ok(!/each time/.test(said), said);
  assert.ok(!/fridge/.test(said), said);
});

// ── 음식·음료 ───────────────────────────────────────────────────────────────

test('먹는 것과 마시는 것을 가려 말한다', () => {
  assert.ok(/Safe to eat/.test(itemVoiceScript(item({ kind: 'food', rx: undefined }), verdict('safe'), member)));
  assert.ok(/Safe to drink/.test(itemVoiceScript(item({ kind: 'drink', rx: undefined }), verdict('safe'), member)));
});

test('음식이 위험하면 누구에게 위험한지 말한다', () => {
  // 한 기기를 여럿이 쓴다. 이름이 빠지면 듣는 사람은 그것이 자기 판정인지 알 수 없다.
  const said = itemVoiceScript(
    item({ kind: 'food', rx: undefined }), verdict('avoid', 'Contains peanuts.'), member,
  );
  assert.ok(said.includes('Mia'), said);
  assert.ok(said.includes('Contains peanuts.'), said);
});

// ── 이름 ────────────────────────────────────────────────────────────────────

test('영어 음성이 못 읽는 이름은 종류로 바꿔 말한다', () => {
  // 화면에는 포장지의 원래 이름이 그대로 남는다. 바뀌는 것은 소리뿐이다.
  const said = itemVoiceScript(
    item({ name: '고추장 불닭볶음면', kind: 'food', rx: undefined }), verdict('safe'), member,
  );
  assert.ok(!said.includes('고추장'), said);
  assert.ok(/^[\x20-\x7E]+$/.test(said), `읽을 수 없는 글자가 남았다: ${said}`);
});
