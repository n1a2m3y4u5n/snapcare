import { test } from 'node:test';
import assert from 'node:assert/strict';

import { forPictograms, readCount, readPrescription, scheduleSentence, toScanItem } from './prescription.ts';
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

// ── 약사가 적은 주의 ────────────────────────────────────────────────────────

test('Notes 칸의 주의가 그림과 판정 양쪽으로 간다', () => {
  /*
    종이가 이미 다 인쇄되어 있어 칸을 새로 팔 수 없다. 그런데 이 종이에는 폭 전체를
    쓰는 빈 줄이 처음부터 있었고 아무도 읽지 않고 있었다 — 약사가 봉투에 손으로
    적던 것을 거기 적으면 된다.
  */
  const rx = readPrescription(SHEET, 'Metformin', '1',
                              'After food. May cause drowsiness. No alcohol.');
  const item = toScanItem(rx)!;

  assert.deepEqual(item.rx?.care, ['with_food', 'drowsy']);
  assert.ok(item.flags?.includes('alcohol'), '금주는 판정까지 가야 한다');
});

test('표의 경고와 종이의 경고를 합친다', () => {
  /*
    둘 다 필요하다. 표는 그 약에 언제나 참인 것을 알고(ACE 억제제의 임신 금기),
    종이는 이 조제에만 해당하는 것을 안다(약사가 이 환자에게 적은 것).
  */
  const item = toScanItem(readPrescription(SHEET, 'Enalapril', '1', 'No alcohol'))!;
  assert.ok(item.flags?.includes('unsafe_pregnancy'), '표에서 온 것');
  assert.ok(item.flags?.includes('alcohol'), '종이에서 온 것');
});

test('못 알아들은 주의는 항목이 아니라 화면이 진다', () => {
  // 그림으로 못 그리는 것을 항목에 넣으면 그리는 쪽이 조용히 버린다. 화면이 글자로
  // 내야 하므로 `notes.unknown` 에 남는다.
  const rx = readPrescription(SHEET, 'Metformin', '1', 'Check blood sugar weekly');
  assert.deepEqual(rx.notes.unknown, ['Check blood sugar weekly']);
  assert.deepEqual(toScanItem(rx)!.rx?.care, []);
});

// ── 일정은 문장으로 ─────────────────────────────────────────────────────────

test('일정을 문장으로 말한다', () => {
  /*
    요일은 형태소가 아예 없고, `\time_morning` 한 장은 7시인지 9시인지를 못 말하고,
    30일치는 `\finish_course` 한 장으로 뭉개진다. 그림으로 옮기면 정확도를 잃으면서
    자리는 더 먹는다 — 그리고 글을 못 읽는 사람에게는 이미 소리가 있다.
  */
  const say = scheduleSentence(readPrescription(
    { layer: '3', days: ['MON', 'TUE', 'WED'], duration: '30d', hour: '7' },
    'Amoxicillin', '2'));
  assert.match(say, /Take 2/);
  assert.match(say, /Monday, Tuesday and Wednesday/);
  assert.match(say, /7 in the morning/);
  assert.match(say, /30 days/);
  assert.match(say, /tray 3/);
});

test('끝이 없는 처방은 없다고 말한다', () => {
  // 안 말하면 사람은 남은 날을 세려고 종이를 다시 본다.
  const say = scheduleSentence(readPrescription({ ...SHEET, duration: 'ongoing' }, 'Metformin'));
  assert.match(say, /no end date/);
});

test('오후 시각을 24시제로 읽지 않는다', () => {
  // "19시" 는 소리로 들으면 세어야 하는 숫자다. 시계를 못 읽는 사람이 쓰는 앱이다.
  const say = scheduleSentence(readPrescription({ ...SHEET, hour: '19' }, 'Metformin'));
  assert.match(say, /7 in the evening/);
  assert.doesNotMatch(say, /19/);
});

test('문장이 이미 말한 것을 그림이 다시 말하지 않는다', () => {
  /*
    `Take 2 ... at 7 in the morning` 옆에 `\qty_two` 와 `\time_morning` 이 나란히
    서면 같은 사실이 두 번이고, 그 둘은 서로를 확인해 주지도 않는다 — 그림 쪽이 덜
    정확하다. `time_morning` 은 7시인지 9시인지를 못 말한다.
  */
  const item = toScanItem(readPrescription(SHEET, 'Amoxicillin', '2'))!;
  const strip = forPictograms(item);
  assert.deepEqual(strip.rx?.schedule, []);
  assert.equal(strip.rx?.doseCount, undefined);
  // 원본은 안 건드린다 — 알람과 상자로 가는 것은 일정이 살아 있어야 한다.
  assert.equal(item.rx?.schedule.length, 1);
  assert.equal(item.rx?.doseCount, 2);
});

test('끝까지 먹으라는 것은 일정이 아니라 주의다', () => {
  /*
    문장의 "30일치가 있다" 와 `\finish_course` 는 다른 말이다. 앞은 몇 개가 있는가고
    뒤는 증상이 가셔도 끝까지 먹으라는 것이다 — 항생제 내성의 주요 경로가 그 지점이다.
  */
  const item = toScanItem(readPrescription(SHEET, 'Amoxicillin', '2'))!;
  assert.notEqual(forPictograms(item).rx?.durationText, 'ongoing');
});
