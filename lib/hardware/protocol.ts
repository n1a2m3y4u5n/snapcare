/**
 * SnapCare ↔ 디스펜서 광학 프로토콜 (SC1).
 *
 * 왜 QR인가
 * ---------
 * 폰과 기기를 네트워크로 잇는 방법은 셋 다 막혔다. BLE는 iOS WebKit에서 불가,
 * 로컬 WiFi/HTTP는 mixed content와 AP 전환 문제, MQTT/wss는 양쪽 모두 인터넷을 요구해
 * "저인프라에서 동작한다"는 전제를 깬다.
 *
 * 광학 링크는 그 셋을 전부 우회한다. 인터넷도, 페어링도, 같은 네트워크도 필요 없다.
 * 그리고 이 앱의 기본 동작이 이미 "사진을 찍는 것"이라, 기기와의 통신이 별도 기능이 아니라
 * 같은 제스처의 연장이 된다 — 디스펜서가 스캔 대상 하나로 추가될 뿐이다.
 *
 * 왜 QR이고 점멸이 아닌가
 * ----------------------
 * 점멸 디코딩은 카메라 프레임레이트·롤링셔터·자동노출·주변광에 전부 흔들린다.
 * QR은 한 프레임이면 되고 오류정정이 내장돼 있다.
 *
 * 화면 없는 기기 아니었나
 * ----------------------
 * 스크린리스 결정은 "사용자가 화면을 읽어야 기기를 쓸 수 있는" 구조를 없애자는 것이었다.
 * 이 QR은 사람이 아니라 폰이 읽는다. 사람에게 향하는 채널은 여전히 LED 링(색)과 음성뿐이고,
 * 기기는 사용자에게 텍스트를 한 글자도 보여주지 않는다.
 *
 * 인코딩
 * ------
 * QR 영숫자 모드가 쓸 수 있는 문자만 사용한다 (0-9 A-Z 공백 $ % * + - . / :).
 * 바이트 모드보다 같은 내용을 적은 모듈에 담아, 작은 화면에서도 스캔된다.
 *
 * 용량 한계 (실측)
 * ---------------
 * 두 방향의 제약이 완전히 다르다.
 *
 * 기기 → 폰 : 0.96" OLED 는 128x64 인데 QR 은 정사각이라 **세로 64px 가 벽**이다.
 *   테두리 4모듈을 포함하면 모듈 2px 로 version 1 (21x21 → 58px) 까지만 들어간다.
 *   영숫자 ECC-M 기준 **약 20자**. 모듈 3px 로 키우면 v1 도 87px 라 아예 안 들어간다.
 *   → 그래서 이벤트 메시지를 필드 6개로 압축했다 (현재 17자).
 *   → 화면을 1.3"(같은 128x64, 픽셀이 물리적으로 큼)로 올리면 같은 2px 모듈이 훨씬 잘 읽힌다.
 *
 * 폰 → 기기 : 폰 화면은 크므로 한계는 기기 리더 해상도다. ESP32-CAM(640x480)이면
 *   version 10 (57x57, 영숫자 395자) 까지 무난하다. 8칸 트레이 주간 계획을 요일·기간까지
 *   실어도(SC1*W*) 205자라 여유가 있다.
 *   ─ 이 205 는 하드웨어 쪽에서 실제로 세어 정정한 값이다. 여기 적혀 있던 141 은
 *     요일·기간 필드가 없던 시절의 수치였다.
 */

/**
 * 기기 화면에 실제로 그릴 수 있는 최대 글자수 (영숫자, ECC-M, 테두리 4모듈, 모듈 2px).
 * 128x64 OLED 의 세로 64px 안에 들어가는 것은 version 1 뿐이고, 그 용량이 20자다.
 * 이 값을 넘기면 기기가 QR 을 화면에 못 그린다 — 조용히 잘리는 대신 여기서 막는다.
 */
export const MAX_DEVICE_PAYLOAD = 20;

/** 기기 화면에 들어가는 길이인가. */
export function fitsDeviceScreen(payload: string): boolean {
  return payload.length <= MAX_DEVICE_PAYLOAD;
}

export const PROTOCOL = 'SC1';

/** 필드 구분자 — 영숫자 모드에서 쓸 수 있는 문자 중 고름 */
const SEP = '*';
/** 슬롯 구분자 */
const SLOT_SEP = '/';
/** 슬롯 안 시각 구분자 */
const TIME_SEP = '.';
/** W 메시지에서 시각·요일마스크·기간을 가르는 구분자 */
const ATTR_SEP = '-';

/** 요일 비트마스크: bit 0 = 월요일. 종이 시트의 좌→우 배열과 같은 순서다. */
export const EVERY_DAY = 0b1111111;   // 127

/** 기기 칸(슬롯) 하나의 복약 일정. slot 은 회전 트레이의 칸 번호(1부터). */
export interface SlotSchedule {
  slot: number;
  /** 24시간 HHMM (예: '0800'). 하루 안에서 반복되는 시각들. */
  times: string[];
}

/**
 * 요일·기간까지 실은 일정.
 *
 * 종이 폼시트는 칸·요일·기간·시각 넷을 담는데 SC1*S* 에는 뒤의 둘을 실을 자리가 없다.
 * 월/수/금 30일짜리 시트가 '매일 무기한' 과 같은 payload 로 인코딩되고, 일정은 맞아
 * 보이는데 아무도 요청하지 않은 나흘에 약이 나간다 — 조용히 뭉개지는 쪽이 훨씬 나쁘다.
 * (하드웨어 쪽에서 폼시트 파서를 만들다 발견했다. pill_dispenser/README.md 참조)
 */
export interface WeeklySlot extends SlotSchedule {
  /** 요일 비트마스크. bit 0 = 월요일. */
  days: number;
  /** 투약 기간(일). 0 = 무기한. */
  durationDays: number;
}

/** 기기가 폰에게 보고하는 사건. */
export interface DoseEvent {
  slot: number;
  /** 예정 시각 HHMM */
  time: string;
  /** T = 복용함, M = 놓침 */
  taken: boolean;
  /** 재생 방지용 순번 (기기가 증가시킨다) */
  seq: number;
}

/* ────────────────────────────────────────────────────────────
 * 폰 → 기기 : 복약 일정
 * SC1*S*1:0800.2000/2:1800
 * ──────────────────────────────────────────────────────────── */

export function encodeSchedule(slots: SlotSchedule[]): string {
  const body = slots
    .filter((s) => s.times.length > 0)
    .map((s) => `${s.slot}:${s.times.map(normalizeTime).join(TIME_SEP)}`)
    .join(SLOT_SEP);
  return [PROTOCOL, 'S', body].join(SEP);
}

export function decodeSchedule(payload: string): SlotSchedule[] | null {
  const parts = payload.trim().toUpperCase().split(SEP);
  if (parts.length !== 3 || parts[0] !== PROTOCOL || parts[1] !== 'S') return null;
  if (parts[2] === '') return [];

  const slots: SlotSchedule[] = [];
  for (const chunk of parts[2].split(SLOT_SEP)) {
    const [slotText, timesText] = chunk.split(':');
    const slot = Number(slotText);
    if (!Number.isInteger(slot) || slot < 1 || slot > 99 || !timesText) return null;

    const times = timesText.split(TIME_SEP);
    if (!times.every(isValidTime)) return null;
    slots.push({ slot, times });
  }
  return slots;
}

/* ────────────────────────────────────────────────────────────
 * 폰 → 기기 : 요일·기간까지 실은 일정 (SC1*S* 의 상위집합)
 * SC1*W*1:0800.2000-127-030/3:1900-021-000
 *
 * 슬롯마다 [시각들] - [3자리 요일마스크] - [3자리 기간(일)].
 * 폭을 고정한 이유: 8비트 펌웨어가 토크나이저 없이 포인터 연산으로 읽는다.
 * 모든 문자가 QR 영숫자 집합 안에 있어야 한다 — 벗어나면 문자당 5.5비트가 8비트가 되고
 * 코드가 커져서 기기 카메라에 안 들어간다.
 *
 * 이 코드를 모르는 구버전 앱에 보여줘도 안전하다: messageKind 가 모르는 종류에 null 을
 * 주고 decodeSchedule 은 두 번째 필드가 S 가 아니면 거부하므로, 둘 다 throw 하지 않는다.
 * ──────────────────────────────────────────────────────────── */

export function encodeWeekly(slots: WeeklySlot[]): string {
  const body = slots
    .filter((s) => s.times.length > 0)
    .map((s) => [
      `${s.slot}:${s.times.map(normalizeTime).join(TIME_SEP)}`,
      pad3(s.days),
      pad3(Math.min(s.durationDays, 999)),
    ].join(ATTR_SEP))
    .join(SLOT_SEP);
  return [PROTOCOL, 'W', body].join(SEP);
}

export function decodeWeekly(payload: string): WeeklySlot[] | null {
  const parts = payload.trim().toUpperCase().split(SEP);
  if (parts.length !== 3 || parts[0] !== PROTOCOL || parts[1] !== 'W') return null;
  if (parts[2] === '') return [];

  const slots: WeeklySlot[] = [];
  for (const chunk of parts[2].split(SLOT_SEP)) {
    const bits = chunk.split(ATTR_SEP);
    if (bits.length !== 3) return null;
    const [slotTimes, maskText, durText] = bits;

    const [slotText, timesText] = slotTimes.split(':');
    const slot = Number(slotText);
    if (!Number.isInteger(slot) || slot < 1 || slot > 99 || !timesText) return null;

    const times = timesText.split(TIME_SEP);
    if (!times.every(isValidTime)) return null;

    if (!/^\d{3}$/.test(maskText) || !/^\d{3}$/.test(durText)) return null;
    const days = Number(maskText);
    // 마스크 0 은 '어느 요일에도 복용하지 않음' 이라 일정으로서 뜻이 없다.
    if (days < 1 || days > EVERY_DAY) return null;

    slots.push({ slot, times, days, durationDays: Number(durText) });
  }
  return slots;
}

/* ────────────────────────────────────────────────────────────
 * 기기 → 폰 : 복용 결과  (작은 OLED에 들어가야 하므로 짧게)
 * SC1*E*1*0800*T*07        → 17자 (한계 20자)
 * ──────────────────────────────────────────────────────────── */

export function encodeEvent(e: DoseEvent): string {
  const payload = [PROTOCOL, 'E', String(e.slot), normalizeTime(e.time), e.taken ? 'T' : 'M', pad2(e.seq)]
    .join(SEP);
  if (!fitsDeviceScreen(payload)) {
    // 기기 화면에 안 들어가는 메시지는 만들어봐야 표시할 수 없다.
    // 필드를 늘릴 때 여기서 걸리면, 화면을 키우거나 인코딩을 더 줄여야 한다는 뜻이다.
    throw new Error(
      `device payload ${payload.length} chars exceeds ${MAX_DEVICE_PAYLOAD} (128x64 OLED, 2px modules)`,
    );
  }
  return payload;
}

export function decodeEvent(payload: string): DoseEvent | null {
  const p = payload.trim().toUpperCase().split(SEP);
  if (p.length !== 6 || p[0] !== PROTOCOL || p[1] !== 'E') return null;

  const slot = Number(p[2]);
  const seq = Number(p[5]);
  if (!Number.isInteger(slot) || slot < 1 || slot > 99) return null;
  if (!isValidTime(p[3])) return null;
  if (p[4] !== 'T' && p[4] !== 'M') return null;
  if (!Number.isInteger(seq) || seq < 0 || seq > 99) return null;

  return { slot, time: p[3], taken: p[4] === 'T', seq };
}

/** 어떤 방향의 메시지인지만 먼저 가려낸다 (카메라가 무엇을 읽었는지 모르므로). */
export function messageKind(payload: string): 'schedule' | 'weekly' | 'event' | null {
  const p = payload.trim().toUpperCase().split(SEP);
  if (p[0] !== PROTOCOL) return null;
  return p[1] === 'S' ? 'schedule'
    : p[1] === 'W' ? 'weekly'
    : p[1] === 'E' ? 'event'
    : null;
}

/* ── 시각 표기 ───────────────────────────────────────────── */

/** '8:00 AM' · '18:00' · '0800' → '0800' */
export function normalizeTime(input: string): string {
  const t = input.trim().toUpperCase();

  const ampm = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (ampm) {
    let h = Number(ampm[1]) % 12;
    if (ampm[3] === 'PM') h += 12;
    return pad2(h) + ampm[2];
  }
  const hhmm = t.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) return pad2(Number(hhmm[1])) + hhmm[2];

  const digits = t.replace(/\D/g, '');
  return digits.length === 4 ? digits : '0000';
}

function isValidTime(t: string): boolean {
  if (!/^\d{4}$/.test(t)) return false;
  const h = Number(t.slice(0, 2));
  const m = Number(t.slice(2));
  return h < 24 && m < 60;
}

function pad3(n: number): string {
  return String(Math.max(0, Math.trunc(n))).padStart(3, '0');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}
