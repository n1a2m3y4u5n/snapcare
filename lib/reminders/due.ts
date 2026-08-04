// 상대 경로 — 시험에서 @/ 별칭이 안 통한다 (lib/snapcare/course.ts 와 같은 이유).
import { msUntil } from '../snapcare/clock.ts';
import { running } from '../snapcare/course.ts';
import type { Reminder } from '@/stores/reminders';

/**
 * **앞으로 울려야 할 알람들.** 시각 계산만 하고 아무것도 띄우지 않는다.
 *
 * 왜 이 파일이 생겼는가
 * ---------------------
 * 복약 알림을 거는 자리가 하나 있었고, 그 하나가 처방전을 스캔한 화면 안이었다
 * (`app/scan/page.tsx`). 거기서 `setTimeout` 을 **하나** 걸었다 — 그 처방의
 * **첫 복용** 하나. 하루 세 번 먹는 약을 등록하면 아침만 알리고 점심과 저녁은
 * 앱이 아무 말도 하지 않았다. 그것을 알아채려면 저녁까지 앱을 켜 두고 기다려야 해서
 * 아무도 알아채지 못했다.
 *
 * 스캔 화면이 알람을 걸 자리가 아니라는 것이 문제의 뿌리다. 알람은 **스캔한 순간**이
 * 아니라 **약을 먹기로 한 시각들**에 딸린 것이고, 그 목록은 스토어에 있다.
 *
 * 무엇을 못 하는가
 * ----------------
 * 이것은 여전히 **앱이 살아 있는 동안**의 알림이다. 탭을 완전히 닫으면 타이머도 같이
 * 죽는다. 그것을 넘는 길은 둘뿐이고 둘 다 서버가 필요하다 — 상자를 짝지은 사람은
 * 이미 그 길로 간다(상자 → 릴레이 → `/api/push/notify` → Web Push). 상자 없이 앱만
 * 쓰는 사람에게는 아직 그 길이 없다.
 *
 * 그래도 이것이 의미 있는 이유는, 지금 고치는 것이 "닫은 앱"이 아니라 **"열어 둔
 * 앱조차 두 번째 복용을 말하지 않는다"** 이기 때문이다.
 */

export interface DueAlarm {
  /** 이 알람을 다시 걸지 않기 위한 이름. 하루 안에서 유일하다. */
  key: string;
  /** 지금부터 몇 ms 뒤인가. */
  inMs: number;
  reminder: Reminder;
}

/**
 * 앞으로 `withinMs` 안에 올 복용 시각들, 이른 것부터.
 *
 * `withinMs` 가 있는 이유는 `setTimeout` 이다. 2^31-1 ms(약 24.8일)를 넘는 지연을
 * 주면 브라우저는 기다리지 않고 **즉시** 실행한다 — 무기한 알람 하나가 그 순간
 * 알림으로 튀어나온다. 기본값을 하루로 두는 것은 그보다 짧게 잡아 두려는 것이고,
 * 하루면 아침에 연 앱이 그날 저녁까지를 다 잡는다.
 *
 * 끝난 처방은 `running` 이 걷는다. 여기서 다시 판단하지 않는 것은 의도다 — "이
 * 처방이 아직 유효한가" 는 `course.ts` 한 곳에서만 답해야 하는 물음이고, 두 곳에서
 * 답하기 시작하면 어느 날 두 답이 갈린다.
 */
export function upcoming(reminders: Reminder[], today: string,
                         now = new Date(), withinMs = 24 * 60 * 60 * 1000): DueAlarm[] {
  const out: DueAlarm[] = [];
  for (const r of running(reminders, today)) {
    const inMs = msUntil(r.time, now);
    if (inMs < 0 || inMs > withinMs) continue;
    out.push({ key: alarmKey(r, now, inMs), inMs, reminder: r });
  }
  return out.sort((a, b) => a.inMs - b.inMs);
}

/**
 * 이 알람을 두 번 울리지 않기 위한 이름.
 *
 * **날짜가 들어가야 한다.** 약 이름과 시각만으로 지으면 오늘 아침 8시에 울린 알람이
 * 내일 아침 8시에 "이미 울린 것" 이 되어 영원히 조용해진다. 매일 먹는 약인데.
 *
 * 날짜는 지금이 아니라 **울릴 때**의 날짜다. 밤 11시에 앱을 열면 내일 아침 8시 알람이
 * 잡히는데, 그것을 오늘 날짜로 이름 붙이면 자정을 넘겨 다시 계산할 때 같은 알람이
 * 다른 이름을 받는다.
 */
export function alarmKey(r: Reminder, now: Date, inMs: number): string {
  const at = new Date(now.getTime() + inMs);
  const day = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
  return `${day}|${r.memberId}|${r.item.name}|${r.time}`;
}

/**
 * 같은 분에 겹치는 약들을 한 알림으로.
 *
 * 아침 8시에 세 알을 먹는 사람에게 알림을 세 개 보내면, 그것은 알림이 아니라 서랍을
 * 채우는 일이다. 상자 쪽 알림(`useDoseAlert`)이 이미 같은 규칙으로 묶고 있고 —
 * "버튼이 하나인 것과 같은 이유" — 이쪽만 따로 굴 이유가 없다.
 */
export function bundle(alarms: DueAlarm[]): { key: string; inMs: number; title: string; body: string }[] {
  const byTime = new Map<number, DueAlarm[]>();
  for (const a of alarms) {
    const at = Math.round(a.inMs / 60000);          // 분 단위로 묶는다
    (byTime.get(at) ?? byTime.set(at, []).get(at)!).push(a);
  }
  return [...byTime.values()].map((group) => {
    const names = group.map((a) => a.reminder.item.name);
    return {
      key: group.map((a) => a.key).join(','),
      inMs: group[0].inMs,
      title: 'SnapCare · Dose reminder',
      body: names.length === 1
        ? `${names[0]} — ${group[0].reminder.time}`
        : `${names.join(', ')} — ${group[0].reminder.time}`,
    };
  });
}
