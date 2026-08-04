'use client';

import { useEffect, useRef, useState } from 'react';
import { HandIcon, HourglassIcon } from '@/components/icons';
import { cachedPictogramPath } from '@/lib/snapcare/dsl';
import { Speakable } from '@/components/sc/Say';
import { speak } from '@/lib/voice';
import type { AwaitingRelease, DeviceReport } from '@/lib/dispenser/types';

/**
 * 지금 꺼내야 하는 약 — 그리고 그것을 꺼내는 단 하나의 버튼.
 *
 * 기기는 시간이 됐다고 약을 내보내지 않는다. 정해진 분에 불이 켜지고 소리가 나지만
 * **트레이는 닫힌 채로 기다린다.** 이 버튼이 여는 것이고, 유예 시간 안에 아무도
 * 누르지 않으면 닫힌 채로 '놓침' 이 기록된다. 기기 전체가 이 버튼 하나에 달려 있다.
 *
 * 글을 못 읽는 사람이 쓴다는 전제가 여기서 특히 무겁다:
 *
 *  · 도착하면 **스스로 말한다.** 화면에 뜬 것을 읽을 수 없으므로, 무엇이 일어났는지는
 *    소리로 도착해야 한다.
 *  · 걸린 약이 둘이어도 **버튼은 하나**다. 08시에 두 트레이가 걸렸다는 것은 08시에
 *    먹을 약이 두 가지라는 뜻이고, 두 번 누르게 만들면 두 번째를 잊는다.
 *  · 유예가 지나면 **버튼을 치운다.** 눌러도 아무 일 없는 버튼은 없느니만 못하다 —
 *    누른 사람은 약을 받았다고 믿고 걸어 나간다.
 *  · 트레이가 도는 데 4초쯤 걸리고 그동안 요청이 안 끝난다. 두 번째 탭과 경주시키지
 *    않는다.
 */

/** 몇 초마다 유예가 지났는지 다시 본다. 1분이면 충분하고, 그보다 잦으면 헛돈다. */
const EXPIRY_TICK_MS = 30_000;

type Phase = 'idle' | 'opening' | 'opened' | 'nothing' | 'blocked';

function hhmmLabel(hhmm: string): string {
  return hhmm.length === 4 ? `${hhmm.slice(0, 2)}:${hhmm.slice(2)}` : hhmm;
}

/** 아직 유예 안에 있는 것만. 시각을 못 읽으면 남겨 둔다 — 지운 쪽이 더 나쁘다. */
function live(doses: AwaitingRelease[], now: number): AwaitingRelease[] {
  return doses.filter((d) => {
    const end = Date.parse(d.expiresAt);
    return Number.isNaN(end) || end > now;
  });
}

export function DoseRelease({ report, onRelease }: {
  report: DeviceReport | null;
  onRelease: (dose?: { tray?: number; at?: string }) => Promise<number>;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [now, setNow] = useState(() => Date.now());
  /** 방금 말한 약 — 같은 것을 폴링마다 되풀이해 말하지 않는다. */
  const spoken = useRef('');

  // 유예가 지나는 것은 사건이 아니라 시각의 흐름이라, 스스로 다시 봐야 한다.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), EXPIRY_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const due = live(report?.status.awaitingRelease ?? [], now);
  const key = due.map((d) => `${d.tray}@${d.time}`).join(',');

  // 새로 걸린 약은 스스로 알린다. 화면을 못 읽는 사람에게 이것이 알림이다.
  useEffect(() => {
    if (!key || key === spoken.current) return;
    spoken.current = key;
    const what = due.length === 1
      ? `Your ${hhmmLabel(due[0].time)} medicine is ready. Press to open the tray.`
      : `${due.length} medicines are ready. Press once to open them all.`;
    void speak(what, 'en-US');
  }, [key, due]);

  // 걸린 약이 사라지면(우리가 열었든, 유예가 지났든) 다음 것을 다시 말할 수 있게 둔다.
  useEffect(() => {
    if (!key) spoken.current = '';
  }, [key]);

  if (due.length === 0) return null;

  async function open() {
    if (phase === 'opening') return; // 4초 동안 두 번째 탭과 경주시키지 않는다
    setPhase('opening');
    try {
      await onRelease();
      // 여기서 끝난 것은 **릴레이가 명령을 받았다**는 뜻이지 약이 나왔다는 뜻이
      // 아니다. 확인은 awaitingRelease 가 빈 채로 오는 다음 보고이고, 그러면 이
      // 카드가 통째로 사라진다.
      setPhase('opened');
      void speak('Opening the tray now.', 'en-US');
    } catch (err) {
      // 기기가 아예 움직일 수 없는 경우(GPIO 없음)와, 이미 지나 버려 열 것이 없는
      // 경우는 사용자가 할 일이 다르다. 앞은 사람을 불러야 하고 뒤는 아무 일도 아니다.
      console.error('[dose] 배출 실패:', err);
      setPhase('blocked');
      void speak('The dispenser could not open. Please ask someone for help.', 'en-US');
    }
  }

  const many = due.length > 1;
  const title = many ? `${due.length} medicines are ready` : `Your ${hhmmLabel(due[0].time)} medicine is ready`;

  return (
    <section className="rounded-3xl p-4 shadow-sm"
             style={{ background: '#fff', outline: '3px solid var(--color-sc-primary)' }}>
      <Speakable text={`${title}. Press the button to open the tray.`}
                 className="flex w-full items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cachedPictogramPath('\\pill_bottle')} alt="" aria-hidden
             className="h-16 w-16 shrink-0 rounded-2xl bg-white p-1" />
        <span className="flex-1 text-left">
          <span className="block text-lg font-bold leading-tight">{title}</span>
          <span className="block text-sm" style={{ color: 'var(--color-sc-muted)' }}>
            {due.map((d) => `Tray ${d.tray} · ${hhmmLabel(d.time)}`).join(' · ')}
          </span>
        </span>
      </Speakable>

      <button
        onClick={open}
        disabled={phase === 'opening'}
        aria-label={many ? 'Open all the trays that are ready' : 'Open the tray'}
        className="mt-3 flex h-16 w-full items-center justify-center gap-3 rounded-2xl text-xl
                   font-bold text-white active:scale-[0.98] transition-transform disabled:opacity-70"
        style={{ background: 'var(--color-sc-primary)' }}
      >
        <span aria-hidden className="flex items-center text-2xl">{phase === 'opening' ? <HourglassIcon /> : <HandIcon />}</span>
        {phase === 'opening' ? 'Opening…' : many ? 'Open them all' : 'Open the tray'}
      </button>

      {phase === 'blocked' && (
        <Speakable text="The dispenser could not open. Please ask someone for help."
                   className="mt-2 flex w-full items-center gap-2 text-sm font-semibold"
                   style={{ color: 'var(--color-avoid)' }}>
          <span className="flex-1">The dispenser could not open — ask someone for help.</span>
        </Speakable>
      )}
    </section>
  );
}
