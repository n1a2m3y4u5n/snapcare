import type { WeeklySlot as AppSlot } from '../hardware/protocol.ts';
import type { WeeklySlot } from './types.ts';

/**
 * 앱이 만든 주간 일정을 키트가 받는 모양으로 옮긴다.
 *
 * `WeeklySlot` 이라는 이름의 타입이 이 저장소에 둘 있다. 하나는 우리가 먼저 만든
 * 광학 프로토콜의 것(`lib/hardware/protocol.ts`)이고, 하나는 dh 의 키트가 펌웨어에서
 * 그대로 옮겨 온 것(`lib/dispenser/types.ts`)이다. 두 타입은 **칸 이름 하나만**
 * 다르다 — `slot` 과 `tray`.
 *
 * 그 하나가 조용히 틀리는 종류의 차이다. 구조 분해로 넘기면 `tray` 가 undefined 인
 * 슬롯이 만들어지고, 그것은 "약이 엉뚱한 칸에서 나온다" 가 아니라 "일정이 통째로
 * 기기에 닿지 않는다" 로 나타난다. 그래서 옮기는 자리를 하나로 두고 시험을 붙인다.
 */
export function toCloudSlots(slots: AppSlot[]): WeeklySlot[] {
  return slots.map((s) => ({
    tray: s.slot,
    times: s.times,
    days: s.days,
    durationDays: s.durationDays,
  }));
}
