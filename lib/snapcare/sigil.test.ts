import test from 'node:test';
import assert from 'node:assert/strict';
import { itemToDsl } from './sigil.ts';
import type { ItemFlag, ScanItem } from './types.ts';

/**
 * 그림이 뜻을 **뒤집어** 말하지 않는지 본다.
 *
 * 이 파일의 대부분은 2026년 8월 전문가 조사에서 나온 지적을 시험으로 옮긴 것이다.
 * 그 조사에서 가장 무거운 지적이 여기 있었다 — 임신 금기 처방전에서 픽토그램이 임신부
 * 그림 한 장을 내보내, 그림만 보는 사람에게는 "임신부용" 으로 읽혔다. 뜻이 전달되지
 * 않는 것과 정반대로 전달되는 것은 다른 실패다. 앞의 것은 사용자가 다시 묻게 하고,
 * 뒤의 것은 사용자가 확신을 가지고 틀리게 한다.
 *
 * 그래서 여기서 재는 것은 "그림이 나오는가" 가 아니라 **"금지가 금지로 나오는가"** 다.
 */

const rx = (over: Partial<NonNullable<ScanItem['rx']>> = {}): NonNullable<ScanItem['rx']> => ({
  dosageText: 'after food',
  durationText: '7 days',
  schedule: [],
  ...over,
});

const item = (over: Partial<ScanItem> = {}): ScanItem => ({
  id: 'i', name: 'Test', kind: 'prescription', emoji: '💊',
  detectedVia: 'test', flags: [], rx: rx(),
  ...over,
});

const lines = (it: ScanItem, avoid: boolean): string[] => itemToDsl(it, avoid).split('\n');

// ── 금기 ────────────────────────────────────────────────────────────────────

test('임신 금기는 판정과 무관하게 언제나 사선이 그어진다', () => {
  // 임신하지 않은 사용자가 찍었다고 해서 임신 금기가 사라지지 않는다. 그 처방전은
  // 다른 사람에게도 가고, 그림은 처방전에 적힌 것을 말해야 한다.
  for (const avoid of [true, false]) {
    const out = lines(item({ flags: ['unsafe_pregnancy'] }), avoid);
    assert.ok(out.includes('\\no{\\state_pregnant}'), `avoid=${avoid} 에서 사선이 없다: ${out.join(' · ')}`);
    assert.ok(!out.includes('\\state_pregnant'), `avoid=${avoid} 에서 맨 임신부 그림이 나갔다`);
  }
});

test('수유 금기도 마찬가지다', () => {
  for (const avoid of [true, false]) {
    assert.ok(lines(item({ flags: ['unsafe_breastfeeding'] }), avoid).includes('\\no{\\state_breastfeeding}'));
  }
});

test('금주 표시에 사선을 덧그리지 않는다', () => {
  // no_alcohol 은 이미 금지 그림이다. 회피 판정에서 한 번 더 감싸면 금주 표시에 사선이
  // 그어져 **마셔도 된다** 가 된다 — 임신 쪽과 정확히 반대 방향의 같은 사고다.
  const out = lines(item({ flags: ['alcohol'] }), true);
  assert.ok(out.includes('\\no_alcohol'));
  assert.ok(!out.includes('\\no{\\no_alcohol}'), '이중부정이 나갔다');
});

test('출혈 경고는 감싸지 않는다', () => {
  // warn_bleeding 은 상태가 아니라 경고다. 감싸면 "출혈하지 말 것" 이라는 말이 안 되는
  // 그림이 된다.
  const out = lines(item({ flags: ['nsaid_bleed'] }), true);
  assert.ok(out.includes('\\warn_bleeding'));
  assert.ok(!out.includes('\\no{\\warn_bleeding}'));
});

// ── 들어 있는 것 ────────────────────────────────────────────────────────────

test('알레르겐은 판정에 따라 사선이 붙고 떨어진다', () => {
  const it = item({ kind: 'food', rx: undefined, flags: ['peanut'] });
  assert.ok(lines(it, true).includes('\\no{\\allergen_peanut}'));
  assert.ok(lines(it, false).includes('\\allergen_peanut'));
});

test('걸리지 않아도 무엇이 들어 있는지는 남긴다', () => {
  // 경고가 아닐 때도 알아야 하는 정보이고, 이 앱에서 그것을 전할 통로는 그림뿐이다.
  const out = lines(item({ kind: 'food', rx: undefined, flags: ['high_salt', 'caffeine'] }), false);
  assert.deepEqual(out, ['\\food_salt', '\\caffeine']);
});

test('같은 형태소를 가리키는 플래그가 겹쳐도 한 번만 그린다', () => {
  const flags: ItemFlag[] = ['peanut', 'peanut'];
  const out = lines(item({ kind: 'food', rx: undefined, flags }), false);
  assert.equal(out.filter((l) => l.includes('allergen_peanut')).length, 1);
});

// ── 복약 지시 ───────────────────────────────────────────────────────────────

test('제형이 그림의 머리가 된다', () => {
  const out = lines(item({ rx: rx({ form: 'eyedrop' }) }), false);
  assert.ok(out.some((l) => l.includes('dropper_bottle')), out.join(' · '));
  assert.ok(!out.some((l) => l.includes('pill_bottle')));
});

test('부위가 있으면 슬롯은 부위가 쓴다', () => {
  // 안약에 '식사와 함께' 는 뜻이 없고, '눈에' 는 이 지시의 절반이다.
  const out = lines(item({ rx: rx({ form: 'eyedrop', dosageText: 'after food' }) }), false);
  assert.ok(out.includes('\\dropper_bottle{\\body_eye}'), out.join(' · '));
});

test('모르는 제형은 조용히 약병으로 떨어지지 않고 빈자리로 표시된다', () => {
  const out = lines(item({ rx: rx({ form: 'nebuliser' as never }) }), false);
  assert.ok(out.includes('\\?nebuliser'), out.join(' · '));
});

test('공복과 아무 조건 없음은 다른 그림이다', () => {
  // 식전 약을 밥과 함께 먹으면 흡수가 달라진다.
  const empty = lines(item({ rx: rx({ dosageText: 'before meals' }) }), false);
  const none = lines(item({ rx: rx({ dosageText: '' }) }), false);
  assert.ok(empty.some((l) => l.includes('food_empty_bowl')));
  assert.ok(!none.some((l) => l.includes('food_')));
});

test('회피면 그것부터 앞에 온다', () => {
  // 나머지 지시를 읽기 전에 멈춰야 한다.
  const out = lines(item({ rx: rx({ form: 'tablet' }), flags: ['peanut'] }), true);
  assert.equal(out[0], '\\no{\\tablet_blister}');
});

test('1회 용량이 시각보다 앞에 온다', () => {
  // "첫 그림은 하루 세 번을 나타내지만 한 번에 한 캡슐이라는 것을 나타내지 못한다.
  //  그 뒤에 아침·정오·저녁 그림이 따로 오므로 혼동이 생긴다" (Atif Usman, 2026-08 조사)
  //
  // 순서가 곧 읽는 순서다. 개수가 뒤에 오면 그것이 하루치인지 한 번치인지 갈리지 않는다.
  const out = lines(item({
    rx: rx({
      form: 'capsule',
      doseCount: 1,
      schedule: [
        { time: '08:00', label: 'Morning', emoji: '🌅' },
        { time: '13:00', label: 'Noon', emoji: '☀️' },
        { time: '19:00', label: 'Evening', emoji: '🌙' },
      ],
    }),
  }), false);
  const qty = out.findIndex((l) => l.includes('qty_one'));
  const firstTime = out.findIndex((l) => l.includes('time_'));
  assert.ok(qty >= 0 && firstTime >= 0, out.join(' · '));
  assert.ok(qty < firstTime, `용량이 시각 뒤에 있다: ${out.join(' · ')}`);
});

test('기간이 정해진 약에만 완주 지시가 붙는다', () => {
  assert.ok(lines(item({ rx: rx({ durationText: '7 days' }) }), false).includes('\\finish_course'));
  assert.ok(!lines(item({ rx: rx({ durationText: 'ongoing' }) }), false).includes('\\finish_course'));
});

test('음식에는 복약 지시를 붙이지 않는다', () => {
  const out = lines(item({ kind: 'food', rx: undefined, flags: ['peanut'] }), false);
  assert.deepEqual(out, ['\\allergen_peanut']);
});

test('시각은 자기 칸을 갖는다 — 약 그림 안에 넣지 않는다', () => {
  // 2026년 8월 전문가 조사: 아침·점심·저녁 아이콘을 키우라는 지적.
  //
  // 그림을 키우는 것으로는 안 됐다. 약 그림의 슬롯 안에 있는 한 앱이 그리는 크기
  // (88px)에서 해는 20px 창에 갇히고, 실제로 렌더해 보면 **아침과 밤이 구별되지
  // 않는다.** 칸을 주는 것이 크기를 주는 유일한 방법이다.
  const out = lines(item({
    rx: rx({
      form: 'tablet',
      schedule: [
        { time: '08:00', label: 'Morning', emoji: '🌅' },
        { time: '19:00', label: 'Evening', emoji: '🌙' },
      ],
    }),
  }), false);
  assert.ok(out.includes('\\time_morning'), out.join(' · '));
  assert.ok(out.includes('\\time_evening'), out.join(' · '));
  assert.ok(!out.some((l) => /\{\\time_/.test(l)), `시각이 아직 머리 안에 있다: ${out.join(' · ')}`);
});

test('주의는 금지로 그리지 않는다 — 사선은 회피에만', () => {
  // 부르는 쪽이 `level !== 'safe'` 를 넘기고 있었다. 손글씨 처방전에 주의가 붙자마자
  // 녹내장 안약 화면에 금지 표시가 떴다 — 읽기 어렵다는 이유로 약을 끊으라고 한 셈이다.
  const rx7 = item({ rx: rx({ form: 'eyedrop' }) });
  const caution = lines(rx7, false);          // 주의: avoid=false 로 부른다
  const avoid = lines(rx7, true);
  assert.ok(!caution.some((l) => l.startsWith('\\no{\\dropper_bottle')), caution.join(' · '));
  assert.ok(avoid.some((l) => l.startsWith('\\no{\\dropper_bottle')), avoid.join(' · '));
});

test('현탁액은 쓰기 전에 흔들라고 그린다', () => {
  // 2026년 8월 조사에서 약국 실무 응답자가 빠진 특별 지시로 처음 꼽았다. 현탁액에서
  // 이것은 예의가 아니라 용량이다 — 가라앉은 채로 따르면 앞쪽은 묽고 바닥은 진하다.
  // 그림(shake_bottle)은 이미 만들어져 있었고 부르는 곳만 없었다.
  const out = lines(item({ rx: rx({ form: 'syrup', shake: true }) }), false);
  assert.ok(out.includes('\\shake_bottle'), `흔들기가 없다: ${out.join(' · ')}`);
});

test('흔들 필요가 없으면 그리지 않는다', () => {
  const out = lines(item({ rx: rx({ form: 'capsule' }) }), false);
  assert.ok(!out.includes('\\shake_bottle'));
});

test('흔들기는 약을 입에 대기 전에 온다', () => {
  // 순서가 곧 읽는 순서다. 흔들라는 말이 먹으라는 그림 뒤에 오면 이미 늦었다.
  const out = lines(item({ rx: rx({ form: 'syrup', shake: true, handwash: true }) }), false);
  const shake = out.indexOf('\\shake_bottle');
  const core = out.findIndex((l) => l.includes('pill_bottle') || l.includes('syrup'));
  assert.ok(shake >= 0 && (core === -1 || shake < core), `순서가 뒤집혔다: ${out.join(' · ')}`);
});

/*
  미리 구운 것이 실제로 나오는 것을 덮는가.

  왜 이 시험이 필요한가
  ---------------------
  화면은 매니페스트에 **모든 줄**이 있어야 정적으로 그린다. 하나라도 빠지면 엔진
  합성으로 넘어가고, 그것이 실패하면 캐시에 있는 줄만 남는다(`PictogramStrip` 의
  3번 폴백). 그래서 빠진 줄은 빈 화면이 아니라 **조용히 사라진 그림**으로 나타난다 —
  눈으로는 "원래 그런 것" 처럼 보인다.

  실제로 두 번 그랬다. 처음엔 주의사항이 만드는 그림이 통째로 빠져 있었고, 그 다음엔
  제형 넷(크림·흡입기·산제·주사)의 머리가 빠져 있었다. 머리가 없으면 시각·개수·보관이
  전부 그 머리를 그릇으로 쓰므로 그 약의 화면이 통째로 빈다.

  두 목록이 서로 다른 파일에 손으로 적혀 있는 한 또 어긋난다. 그것을 사람이 눈으로
  맞추는 대신 여기서 잡는다.
*/
test('미리 구운 것이 실제로 나오는 것을 덮는가', async () => {
  const { readFileSync } = await import('node:fs');
  const { dslKey } = await import('./dsl.ts');
  const { readPrescription, toScanItem } = await import('../formsheet/prescription.ts');
  const { WHO_DRUGS } = await import('../formulary/who.ts');

  const manifest = JSON.parse(readFileSync('public/pictograms/manifest.json', 'utf8'));
  const NOTES = ['', 'After food. May cause drowsiness.', 'Take with food. Do not drive.',
    'Keep in fridge. Shake well before use.', 'Not for children. Take with a full glass of water.',
    'Keep in a dark place. May upset the stomach.', 'Remove contact lenses before use.',
    'Take on an empty stomach'];

  const missing = new Set<string>();
  for (const drug of WHO_DRUGS) {
    for (const notes of NOTES) {
      for (const hour of ['8', '13', '19', '23']) {
        const sheet = { layer: '3', days: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
          duration: '7d', hour } as never;
        const item = toScanItem(readPrescription(sheet, drug.name, '2', notes));
        if (!item) continue;
        // 회피 판정도 함께 — `\no{머리}` 는 그때만 나오는 모양이다.
        for (const avoid of [false, true]) {
          for (const line of itemToDsl(item, avoid).split('\n')) {
            // `\?개념` 은 "그림이 없다" 는 표시라 캐시에 있을 수 없다.
            if (!line || line.startsWith('\\?')) continue;
            if (manifest[dslKey(line)] === undefined) missing.add(line);
          }
        }
      }
    }
  }

  assert.deepEqual([...missing].sort(), [],
    '이 줄들이 화면에서 조용히 사라진다. scripts/prewarm-pictograms.mjs 의 목록에 넣고 다시 구워라');
});
