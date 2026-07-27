import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recentDays, dailySeries, summarize, trackingSentence, watchedFor } from './tracking.ts';

test('최근 N일을 오래된 것부터 낸다', () => {
  assert.deepEqual(recentDays('2026-03-03', 4),
    ['2026-02-28', '2026-03-01', '2026-03-02', '2026-03-03']);
});

test('월 경계를 넘어간다', () => {
  assert.deepEqual(recentDays('2026-01-02', 3), ['2025-12-31', '2026-01-01', '2026-01-02']);
});

test('기록이 없는 날은 0 이 아니라 null 이다', () => {
  // "먹은 게 없다" 와 "찍지 않았다" 를 같게 그리면 안 찍은 날이 잘 지킨 날로 보인다.
  const days = ['d1', 'd2'];
  const pts = dailySeries([], 'sugars', 50, days, (d) => (d === 'd1' ? 30 : null));
  assert.equal(pts[0].amount, 30);
  assert.equal(pts[0].pct, 60);
  assert.equal(pts[0].over, true);
  assert.equal(pts[1].amount, null);
  assert.equal(pts[1].pct, null);
  assert.equal(pts[1].over, false);
});

test('상한의 절반이 문턱이다 (compute.assess 와 같다)', () => {
  const pts = dailySeries([], 'sugars', 50, ['a', 'b'], (d) => (d === 'a' ? 24.9 : 25));
  assert.equal(pts[0].over, false);
  assert.equal(pts[1].over, true);
});

test('연속 일수는 안 찍은 날을 끊지도 잇지도 않는다', () => {
  const mk = (over: boolean | null) =>
    over === null
      ? { day: 'x', amount: null, pct: null, over: false }
      : { day: 'x', amount: 1, pct: over ? 60 : 10, over };
  // 넘김 → 안찍음 → 지킴 → 지킴  ⇒ 연속 2
  assert.equal(summarize([mk(true), mk(null), mk(false), mk(false)]).streak, 2);
  // 오늘 넘겼으면 연속 0
  assert.equal(summarize([mk(false), mk(false), mk(true)]).streak, 0);
  // 안 찍은 날만 있으면 0
  assert.equal(summarize([mk(null), mk(null)]).streak, 0);
});

test('요약은 기록이 있는 날만 센다', () => {
  const mk = (over: boolean | null) =>
    over === null
      ? { day: 'x', amount: null, pct: null, over: false }
      : { day: 'x', amount: 1, pct: over ? 60 : 10, over };
  const s = summarize([mk(true), mk(null), mk(false)]);
  assert.equal(s.logged, 2);
  assert.equal(s.over, 1);
});

test('한 문장 요약', () => {
  assert.match(trackingSentence('Sugar', { logged: 0, over: 0, streak: 0 }, 7), /No sugar recorded/);
  assert.match(trackingSentence('Sugar', { logged: 5, over: 0, streak: 5 }, 7), /stayed within the limit on all 5/);
  assert.match(trackingSentence('Salt', { logged: 6, over: 2, streak: 3 }, 7), /went over on 2 of 6/);
});

test('조건이 없으면 지켜볼 것도 없다', () => {
  assert.deepEqual(watchedFor([]), []);
  assert.deepEqual(watchedFor(['peanut_allergy']), []);   // 알레르기는 추적 대상이 아니다
  assert.equal(watchedFor(['diabetic'])[0].key, 'sugars');
  assert.equal(watchedFor(['hypertension'])[0].key, 'salt');
  assert.equal(watchedFor(['diabetic', 'hypertension']).length, 2);
});
