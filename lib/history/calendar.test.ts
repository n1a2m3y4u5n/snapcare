import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DAY_PARTS, MAX_SEGMENTS, calendar, daySentence, leadingBlanks, partOf, trailingBlanks } from './calendar.ts';
import type { DoseRow } from './adherence.ts';

function dose(dayKey: string, taken: boolean): DoseRow {
  return { dayKey, due: '0800', taken, tray: 1, name: 'Compartment 1',
           reason: taken ? 'released' : 'not-released' };
}

const TODAY = '2026-08-04';   // 화요일

test('하루가 한 칸이고, 그 날의 횟수가 칸 안에 들어간다', () => {
  const days = calendar(
    [dose('2026-08-04', true), dose('2026-08-04', false), dose('2026-08-03', true)],
    TODAY, 3);

  assert.equal(days.length, 3);
  const today = days.at(-1)!;
  assert.deepEqual(
    { key: today.dayKey, offered: today.offered, taken: today.taken },
    { key: '2026-08-04', offered: 2, taken: 1 });
});

test('오래된 날이 앞에 온다', () => {
  // 달력은 왼쪽 위에서 오른쪽 아래로 읽는다. 시간이 거꾸로 흐르는 달력은 달력이 아니다.
  const days = calendar([], TODAY, 3).map((d) => d.dayKey);
  assert.deepEqual(days, ['2026-08-02', '2026-08-03', '2026-08-04']);
});

test('기록이 없는 날도 칸을 갖는다', () => {
  // 빠뜨리면 뒤의 날들이 요일을 하나씩 밀고 앉는다 — 격자는 그대로인데 전부 틀린다.
  const days = calendar([dose('2026-08-04', true)], TODAY, 3);
  assert.equal(days.length, 3);
  assert.equal(days[0].offered, 0);
});

test('셀 수 있을 때만 쪼갠다', () => {
  const few = calendar(
    Array.from({ length: MAX_SEGMENTS }, () => dose(TODAY, true)), TODAY, 1);
  assert.equal(few[0].countable, true);

  const many = calendar(
    Array.from({ length: MAX_SEGMENTS + 1 }, () => dose(TODAY, true)), TODAY, 1);
  assert.equal(many[0].countable, false,
    '조각이 몇 픽셀이 되면 세는 척을 그만두고 게이지로 바꾼다');

  // 아무것도 없는 날은 쪼갤 것도 없다.
  assert.equal(calendar([], TODAY, 1)[0].countable, false);
});

test('첫 칸이 제 요일 아래에 앉는다', () => {
  // 요일이 세로로 줄지 않으면 "주말마다 저녁을 거른다" 가 안 보이고, 그것이 이
  // 화면을 격자가 아니라 달력으로 만드는 이유의 절반이다.
  assert.equal(leadingBlanks('2026-08-02'), 0);   // 일요일
  assert.equal(leadingBlanks('2026-08-04'), 2);   // 화요일
});

test('칸마다 소리로 읽을 말이 있다', () => {
  const days = calendar([dose(TODAY, true), dose(TODAY, false)], TODAY, 1);
  assert.match(daySentence(days[0]), /1 of 2/);
  assert.match(daySentence(calendar([], TODAY, 1)[0]), /nothing from the box/);
});

// ── 때 ──────────────────────────────────────────────────────────────────────

test('칸 안이 시각 순으로 늘어선다', () => {
  /*
    이것이 이 기능의 핵심이다. 예전에는 그리는 쪽이 먹은 것을 위에서부터 채웠고,
    그래서 **아침을 거르고 저녁을 먹은 날이 아침을 먹고 저녁을 거른 날과 똑같이
    생겼다.** 두 날은 전혀 다른 날이고, 어느 쪽인지가 이 화면을 보는 이유다.
  */
  const at = (due: string, taken: boolean): DoseRow =>
    ({ dayKey: TODAY, due, taken, tray: 1, name: 'x', reason: taken ? 'released' : 'not-released' });

  const morningMissed = calendar([at('1900', true), at('0800', false)], TODAY, 1);
  const eveningMissed = calendar([at('0800', true), at('1900', false)], TODAY, 1);

  assert.deepEqual(morningMissed[0].slots.map((s) => [s.part, s.taken]),
                   [['morning', false], ['evening', true]]);
  assert.deepEqual(eveningMissed[0].slots.map((s) => [s.part, s.taken]),
                   [['morning', true], ['evening', false]]);
  // 두 날의 조각 차례가 같고 채움만 다르다 — 그림이 갈리는 것은 그래서다.
  assert.notDeepEqual(morningMissed[0].slots.map((s) => s.taken),
                      eveningMissed[0].slots.map((s) => s.taken));
});

test('셋이 하루를 빠짐없이 덮는다', () => {
  /*
    넷이었다 — 밤이 따로 있었다. 6×12px 짜리 조각에서 넷을 갈라내는 것은 눈이
    안정적으로 못 하는 일이고, 범례가 안 배워지면 색을 나눈 일 자체가 헛일이 된다.

    셋으로 줄이면서 **덮는 것이 더 중요해졌다.** 넷일 때는 밤이 나머지를 받았는데,
    이제 저녁이 그 일을 한다. 어느 시각이 아무 때에도 안 들면 그 복용은 화면에서
    사라진다.
  */
  for (let h = 0; h < 24; h++) {
    const part = partOf(`${String(h).padStart(2, '0')}00`);
    assert.notEqual(part, 'unknown', `${h}시가 어느 때에도 안 든다`);
  }
  assert.equal(partOf('0500'), 'morning');
  assert.equal(partOf('1059'), 'morning');
  assert.equal(partOf('1100'), 'midday');
  assert.equal(partOf('1659'), 'midday');
  assert.equal(partOf('1700'), 'evening');
  // 밤에 먹는 약은 저녁에 든다. 안압약의 `nocte` 처방이 실제로 있고, 그것을
  // "저녁" 이라고 부르는 것은 틀린 말이 아니다.
  assert.equal(partOf('2200'), 'evening');
  assert.equal(partOf('0300'), 'evening');
});

test('범례에 실리는 때가 셋이다', () => {
  // 색을 외워야 하는 자리라 개수가 곧 비용이다.
  assert.equal(DAY_PARTS.length, 3);
});

test('거른 것이 어느 때였는지 소리로도 말한다', () => {
  // 눈으로 읽는 사람과 귀로 듣는 사람이 다른 사실을 받으면 그 둘은 같은 화면을 본
  // 것이 아니다. 색으로 때를 보이기로 한 이상 소리도 때를 말해야 한다.
  const day = calendar(
    [{ dayKey: TODAY, due: '0800', taken: true, tray: 1, name: 'x', reason: 'released' },
     { dayKey: TODAY, due: '1900', taken: false, tray: 2, name: 'x', reason: 'not-released' }],
    TODAY, 1)[0];
  assert.match(daySentence(day), /evening one was missed/);
});

test('시각을 못 읽으면 아무 때로도 부르지 않는다', () => {
  /*
    처음에는 못 읽는 값을 `night` 으로 떨어뜨렸다. 그러면 시각이 비어 온 기록이
    화면에서 **밤에 먹은 약**이 되고, 그것을 알아챌 방법이 없다. 이 저장소가 세
    군데에서 되풀이해 적어 둔 규칙이 그것이다 — 그럴듯한 틀린 값이 물음표보다 나쁘다.
  */
  assert.equal(partOf(''), 'unknown');
  assert.equal(partOf('8'), 'unknown');
  assert.equal(partOf('8 PM'), 'unknown');
  assert.equal(partOf('9900'), 'unknown');
  assert.equal(partOf(undefined as unknown as string), 'unknown');
});

test('때를 모르는 것은 거른 이유로 말하지 않는다', () => {
  // "The unrecorded one was missed" 는 문장이 아니다. 모르는 것에 대해서는 숫자만 말한다.
  const day = calendar(
    [{ dayKey: TODAY, due: '', taken: false, tray: 1, name: 'x', reason: 'not-released' },
     { dayKey: TODAY, due: '0800', taken: true, tray: 2, name: 'x', reason: 'released' }],
    TODAY, 1)[0];
  assert.match(daySentence(day), /1 of 2 doses/);
  assert.doesNotMatch(daySentence(day), /unrecorded/);
});

/*
  아직 시각이 안 온 복용은 **실패가 아니다.**

  `taken: false` 를 전부 거른 것으로 그리고 있었다. 그래서 아침에 앱을 열면 오늘
  저녁 약이 이미 실패로 칠해져 있었다 — 아직 일어나지도 않은 일을 나무라는 화면이고,
  매일 아침 그것을 보는 사람에게는 앱이 자기를 못 미더워하는 것으로 읽힌다.
*/
test('오늘 아직 안 온 복용은 거른 것과 갈린다', () => {
  const rows = [
    { dayKey: '2026-08-05', due: '0800', taken: true },
    { dayKey: '2026-08-05', due: '1900', taken: false },   // 정오 기준 아직
    { dayKey: '2026-08-04', due: '1900', taken: false },   // 어제 — 진짜 거름
  ] as never[];
  const days = calendar(rows, '2026-08-05', 3, '2026-08-05', '1200');
  const today = days.find((d) => d.today)!;
  const yesterday = days.find((d) => d.dayKey === '2026-08-04')!;

  assert.equal(today.pending, 1, '오늘 저녁은 아직 안 온 것이다');
  assert.equal(today.slots.find((s) => s.due === '1900')!.pending, true);
  assert.equal(yesterday.pending, 0, '지난 날의 빈 자리는 그냥 거른 것이다');
  assert.equal(yesterday.slots[0].pending, false);
});

test('시각이 지나면 거른 것이 된다', () => {
  const rows = [{ dayKey: '2026-08-05', due: '0800', taken: false }] as never[];
  const days = calendar(rows, '2026-08-05', 1, '2026-08-05', '1200');
  assert.equal(days[0].pending, 0, '8시가 지났으면 더는 기다리는 것이 아니다');
});

/*
  달력이 달력으로 보이려면 **마지막 줄도 그 주 끝까지** 있어야 한다.

  창이 오늘에서 끝나므로 마지막 줄이 주 중간에서 뚝 끊겼다. 앞의 빈 칸은 이미 그리고
  있었으니 같은 이유가 뒤에도 있었던 셈이고, 한쪽만 하고 있었다. 실제로 "캘린더가
  오늘 날짜가 안 맞는 것 같다" 는 말을 들었다.
*/
test('마지막 날 뒤에 그 주의 남은 칸 수를 센다', () => {
  // 2026-08-05 는 수요일(getUTCDay 3). 목·금·토 셋이 남는다.
  assert.equal(trailingBlanks('2026-08-05'), 3);
  // 토요일이면 남는 것이 없다.
  assert.equal(trailingBlanks('2026-08-08'), 0);
  // 일요일이면 여섯.
  assert.equal(trailingBlanks('2026-08-09'), 6);
});

test('앞뒤 빈 칸을 더하면 언제나 일곱의 배수다', () => {
  // 이것이 깨지면 격자가 어긋나고, 어긋난 격자에서는 세로줄이 요일을 안 가리킨다.
  for (const [first, last, n] of [
    ['2026-07-09', '2026-08-05', 28],
    ['2026-08-01', '2026-08-08', 8],
    ['2026-08-09', '2026-08-09', 1],
  ] as [string, string, number][]) {
    const total = leadingBlanks(first) + n + trailingBlanks(last);
    assert.equal(total % 7, 0, `${first}..${last} 에서 격자가 어긋난다 (${total})`);
  }
});

/*
  창이 **달**이다.

  넉 주짜리 창이 화면에서 달로 읽혔다 — 일곱 칸 격자에 요일 머리글자가 붙어 있으면
  사람은 1일에서 시작해 말일에서 끝나는 것을 보는데, 이 앱은 칸에 날짜 숫자를 안 써서
  (글을 못 읽는 사람이 쓴다) 어긋난 것을 바로잡을 단서가 화면에 없다. 실제로 나온
  말 — "지금 8월 5일인데 월말처럼 나온다".
*/
test('달을 주면 그 달의 모든 날을 그린다', () => {
  const days = calendar([], '2026-08', 28, '2026-08-05');
  assert.equal(days.length, 31, '8월은 서른하루다');
  assert.equal(days[0].dayKey, '2026-08-01');
  assert.equal(days.at(-1)!.dayKey, '2026-08-31');
  assert.equal(days.filter((d) => d.today).length, 1);
  assert.equal(days.find((d) => d.today)!.dayKey, '2026-08-05');
});

test('달의 앞뒤 빈 칸을 더하면 일곱의 배수다', () => {
  for (const m of ['2026-08', '2026-02', '2024-02', '2026-11']) {
    const days = calendar([], m, 28, '2026-08-05');
    const total = leadingBlanks(days[0].dayKey) + days.length + trailingBlanks(days.at(-1)!.dayKey);
    assert.equal(total % 7, 0, `${m} 에서 격자가 어긋난다 (${total})`);
  }
});
