import test from 'node:test';
import assert from 'node:assert/strict';

import { byDay, dayLabel, daySentence } from './byDay.ts';
import { doseRows, adherence, adherenceSentence, clockOf, windowDays } from './adherence.ts';
import type { ScanRecord } from '../snapcare/types.ts';

const TODAY = '2026-08-03';
/*
  하루의 끝 시각을 **못 박는다.**

  `adherence` 는 아직 안 온 복용을 분모에서 빼는데, 그 판단이 "지금 몇 시인가" 에
  달려 있다. 시험이 그 기본값에 기대고 있어서 **밤 열한 시에 통과하던 것이 자정을
  넘기자 셋이 깨졌다** — 오후 일곱 시 복용이 갑자기 '아직 안 온 것' 이 됐기 때문이다.

  자료가 아니라 시계 때문에 답이 달라지는 시험은 같은 것을 두 번 확인해 주지 못한다.
  거른 복용을 말하려는 시험들이므로 그 날이 다 지난 시각으로 고정한다.
*/
const ENDOFDAY = '2359';

function food(dayKey: string, over: Partial<ScanRecord> = {}): ScanRecord {
  return {
    id: `f_${Math.abs(dayKey.length + Object.keys(over).length)}_${over.name ?? 'x'}_${dayKey}`,
    itemId: 'i1', name: over.name ?? 'Biscuit', kind: 'food', emoji: '🍪',
    memberId: 'me', level: 'safe', timeLabel: '2:00 PM', dayKey, ...over,
  };
}

function dose(dayKey: string, due: string, taken: boolean, over: Partial<ScanRecord> = {}): ScanRecord {
  return {
    id: `d_${dayKey}_${due}`, itemId: 'device_tray_1', name: 'Amoxicillin',
    kind: 'medicine', emoji: '💊', memberId: 'me',
    level: taken ? 'safe' : 'caution', timeLabel: `${due} `, dayKey,
    dose: { taken, due, tray: 1, reason: taken ? 'released' : 'not-released' },
    ...over,
  };
}

// ── 날짜별로 묶기 ────────────────────────────────────────────────────────────

test('최근 날이 먼저 온다', () => {
  const days = byDay([food('2026-07-30'), food(TODAY), food('2026-08-01')], TODAY);
  assert.deepEqual(days.map((d) => d.dayKey), [TODAY, '2026-08-01', '2026-07-30']);
});

test("시드 기록의 날짜 센티널을 실제 날짜로 옮긴다", () => {
  // 안 옮기면 문자열 정렬에서 't'·'y' 가 숫자보다 뒤라 목록 맨 아래에 따로 앉는다 —
  // 화면에서는 그것이 1970년보다 오래된 날처럼 보인다.
  //
  // 처음에는 'today' 만 확인했고, 그래서 'yesterday' 를 빠뜨린 채 통과했다. 데모
  // 계정에서 그 줄 하나가 목록 끝에 떨어져 앉는 것을 보고 알았다.
  const days = byDay([food('today'), food('yesterday'), food('2026-07-01')], TODAY);
  assert.deepEqual(days.map((d) => d.dayKey), [TODAY, '2026-08-02', '2026-07-01']);
});

test('음식과 약을 갈라 센다', () => {
  const [day] = byDay([food(TODAY), dose(TODAY, '0800', true), dose(TODAY, '1300', false)], TODAY);
  assert.equal(day.foods.length, 1);
  assert.equal(day.doses.length, 2);
  assert.equal(day.taken, 1);
  assert.equal(day.missed, 1);
});

test('사람이 직접 찍은 약은 복용 수에 안 들어간다', () => {
  // dose 가 없는 기록은 상자에서 온 것이 아니다. 분모에 넣으면 순응도가 늘 100%가
  // 된다 — 안 먹은 날에는 아무도 앱을 켜지 않으니까.
  const manual = food(TODAY, { kind: 'medicine', name: '내가 찍은 약' });
  const [day] = byDay([manual, dose(TODAY, '0800', true)], TODAY);
  assert.equal(day.doses.length, 1);
  assert.equal(day.foods.length, 0, '약은 음식 목록에도 안 들어가야 한다');
});

test('다른 사람 기록은 안 섞인다', () => {
  const days = byDay([food(TODAY), food(TODAY, { memberId: '아이' })], TODAY, 'me');
  assert.equal(days[0].records.length, 1);
});

test('회피와 몸 반응이 그날 줄에 표시된다', () => {
  const [day] = byDay([food(TODAY, { level: 'avoid' }), food(TODAY, { reaction: 'unwell' })], TODAY);
  assert.ok(day.hadAvoid);
  assert.ok(day.hadReaction);
});

// ── 날짜 이름 ────────────────────────────────────────────────────────────────

test('가까운 날은 이름으로 부른다', () => {
  // 날짜를 못 읽는 사람에게 2026-08-02 는 아무것도 아니고 "어제" 는 안다.
  assert.equal(dayLabel(TODAY, TODAY), 'Today');
  assert.equal(dayLabel('2026-08-02', TODAY), 'Yesterday');
  assert.equal(dayLabel('2026-07-31', TODAY), '3 days ago');
});

test('일주일이 넘으면 날짜를 낸다', () => {
  // "23일 전" 은 세어 보지 않으면 언제인지 모른다.
  assert.match(dayLabel('2026-07-11', TODAY), /Jul/);
});

// ── 하루를 한 문장으로 ───────────────────────────────────────────────────────

test('그날을 한 문장으로 읽어 준다', () => {
  const [day] = byDay([food(TODAY), dose(TODAY, '0800', true), dose(TODAY, '1300', true)], TODAY);
  const s = daySentence(day, 'Today');
  assert.match(s, /one thing to eat/);
  assert.match(s, /took all 2/);
});

test('거른 것이 있으면 그것을 말한다', () => {
  const [day] = byDay([dose(TODAY, '0800', true), dose(TODAY, '1300', false)], TODAY);
  assert.match(daySentence(day, 'Today'), /took 1 medicines and missed 1/);
});

test('몸이 안 좋았다는 답은 문장 끝에 붙는다', () => {
  const [day] = byDay([food(TODAY, { reaction: 'unwell' })], TODAY);
  assert.match(daySentence(day, 'Today'), /felt unwell/);
});

test('아무것도 없는 날은 없다고 말한다', () => {
  assert.match(daySentence(byDay([], TODAY)[0] ?? {
    dayKey: TODAY, records: [], foods: [], doses: [], taken: 0, missed: 0,
    hadAvoid: false, hadReaction: false,
  }, 'Today'), /Nothing was recorded/);
});

// ── 순응도 ───────────────────────────────────────────────────────────────────

test('상자에서 온 복용만 센다', () => {
  const manual = food(TODAY, { kind: 'medicine' });
  assert.equal(doseRows([manual, dose(TODAY, '0800', true)]).length, 1);
});

test('일곱 번 중 한 번을 거르면 그렇게 센다', () => {
  const rows = doseRows([
    dose(TODAY, '0800', true), dose(TODAY, '1300', true), dose(TODAY, '1900', true),
    dose('2026-08-02', '0800', true), dose('2026-08-02', '1300', false),
    dose('2026-08-01', '0800', true), dose('2026-08-01', '1300', true),
  ]);
  const a = adherence(rows, TODAY, 7, ENDOFDAY);
  assert.equal(a.offered, 7);
  assert.equal(a.taken, 6);
  assert.equal(a.missed, 1);
  assert.ok(Math.abs(a.rate! - 6 / 7) < 1e-9);
});

test('기간 밖의 복용은 분모에 안 들어간다', () => {
  const rows = doseRows([dose(TODAY, '0800', true), dose('2026-06-01', '0800', false)]);
  assert.equal(adherence(rows, TODAY, 7, ENDOFDAY).offered, 1);
});

test('상자가 아무것도 보고한 적 없으면 0%가 아니라 "모름"이다', () => {
  // 0% 는 "다 걸렀다" 는 뜻이다. 짝지은 상자가 없는 사람에게 그렇게 말하면 안 된다.
  const a = adherence([], TODAY, 7, ENDOFDAY);
  assert.equal(a.rate, null);
  assert.match(adherenceSentence(a), /has not reported/);
});

test('자주 거르는 시각을 짚는다', () => {
  // 아침을 거르는 사람과 저녁을 거르는 사람은 고칠 곳이 다르다.
  const rows = doseRows([
    dose(TODAY, '1900', false), dose('2026-08-02', '1900', false),
    dose('2026-08-01', '0800', false), dose('2026-08-01', '1900', true),
  ]);
  assert.equal(adherence(rows, TODAY, 7, ENDOFDAY).worstTime, '1900');
});

test('동점이면 시각을 짚지 않는다', () => {
  // 둘 중 하나를 고르면 없는 규칙을 있다고 말하는 것이 된다.
  const rows = doseRows([dose(TODAY, '0800', false), dose(TODAY, '1900', false)]);
  assert.equal(adherence(rows, TODAY, 7, ENDOFDAY).worstTime, null);
});

test('기록이 없는 날은 연속을 끊지 않는다', () => {
  // 상자를 잠깐 꺼 두었거나 여행을 갔을 수 있다. 그 날을 실패로 세면 연속일이
  // 아무 뜻도 없는 수가 된다.
  const rows = doseRows([
    dose(TODAY, '0800', true),
    // 2026-08-02 는 기록 자체가 없다
    dose('2026-08-01', '0800', true),
  ]);
  assert.equal(adherence(rows, TODAY, 7, ENDOFDAY).streak, 2);
});

test('오늘 거른 것으로 어제까지의 연속을 깎지 않는다', () => {
  // 오늘은 아직 안 지났다. 저녁 약을 아직 안 먹었다고 연속을 0으로 만들면,
  // 화면이 아침마다 "0일" 이라고 말한다.
  const rows = doseRows([
    dose(TODAY, '1900', false),
    dose('2026-08-02', '0800', true), dose('2026-08-01', '0800', true),
  ]);
  assert.equal(adherence(rows, TODAY, 7, ENDOFDAY).streak, 2);
});

test('어제 거르면 연속이 끊긴다', () => {
  const rows = doseRows([
    dose(TODAY, '0800', true), dose('2026-08-02', '0800', false), dose('2026-08-01', '0800', true),
  ]);
  assert.equal(adherence(rows, TODAY, 7, ENDOFDAY).streak, 1);
});

test('잘하고 있을 때도 말한다', () => {
  // 실패했을 때만 말하는 앱은 잔소리가 되고, 잔소리는 꺼진다.
  const rows = doseRows([dose(TODAY, '0800', true), dose('2026-08-02', '0800', true)]);
  assert.match(adherenceSentence(adherence(rows, TODAY, 7, ENDOFDAY)), /every dose for 2 days/);
});

test('문장이 백분율이 아니라 횟수로 말한다', () => {
  // 숫자를 못 읽는 사람에게 "86%" 는 도착하지 않는다. 셀 수 있는 말로 한다.
  const rows = doseRows([
    dose(TODAY, '0800', false), dose(TODAY, '1300', true), dose(TODAY, '1900', true),
  ]);
  const s = adherenceSentence(adherence(rows, TODAY, 7, ENDOFDAY));
  assert.ok(!s.includes('%'), `백분율이 문장에 들어갔다: ${s}`);
  assert.match(s, /missed once/);
});

test('시각을 사람이 읽는 말로 바꾼다', () => {
  assert.equal(clockOf('0800'), '8:00 AM');
  assert.equal(clockOf('1900'), '7:00 PM');
  assert.equal(clockOf('0000'), '12:00 AM');
});

test('기간이 정확히 그 날짜들을 덮는다', () => {
  const w = windowDays(TODAY, 3);
  assert.deepEqual(w, ['2026-08-03', '2026-08-02', '2026-08-01']);
});
