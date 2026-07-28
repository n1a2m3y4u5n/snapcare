import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prune } from './retention.ts';
import type { ScanRecord } from './types.ts';

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
  const many = Array.from({ length: 260 }, (_, i) => rec('2026-07-20', `x${i}`));
  assert.equal(prune(many, '2026-07-29').length, 200);
});
