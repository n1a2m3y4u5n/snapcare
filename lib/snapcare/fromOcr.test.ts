import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ocrToScanItem } from './fromOcr.ts';

/**
 * 처방전 글자에서 위험 플래그를 뽑는 부분.
 *
 * 여기서 안 붙는 플래그는 판정 엔진에 영원히 도착하지 않는다 — 타입에 정의돼 있고
 * 픽토그램까지 그려져 있어도, 만드는 코드가 없으면 없는 기능이다.
 */

const RX = (warnings: string) =>
  `PRESCRIPTION\nAmoxicillin Capsules 250 mg\nTake 1 capsule three times a day, after meals.\nWarnings: ${warnings}`;

test('금주 지시를 플래그로 잡는다', () => {
  // 우리 항생제 샘플에 실제로 적혀 있는 문구다. 오랫동안 아무도 읽지 않았다.
  assert.ok(ocrToScanItem(RX('No alcohol.')).item.flags.includes('alcohol'));
  assert.ok(ocrToScanItem(RX('Avoid alcohol during treatment.')).item.flags.includes('alcohol'));
  assert.ok(ocrToScanItem(RX('복용 중 알코올 섭취 금지')).item.flags.includes('alcohol'));
});

test('임신·수유 금기가 판정 엔진까지 간다', () => {
  // OCR 이 뽑아 픽토그램까지 갔는데 판정에는 안 닿던 구간이 있었다.
  const f = ocrToScanItem(RX('Not for use in pregnancy. Caution if breastfeeding.')).item.flags;
  assert.ok(f.includes('unsafe_pregnancy'));
  assert.ok(f.includes('unsafe_breastfeeding'));
});

test('NSAID 는 출혈 위험으로 잡는다', () => {
  const f = ocrToScanItem('Ibuprofen Tablets 200 mg\nTake 1 tablet twice a day, after meals.').item.flags;
  assert.ok(f.includes('nsaid_bleed'));
});

test('관계 없는 처방전에는 아무 플래그도 붙이지 않는다', () => {
  // 모른다는 것과 위험하다는 것은 다르다.
  assert.deepEqual(
    ocrToScanItem(RX('Do not exceed the stated dose.')).item.flags,
    [],
  );
});
