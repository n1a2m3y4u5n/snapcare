'use client';

import { useEffect, useRef } from 'react';
import { canNotify, notify } from '@/lib/notifications';
import type { DeviceReport } from './types.ts';

/**
 * 상자가 약을 내밀면 폰이 부른다.
 *
 * 배출 버튼은 앱을 보고 있는 사람에게만 보인다. 상자는 불이 켜지고 소리가 나지만
 * 그것은 상자 옆에 있는 사람에게만 닿고, 유예가 지나면 트레이는 닫힌 채로 '놓침' 이
 * 기록된다. 부르는 자리가 없으면 배출 기능은 **앱을 마침 열어 둔 사람에게만** 동작한다.
 *
 * 세 가지를 조심한다:
 *
 *  · **한 번만 부른다.** 긴 폴링은 같은 약을 몇 번이고 다시 실어 온다. 부른 것을
 *    기억해 두지 않으면 알림이 몇 초마다 다시 뜬다.
 *  · **보고 있으면 부르지 않는다.** 화면에 배출 카드가 이미 떠 있고 소리로도 말했다.
 *    거기에 알림까지 겹치면 같은 말을 세 번 하는 것이고, 알림 서랍만 지저분해진다.
 *  · **하나로 묶어 부른다.** 08시에 두 트레이가 걸렸으면 알림도 하나다 — 버튼이
 *    하나인 것과 같은 이유다.
 */

function hhmm(text: string): string {
  return text.length === 4 ? `${text.slice(0, 2)}:${text.slice(2)}` : text;
}

export function useDoseAlert(report: DeviceReport | null) {
  /** 이미 부른 약. 같은 것을 폴링마다 다시 부르지 않는다. */
  const called = useRef<Set<string>>(new Set());

  useEffect(() => {
    const due = report?.status.awaitingRelease ?? [];
    if (due.length === 0) return;
    if (!canNotify()) return;

    const key = due.map((d) => `${d.tray}@${d.dueAt}`).join(',');
    if (called.current.has(key)) return;
    called.current.add(key);

    // 사람이 이 화면을 보고 있으면 카드가 이미 말했다.
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;

    const title = due.length === 1
      ? `Your ${hhmm(due[0].time)} medicine is ready`
      : `${due.length} medicines are ready`;
    void notify(title, 'Open SnapCare and press the button to open the tray.', {
      // 태그가 고정이라 새 약이 걸리면 앞의 알림을 **갈아치운다.** 쌓이지 않는 것이
      // 맞다 — 서랍에 남은 옛 알림을 눌러도 그 약은 이미 유예가 지났다.
      tag: 'snapcare-dose-ready',
      sticky: true,
    });
  }, [report]);
}
