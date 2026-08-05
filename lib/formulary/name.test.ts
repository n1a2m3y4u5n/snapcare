import test from 'node:test';
import assert from 'node:assert/strict';

import { cleanDrugName, plausibleName } from './name.ts';

/*
  이 파일이 막는 것은 하나다: **약 이름 자리에 약 이름이 아닌 것이 앉는 것.**

  아래 두 문자열은 지어낸 예가 아니라 화면에 실제로 뜬 것이다. 이름이 잘못 들어가면
  그 위에 문장이 지어지고 소리로도 나가므로, 사람은 자기가 무슨 약을 쥐고 있는지에
  대해 틀린 말을 듣는다.
*/
test('OCR 잡음은 약 이름이 아니다', () => {
  assert.equal(plausibleName('Sr" 77 eam TR v Spent ee —— eee errr error ——'), false);
  assert.equal(plausibleName('eee errr error'), false);
  // 같은 글자가 셋 잇달아 오는 말을 사람은 안 쓴다.
  assert.equal(plausibleName('Amoxxxicillin'), false);
  // 한 글자짜리 조각이 섞인 것은 낱말이 아니라 부스러기다.
  assert.equal(plausibleName('TR v Spent'), false);
});

test('종이에 인쇄된 말은 떼어낸다 — 버리는 게 아니라', () => {
  // 맨 위 제목이 이름칸 크롭에 걸린 경우. 앞의 진짜 이름은 살아야 한다.
  assert.equal(cleanDrugName('Acetaminophen Pill Dispenser Schedule'), 'Acetaminophen');
  assert.equal(plausibleName('Acetaminophen Pill Dispenser Schedule'), true);
  // 인쇄된 말만 남으면 이름이 아니다.
  assert.equal(plausibleName('PILL DISPENSER SCHEDULE'), false);
  assert.equal(plausibleName('Medication name'), false);
});

test('진짜 약 이름은 통과한다 — 표에 없는 것도', () => {
  for (const n of ['Amoxicillin', 'Rosuvastatin', 'Co-trimoxazole', 'ORS',
    'Amoxicillin 500mg', 'Amoxicillin clavulanate 500mg', 'Timolol eye drops']) {
    assert.equal(plausibleName(n), true, `막히면 안 된다: ${n}`);
  }
});

test('함량 표기는 이름의 일부로 남긴다', () => {
  // 사람은 이 숫자를 포장지에서 찾는다. 지우면 맞춰 볼 것이 없어진다.
  assert.equal(cleanDrugName('Amoxicillin 500mg'), 'Amoxicillin 500mg');
});
