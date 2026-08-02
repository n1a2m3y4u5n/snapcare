import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCloudSlots } from './fromApp.ts';
import { encodeWeekly as encodeForCloud } from './schedule.ts';
import { encodeWeekly as encodeForOptical } from '../hardware/protocol.ts';

/**
 * 두 경로가 **같은 문장**을 만드는지 본다.
 *
 * 이것이 이 파일의 요점이다. 같은 일정이 QR 로도 가고 사서함으로도 가는데, 둘이
 * 갈라지면 화면에 보이는 것과 기기에 저장되는 것이 달라진다. 그런 어긋남은 기기가
 * 조용히 다른 시각에 약을 내보내는 모습으로만 드러난다.
 */
test('옮긴 일정이 원래 일정과 같은 SC1 문장이 된다', () => {
  const app = [
    { slot: 1, times: ['0800', '2000'], days: 0b1111111, durationDays: 30 },
    { slot: 3, times: ['1230'], days: 0b0010101, durationDays: 0 },
  ];
  assert.equal(encodeForCloud(toCloudSlots(app)), encodeForOptical(app));
  assert.equal(encodeForCloud(toCloudSlots(app)), 'SC1*W*1:0800.2000-127-030/3:1230-021-000');
});

test('칸 이름이 slot 에서 tray 로 옮겨진다', () => {
  // 이 한 줄이 틀리면 일정이 기기에 닿지 않는다 — 약이 엉뚱한 칸에서 나오는 것이
  // 아니라 아무 칸에서도 나오지 않는다.
  assert.deepEqual(toCloudSlots([{ slot: 7, times: ['0900'], days: 127, durationDays: 5 }]), [
    { tray: 7, times: ['0900'], days: 127, durationDays: 5 },
  ]);
});

test('빈 일정은 빈 채로 넘어간다', () => {
  assert.deepEqual(toCloudSlots([]), []);
});
