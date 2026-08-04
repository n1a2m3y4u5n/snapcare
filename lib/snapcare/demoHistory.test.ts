import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { DEMO_DAYS, demoHistory } from './demoHistory.ts';
import { MAX_BACK, WINDOW_DAYS } from '../history/window.ts';
import { byDay } from '../history/byDay.ts';
import { adherence, doseRows } from '../history/adherence.ts';
import { KEEP_COUNT } from './retention.ts';

const TODAY = '2026-08-03';
const ME = 'me';

/*
  시각을 못박는다.

  `demoHistory` 는 **오늘 지나간 것만** 넣는다(아침 여덟 시 약은 아홉 시에 앱을 열어야
  보인다). 그래서 시각을 안 넘기면 이 파일의 시험이 **몇 시에 도는지에 따라** 달라진다 —
  자정과 새벽 여덟 시 사이에 돌리면 오늘이 통째로 비어서 "84일" 이 83 이 된다. 실제로
  그렇게 한 번 빨갛게 났고, 그때 의심한 것은 방금 고친 코드였다.

  23:30 은 하루가 다 지난 시각이다. 그 시각의 자료가 이 시험들이 말하려는 것 —
  하루가 몇 건이고 석 달이 며칠인지 — 을 재는 데 맞다.
*/
const LATE = 23 * 60 + 30;

test('달력의 세 창이 정확히 채워진다', () => {
  /*
    길이가 두 번 바뀌었다. 다섯 주였다가 — 넉 주짜리 달력이 생기면서 한 번만 뒤로
    가면 빈 격자가 나왔다 — 90일이 됐고, 지금은 84일이다.

    84 인 이유는 창에 딱 맞는 수여서다. 창이 28일이고 뒤로 갈 수 있는 끝이 2번
    창이므로 세 창이 정확히 84일이다. 90 이면 마지막 창의 엿새가 자료 밖으로 나가서
    반쯤 빈 달력이 되고, **반만 채워진 달력은 "이때 안 먹었다" 로 읽힌다.**
  */
  const h = demoHistory(TODAY, ME, DEMO_DAYS, LATE);
  const days = byDay(h, TODAY, ME);
  assert.equal(days.length, DEMO_DAYS);
  assert.equal(DEMO_DAYS % WINDOW_DAYS, 0, '창에 딱 안 맞으면 반쯤 빈 달력이 생긴다');
  assert.equal(DEMO_DAYS / WINDOW_DAYS, MAX_BACK + 1, '뒤로 갈 수 있는 끝과 자료의 끝이 같아야 한다');
  assert.ok(h.length > 200, `기록이 ${h.length} 개뿐이다`);
});

test('보관 한도 안에 들어간다', () => {
  // 넘치면 시연 자료가 스스로 잘려서, 만들어 놓고 안 보이는 자료가 된다.
  //
  // 상한을 숫자로 적지 않고 가져다 쓴다. 예전에는 200이 여기 박혀 있었고, 그
  // 값이 바뀌었을 때 이 시험은 **바뀐 쪽이 아니라 자기 자신을** 지켰다.
  const h = demoHistory(TODAY, ME, DEMO_DAYS, LATE);
  assert.ok(h.length <= KEEP_COUNT, `${h.length} 개는 보관 한도(${KEEP_COUNT})를 넘는다`);
});

test('열 때마다 같은 자료가 나온다', () => {
  // 무작위를 쓰면 화면 캡처가 흔들리고 "어제는 이랬는데" 를 말할 수가 없다.
  assert.deepEqual(demoHistory(TODAY, ME, DEMO_DAYS, LATE), demoHistory(TODAY, ME, DEMO_DAYS, LATE));
});

test('오늘은 지금까지 지나간 것만 들어 있다', () => {
  /*
    안 온 저녁 약을 걸렀다고 세면 순응도가 매일 아침 나빠 보인다. 그리고 그보다
    큰 문제가 있었다 — 저녁 하나만 빼고 나머지를 다 넣어서, **아침 아홉 시에 앱을
    열어도 점심 약이 이미 먹은 것으로 앉아 있었다.** 시연에서 그 화면은 "이 앱은
    미래를 안다" 로 읽힌다.

    시각을 넘겨서 잰다. 안에서 시계를 읽으면 이 시험이 몇 시에 도느냐에 따라 답이
    달라지고, 그러면 확인이 아니라 우연이 된다.
  */
  const at9 = byDay(demoHistory(TODAY, ME, DEMO_DAYS, 9 * 60), TODAY, ME)[0];
  assert.equal(at9.missed, 0);
  assert.equal(at9.doses.length, 1, '아침 아홉 시에는 8시 약 하나만 지났다');

  const at2340 = byDay(demoHistory(TODAY, ME, DEMO_DAYS, 23 * 60 + 40), TODAY, ME)[0];
  assert.equal(at2340.doses.length, 3, '밤에는 셋 다 지났다');
});

test('순응도가 셀 것이 생긴다', () => {
  const a = adherence(doseRows(demoHistory(TODAY, ME, DEMO_DAYS, LATE), ME), TODAY, 7);
  assert.ok(a.offered > 15, `일주일에 ${a.offered} 번뿐이다`);
  assert.ok(a.missed > 0, '한 번도 안 거르면 이 화면이 무엇을 하는지 안 보인다');
  assert.ok(a.rate !== null && a.rate > 0.7, '너무 나쁘면 시연 자료로 안 맞는다');
});

test('저녁을 주로 거르는 것이 드러난다', () => {
  // 아침을 거르는 사람과 저녁을 거르는 사람은 고칠 곳이 다르다. 그 구별을 짚는
  // 것이 이 기능의 값이고, 무작위로 흩뿌리면 화면에 안 나온다.
  assert.equal(adherence(doseRows(demoHistory(TODAY, ME, DEMO_DAYS, LATE), ME), TODAY, 14).worstTime, '1900');
});

test('설탕이 줄어드는 이야기가 들어 있다', () => {
  // 주별 막대가 내려가는 것이 보여야 그 화면이 존재하는 이유가 증명된다.
  const h = demoHistory(TODAY, ME, DEMO_DAYS, LATE);
  /*
    **단것만** 센다. 예전에는 바코드가 있는 것을 다 셌는데, 그때는 자료에 단것밖에
    없어서 같은 답이 나왔다. 끼니가 들어오면서 그 어림이 깨진다 — 빵과 렌틸이
    설탕 추세에 섞이면 방향이 안 보인다.
  */
  const SWEET = new Set(['9002490100070', '5000159461122', '5000159407236',
                         '5449000000996', '3017620422003']);
  const sweetsIn = (from: number, to: number) => h.filter((r) => {
    if (!r.barcode || !SWEET.has(r.barcode)) return false;
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
  /*
    목록을 손으로 적지 않는다. 적어 두면 캐시에 파일을 넣고 여기를 안 고친 날,
    시험이 **있는 것을 없다고** 말한다 — 진짜 결함과 구별이 안 되는 실패다.
  */
  const dir = join(dirname(fileURLToPath(import.meta.url)), '../../public/nutrition');
  const CACHED = new Set(readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, '')));
  for (const r of demoHistory(TODAY, ME, DEMO_DAYS, LATE)) {
    if (r.barcode) assert.ok(CACHED.has(r.barcode), `${r.barcode} 는 캐시에 없다`);
  }
});

test('식이 일지가 추론할 만큼 반응이 쌓인다', () => {
  // 반응이 하나뿐이면 화면이 "아직 모른다" 만 말하고, 그 기능이 있다는 것조차
  // 안 보인다.
  const reacted = demoHistory(TODAY, ME, DEMO_DAYS, LATE).filter((r) => r.reaction === 'unwell');
  assert.ok(reacted.length >= 3, `반응이 ${reacted.length} 번뿐이다`);
  assert.ok(reacted.every((r) => r.tags?.includes('en:peanuts')));
});

test('기록마다 id 가 겹치지 않는다', () => {
  const h = demoHistory(TODAY, ME, DEMO_DAYS, LATE);
  assert.equal(new Set(h.map((r) => r.id)).size, h.length);
});

test('괜찮았던 끼니도 답이 달려 있다', () => {
  // 피셔 정확검정에는 네 칸이 필요하다 — 먹고 아팠다, 먹고 괜찮았다, 안 먹고
  // 아팠다, 안 먹고 괜찮았다. 아픈 날에만 답을 달면 아랫줄이 통째로 0 이라
  // 화면이 "0 of 0" 을 띄운 채 영원히 "지켜보는 중" 에 머문다.
  const h = demoHistory(TODAY, ME, DEMO_DAYS, LATE);
  const fine = h.filter((r) => r.reaction === 'fine');
  const unwell = h.filter((r) => r.reaction === 'unwell');
  assert.ok(fine.length >= 5, `괜찮았다는 답이 ${fine.length} 개뿐이다`);
  assert.ok(unwell.length >= 3);
  assert.ok(fine.every((r) => !r.tags?.includes('en:peanuts')),
    '괜찮았던 끼니에 땅콩이 들어 있으면 추론이 반대로 간다');
});
