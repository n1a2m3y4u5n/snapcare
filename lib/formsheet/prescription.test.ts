import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readCount, readPrescription, toScanItem } from './prescription.ts';
import type { FormSheetValues } from '../hardware/formSheet.ts';

const SHEET: FormSheetValues = {
  layer: '3',
  days: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
  duration: '7d',
  hour: '8',
};

test('종이 한 장이 여섯 가지를 다 답한다', () => {
  /*
    이 시험이 이 기능의 정의다. 처방전을 찍으면 나와야 하는 것 여섯 —
    이름, 그림(제형과 경고), 몇 번째 층, 무슨 요일, 며칠치, 몇 시.
  */
  const rx = readPrescription(SHEET, 'Amoxicillin 500mg', '2');
  const item = toScanItem(rx)!;

  assert.equal(item.name, 'Amoxicillin');            // 이름
  assert.equal(item.rx?.form, 'capsule');            // 그림의 머리
  assert.equal(rx.schedule.schedule[0].slot, 3);     // 몇 번째 층
  assert.equal(rx.schedule.schedule[0].days, 127);   // 매일
  assert.equal(rx.schedule.schedule[0].durationDays, 7);
  assert.equal(item.rx?.schedule[0].time, '08:00');  // 몇 시
  assert.equal(item.rx?.doseCount, 2);
});

test('제형이 그림의 특별 지시까지 정한다', () => {
  /*
    표가 제형을 아니까 여기서 나온다. OCR 이 "쓰기 전에 손을 씻으시오" 를 못 읽어도
    안약이면 손 씻기가 붙고, 시럽이면 흔들기가 붙는다 — 현탁액에서 흔드는 것은
    예의가 아니라 **용량**이다.
  */
  const eye = toScanItem(readPrescription(SHEET, 'Timolol'))!;
  assert.equal(eye.rx?.form, 'eyedrop');
  assert.equal(eye.rx?.handwash, true);

  const syrup = toScanItem(readPrescription(SHEET, 'Oral rehydration salts'))!;
  assert.equal(syrup.rx?.form, 'sachet');
  assert.equal(syrup.rx?.shake, false);
});

test('표의 경고가 판정 플래그로 넘어간다', () => {
  // 임신 금기가 종이에는 없고 표에만 있다. 그것이 판정 엔진까지 가야 임신한
  // 사람에게 빨간 화면이 뜬다.
  const item = toScanItem(readPrescription(SHEET, 'Enalapril'))!;
  assert.ok(item.flags?.includes('unsafe_pregnancy'));
});

test('못 읽은 것과 목록에 없는 것을 가른다', () => {
  /*
    두 경우에 사람이 할 일이 다르다. 글자가 안 나왔으면 다시 찍는 것이고, 글자는
    나왔는데 표에 없으면 다시 찍어 봐야 소용이 없다 — 손으로 골라야 한다.
    한 가지 말로 뭉치면 반은 헛걸음을 한다.
  */
  const blank = readPrescription(SHEET, '   ');
  assert.equal(blank.drug, null);
  assert.equal(blank.unread, true, '빈 칸은 다시 찍는 문제다');

  const notListed = readPrescription(SHEET, 'Rosuvastatin');
  assert.equal(notListed.drug, null);
  assert.equal(notListed.unread, false, '읽히긴 했으니 다시 찍을 일이 아니다');
  assert.equal(notListed.read, 'Rosuvastatin', '무엇으로 읽었는지 화면이 보여줘야 한다');
});

test('이름을 못 맞히면 항목을 만들지 않는다', () => {
  // 이름을 지어내면 그림과 경고까지 지어낸 약의 것이 뜬다.
  assert.equal(toScanItem(readPrescription(SHEET, 'Rosuvastatin')), null);
});

test('버블을 안 채웠으면 항목을 만들지 않는다', () => {
  const noDays = readPrescription({ ...SHEET, days: [] }, 'Amoxicillin');
  assert.deepEqual(noDays.schedule.schedule, []);
  assert.equal(toScanItem(noDays), null);
  assert.ok(noDays.schedule.missing.includes('days'));
});

test('개수칸에서 함량을 개수로 읽지 않는다', () => {
  /*
    개수칸에 `500mg` 이라고 적는 사람이 있다. 그것을 개수로 쓰면 그림이 점 500개를
    그리려 든다. 한 번에 열 알을 먹는 처방은 없으므로, 그 위는 개수가 아니다.
  */
  assert.equal(readCount('2'), 2);
  assert.equal(readCount('2 tablets'), 2);
  assert.equal(readCount('500mg'), undefined);
  assert.equal(readCount(''), undefined);
  assert.equal(readCount('one'), undefined);
});

test('요일이 일부면 그 요일들이 칩에 적힌다', () => {
  const item = toScanItem(readPrescription({ ...SHEET, days: ['MON', 'WED', 'FRI'] }, 'Metformin'))!;
  const days = item.chips?.[1].label ?? '';
  assert.match(days, /Mon/);
  assert.match(days, /Wed/);
  assert.match(days, /Fri/);
  assert.doesNotMatch(days, /Tue/);
});
