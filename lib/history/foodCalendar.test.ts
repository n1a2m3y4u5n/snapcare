import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MAX_SEGMENTS, foodCalendar, foodDaySentence } from './foodCalendar.ts';
import { MAX_SEGMENTS as DOSE_MAX } from './calendar.ts';
import type { Level, ScanRecord } from '../snapcare/types.ts';

const TODAY = '2026-08-04';

function scan(dayKey: string, level: Level, kind: ScanRecord['kind'] = 'food'): ScanRecord {
  return {
    id: `${dayKey}-${level}-${Math.random()}`,
    itemId: 'x', name: 'Something', kind, emoji: '🍎',
    memberId: 'm1', level, timeLabel: '2:00 PM', dayKey,
  } as ScanRecord;
}

test('두 달력이 같은 한도를 쓴다', () => {
  // 한 화면에서 배운 그림이 다른 화면에서 그대로 읽혀야 한다. 조각이 갈라지는
  // 지점이 서로 다르면 같은 개수의 날이 두 화면에서 다르게 생긴다.
  assert.equal(MAX_SEGMENTS, DOSE_MAX);
});

test('하루가 한 칸이고 그 날 확인한 것들이 칸 안에 들어간다', () => {
  const days = foodCalendar(
    [scan(TODAY, 'safe'), scan(TODAY, 'avoid'), scan('2026-08-03', 'safe')],
    TODAY, 'm1', 3);
  const today = days.at(-1)!;
  assert.equal(today.levels.length, 2);
});

test('나쁜 것이 위로 온다', () => {
  // 하루에 조각 하나만 눈에 들어오더라도 그것이 회피여야 한다.
  const days = foodCalendar(
    [scan(TODAY, 'safe'), scan(TODAY, 'caution'), scan(TODAY, 'avoid')], TODAY, 'm1', 1);
  assert.deepEqual(days[0].levels, ['avoid', 'caution', 'safe']);
});

test('약은 이 달력에 안 들어간다', () => {
  // 복약은 자기 달력을 갖고 있고, 여기 섞이면 "오늘 세 가지 먹었다" 가 음식 셋이
  // 아니라 음식 하나와 약 둘이 된다.
  const days = foodCalendar(
    [scan(TODAY, 'safe'), scan(TODAY, 'safe', 'medicine')], TODAY, 'm1', 1);
  assert.equal(days[0].levels.length, 1);
});

test('오래된 날이 앞에 오고, 빈 날도 칸을 갖는다', () => {
  const days = foodCalendar([scan(TODAY, 'safe')], TODAY, 'm1', 3);
  assert.deepEqual(days.map((d) => d.dayKey),
    ['2026-08-02', '2026-08-03', '2026-08-04']);
  assert.equal(days[0].levels.length, 0);
  assert.equal(days[0].countable, false);
});

test('칸마다 읽어 줄 말이 있다', () => {
  const one = foodCalendar([scan(TODAY, 'avoid')], TODAY, 'm1', 1)[0];
  assert.match(foodDaySentence(one), /1 to avoid/);
  const none = foodCalendar([], TODAY, 'm1', 1)[0];
  assert.match(foodDaySentence(none), /nothing checked/);
});
