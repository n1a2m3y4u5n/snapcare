'use client';

import { useEffect, useRef } from 'react';

import { PERMISSION_EVENT, canNotify, notify } from '@/lib/notifications';
import { todayKey } from '@/stores/scans';
import { useReminders } from '@/stores/reminders';
import { bundle, upcoming } from './due';

/**
 * 복약 시각마다 폰이 부른다. 앱이 열려 있는 동안.
 *
 * 무엇이 고쳐졌는가
 * -----------------
 * 알람을 거는 자리가 처방전 스캔 화면 안에 있었고, 거기서 **첫 복용 하나**만 걸었다.
 * 하루 세 번 먹는 약을 등록하면 아침만 울리고 점심·저녁은 앱이 침묵했다. 그리고 그
 * 사실을 알아채려면 저녁까지 앱을 켜 두고 기다려야 해서 아무도 알아채지 못했다.
 *
 * 왜 다시 계산하는가
 * ------------------
 * 타이머는 걸어 두고 잊는 것이 아니다. 세 가지가 그것을 무너뜨린다.
 *
 *  · **폰이 잔다.** 화면을 끄면 브라우저가 타이머를 미루거나 아예 죽인다. 그래서
 *    화면이 다시 보이는 순간(`visibilitychange`)마다 처음부터 다시 잡는다.
 *  · **자정이 온다.** 창을 하루로 자르므로(`upcoming`), 어제 잡은 것은 오늘 것을
 *    모른다.
 *  · **처방이 바뀐다.** 스토어를 구독하는 것이 이 훅이 스캔 화면과 다른 점이다 —
 *    약을 지우면 그 알람도 같이 사라진다.
 *
 * 두 번 울리지 않게
 * -----------------
 * 다시 잡을 때마다 걸어 둔 타이머를 **전부 걷고** 다시 건다. 그러지 않으면 앱을
 * 열 때마다 같은 8시가 한 겹씩 쌓인다. 이미 울린 것은 `fired` 가 기억하는데,
 * 그 이름에 날짜가 들어 있어서(`alarmKey`) 내일 같은 시각은 다른 알람이 된다.
 *
 * 무엇을 여전히 못 하는가
 * -----------------------
 * 탭을 완전히 닫으면 타이머도 죽는다. 상자를 짝지은 사람은 그 너머까지 간다
 * (상자 → 릴레이 → `/api/push/notify` → Web Push). 상자 없이 앱만 쓰는 사람에게는
 * 아직 그 길이 없고, 그것을 여는 것은 서버가 시각을 알아야 하는 별개의 일이다.
 */
export function useDoseReminders(): void {
  const reminders = useReminders((s) => s.reminders);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** 이미 울린 알람. 날짜가 이름에 들어 있으므로 내일 같은 시각은 여기 없다. */
  const fired = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    function arm() {
      for (const t of timers.current) clearTimeout(t);
      timers.current = [];
      if (!canNotify()) return;

      for (const alarm of bundle(upcoming(reminders, todayKey()))) {
        if (fired.current.has(alarm.key)) continue;
        timers.current.push(setTimeout(() => {
          fired.current.add(alarm.key);
          void notify(alarm.title, alarm.body, {
            // 상자 알림과 **같은 태그다.** 둘 다 도착하는 것은 정상인데(앱이 열려
            // 있고 상자도 보고했다), 서랍에 같은 말이 두 줄 남을 이유는 없다.
            tag: 'snapcare-dose',
            sticky: true,
          });
        }, alarm.inMs));
      }
    }

    arm();
    // 화면이 돌아올 때마다 다시. 잠든 사이에 타이머가 미뤄졌거나 죽었을 수 있고,
    // 자정을 넘겼을 수도 있다.
    const wake = () => { if (document.visibilityState === 'visible') arm(); };
    document.addEventListener('visibilitychange', wake);
    // 허락을 막 받은 순간. 그 전까지 `arm` 은 `canNotify()` 에서 되돌아 나왔고,
    // 이 신호가 없으면 허락한 그날 알람이 통째로 빈다.
    window.addEventListener(PERMISSION_EVENT, arm);
    return () => {
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener(PERMISSION_EVENT, arm);
      for (const t of timers.current) clearTimeout(t);
      timers.current = [];
    };
  }, [reminders]);
}
