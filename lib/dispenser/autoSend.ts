import { encodeWeekly, type WeeklySlot as AppSlot } from '../hardware/protocol.ts';
import { weeklyFrom } from '../hardware/dispenser.ts';
import type { Reminder } from '../../stores/reminders.ts';

/*
  React 도 스토어도 만지지 않는다. 훅 안에 있으면 시험할 방법이 없어서 떼어
  냈다 — 이 저장소의 시험은 노드에서 타입만 벗겨 돌리고, `stores/reminders.ts`
  는 `@/` 별칭을 런타임으로 끌어와서 그 자리에서 못 읽힌다. 여기서는 그 파일이
  타입으로만 들어오므로 벗겨지고 남지 않는다.
*/

/**
 * 지금 보낼 것이 있는가. 없으면 null.
 *
 * 훅에서 떼어 낸 이유는 이것이 이 파일에서 유일하게 틀리면 아픈 부분이고, 훅
 * 안에 있으면 시험할 방법이 없어서다. 같은 것을 다시 보내면 기기가 오늘 이미
 * 나간 복용을 다시 밀린 것으로 세고, 그것은 한 번 더 먹으라는 뜻이 된다.
 */
export function pending(
  reminders: Reminder[],
  trays: number,
  lastSent: string | null,
): { payload: string; slots: AppSlot[] } | null {
  const slots = reminders.length ? weeklyFrom(reminders, trays).slots : [];
  if (!slots.length) return null;      // 빈 일정은 보내지 않는다 — 아래 참조
  const payload = encodeWeekly(slots);
  return payload === lastSent ? null : { payload, slots };
}
