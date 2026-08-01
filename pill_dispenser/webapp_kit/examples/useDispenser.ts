/**
 * The long poll, written properly — as a React hook.
 *
 * This is an example to copy or to read, not part of the module. It makes two
 * assumptions the kit itself deliberately does not: that you are using React,
 * and that a component's lifetime is the right lifetime for the connection.
 *
 * The loop is four lines. Everything else here is the three things that are
 * easy to get wrong:
 *
 *   - a poll that finds nothing is the normal case, not an error
 *   - a dropped connection is also normal — it happens every time a phone locks
 *     its screen — so it needs backoff, not an error banner
 *   - the loop must stop when the component unmounts, or a page somebody
 *     navigates away from goes on holding a connection until the tab closes
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DispenserClient,
  RevisionConflictError,
  type DeviceReport,
  type WeeklySlot,
} from '@/lib/snapcare/dispenser';

/** How long the relay holds a poll open. Matches the device's own default. */
const HOLD_SECONDS = 50;

/** Backoff after a failed poll: 1s, 2s, 4s … capped. */
const BACKOFF_START_MS = 1_000;
const BACKOFF_CAP_MS = 60_000;

export interface DispenserState {
  /** Null until the first report arrives. */
  report: DeviceReport | null;
  /** True until the first poll returns, either way. */
  loading: boolean;
  /**
   * Set when the *transport* is unhappy — a relay that is down, a token that
   * does not open the mailbox. Not set by a poll that simply found nothing.
   */
  error: Error | null;
  /**
   * True when the device has not been heard from for a while. Judged from the
   * report's own timestamp, because a dispenser whose power has been pulled
   * looks identical to a healthy one from here.
   */
  stale: boolean;
}

export function useDispenser(relayUrl: string, claim: string) {
  const [state, setState] = useState<DispenserState>({
    report: null,
    loading: true,
    error: null,
    stale: false,
  });
  const clientRef = useRef<DispenserClient | null>(null);

  useEffect(() => {
    if (!relayUrl || !claim) return;

    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      let client: DispenserClient;
      try {
        client = await DispenserClient.pair({ relayUrl, claim });
      } catch (error) {
        // A bad pairing code fails here, before any network happens. That is
        // the right place for it: it is a typo, not an outage.
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: error as Error }));
        return;
      }
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
              setState({
                report: found.report,
                loading: false,
                error: null,
                stale: DispenserClient.isStale(found.report),
              });
            }
          } else if (!cancelled) {
            // Nothing new. Not an error — but it is a moment to re-check
            // staleness, because "nothing new for a long time" is exactly what
            // an unplugged dispenser looks like.
            setState((s) => ({
              ...s,
              loading: false,
              stale: s.report ? DispenserClient.isStale(s.report) : s.stale,
            }));
          }
        } catch (error) {
          if (cancelled || controller.signal.aborted) return;
          if (!cancelled) setState((s) => ({ ...s, loading: false, error: error as Error }));
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
  }, [relayUrl, claim]);

  /**
   * Publish a schedule. Returns the new revision, or throws.
   *
   * A `RevisionConflictError` means somebody else saved while this screen was
   * open — re-read and show them the newer schedule. Do not retry: the writer
   * that lost is the one holding the stale copy.
   */
  const setSchedule = useCallback(async (slots: WeeklySlot[]) => {
    const client = clientRef.current;
    if (!client) throw new Error('not paired yet');
    return client.setSchedule(slots);
  }, []);

  /** What we last told the device to do, for the conflict screen. */
  const getSchedule = useCallback(async () => {
    const client = clientRef.current;
    if (!client) throw new Error('not paired yet');
    return client.getSchedule();
  }, []);

  /**
   * Open the tray for a dose that is due. With no argument, for everything due.
   *
   * The device does not dispense on a timer: a due dose sits on
   * `report.status.awaitingRelease` until this is called, and if nobody calls it
   * inside the grace window the tray stays shut and the dose is recorded missed.
   *
   * This resolves when the *relay* has the command, not when a pill has come
   * out. The report arriving with an empty `awaitingRelease` is the confirmation,
   * and the long poll above brings it within a second or two.
   */
  const release = useCallback(async (dose?: { tray?: number; at?: string }) => {
    const client = clientRef.current;
    if (!client) throw new Error('not paired yet');
    return client.release(dose);
  }, []);

  return { ...state, setSchedule, getSchedule, release, RevisionConflictError };
}
