import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recentDays, dailySeries, summarize, trackingSentence, watchedFor, recentWeeks, weeklySeries, weeklySentence } from './tracking.ts';

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

test('조건이 있으면 조건이 무엇을 볼지 정한다', () => {
  assert.equal(watchedFor(['diabetic'])[0].key, 'sugars');
  assert.equal(watchedFor(['hypertension'])[0].key, 'salt');
  assert.equal(watchedFor(['diabetic', 'hypertension']).length, 2);
});

test('조건이 없어도 지켜볼 것을 준다 — 화면이 통째로 사라지지 않는다', () => {
  // 예전에는 빈 배열이었고, 그러면 추세 화면이 아예 안 떴다. 진단이 없는 사람도
  // 어제보다 오늘 덜 먹었는지는 알 수 있어야 한다 — 그게 진단을 늦추는 길이다.
  const none = watchedFor([]);
  assert.equal(none.length, 2);
  assert.deepEqual(none.map((w) => w.key).sort(), ['salt', 'sugars']);

  // 추적 대상이 아닌 조건만 있는 경우도 같다.
  assert.equal(watchedFor(['peanut_allergy']).length, 2);
});

test('조건이 정한 것이 기본을 덮는다 — 같은 영양소를 두 줄로 그리지 않는다', () => {
  const diabetic = watchedFor(['diabetic']);
  assert.equal(diabetic.length, 1);
  assert.equal(diabetic[0].key, 'sugars');
});

test('주는 하루 평균이지 합이 아니다', () => {
  // 사흘 찍은 주와 이레 찍은 주를 합으로 견주면 많이 찍은 주가 나쁜 주로 보인다.
  // 앱을 열심히 쓴 것에 벌을 주는 셈이고, 그러면 다음 주에 덜 찍는다.
  const weeks = recentWeeks('2026-08-03', 2);
  const busy = new Set(weeks[1]);                       // 최근 주는 이레 다 찍었다
  const sparse = new Set([weeks[0][0], weeks[0][1]]);   // 그 전 주는 이틀만
  const pts = weeklySeries(weeks, 50, (d) =>
    busy.has(d) ? 10 : sparse.has(d) ? 10 : null);
  assert.equal(pts[0].average, 10);
  assert.equal(pts[1].average, 10);   // 합이었다면 20 대 70 으로 갈렸을 것이다
  assert.equal(pts[0].logged, 2);
  assert.equal(pts[1].logged, 7);
});

test('기록이 없는 주는 0 이 아니라 빈칸이다', () => {
  const weeks = recentWeeks('2026-08-03', 3);
  const pts = weeklySeries(weeks, 50, () => null);
  assert.deepEqual(pts.map((p) => p.average), [null, null, null]);
});

test('장기 문장은 방향을 말하되, 흔들림은 방향이라고 하지 않는다', () => {
  const weeks = recentWeeks('2026-08-03', 4);
  const half = new Set([...weeks[0], ...weeks[1]]);
  // 앞 두 주 많이, 뒤 두 주 적게 → 내려가는 중
  const down = weeklySeries(weeks, 50, (d) => (half.has(d) ? 40 : 5));
  assert.match(weeklySentence('Sugar', down), /going down/i);
  // 거의 같으면 방향을 말하지 않는다
  const flat = weeklySeries(weeks, 50, () => 20);
  assert.match(weeklySentence('Sugar', flat), /about the same/i);
  // 한 주뿐이면 아직 말할 수 없다
  const one = weeklySeries(recentWeeks('2026-08-03', 4), 50,
    (d) => (weeks[3].includes(d) ? 20 : null));
  assert.match(weeklySentence('Sugar', one), /Not enough/i);
});

test('열두 주는 보관 기간 안이다', () => {
  // 기록은 90일 뒤 지워진다(lib/snapcare/retention.ts). 그보다 멀리 물으면 빈칸만 온다.
  const weeks = recentWeeks('2026-08-03', 12);
  assert.equal(weeks.length, 12);
  assert.equal(weeks.flat().length, 84);
});
