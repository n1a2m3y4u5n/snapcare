'use client';

import { useEffect, useRef } from 'react';
import { useScans, todayKey } from '@/stores/scans';
import { useProfile } from '@/stores/profile';
import { eventId, toScanRecord } from './doseLog.ts';
import type { DeviceReport } from './types.ts';

/**
 * 상자가 남긴 복용 사건을 앱의 기록으로 옮긴다.
 *
 * 이것이 없으면 짝지은 상자는 약을 내보내기만 하고 아무 흔적도 남기지 않는다 —
 * 기록을 만들려면 기기 화면의 코드를 사람이 찍어야 했고, 그 수고를 없애자는 것이
 * 상자를 만든 이유였다.
 *
 * 세 가지를 조심한다:
 *
 *  · **두 번 넣지 않는다.** 보고는 같은 사건을 계속 다시 실어 온다. 새로고침하면
 *    ref 는 비지만 저장소에는 남아 있으므로, 저장된 것도 함께 본다.
 *  · **오래된 것부터 넣는다.** addScan 은 앞에 붙이므로, 최신부터 넣으면 목록이
 *    뒤집힌다.
 *  · **약 이름은 알면 쓰고 모르면 칸 번호로 부른다.** 이름을 지어내면 기록이
 *    거짓말을 하고, 그 기록은 나중에 식이 일지가 원인을 찾는 재료가 된다.
 */
export function useDoseLog(report: DeviceReport | null,
                           names?: Record<number, string>,
                           doses?: Record<number, string>) {
  const addScan = useScans((s) => s.addScan);
  /** 이번 화면에서 이미 넣은 것. 폴링마다 저장소를 훑지 않기 위한 것뿐이다. */
  const filed = useRef<Set<string>>(new Set());

  /*
    `names` 를 의존성에 그대로 둔다. 부르는 쪽에서 useMemo 로 안정된 객체를 주기
    때문이고(약이 바뀔 때만 새로 만들어진다), 설령 한 번 더 돌아도 아래는 이미 넣은
    것을 건너뛰므로 하는 일이 없다. 처음에는 ref 로 들고 있으려 했는데 렌더 중에 ref
    를 건드리는 것이 되어 규칙에 걸렸다 — 규칙이 옳다.
  */
  useEffect(() => {
    const events = report?.events;
    if (!events?.length) return;

    const already = new Set(useScans.getState().scans.map((r) => r.id));
    const today = todayKey();
    const memberId = useProfile.getState().profile?.id ?? 'you';

    for (const e of [...events].reverse()) {
      const id = eventId(e);
      if (filed.current.has(id) || already.has(id)) continue;
      filed.current.add(id);
      addScan(toScanRecord(e, {
        today, memberId,
        name: names?.[e.tray],
        doseText: doses?.[e.tray],
      }));
    }
  }, [report, addScan, names, doses]);
}
