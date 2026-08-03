import test from 'node:test';
import assert from 'node:assert/strict';

import { extractRxInfo } from './ocr-to-macro.ts';

/**
 * OCR 글자에서 구조를 뽑는 부분.
 *
 * 이 함수는 카메라가 읽은 글자를 판정 엔진과 그림 엔진이 쓰는 값으로 바꾼다. 여기서
 * 놓친 것은 뒤에서 되살아나지 않는다 — 금기를 못 읽으면 임신부에게 'Safe' 가 뜨고,
 * 흔들라는 지시를 못 읽으면 그림에도 소리에도 그 말이 없다.
 *
 * 시험이 없던 파일이다. 아래 넷 중 셋은 여기서 실제로 났던 결함을 잠그는 것이고,
 * 그 결함들은 전부 "조용히 틀린 값을 내보내는" 종류였다.
 */

test('현탁액·시럽에서 "흔들라"를 읽어낸다', () => {
  // 2026년 8월 조사에서 약국 실무 응답자가 빠진 특별 지시로 처음 꼽은 것이다.
  // 현탁액에서 흔들기는 예의가 아니라 용량이다 — 가라앉은 채로 따르면 앞쪽 몇
  // 회분은 묽고 바닥 쪽은 진하다. 같은 5 mL 를 재도 들어가는 약의 양이 달라진다.
  for (const t of [
    '잘 흔들어서 복용하십시오',
    'Shake well before use',
    'Amoxicillin suspension 125mg/5mL',
    '아목시실린 현탁액',
  ]) {
    assert.equal(extractRxInfo(t).needsShake, true, `못 읽음: ${t}`);
  }
});

test('흔들 필요가 없는 약에는 붙이지 않는다', () => {
  // 없는 지시를 그리면 그림 한 칸이 낭비되는 것으로 끝나지 않는다. 캡슐을 흔들라는
  // 그림을 본 사람은 이 앱이 무엇을 말하는지 다시 의심하게 된다.
  assert.equal(extractRxInfo('Amoxicillin 500mg capsule, take one three times a day').needsShake, false);
  assert.equal(extractRxInfo('타이레놀정 500mg 1일 3회').needsShake, false);
});

test('"Do not refrigerate" 를 냉장으로 읽지 않는다', () => {
  // 보관 지시가 통째로 뒤집히던 자리. 이 값은 그림과 음성 양쪽으로 그대로 나간다.
  assert.equal(extractRxInfo('Store below 25 C. Do not refrigerate.').storageType, 'room');
  assert.equal(extractRxInfo('Keep refrigerated (2-8 C). Do not freeze.').storageType, 'refrigerator');
});

test('오독된 금기도 잡는다', () => {
  // Tesseract 가 "breastfeeding" 을 "breastizeding" 으로 읽어 수유 금기가 판정
  // 엔진에 도달하지 못한 적이 있다. 금기는 이 파일에서 가장 관대해야 하는 자리다.
  assert.ok(extractRxInfo('Not for use in pregnancy').contraindications.includes('pregnant'));
  assert.ok(extractRxInfo('Caution if breastizeding').contraindications.includes('breastfeeding'));
});

test('안약은 손을 씻으라고 한다', () => {
  assert.equal(extractRxInfo('Instil 1 drop into each eye').needsHandwash, true);
  assert.equal(extractRxInfo('Take one tablet daily').needsHandwash, false);
});
