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
