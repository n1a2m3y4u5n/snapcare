import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { ADULT_DOSES, DEMO_DAYS, KID_DOSES, demoHistory } from './demoHistory.ts';
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

/*
  시연 자료가 **누구 것인가.**

  저장 자리는 계정별로 갈려 있지만(`snapcare-scans#demo_kid`), 화면은 기록의
  `memberId` 로 한 번 더 거른다. 둘이 어긋나면 자료는 저장돼 있는데 화면은 비어 있다 —
  실제로 아이 계정이 그랬다. 저장 자리를 가르는 것과 주인을 적는 것은 다른 일이다.
*/
test('기록의 주인이 프로필과 같아야 화면에 뜬다', () => {
  /*
    화면은 `memberId === member.id` 로 거른다. 어긋나면 저장돼 있으면서 안 나온다 —
    비는 것이 아니라 조용히 일부만 세는 쪽이라 더 나쁘다. 한때 여기에 계정 id 를
    넣었다가 프로필 쪽(`PROFILE_ID`)과 짝이 깨져 달력이 통째로 비었다.
  */
  for (const plan of [ADULT_DOSES, KID_DOSES]) {
    const h = demoHistory('2026-08-05', 'me', 84, 23 * 60, plan);
    assert.ok(h.length > 0);
    assert.equal(h.filter((r) => r.memberId === 'me').length, h.length,
      '넘긴 주인 그대로여야 한다');
  }
});

test('아이에게는 아이 약을 준다', () => {
  /*
    두 가지를 한꺼번에 본다. 전에는 아이에게 참·거짓을 넘겨서 복약을 통째로 껐는데,
    막을 것은 **남의 약**이지 약 자체가 아니었다. 끄기만 하니 아이 쪽 복약 화면이
    비었고, 사람을 바꾸면 이 앱의 절반이 사라졌다.
  */
  const kid = demoHistory('2026-08-05', 'me', 84, 23 * 60, KID_DOSES);
  const names = new Set(kid.filter((r) => r.dose).map((r) => r.name));

  assert.ok(names.size > 0, '아이도 복약 기록이 있어야 한다');
  for (const grandma of ['Metformin 500mg', 'Amlodipine 5mg']) {
    assert.ok(!names.has(grandma), `일곱 살 화면에 ${grandma} 이 쌓이면 그 자체가 틀린 화면이다`);
  }
  assert.deepEqual([...names].sort(), ['Loratadine 5mg', 'Vitamin D 400 IU']);

  // 하루 두 번이다. 할머니가 세 번이라, 달력 칸의 조각 수가 그 사람의 처방을 그린다.
  const perDay = kid.filter((r) => r.dose && r.dayKey === '2026-08-04').length;
  assert.equal(perDay, 2);

  // 끼니는 그대로다 — 아이 쪽 논지의 나머지 절반이다.
  assert.ok(kid.filter((r) => !r.dose).length > 200);
});

test('땅콩 알레르기가 적힌 사람에게는 지난 땅콩도 빨강이다', () => {
  /*
    지난 기록에는 판정 재계산이 없다 — 판정은 찍는 순간에 나고 `level` 은 그때 박힌다.
    그래서 프로필에 땅콩 알레르기가 적힌 아이의 시연 식단에서 땅콩버터 스물몇 번이
    전부 초록이었다. 이 앱의 간판이 정확히 그 판정인데.
  */
  const kid = demoHistory('2026-08-05', 'me', 84, 23 * 60, KID_DOSES, true);
  const peanut = kid.filter((r) => r.itemId === 'peanutButter' || r.itemId === 'snickers');
  assert.ok(peanut.length > 0, '시연 식단에 땅콩이 있어야 이 시험이 뜻이 있다');
  for (const r of peanut) {
    assert.equal(r.level, 'avoid', `${r.timeLabel} 의 ${r.name} 이 ${r.level} 이다`);
  }
});

test('알레르기가 안 적힌 사람에게는 일지가 찾아낼 몫으로 남긴다', () => {
  // 할머니 쪽 이야기는 "일지가 찾아낸다" 이다. 처음부터 빨간 것으로 알고 있었다면
  // 찾아낼 것이 없고, 그 기능을 보여줄 자리가 사라진다.
  const adult = demoHistory('2026-08-05', 'me', 84, 23 * 60, ADULT_DOSES, false);
  const peanut = adult.filter((r) => r.itemId === 'peanutButter');
  assert.ok(peanut.length > 0);
  assert.ok(peanut.every((r) => r.level !== 'avoid'), '찾아내기 전인데 이미 빨강이다');
  assert.ok(peanut.some((r) => r.reaction === 'unwell'), '일지가 찾아낼 단서가 없다');
});
