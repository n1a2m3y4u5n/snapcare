import test from 'node:test';
import assert from 'node:assert/strict';

import { MAX_MONTHS_BACK, monthDays, monthOf } from './window.ts';

/*
  창을 넉 주에서 달로 옮기면서 생긴 산수. 틀리면 화면이 반쯤 빈 달력을 그리고,
  반만 채워진 달력은 "이때 안 먹었다" 로 읽힌다.
*/
void MAX_MONTHS_BACK;

test('달의 날짜를 빠짐없이 센다', () => {
  assert.equal(monthDays('2026-08').length, 31);
  assert.equal(monthDays('2026-02').length, 28);
  assert.equal(monthDays('2024-02').length, 29, '윤년');
  assert.equal(monthDays('2026-04').length, 30);
  assert.equal(monthDays('2026-08')[0], '2026-08-01');
  assert.equal(monthDays('2026-08').at(-1), '2026-08-31');
});

test('뒤로 가면 달이 넘어간다 — 연말도', () => {
  assert.equal(monthOf('2026-08-05', 0), '2026-08');
  assert.equal(monthOf('2026-08-05', 1), '2026-07');
  assert.equal(monthOf('2026-01-15', 1), '2025-12', '해를 넘어야 한다');
  assert.equal(monthOf('2026-03-31', 1), '2026-02', '31일에서 2월로 가도 안 흘러넘친다');
});

test('오늘을 아직 모를 때 던지지 않는다', () => {
  /*
    화면이 서버에서 먼저 그려질 때 오늘은 빈 문자열이다. 여기서 던지면 그 페이지의
    사전 렌더링이 통째로 실패한다 — 실제로 배포 빌드가 그 자리에서 깨졌다.
  */
  assert.equal(monthOf('', 0), '');
  assert.equal(monthOf('rubbish', 1), '');
  assert.deepEqual(monthDays(''), []);
});
