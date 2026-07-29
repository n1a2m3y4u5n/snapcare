import type { Reminder } from '@/stores/reminders';
import { to24h } from '../hardware/dispenser.ts';   // 상대 경로 — 시험에서 @/ 별칭이 안 통한다

/**
 * 처방에는 끝이 있다.
 *
 * 무엇이 문제였나
 * ---------------
 * 앱은 복약을 **시작할 수만 있고 끝내지 못했다.** `reminders.remove` 는 있는데
 * 부르는 곳이 한 군데도 없었다. 7일짜리 항생제도 8일째, 100일째 계속 울린다.
 *
 * 그리고 처방을 다시 찍으면 알람이 겹쳤다. 의사가 용량을 반으로 줄여도 옛 알람과
 * 새 알람이 둘 다 울린다. 앱은 처방이 **바뀌었다**는 것을 표현할 방법이 없었다.
 *
 * 왜 이것이 다른 어떤 결함보다 무거운가
 * --------------------------------------
 * 이 프로젝트의 문제 정의가 항생제 내성이다 — 증상이 가시면 끊는 것. 그래서
 * `finish_course` 형태소까지 만들어 "끝까지 드세요" 를 그린다. 그런데 **끝났다고
 * 말해 주는 순간이 없었다.**
 *
 * 더 나쁜 것은 그 다음이다. **가끔 틀리는 알람은 모든 알람을 무시하게 만든다.**
 * 일주일 지나서도 울리는 항생제 알람을 며칠 겪은 사람은 알람을 끄거나 흘려듣게
 * 되고, 그러면 평생 먹어야 하는 당뇨약 알람까지 같이 죽는다. 정작 알람이 꼭
 * 필요한 쪽이 그쪽이다.
 *
 * 자료는 이미 다 있었다 — OCR 이 "for 7 days" 를 읽고, `durationDays()` 가 그것을
 * 숫자로 바꾸고, 시험까지 통과한다. 다만 그 값을 **기기로 보낼 때만** 쓰고 앱
 * 자신은 쓰지 않았다.
 */

/** 하루를 밀리초로. 날짜만 다루므로 UTC 로 계산한다 (시간대에서 하루가 밀린다). */
const DAY = 86_400_000;

/** 'YYYY-MM-DD' → UTC 밀리초. */
function at(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** UTC 밀리초 → 'YYYY-MM-DD'. */
function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * 같은 약인가를 가르는 열쇠.
 *
 * 아이템 표(`ocr_…`)는 **읽어낸 글자의 해시**라 같은 처방전을 다시 찍어도 조명이
 * 달라지면 값이 달라진다. 그래서 이름으로 가른다.
 *
 * 이름이 다르게 읽히면 다른 약으로 본다. 그쪽으로 틀리면 알람이 하나 남는 것이고,
 * 반대로 틀리면 **살아 있는 알람을 지우는 것**이다. 둘 중에는 앞이 낫다.
 */
export function medicineKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * 마지막으로 먹는 날. 무기한(days = 0)이면 null.
 *
 * 시작일을 1일째로 센다 — "7일간" 은 오늘 포함 이레다. 처방전에 그렇게 적히고,
 * 약국에서도 그렇게 센다.
 */
export function lastDay(startedOn: string, days: number): string | null {
  if (!days || days <= 0) return null;
  return iso(at(startedOn) + (days - 1) * DAY);
}

/** 이 알람의 복약 기간이 끝났는가. */
export function isOver(r: Reminder, today: string): boolean {
  if (!r.startedOn || !r.days) return false;
  const last = lastDay(r.startedOn, r.days);
  return last !== null && at(today) > at(last);
}

/** 아직 도는 것만. */
export function running(reminders: Reminder[], today: string): Reminder[] {
  return reminders.filter((r) => !isOver(r, today));
}

/** 오늘로 끝난 것들 (약 단위로 하나씩). */
export function finished(reminders: Reminder[], today: string): Reminder[] {
  const seen = new Set<string>();
  return reminders.filter((r) => {
    if (!isOver(r, today)) return false;
    const k = medicineKey(r.item.name);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * 다음에 먹을 것.
 *
 * 전에는 배열의 첫 번째를 썼는데, 그 배열은 **최근에 더한 순**이지 시각순이 아니다.
 * 약을 세 개 먹는 사람에게 홈은 아무거나 하나를 "다음 복용" 이라고 보여주고 있었다.
 *
 * 지금 시각을 지난 것은 내일 것으로 본다 — 하루를 한 바퀴 돌려 가장 가까운 것을
 * 고른다. 시각을 읽을 수 없는 것('as needed')은 후보에서 뺀다.
 */
export function nextDue(reminders: Reminder[], nowHm: string): Reminder | undefined {
  const now = minutes(nowHm);
  let best: { r: Reminder; wait: number } | undefined;
  for (const r of reminders) {
    const t = minutes(to24h(r.time));
    // NaN 을 null 로 검사하고 있었다. 걸러지지 않은 'as needed' 가 첫 번째 후보가
    // 되면 그다음 비교는 전부 false(NaN)라 **늘 그것이 다음 복용**이 됐다.
    if (Number.isNaN(t)) continue;
    const wait = (t - now + 1440) % 1440;
    if (!best || wait < best.wait) best = { r, wait };
  }
  return best?.r;
}

function minutes(hm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

/**
 * 같은 약의 옛 알람을 새 것으로 **갈아 끼운다.**
 *
 * 전에는 앞에 붙이기만 했다. 처방전을 다시 찍으면 — 리필이든, 의사가 용량을
 * 바꿨든 — 옛 알람이 그대로 남아 새 것과 함께 울렸다. 화면에는 두 줄이 보이지만
 * 그것이 두 개의 처방인지 같은 것이 두 번 들어온 것인지 알 방법이 없다.
 *
 * 다른 약은 손대지 않는다. 당뇨약을 먹는 사람이 항생제를 새로 받았다고 당뇨약
 * 알람이 사라지면 안 된다.
 */
export function replaceCourse(existing: Reminder[], incoming: Reminder[]): Reminder[] {
  const keys = new Set(incoming.map((r) => medicineKey(r.item.name)));
  return [...incoming, ...existing.filter((r) => !keys.has(medicineKey(r.item.name)))];
}
