'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DispenserClient } from './relay.ts';
import { PAIRED_EVENT, clientFor, loadPaired, type PairedDevice } from './paired.ts';
import type { DeviceReport, WeeklySlot } from './types.ts';

/**
 * 기기와의 연결을 화면 하나가 붙잡고 있는다 — 긴 폴링.
 *
 * dh 의 `webapp_kit/examples/useDispenser.ts` 를 옮긴 것이다. 바꾼 것은 하나뿐:
 * 페어링 코드를 받지 않고 기억해 둔 짝(paired.ts)으로 붙는다. 코드를 화면까지
 * 들고 다니면 그것을 어딘가 저장해야 하고, 그 저장이 우리가 피하려던 것이다.
 *
 * 나머지 셋은 그대로 두었다. 셋 다 틀리기 쉬운 자리라 원본의 판단이 옳다:
 *   · 아무것도 못 찾은 폴링은 **정상**이지 오류가 아니다
 *   · 끊긴 연결도 정상이다 — 폰이 화면을 끌 때마다 끊긴다. 오류 띠가 아니라 물러서기
 *   · 화면을 떠나면 루프를 멈춰야 한다. 안 그러면 탭이 닫힐 때까지 연결을 붙잡는다
 */

/** 릴레이가 폴링을 붙잡아 두는 시간. 기기 쪽 기본값과 같다. */
const HOLD_SECONDS = 50;
const BACKOFF_START_MS = 1_000;
const BACKOFF_CAP_MS = 60_000;

/**
 * 빈손으로 돌아온 폴링 사이의 최소 간격.
 *
 * 204(새 것 없음)는 이미 서버에서 기다렸다 오므로 이 값이 공짜지만, 404(사서함이
 * 아직 없음)는 **즉시** 돌아온다. 이 바닥이 없으면 짝이 안 지어진 기기에서 루프가
 * 망이 허용하는 만큼 돈다 — 탭 하나당 초당 수백 번. 펌웨어에도 같은 이유의 같은
 * 장치가 있다(`cloud.py` 의 `_MIN_CYCLE_S`).
 */
const IDLE_FLOOR_MS = 2_000;

export interface DispenserState {
  /** 아직 짝이 없으면 null — 화면은 페어링을 보여줘야 한다. */
  paired: PairedDevice | null;
  /** 첫 보고가 오기 전에는 null. */
  report: DeviceReport | null;
  /** 첫 폴링이 어느 쪽으로든 돌아오기 전. */
  loading: boolean;
  /** 전송이 불행할 때만 — 빈손으로 돌아온 폴링은 여기 안 들어간다. */
  error: Error | null;
  /**
   * 한동안 기기 소식이 없다. 보고 **자신의 시각**으로 재는데, 전원이 뽑힌
   * 디스펜서는 여기서 보면 건강한 것과 구별되지 않기 때문이다.
   */
  stale: boolean;
}

export function useDispenser() {
  const [state, setState] = useState<DispenserState>({
    paired: null, report: null, loading: true, error: null, stale: false,
  });
  const clientRef = useRef<DispenserClient | null>(null);
  /** 짝이 바뀌면(페어링·해제) 루프를 다시 세운다. */
  const [generation, setGeneration] = useState(0);

  /*
    짝이 생기면 처음부터 다시 돈다. 시연에서 스스로 짝을 맺는 경우, 이 훅은 이미
    "짝 없음" 으로 멈춰 있어서 그대로 두면 상자 소식이 영영 안 온다.
  */
  useEffect(() => {
    const again = () => setGeneration((n) => n + 1);
    window.addEventListener(PAIRED_EVENT, again);
    return () => window.removeEventListener(PAIRED_EVENT, again);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      const paired = await loadPaired();
      if (cancelled) return;
      if (!paired) {
        setState({ paired: null, report: null, loading: false, error: null, stale: false });
        return;
      }
      setState((s) => ({ ...s, paired }));

      const client = clientFor(paired);
      clientRef.current = client;

      let rev = 0;
      let backoff = BACKOFF_START_MS;

      while (!cancelled && !controller.signal.aborted) {
        try {
          const found = await client.waitForReport(rev, HOLD_SECONDS, controller.signal);
          backoff = BACKOFF_START_MS;

          if (found) {
            rev = found.rev;
            if (!cancelled) {
              setState((s) => ({
                ...s,
                report: found.report,
                loading: false,
                error: null,
                stale: DispenserClient.isStale(found.report),
              }));
            }
          } else if (!cancelled) {
            // 새 것이 없다. 오류가 아니지만 **낡음은 다시 재야 한다** — "오랫동안
            // 새 것이 없다" 가 바로 전원이 뽑힌 기기의 모습이기 때문이다.
            setState((s) => ({
              ...s,
              loading: false,
              stale: s.report ? DispenserClient.isStale(s.report) : s.stale,
            }));
            await new Promise((resolve) => setTimeout(resolve, IDLE_FLOOR_MS));
          }
        } catch (error) {
          if (cancelled || controller.signal.aborted) return;
          setState((s) => ({ ...s, loading: false, error: error as Error }));
          await new Promise((resolve) => setTimeout(resolve, backoff));
          backoff = Math.min(backoff * 2, BACKOFF_CAP_MS);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      clientRef.current = null;
    };
  }, [generation]);

  /** 짝을 새로 지었거나 잊었을 때 부른다 — 루프를 다시 세운다. */
  const refresh = useCallback(() => setGeneration((n) => n + 1), []);

  const setSchedule = useCallback(async (slots: WeeklySlot[]) => {
    const client = clientRef.current;
    if (!client) throw new Error('아직 짝지어진 기기가 없다');
    return client.setSchedule(slots);
  }, []);

  /**
   * 걸려 있는 약의 트레이를 연다. 인자가 없으면 **지금 걸린 것 전부**.
   *
   * 기기는 시간이 됐다고 약을 내보내지 않는다. 걸린 약은 `awaitingRelease` 에 앉아
   * 이 호출을 기다리고, 유예 시간 안에 아무도 부르지 않으면 트레이는 닫힌 채로
   * '놓침' 이 기록된다.
   *
   * 이 함수는 **릴레이가 명령을 받았을 때** 끝난다 — 약이 나온 시점이 아니다.
   * 확인은 `awaitingRelease` 가 빈 채로 도착하는 다음 보고이고, 위 긴 폴링이
   * 그것을 1~2초 안에 가져온다.
   */
  const release = useCallback(async (dose?: { tray?: number; at?: string }) => {
    const client = clientRef.current;
    if (!client) throw new Error('아직 짝지어진 기기가 없다');
    return client.release(dose);
  }, []);

  return { ...state, refresh, setSchedule, release };
}
