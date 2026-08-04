'use client';

import { useState } from 'react';

import { Speakable } from '@/components/sc/Say';
import { clientFor, type PairedDevice } from '@/lib/dispenser/paired';

/**
 * 상자를 직접 움직여 보는 자리 — 트레이를 열고, 부저를 울린다.
 *
 * 왜 배출 버튼으로는 안 되는가
 * ---------------------------
 * 화면의 배출 버튼은 **밀린 복용**을 꺼내는 것이고, 기기가 지금 내주고 있는 복용에
 * 대해서만 움직인다. 알림을 네 시간 늦게 눌러도 약이 두 번 나오지 않는 이유가 그것이고,
 * 약에 대해서는 그게 맞다.
 *
 * 그런데 조립을 막 끝낸 사람과 시연하는 사람이 묻는 것은 다른 질문이다 — **이 기계가
 * 도는가.** 처방이 하나도 안 실린 상자에는 밀린 복용이 없으므로 배출 버튼은 거기서
 * 아무것도 답하지 못한다. 그래서 별도의 길이 필요하다.
 *
 * 기기 쪽은 `drop_now` 로 간다. 스케줄러를 건드리지 않는 호출이라 **기계를 확인하는
 * 일이 실제 복용을 취소하지 않는다.** 나온 것은 기록에 남되 `manual` 로 표시된다 —
 * 무언가 호퍼를 떠났으면 기록이 그것을 빠뜨리면 안 되고, 그렇다고 순응도 계산에
 * 예정된 복용처럼 섞이면 안 된다.
 *
 * 왜 릴레이를 지나는가
 * -------------------
 * 같은 와이파이가 아니어도 되기 때문이다. 시연에서 이 차이가 전부다 — 폰을 들고
 * 방을 나가서 눌러도 상자가 움직인다. 명령은 상자 열쇠로 봉해져서 가고, 릴레이는
 * 그것을 열 수 없다. 그래서 "어디서든 조작한다" 는 "스티커를 쥐고 있다" 와 정확히
 * 같은 강도이지 그보다 세지 않다.
 */
export function BenchTest({ paired, trays }: { paired: PairedDevice; trays: number }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function send(label: string, run: () => Promise<number>) {
    setBusy(label);
    setNote(null);
    try {
      await run();
      /*
        "보냈다" 이지 "움직였다" 가 아니다. 릴레이는 사서함이라 상자가 그것을 집어
        갔는지 알 수 없고, 여기서 성공이라고 말하면 전원이 뽑힌 상자에도 성공이 뜬다.
        실제로 움직였는지는 위의 상태판이 답한다.
      */
      setNote(`Sent. Watch the box — ${label}.`);
    } catch (err) {
      console.error('[bench] 명령을 못 보냈다:', err);
      setNote('Could not reach the mailbox. Check the connection.');
    } finally {
      setBusy(null);
    }
  }

  const client = () => clientFor(paired);

  return (
    <section className="mt-4 rounded-3xl bg-white p-4 shadow-sm">
      <Speakable text="Test the box. Open a tray or sound the buzzer, to check the machine works."
                 className="flex w-full items-center gap-2 text-[11px] font-bold tracking-wide"
                 style={{ color: 'var(--color-sc-muted)' }}>
        <span className="flex-1">TEST THE BOX</span>
      </Speakable>

      {/*
        칸 수는 상자가 스스로 말한 것을 쓴다. 여덟 개를 그려 놓고 셋만 달린 기계에서
        누르면 "그 트레이는 연결되어 있지 않습니다" 가 돌아오는데, 그건 사람이 고칠 수
        있는 것이 아니라 우리가 안 물어봐서 생긴 일이다.
      */}
      <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(4rem,1fr))] gap-2">
        {Array.from({ length: trays }, (_, i) => i + 1).map((tray) => (
          <button
            key={tray}
            onClick={() => send(`tray ${tray}`, () => client().drop(tray))}
            disabled={busy !== null}
            aria-label={`Open tray ${tray}`}
            className="flex aspect-square items-center justify-center rounded-2xl text-xl font-bold
                       disabled:opacity-40"
            style={{ background: 'var(--color-sc-bg)', color: 'var(--color-sc-ink)' }}
          >
            {busy === `tray ${tray}` ? '…' : tray}
          </button>
        ))}
      </div>

      <button
        onClick={() => send('the buzzer', () => client().beep())}
        disabled={busy !== null}
        className="sc-row mt-2 flex w-full items-center rounded-2xl py-3 text-left disabled:opacity-40"
        style={{ background: 'var(--color-sc-bg)' }}
      >
        <span className="sc-icon" aria-hidden>🔔</span>
        <span className="flex-1 font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
          {busy === 'the buzzer' ? 'Sending…' : 'Sound the buzzer'}
        </span>
      </button>

      {note && <p className="mt-2 text-sm" style={{ color: 'var(--color-sc-muted)' }}>{note}</p>}

      {/*
        이 칸이 무엇인지 적어 둔다. 여기서 나온 알약은 복용이 아니고, 그 사실을 모르면
        시연 뒤에 기록이 이상해 보인다.
      */}
      <p className="mt-2 text-[11px] leading-snug" style={{ color: 'var(--color-sc-muted)' }}>
        For checking the machine. What comes out is logged as a manual drop, not as a dose.
      </p>
    </section>
  );
}
