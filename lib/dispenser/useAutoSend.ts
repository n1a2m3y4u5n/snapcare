'use client';

import { useEffect, useRef, useState } from 'react';

import { FITTED_TRAYS } from '../hardware/dispenser.ts';
import { useReminders } from '../../stores/reminders.ts';
import { pending } from './autoSend.ts';
import { clientFor, loadPaired } from './paired.ts';
import { toCloudSlots } from './fromApp.ts';

/**
 * 폰에서 만든 알람을 짝지은 상자로 **저절로** 보낸다.
 *
 * 왜 필요한가
 * -----------
 * 알람을 만드는 것과 상자에 일정을 넣는 것이 별개 동작이었다. 기기 화면까지 가서
 * 전송 버튼을 눌러야 상자가 알았고, 안 누르면 앱에는 알람이 있고 상자에는 아무
 * 일정도 없는 상태가 된다 — **그리고 화면 어디에도 그 어긋남이 보이지 않았다.**
 *
 * 그게 조용히 틀리는 종류의 실패다. 보냈다고 믿은 사람은 아침에 약이 나올 것이라고
 * 믿고, 그 믿음은 아무 일도 일어나지 않는 아침에 깨진다. 벤치에서 그대로 나온 말:
 * "핸드폰에서 만든 리마인더가 기기로는 전송이 안 되는 느낌인데."
 *
 * 같은 것을 두 번 보내지 않는다
 * -----------------------------
 * **이게 이 파일에서 제일 조심할 자리다.** 기기는 새 일정을 받으면 "오늘 이미 나간
 * 것" 을 다시 센다 — 그래야 처방이 바뀐 날 아침 약이 새 계획대로 나온다. 그러니
 * 내용이 같은 일정을 다시 보내면 이미 먹은 복용이 다시 밀린 것이 되고, 그것은 한
 * 번 더 먹으라는 뜻이 된다.
 *
 * 그래서 보내기 전에 `SC1*W*` 문자열을 만들어 **마지막으로 보낸 것**과 견준다.
 * 같으면 아무 일도 안 한다. 이 비교가 스토어의 모양이 아니라 전선에 실릴 바이트를
 * 보는 것도 그래서다 — 알람의 이름이나 색이 바뀌어도 상자에 갈 것은 그대로다.
 *
 * 무엇을 기다리지 않는가
 * ----------------------
 * 첫 보고를 기다리지 않는다. `loadPaired()` 만 있으면 사서함에 놓을 수 있고,
 * 상자가 꺼져 있어도 켜지는 순간 받는다. 그게 사서함을 쓰는 이유다.
 *
 * 실패는 삼키지 않는다
 * --------------------
 * 못 보냈으면 그 사실이 남는다(`error`). 망이 없거나 짝이 없으면 실패하는 것이
 * 정상이고, 정상이라고 해서 사람이 몰라도 되는 것은 아니다.
 */

/** 사람이 알람을 여러 개 손보는 동안 기다린다. 한 번에 한 번만 보내려고. */

const SETTLE_MS = 1_500;

export interface AutoSend {
  /** 마지막으로 상자에 놓은 일정, 또는 null. */
  sent: string | null;
  /** 지금 보내는 중인가. */
  sending: boolean;
  /** 마지막 실패, 또는 null. 성공하면 지워진다. */
  error: string | null;
}

export function useAutoSend(trays: number = FITTED_TRAYS): AutoSend {
  const reminders = useReminders((s) => s.reminders);
  const [state, setState] = useState<AutoSend>({
    sent: null, sending: false, error: null,
  });

  /*
    보낸 것을 ref 에 둔다. 상태에 두면 그것을 바꾸는 것이 이 이펙트를 다시 돌게
    하고, 다시 돌면 또 보낸다.
  */
  const lastSent = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // 빈 일정은 보내지 않는다. 그것은 상자에 실린 것을 지우라는 뜻인데, 앱을 새
    // 폰에 깔아 알람이 아직 비어 있는 상태와 사람이 전부 지운 상태가 이 자리에서
    // 구별되지 않는다. 지우는 것은 사람이 명시적으로 할 일이다.
    const next = pending(reminders, trays, lastSent.current);
    if (!next) return;
    const { payload, slots } = next;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void (async () => {
        const paired = await loadPaired();
        if (!paired) return;             // 짝이 없다. 실패가 아니라 할 일이 없는 것
        setState((s) => ({ ...s, sending: true }));
        try {
          await clientFor(paired).setSchedule(toCloudSlots(slots));
          lastSent.current = payload;
          setState({ sent: payload, sending: false, error: null });
        } catch (err) {
          console.error('[dispenser] 자동 전송 실패:', err);
          setState((s) => ({
            ...s,
            sending: false,
            error: '상자에 닿지 못했다',
          }));
        }
      })();
    }, SETTLE_MS);

    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [reminders, trays]);

  return state;
}
