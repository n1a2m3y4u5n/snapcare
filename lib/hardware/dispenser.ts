import type { Reminder } from '@/stores/reminders';
import { EVERY_DAY, type WeeklySlot } from './protocol.ts';   // 확장자 필수 — 시험이 --experimental-strip-types 로 돈다

/**
 * 실제 디스펜서와 이야기하는 법.
 *
 * 우리 코드와 제안서는 기기를 0.96" 128x64 OLED 에 ESP32-CAM 이 붙은 것으로 가정하고
 * 광학 프로토콜(SC1)을 설계했다. 실제 하드웨어(Shaztech/Pilldispenser)는 다르다:
 *
 *   화면   2.8" 320x240 터치스크린 (ESP32-2432S028, 흔히 CYD)
 *   카메라 없음 — 부품표에 존재하지 않는다
 *   통신   WiFi 내장. NTP 로 시각을 맞추므로 사실상 필수다
 *
 * 즉 "폰이 QR 을 띄우고 기기가 읽는다" 는 경로는 읽을 장치가 없어서 성립하지 않는다.
 * 대신 기기가 HTTP GET API 와 mDNS 호스트명을 이미 제공한다. 그쪽이 훨씬 낫다.
 *
 * 혼합 콘텐츠 문제는 우회된다. HTTPS 페이지에서 HTTP 를 fetch 하면 브라우저가 막지만,
 * **최상위 내비게이션은 막지 않는다**. 그래서 앱은 요청을 보내지 않고 링크를 만든다 —
 * 사용자가 한 번 누르면 기기 자신의 페이지로 이동해 저장되고 확인 화면이 뜬다.
 * 브로커도 클라우드도 카메라도 필요 없고, 같은 WiFi 에만 있으면 된다.
 *
 * 남는 제약: 트레이 하나에 알람 시각은 하나다. 하루 세 번이면 트레이 세 개를 쓴다.
 */

/** 기기 기본 mDNS 호스트명. 기기 설정에서 바꿀 수 있다. */
export const DEFAULT_HOST = 'pilldispenser.local';

/** 트레이 수 상한 (하드웨어 사양). */
/**
 * 펌웨어가 다루는 최대 트레이 수. 대회 출품 기기에는 **3개만 달려 있다** —
 * 실제 개수는 화면에서 받아 planTrays 에 넘긴다. 없는 트레이를 지정하면 펌웨어가
 * 거절한다(요청을 반만 받아들이면, 예정만 되고 나오지 않는 복용이 생긴다).
 */
export const MAX_TRAYS = 8;

/** 대회 출품 기기에 실제로 달린 개수. 화면의 기본값. */
export const FITTED_TRAYS = 3;

/** 기기가 쓰는 색 인덱스 0..7. 우리 판정색과 뜻이 겹치는 것만 골라 매핑한다. */
export const TRAY_COLORS = {
  green: 2,
  amber: 3,
  red: 1,
} as const;

export interface TrayPlan {
  /** 1..MAX_TRAYS */
  tray: number;
  /** 기기 화면에 뜰 이름 */
  name: string;
  /** HH:MM 24시간 */
  time: string;
  /** 0..7 */
  color: number;
  /** 이 칸을 만든 알람. 복용 기간처럼 URL 에 실을 수 없는 것을 여기서 꺼낸다. */
  source?: Reminder;
}

/** '6:00 PM' → '18:00'. 기기는 24시간 표기만 받는다. */
export function to24h(label: string): string {
  const m = label.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return label;
  let h = Number(m[1]);
  const min = m[2];
  const ap = m[3]?.toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${min}`;
}

/**
 * 알람 목록을 트레이 배치로.
 *
 * 트레이당 시각이 하나뿐이라 "하루 세 번" 은 트레이 세 개가 된다. 그래서 배치는
 * 약이 아니라 **복용 한 번**을 단위로 한다. 트레이가 모자라면 앞에서부터 채우고
 * 남는 것은 돌려준다 — 조용히 잘라내면 안 들어간 복용이 있다는 사실 자체가 사라진다.
 */
export function planTrays(reminders: Reminder[], maxTrays = MAX_TRAYS): {
  plan: TrayPlan[];
  dropped: Reminder[];
} {
  const sorted = [...reminders].sort((a, b) => to24h(a.time).localeCompare(to24h(b.time)));
  const plan: TrayPlan[] = [];
  const dropped: Reminder[] = [];
  for (const r of sorted) {
    if (plan.length >= maxTrays) { dropped.push(r); continue; }
    plan.push({
      tray: plan.length + 1,
      // 기기 화면은 좁다. 약 이름을 자르되 어느 약인지는 남아야 한다.
      name: r.item.name.slice(0, 16),
      source: r,
      time: to24h(r.time),
      color: TRAY_COLORS.green,
    });
  }
  return { plan, dropped };
}

/**
 * 기기의 /save 로 보낼 URL.
 *
 * 파라미터 이름은 펌웨어(Web_Stuff.ino)의 것을 그대로 쓴다:
 *   trayNames{i} · time{i} (HH:MM) · color{i} (0..7) · trayAlertEna{i} (존재하면 켜짐)
 *   trayinst — 설치된 트레이 수. 펌웨어가 +1 해서 쓰므로 하나 뺀 값을 보낸다.
 */
export function saveUrl(host: string, plan: TrayPlan[]): string {
  const q = new URLSearchParams();
  q.set('trayinst', String(Math.max(0, plan.length - 1)));
  for (const t of plan) {
    q.set(`trayNames${t.tray}`, t.name);
    q.set(`time${t.tray}`, t.time);
    q.set(`color${t.tray}`, String(t.color));
    q.set(`trayAlertEna${t.tray}`, 'on');
  }
  return `http://${cleanHost(host)}/save?${q.toString()}`;
}

/**
 * 요일과 복용 기간까지 담아 보내는 URL. `/save` 의 무손실 판.
 *
 * `/save` 에는 요일 칸도 기간 칸도 없어서, 월·수·금 처방이 매일 나오고 30일 코스가
 * 트레이가 빌 때까지 계속된다. 그 둘을 담을 수 있는 것은 `SC1*W*` 페이로드뿐인데,
 * 그것을 받는 `/api/schedule` 은 POST 라서 **HTTPS 로 배포된 이 앱에서는 부를 수
 * 없다** (혼합 콘텐츠). 최상위 이동은 막히지 않으므로 펌웨어가 같은 페이로드를 GET
 * 링크로도 받는다 — `server.py` 의 `_link_schedule`.
 *
 * 종이 폼시트 경로가 실제로 기기에 닿는 것이 이 함수다. 그 전까지 폼시트에서 읽은
 * 처방은 화면에 요약으로만 뜨고 어디로도 가지 않았다.
 */
export function scheduleUrl(host: string, payload: string): string {
  return `http://${cleanHost(host)}/schedule?payload=${encodeURIComponent(payload)}`;
}

/**
 * 지금 나와 있는 복용을 배출한다 — 앱 메인 화면의 버튼과 푸시 알림이 누르는 것.
 *
 * 기기는 예정된 시각에 **떨어뜨리지 않는다.** 링이 초록으로 켜지고 부저가 울리며
 * 기다릴 뿐이고, 이 요청(또는 기기의 물리 버튼)이 트레이를 여는 유일한 길이다.
 * 이것이 없으면 정상적으로 조립된 기기가 한 시간 울리다 미복용으로 기록한다.
 *
 * 인자 없이 부르면 지금 나와 있는 것을 전부 배출한다 — 같은 시각에 두 칸이 걸려
 * 있으면 두 번 누르게 만드는 쪽이 두 번째를 잊게 만든다. `tray`/`at` 은 알림이
 * 특정 복용을 가리킬 때 좁히는 용도다.
 *
 * 창이 닫힌 뒤에 눌러도 안전하다. 기기가 "기다리던 것이 없다" 는 화면을 보여 주고
 * 아무것도 열지 않는다 — 잠금화면에 남아 있던 알림을 한 시간 뒤에 누른 경우다.
 */
export function releaseUrl(host: string, dose?: { tray?: number; at?: string }): string {
  const q = new URLSearchParams();
  if (dose?.tray != null) q.set('tray', String(dose.tray));
  if (dose?.at) q.set('at', dose.at.replace(':', ''));
  const query = q.toString();
  return `http://${cleanHost(host)}/release${query ? `?${query}` : ''}`;
}

/** 한 칸을 지금 배출한다 — 기기 앞에서 눌러 확인할 때 쓴다. */
export function dropUrl(host: string, tray: number): string {
  return `http://${cleanHost(host)}/dropout?tray=${tray}`;
}

/** 울리고 있는 알람을 끈다. */
export function dismissUrl(host: string): string {
  return `http://${cleanHost(host)}/dismiss`;
}

/**
 * 호스트명 정리.
 *
 * 사용자가 'http://' 를 붙여 적거나 끝에 슬래시를 남기는 것을 그대로 이으면
 * 'http://http://…' 가 된다. 여기서 한 번 걸러 둔다 — 주소를 타이핑하는 것은
 * 이 앱에서 유일하게 남은 문자 입력이라, 틀렸을 때 왜 안 되는지 알기 어렵다.
 */
export function cleanHost(host: string): string {
  return host.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

/** 주소가 그럴듯한가. 완벽한 검사는 아니고 흔한 실수만 잡는다. */
export function looksLikeHost(host: string): boolean {
  const h = cleanHost(host);
  return h.length > 0 && !/\s/.test(h) && /^[a-z0-9.\-:]+$/i.test(h);
}


/**
 * 처방전에 적힌 복용 기간을 날수로.
 *
 * "for 7 days", "7일간", "2 weeks" 같은 표현을 받는다. 알 수 없으면 0 —
 * 펌웨어에서 0 은 '무기한' 이다.
 */
export function durationDays(text: string | undefined): number {
  if (!text || /ongoing/i.test(text)) return 0;
  const m = text.match(/(\d+)\s*(day|days|일|week|weeks|주)/i);
  if (!m) return 0;
  const n = Number(m[1]);
  return /week|주/i.test(m[2]) ? n * 7 : n;
}

/**
 * 알람을 주간 슬롯으로. `/save` 로는 보낼 수 없는 것을 담는다.
 *
 * `/save` 에는 **요일 칸도 복용 기간 칸도 없다.** 그래서 그 경로로 보내면 월·수·금
 * 처방이 매일 나오고 30일 코스가 트레이가 빌 때까지 계속된다. 이 함수가 만든 슬롯을
 * `encodeWeekly` 로 묶어 `scheduleUrl` 에 넘기면 둘 다 살아서 도착한다.
 *
 * 요일은 매일(EVERY_DAY)로 둔다 — 앱이 아직 요일을 묻지 않기 때문이고, 모르는 것을
 * 지어내는 것보다 매일이 안전하다. 기간은 처방전에서 읽은 값을 쓴다.
 */
export function weeklyFrom(reminders: Reminder[], maxTrays = FITTED_TRAYS): {
  slots: WeeklySlot[];
  dropped: Reminder[];
} {
  const { plan, dropped } = planTrays(reminders, maxTrays);
  const slots: WeeklySlot[] = plan.map((p) => ({
    slot: p.tray,
    times: [p.time.replace(':', '')],
    days: EVERY_DAY,
    durationDays: durationDays(p.source?.item?.rx?.durationText),
  }));
  return { slots, dropped };
}
