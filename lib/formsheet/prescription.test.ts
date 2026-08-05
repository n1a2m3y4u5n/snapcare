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

/*
  전에는 이 자리에 "이름을 못 맞히면 항목을 만들지 않는다" 가 있었다. 이름을 지어낼까
  봐 그랬는데, 지어내지 않는 방법이 하나 더 있다 — **읽은 글자를 그대로 쓰고 확신을
  끄는 것**. 통째로 거부하면 종이에서 읽힌 나머지(일정·개수·주의)까지 같이 사라지고,
  그 사람은 종이를 스스로 못 읽어서 여기 온 사람이다.
*/
test('표에 없는 약이어도 항목을 만든다 — 대신 초록을 안 켠다', () => {
  const rx = readPrescription(SHEET, 'Rosuvastatin', '1');
  assert.equal(rx.drug, null, '전제: 표에 없다');
  assert.equal(rx.unread, false, '전제: 글자는 읽혔다');

  const item = toScanItem(rx);
  assert.ok(item, '종이가 통째로 거부되면 안 된다');
  assert.equal(item.name, 'Rosuvastatin', '읽은 글자 그대로 — 종이와 맞춰 볼 수 있어야 한다');
  assert.equal(item.unidentified, true, '확신을 끈다 — 판정 엔진이 이 값으로 초록을 막는다');
  assert.equal(item.rx?.form, undefined, '모르는 약의 제형을 지어내지 않는다');
  // 버려지던 것들. 이것이 이 변경의 요점이다.
  assert.ok(item.rx?.schedule.length, '일정이 살아 있어야 한다');
  assert.equal(item.rx?.doseCount, 1, '개수가 살아 있어야 한다');
  // 이 문장이 화면에서 "언제 몇 알" 을 말하는 유일한 자리이고, 소리도 이것을 읽는다.
  assert.match(item.rx?.dosageText ?? '', /^Rosuvastatin will drop from layer 3, 8:00 AM everyday\./);
  assert.match(item.rx?.dosageText ?? '', /Take 1 each time\./);
});

test('글자조차 못 읽었으면 만들지 않는다 — 그때는 다시 찍는 문제다', () => {
  const rx = readPrescription(SHEET, 'x');
  assert.equal(rx.unread, true);
  assert.equal(toScanItem(rx), null, '부를 이름이 없으면 화면에 띄울 물건이 없다');
});

test('표에 있으면 확신을 지우지 않는다', () => {
  const item = toScanItem(readPrescription(SHEET, 'Amoxicillin'));
  assert.ok(item);
  assert.equal(item.unidentified, undefined);
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
  assert.match(say, /^Amoxicillin will drop from layer 3/);
  assert.match(say, /7:00 AM/);
  assert.match(say, /on Monday, Tuesday and Wednesday/);
  assert.match(say, /Take 2 each time/);
  assert.match(say, /disabled after 30 days/);
});

test('이레가 다 표시되면 everyday 다', () => {
  /*
    옮겨 온 파이썬은 `len > 4` 에 먼저 걸려서 이레를 "everyday except 이레 전부" 로
    적었고, `everyday` 가지는 닿을 수 없었다. 매일 먹는 약이 매일 빼는 약이 된다.
  */
  const say = scheduleSentence(readPrescription(SHEET, 'Metformin'));
  assert.match(say, /everyday\./);
  assert.doesNotMatch(say, /except/);
});

test('닷새면 빠진 이틀을 적는다 — 있는 날이 아니라', () => {
  /*
    옮겨 온 파이썬은 여기서 뜻이 정확히 뒤집혔다. 표시된 다섯 날을 "빼는 날" 로
    적어서, 평일에 먹는 약이 평일에 빼는 약이 됐다.
  */
  const say = scheduleSentence(readPrescription(
    { layer: '1', days: ['MON', 'TUE', 'WED', 'THU', 'FRI'], duration: '7d', hour: '12' },
    'Metformin'));
  assert.match(say, /everyday except Saturday and Sunday/);
});

test('끝이 없는 처방에는 끝나는 말을 안 붙인다', () => {
  const say = scheduleSentence(readPrescription({ ...SHEET, duration: 'ongoing' }, 'Metformin'));
  assert.doesNotMatch(say, /disabled/);
});

test('자정과 정오를 0시·12시로 읽지 않는다', () => {
  // 12시간제에서 0시는 12 AM 이고 12시는 12 PM 이다. 옮겨 온 파이썬이 그 둘을
  // 따로 다룬 이유가 그것이고, 여기서도 따로 다룬다.
  assert.match(scheduleSentence(readPrescription({ ...SHEET, hour: '0' }, 'Metformin')), /12:00 AM/);
  assert.match(scheduleSentence(readPrescription({ ...SHEET, hour: '12' }, 'Metformin')), /12:00 PM/);
  assert.match(scheduleSentence(readPrescription({ ...SHEET, hour: '19' }, 'Metformin')), /7:00 PM/);
});

test('요일을 약자로 읽지 않는다', () => {
  /*
    이 문장이 존재하는 이유가 **소리로 듣는 것**이다. 음성 합성기는 `MON` 을 "먼"
    이라고 읽는다. 눈으로만 볼 문장이면 약자가 짧아서 낫지만 이 문장은 그런 문장이
    아니다.
  */
  const say = scheduleSentence(readPrescription(
    { layer: '1', days: ['MON'], duration: '7d', hour: '8' }, 'Metformin'));
  assert.match(say, /Monday/);
  assert.doesNotMatch(say, /\bMON\b/);
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


/*
  표에 없는 약을 조회로 보완하는 경로.

  이 시험들이 지키는 것은 "채운다" 가 아니라 **"무엇을 안 받는가"** 다. 검증 안 된
  출처에서 온 값이 사람이 쓴 표를 덮거나 경고를 지우면, 그 조용한 덮어쓰기는
  화면에 아무 표시도 안 남는다.
*/
const LOOKUP = {
  known: true, name: 'Rosuvastatin', inn: 'rosuvastatin', form: 'tablet' as const,
  flags: ['unsafe_pregnancy' as const], handwash: false, shake: false,
  storage: 'room' as const, purpose: 'This medicine lowers cholesterol.', confident: true,
};

test('조회가 제형·경고·용도를 채운다 — 그래도 초록은 안 켠다', () => {
  const item = toScanItem(readPrescription(SHEET, 'Rosuvastatin', '1'), LOOKUP);
  assert.ok(item);
  assert.equal(item.rx?.form, 'tablet');
  assert.ok(item.flags.includes('unsafe_pregnancy'), '임신 금기가 판정까지 가야 한다');
  assert.ok(item.rx?.notes?.includes('This medicine lowers cholesterol.'));
  // 초록을 막는 값은 그대로. 조회는 확신을 주지 않는다.
  assert.equal(item.unidentified, true);
  assert.equal(item.lookedUp, true, '문구를 가르려면 이 값이 필요하다');
});

test('표에서 맞은 약에는 조회를 안 섞는다 — 사람이 쓴 것이 이긴다', () => {
  const poison = { ...LOOKUP, name: 'WRONG', form: 'cream' as const, purpose: 'nonsense.' };
  const item = toScanItem(readPrescription(SHEET, 'Amoxicillin', '1'), poison);
  assert.ok(item);
  assert.equal(item.name, 'Amoxicillin');
  assert.notEqual(item.rx?.form, 'cream');
  assert.equal(item.unidentified, undefined);
  assert.equal(item.lookedUp, undefined);
});

test('조회는 경고를 더하기만 한다 — 종이가 적은 것을 못 지운다', () => {
  const noFlags = { ...LOOKUP, flags: [] as never[] };
  // 종이의 Notes 칸이 금주를 적었다. 조회가 조용히 지우면 안 된다.
  const rx = readPrescription(SHEET, 'Rosuvastatin', '1', 'Do not drink alcohol');
  assert.ok(rx.notes.flags.includes('alcohol'), '전제: 종이가 금주를 적었다');
  const item = toScanItem(rx, noFlags);
  assert.ok(item?.flags.includes('alcohol'));
});

test('못 알아본 조회는 없는 것과 같다', () => {
  const item = toScanItem(readPrescription(SHEET, 'Rosuvastatin', '1'),
    { ...LOOKUP, known: false });
  assert.ok(item);
  assert.equal(item.name, 'Rosuvastatin', '읽은 글자가 남는다');
  assert.equal(item.lookedUp, undefined);
});
