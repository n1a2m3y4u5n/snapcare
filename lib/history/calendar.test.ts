import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MAX_SEGMENTS, calendar, daySentence, leadingBlanks } from './calendar.ts';
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
