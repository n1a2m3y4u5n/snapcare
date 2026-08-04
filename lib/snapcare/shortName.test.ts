import { test } from 'node:test';
import assert from 'node:assert/strict';

import { shortName } from './shortName.ts';

test('종이 한 줄에서 이름만 남긴다', () => {
  /*
    OCR 은 처방전의 한 줄을 통째로 이름으로 준다. 약국이 인쇄하는 그 줄에는 이름
    말고도 함량·제형·약전 표시·포장 수량이 다 들어 있고, 기기 일정 화면은 그 줄
    오른쪽에 트레이 번호와 시각도 놓아야 한다.
  */
  assert.equal(shortName("AMOXICILLIN 500MG CAPSULES BP 21'S"), 'Amoxicillin');
  assert.equal(shortName('Metformin 500mg film-coated tablets'), 'Metformin');
  assert.equal(shortName('Ibuprofen 200mg'), 'Ibuprofen');
});

test('실제로 읽어 본 안과 처방전', () => {
  // 라고스 안과 병원의 공개(CC0) 처방전. 이 앱이 손글씨 시험에 쓴 그 종이다.
  assert.equal(shortName('G. Azopt 8hrly'), 'G. Azopt');
  assert.equal(shortName('G. Combigan 12mg'), 'G. Combigan');
  assert.equal(shortName('G. Xalatan nocte'), 'G. Xalatan');
});

test('앞의 한두 글자는 안 뗀다', () => {
  /*
    `G.` 는 점안이다. 두 글자밖에 안 되면서 **먹는 것인지 눈에 넣는 것인지**를
    말한다 — 떼면 `Xalatan` 을 삼키라는 말로 읽힌다.
  */
  assert.match(shortName('G. Xalatan nocte'), /^G\./);
  assert.match(shortName('Cap. Amoxicillin 500mg'), /^Cap\./);
});

test('대문자 덩어리를 첫 글자만 대문자로', () => {
  // 대문자는 같은 글자 수에서 넓고, 윗선이 평평해서 낱말의 윤곽이 사라진다.
  assert.equal(shortName('AMOXICILLIN'), 'Amoxicillin');
  // 두 글자 약어는 그대로. 소문자로 만들면 다른 말이 된다.
  assert.equal(shortName('VITAMIN D3'), 'Vitamin D3');
});

test('규칙이 이름을 통째로 먹으면 원문을 돌려준다', () => {
  /*
    이 함수의 안전장치다. 이름 자체가 제형인 약이 있고 — `Eye drops` — 그때 규칙을
    그대로 적용하면 빈 문자열이 남는다. 빈 이름은 짧은 이름이 아니라 사라진 약이다.
  */
  assert.equal(shortName('Eye drops'), 'Eye drops');
  assert.equal(shortName('Tablets'), 'Tablets');
  assert.equal(shortName(''), '');
});

test('그래도 길면 낱말 경계에서 자른다', () => {
  // 글자 수로 자르면 `Amoxicilli…` 가 나오고, 그건 약 이름도 아니고 아무것도 아니다.
  const out = shortName('Amoxicillin Trihydrate Sodium Something', 22);
  assert.ok(out.length <= 23, out);
  assert.match(out, /…$/);
  // 낱말 경계에서 잘렸다 = 말줄임표 앞까지가 원문의 낱말 단위 앞부분이다.
  const kept = out.slice(0, -1);
  assert.ok('Amoxicillin Trihydrate Sodium Something'.startsWith(kept + ' '),
            `낱말 한가운데서 잘렸다: ${out}`);
});

test('한 낱말이 이미 길면 자르지 않는다', () => {
  // 잘린 약 이름보다 넘치는 약 이름이 낫다. 잘린 것은 다른 약처럼 보인다.
  assert.equal(shortName('Sulfamethoxazoletrimethoprim', 12), 'Sulfamethoxazoletrimethoprim');
});

test('짧은 이름은 건드리지 않는다', () => {
  assert.equal(shortName('Metformin'), 'Metformin');
  assert.equal(shortName('Insulin'), 'Insulin');
});
