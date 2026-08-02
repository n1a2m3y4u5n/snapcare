/**
 * 시각을 글자 없이 보여주기.
 *
 * 화면에서 시각만은 끝까지 글자로 남아 있었다 — "2:14 PM", "08:00". 판정은 색으로,
 * 성분은 픽토그램으로 옮겼는데 시각은 읽을 줄 알아야만 도착한다.
 *
 * 아날로그 시계 문자판은 글을 몰라도 배우는 표기이고(바늘 위치가 곧 시각이다),
 * 해와 달은 그보다도 앞선다. 둘을 겹쳐 쓴다 — 문자판이 몇 시인지를, 해/달이
 * 오전인지 밤인지를 맡는다. 12시간제 문자판만으로는 아침 8시와 저녁 8시가 같아 보인다.
 */

/** 시계 문자판 이모지 (정시 🕐~🕛, 반시 🕜~🕧). */
const OCLOCK = 0x1f550;   // 🕐 = 1시
const HALF = 0x1f55c;     // 🕜 = 1시 30분

/**
 * 가장 가까운 30분으로 반올림한 문자판.
 * 분 단위까지 그릴 방법이 없으므로 반올림하고, 정확한 시각은 옆의 글자가 맡는다.
 */
export function clockFace(hour24: number, minute: number): string {
  let h = hour24 % 12;
  let half = false;
  if (minute >= 45) h = (h + 1) % 12;
  else if (minute >= 15) half = true;

  const index = h === 0 ? 11 : h - 1;   // 12시가 배열 끝
  return String.fromCodePoint((half ? HALF : OCLOCK) + index);
}

export interface DayPart {
  emoji: string;
  /** 음성으로 읽을 때 쓰는 말 */
  label: string;
}

/**
 * 하루 중 어느 때인가.
 * 경계는 대상 지역(적도 부근)의 해가 뜨고 지는 시각에 맞췄다 — 위도가 높은 곳의
 * 여름 기준으로 잡으면 저녁 8시가 대낮으로 표시된다.
 */
export function dayPart(hour24: number): DayPart {
  if (hour24 >= 5 && hour24 < 11) return { emoji: '🌅', label: 'in the morning' };
  if (hour24 >= 11 && hour24 < 16) return { emoji: '☀️', label: 'in the middle of the day' };
  if (hour24 >= 16 && hour24 < 20) return { emoji: '🌆', label: 'in the evening' };
  return { emoji: '🌙', label: 'at night' };
}

/**
 * 화면에 있는 시각 문자열에서 시·분을 뽑는다.
 *
 * 앱 안에 세 가지 형태가 섞여 있다:
 *   'Today · 2:14 PM'  (기록 라벨)   '08:00' (복약 시간표)   '8:00 AM'
 * 못 읽으면 null 을 주고, 부르는 쪽은 글자만 보여준다 — 틀린 시계를 그리느니 없는 편이 낫다.
 */
export function parseClock(text: string): { hour: number; minute: number } | null {
  const m = text.match(/(\d{1,2})\s*:\s*(\d{2})\s*(AM|PM)?/i);
  if (!m) return null;

  let hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59) return null;

  const suffix = m[3]?.toUpperCase();
  if (suffix === 'PM' && hour < 12) hour += 12;
  if (suffix === 'AM' && hour === 12) hour = 0;
  if (hour > 23) return null;

  return { hour, minute };
}

/** 시각을 음성으로. "8시 30분 아침" 처럼 읽어준다. */
export function speakTime(hour24: number, minute: number): string {
  const h12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const mm = minute === 0 ? "o'clock" : minute < 10 ? `oh ${minute}` : String(minute);
  return `${h12} ${mm} ${dayPart(hour24).label}`;
}

/**
 * 지금부터 그 시각까지 몇 밀리초인가. 이미 지났으면 **내일 같은 시각**까지.
 *
 * 알림을 예약하는 데 쓴다. 저녁 7시에 아침 8시 약을 찍은 사람에게 오늘 아침으로
 * 계산한 음수를 주면, 예약이 조용히 취소되거나(음수는 예약하지 않는다) 즉시 뜬다.
 * 둘 다 사용자에게는 "알림이 이상하다" 로만 보인다.
 */
export function msUntil(text: string, now = new Date()): number {
  const t = parseClock(text);
  if (!t) return -1;
  const at = new Date(now);
  at.setHours(t.hour, t.minute, 0, 0);
  if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
  return at.getTime() - now.getTime();
}
