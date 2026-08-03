import type { DoseEvent } from './types.ts';
import type { ScanRecord } from '../snapcare/types.ts';

/**
 * 상자가 남긴 복용 사건을 앱의 기록 한 줄로 옮긴다.
 *
 * 지금까지 이 앱에서 "약을 먹었다" 는 기록이 생기는 길은 하나뿐이었다 — 기기 화면에
 * 뜬 코드를 사람이 찍는 것. 그런데 그 수고를 없애자는 것이 상자를 만든 이유다. 짝지은
 * 상자는 보고마다 `events` 를 실어 보내므로, 찍지 않아도 기록이 채워진다.
 *
 * 순수 함수로 떼어 둔 이유는 아래 두 가지가 조용히 틀리기 쉬워서다.
 */

/**
 * 같은 사건이 두 번 들어오지 않게 하는 이름표.
 *
 * `seq` 를 쓰지 않는다 — 펌웨어에서 100 에서 되돌아가기 때문에(`_record()`), 오래 쓴
 * 상자에서는 같은 번호가 다시 온다. 사건이 일어난 **시각**은 되돌아가지 않는다.
 */
export function eventId(e: DoseEvent): string {
  return `dev_${e.at}_${e.tray}_${e.time}`;
}

/**
 * 이 사건이 일어난 날.
 *
 * 문자열에서 그대로 떼어 온다. `new Date()` 로 파싱해 폰의 날짜를 읽으면, 자정 무렵에
 * 시차가 있는 두 곳(상자와 폰)에서 **어제 먹은 약이 오늘로 기록된다.** 사람이 겪은
 * 날은 상자가 걸려 있는 벽의 날짜다.
 */
export function eventDayKey(e: DoseEvent): string {
  return e.at.slice(0, 10);
}

/** `2026-08-02T19:12:53+09:00` → `7:12 PM`. 기기의 시각을 그대로 읽는다. */
function clockLabel(at: string): string {
  const hm = at.slice(11, 16);
  const h = Number(hm.slice(0, 2));
  const m = hm.slice(3, 5);
  if (!Number.isFinite(h)) return hm;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${((h + 11) % 12) + 1}:${m} ${ampm}`;
}

/**
 * 사건 하나를 기록 한 줄로.
 *
 * `taken` 이 거짓인 것도 남긴다. 놓친 복용은 지워야 할 실패가 아니라 **돌보는 사람이
 * 알아야 하는 사실**이고, 남기지 않으면 "이번 주에 두 번 걸렀다" 를 아무도 알 수 없다.
 */
export function toScanRecord(e: DoseEvent, opts: {
  today: string;
  memberId: string;
  name?: string;
}): ScanRecord {
  const day = eventDayKey(e);
  const when = clockLabel(e.at);
  return {
    id: eventId(e),
    itemId: `device_tray_${e.tray}`,
    name: opts.name ?? `Compartment ${e.tray}`,
    kind: 'medicine',
    emoji: '💊',
    memberId: opts.memberId,
    level: e.taken ? 'safe' : 'caution',
    timeLabel: day === opts.today ? `Today · ${when}` : `${day.slice(5)} · ${when}`,
    dayKey: day,
    /*
      상자가 말한 것을 그대로 싣는다.

      전에는 `level` 로만 남겼다 — 먹었으면 safe, 걸렀으면 caution. 그런데 caution 은
      설탕 많은 과자에도 붙는 값이라, 저장소에서 놓친 항생제와 과자가 같아진다.
      상자는 사실을 보고했는데 앱이 세는 자리에서 잃어버리고 있었고, 그래서 "이번
      주에 두 번 걸렀다" 를 낼 수가 없었다.
    */
    dose: { taken: e.taken, due: e.time, tray: e.tray, reason: e.reason },
  };
}
