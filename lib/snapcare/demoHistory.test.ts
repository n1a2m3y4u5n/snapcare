import test from 'node:test';
import assert from 'node:assert/strict';

import { demoHistory } from './demoHistory.ts';
import { byDay } from '../history/byDay.ts';
import { adherence, doseRows } from '../history/adherence.ts';

const TODAY = '2026-08-03';
const ME = 'me';

test('다섯 주가 실제로 채워진다', () => {
  // 시연 자료가 오늘·어제 네 줄뿐이라 이 앱이 시간을 두고 하는 일이 화면에
  // 아무것도 안 나왔다. 열나흘 추세는 막대 두 개, 주별 추세는 아예 안 떴다.
  const h = demoHistory(TODAY, ME);
  const days = byDay(h, TODAY, ME);
  assert.equal(days.length, 35);
  assert.ok(h.length > 100, `기록이 ${h.length} 개뿐이다`);
});

test('보관 한도 안에 들어간다', () => {
  // lib/snapcare/retention.ts 가 200개·90일에서 자른다. 넘치면 시연 자료가
  // 스스로 잘려서, 만들어 놓고 안 보이는 자료가 된다.
  const h = demoHistory(TODAY, ME);
  assert.ok(h.length <= 200, `${h.length} 개는 보관 한도를 넘는다`);
});

test('열 때마다 같은 자료가 나온다', () => {
  // 무작위를 쓰면 화면 캡처가 흔들리고 "어제는 이랬는데" 를 말할 수가 없다.
  assert.deepEqual(demoHistory(TODAY, ME), demoHistory(TODAY, ME));
});

test('오늘 아직 안 온 복용을 거른 것으로 세지 않는다', () => {
  // 안 온 저녁 약을 걸렀다고 세면 순응도가 매일 아침 나빠 보인다.
  const today = byDay(demoHistory(TODAY, ME), TODAY, ME)[0];
  assert.equal(today.missed, 0);
  assert.equal(today.doses.length, 2, '오늘은 아침·점심 둘만 지났다');
});

test('순응도가 셀 것이 생긴다', () => {
  const a = adherence(doseRows(demoHistory(TODAY, ME), ME), TODAY, 7);
  assert.ok(a.offered > 15, `일주일에 ${a.offered} 번뿐이다`);
  assert.ok(a.missed > 0, '한 번도 안 거르면 이 화면이 무엇을 하는지 안 보인다');
  assert.ok(a.rate !== null && a.rate > 0.7, '너무 나쁘면 시연 자료로 안 맞는다');
});

test('저녁을 주로 거르는 것이 드러난다', () => {
  // 아침을 거르는 사람과 저녁을 거르는 사람은 고칠 곳이 다르다. 그 구별을 짚는
  // 것이 이 기능의 값이고, 무작위로 흩뿌리면 화면에 안 나온다.
  assert.equal(adherence(doseRows(demoHistory(TODAY, ME), ME), TODAY, 14).worstTime, '1900');
});

test('설탕이 줄어드는 이야기가 들어 있다', () => {
  // 주별 막대가 내려가는 것이 보여야 그 화면이 존재하는 이유가 증명된다.
  const h = demoHistory(TODAY, ME);
  const sweetsIn = (from: number, to: number) => h.filter((r) => {
    if (!r.barcode) return false;
    const back = Math.round((new Date(`${TODAY}T00:00:00Z`).getTime()
      - new Date(`${r.dayKey}T00:00:00Z`).getTime()) / 86400000);
    return back >= from && back < to;
  }).length;
  const thisWeek = sweetsIn(0, 7);
  const fourWeeksAgo = sweetsIn(28, 35);
  assert.ok(fourWeeksAgo > thisWeek * 2,
    `4주 전 ${fourWeeksAgo} 개, 이번 주 ${thisWeek} 개 — 방향이 안 보인다`);
});

test('영양 수치가 나오는 제품만 쓴다', () => {
  // public/nutrition/ 에 없는 바코드를 쓰면 오프라인에서 합산이 비고, 이 자료가
  // 채우려던 화면이 그대로 빈 채로 남는다.
  const CACHED = new Set([
    '3017620422003', '5000159407236', '5000159461122',
    '5449000000996', '8001505005707', '9002490100070',
  ]);
  for (const r of demoHistory(TODAY, ME)) {
    if (r.barcode) assert.ok(CACHED.has(r.barcode), `${r.barcode} 는 캐시에 없다`);
  }
});

test('식이 일지가 추론할 만큼 반응이 쌓인다', () => {
  // 반응이 하나뿐이면 화면이 "아직 모른다" 만 말하고, 그 기능이 있다는 것조차
  // 안 보인다.
  const reacted = demoHistory(TODAY, ME).filter((r) => r.reaction === 'unwell');
  assert.ok(reacted.length >= 3, `반응이 ${reacted.length} 번뿐이다`);
  assert.ok(reacted.every((r) => r.tags?.includes('en:peanuts')));
});

test('기록마다 id 가 겹치지 않는다', () => {
  const h = demoHistory(TODAY, ME);
  assert.equal(new Set(h.map((r) => r.id)).size, h.length);
});

test('괜찮았던 끼니도 답이 달려 있다', () => {
  // 피셔 정확검정에는 네 칸이 필요하다 — 먹고 아팠다, 먹고 괜찮았다, 안 먹고
  // 아팠다, 안 먹고 괜찮았다. 아픈 날에만 답을 달면 아랫줄이 통째로 0 이라
  // 화면이 "0 of 0" 을 띄운 채 영원히 "지켜보는 중" 에 머문다.
  const h = demoHistory(TODAY, ME);
  const fine = h.filter((r) => r.reaction === 'fine');
  const unwell = h.filter((r) => r.reaction === 'unwell');
  assert.ok(fine.length >= 5, `괜찮았다는 답이 ${fine.length} 개뿐이다`);
  assert.ok(unwell.length >= 3);
  assert.ok(fine.every((r) => !r.tags?.includes('en:peanuts')),
    '괜찮았던 끼니에 땅콩이 들어 있으면 추론이 반대로 간다');
});
