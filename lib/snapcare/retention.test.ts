import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prune } from './retention.ts';
import type { ScanRecord } from './types.ts';
import { KEEP_COUNT } from './retention.ts';

const rec = (dayKey: string, id = dayKey): ScanRecord =>
  ({ id, dayKey, timeLabel: '', name: 'x' } as unknown as ScanRecord);

test('90일이 지난 기록은 떨어낸다 — 앱이 쓰지도 않는 자료를 들고 있을 이유가 없다', () => {
  const kept = prune([rec('2026-07-01'), rec('2026-01-01')], '2026-07-29');
  assert.deepEqual(kept.map((r) => r.dayKey), ['2026-07-01']);
});

test('경계선 하루는 남긴다', () => {
  // 2026-07-29 에서 90일 전은 2026-04-30
  const kept = prune([rec('2026-04-30'), rec('2026-04-29')], '2026-07-29');
  assert.deepEqual(kept.map((r) => r.dayKey), ['2026-04-30']);
});

test('데모 시드와 구버전 기록은 건드리지 않는다 — 날짜를 알 수 없는 것을 지우면 안 된다', () => {
  const kept = prune([rec('today'), { id: 'old' } as ScanRecord], '2026-07-29');
  assert.equal(kept.length, 2);
});

test('개수 상한도 그대로 지킨다', () => {
  const many = Array.from({ length: KEEP_COUNT + 60 }, (_, i) => rec('2026-07-20', `x${i}`));
  assert.equal(prune(many, '2026-07-29').length, KEEP_COUNT);
});

test('개수 상한이 날짜보다 먼저 걸리지 않는다', () => {
  /*
    상한이 200이던 때의 진짜 결함. 상자를 쓰는 사람은 하루에 복용만 두세 건이
    들어오고 거기에 끼니가 붙으므로, 200건은 마흔 날쯤에서 찬다 — **90일을
    보관한다고 적어 놓고 실제로는 40일에서 잘리고 있었다.** 잘린다는 표시도
    어디에도 없어서, 두 달 전 것을 찾는 사람은 자기가 안 쓴 날로 알게 된다.

    하루 열 건은 상자 셋에 끼니 넷을 넘는 양이다. 그만큼 써도 90일이 먼저 걸려야
    한다.
  */
  const busy = Array.from({ length: 90 * 10 }, (_, i) =>
    rec(`2026-0${5 + Math.floor(i / 300)}-${String((i % 28) + 1).padStart(2, '0')}`, `b${i}`));
  assert.ok(prune(busy, '2026-07-29').length > 200,
    '하루 열 건을 쓰는 사람이 개수 상한에서 먼저 잘린다');
});
