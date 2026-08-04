'use client';

import { useEffect, useState } from 'react';

import { clientFor, loadPaired, type PairedDevice } from '@/lib/dispenser/paired';
import type { DeviceReport } from '@/lib/dispenser/types';

/**
 * 발표자 콘솔. **심사위원의 태블릿이 아니라 발표자 자신의 폰**에서 여는 자리다.
 *
 * 왜 필요한가
 * -----------
 * 이 기계가 하는 일의 핵심은 "복용 시각이 되면 알리고, 사람이 누르면 내준다" 이고,
 * 그것을 보여주려면 그 시각까지 기다려야 한다. 심사위원 앞에서 아침 8시를 기다릴 수는
 * 없다. 미리 일정을 발표 시각으로 맞춰 두는 방법은 발표가 몇 분만 밀리면 무너지고,
 * 순서가 바뀌면 아예 못 쓴다.
 *
 * 그래서 발표자가 신호를 준다. 심사위원의 태블릿에는 이 화면이 없고, 그들이 보는 것은
 * 평범한 앱이다 — 알림이 오고, 배출 버튼이 뜨고, 누르면 약이 나온다.
 *
 * 무엇을 속이지 않는가
 * -------------------
 * 여기서 누르는 것은 기기에게 **진짜로 복용을 밀리게** 한다. 기기는 진짜 복용 시각에
 * 도는 것과 같은 코드를 돌리고, 그 뒤는 전부 평소 경로다 — 부저, 화면, 앱 알림,
 * 배출 버튼, 서보, 기록. 시연을 위해 만든 우회로가 하나도 없다. 그러지 않으면
 * 보여준 것과 만든 것이 다른 물건이 되고, 그건 심사에서 보여줄 가치가 없다.
 *
 * 왜 링크가 없는가
 * ---------------
 * 어디에서도 이 화면으로 가는 길을 두지 않았다. 주소를 아는 사람만 온다. 앱을 쓰는
 * 사람에게 "복용을 지금 밀리게 하는 버튼" 은 있어서는 안 되는 것이고, 발표자는 주소를
 * 외울 수 있다.
 */

/** 짝지은 상자가 마지막으로 보고한 것을 짧게. 발표 중에 상태를 확인하는 용도. */
function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span style={{ color: 'var(--color-sc-muted)' }}>{label}</span>
      <span className="font-semibold" style={{ color: 'var(--color-sc-ink)' }}>{value}</span>
    </div>
  );
}

export default function PresentPage() {
  const [paired, setPaired] = useState<PairedDevice | null>(null);
  const [report, setReport] = useState<DeviceReport | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => { void loadPaired().then(setPaired); }, []);

  /*
    상태를 3초마다 다시 읽는다.

    이 화면은 발표 중에만 열려 있고, 발표자는 "지금 상자가 무엇을 하고 있는가" 를
    말하면서 봐야 한다. 나머지 화면이 쓰는 롱폴은 조용할 때 좋은 방식이지만 여기서는
    화면이 멈춘 것처럼 보인다.
  */
  useEffect(() => {
    if (!paired) return;
    let alive = true;
    const client = clientFor(paired);
    const pull = () => client.getReport()
      .then((found) => { if (alive && found) setReport(found.report); })
      .catch(() => { /* 발표 중에 붉은 글씨를 띄우지 않는다 */ });
    void pull();
    const timer = setInterval(pull, 3000);
    return () => { alive = false; clearInterval(timer); };
  }, [paired]);

  async function send(label: string, run: () => Promise<number>) {
    setBusy(label);
    setNote(null);
    try {
      await run();
      setNote(`보냈다 — ${label}`);
    } catch (err) {
      console.error('[present] 명령 실패:', err);
      setNote('사서함에 닿지 못했다.');
    } finally {
      setBusy(null);
    }
  }

  if (!paired) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-8 text-center"
            style={{ background: 'var(--color-sc-bg)' }}>
        <span aria-hidden className="text-5xl">📦</span>
        <p className="text-lg font-bold" style={{ color: 'var(--color-sc-ink)' }}>
          이 폰은 아직 상자와 짝이 없다
        </p>
        <p className="text-sm" style={{ color: 'var(--color-sc-muted)' }}>
          발표자 폰에서도 한 번 짝을 맺어야 한다. 카메라로 상자를 찍으면 된다.
        </p>
      </main>
    );
  }

  const status = report?.status;
  const waiting = status?.awaitingRelease ?? [];
  const trays = status?.trayCount ?? 8;
  const numbers = Array.from({ length: trays }, (_, i) => i + 1);

  return (
    <main className="mx-auto min-h-screen w-full max-w-[520px] px-5 py-8"
          style={{ background: 'var(--color-sc-bg)' }}>
      <h1 className="text-xl font-bold" style={{ color: 'var(--color-sc-ink)' }}>발표자 콘솔</h1>
      <p className="mt-1 text-xs" style={{ color: 'var(--color-sc-muted)' }}>
        심사위원 태블릿에는 이 화면이 없다. 여기서 누르면 상자가 진짜로 복용 시각을
        맞은 것처럼 움직인다.
      </p>

      {/* ── 지금 상자가 무엇을 하고 있나 ─────────────────────────────────── */}
      <section className="mt-5 rounded-3xl bg-white p-4 shadow-sm">
        <Line label="상자" value={report ? '말하고 있음' : '아직 소식 없음'} />
        <Line label="시계" value={status ? (status.clock.trusted ? `믿음 · ${status.clock.source}` : '못 믿음 — 아무것도 안 나온다') : '—'} />
        <Line label="트레이" value={status ? `${status.trayCount}칸 · 서보 ${status.servoUsable ? '정상' : '없음'}` : '—'} />
        <Line label="지금 밀린 복용" value={waiting.length ? waiting.map((d) => `${d.tray}번 ${d.time}`).join(', ') : '없음'} />
      </section>

      {/* ── 알람을 울린다 ────────────────────────────────────────────────── */}
      <section className="mt-4 rounded-3xl bg-white p-4 shadow-sm">
        <h2 className="text-[11px] font-bold tracking-wide" style={{ color: 'var(--color-sc-muted)' }}>
          복용 알람을 지금 울린다
        </h2>
        <p className="mt-1 text-xs" style={{ color: 'var(--color-sc-muted)' }}>
          누르면 부저가 울고 화면이 초록이 되고 심사위원 태블릿에 배출 버튼이 뜬다.
          그 다음은 그들이 누른다.
        </p>
        <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(4rem,1fr))] gap-2">
          {numbers.map((tray) => (
            <button
              key={tray}
              onClick={() => send(`${tray}번 알람`, () => clientFor(paired).ringNow(tray))}
              disabled={busy !== null}
              className="flex aspect-square items-center justify-center rounded-2xl text-xl font-bold text-white disabled:opacity-40"
              style={{ background: 'var(--color-safe)' }}
            >
              {busy === `${tray}번 알람` ? '…' : tray}
            </button>
          ))}
        </div>
      </section>

      {/* ── 기계가 도는지 (알람 없이) ─────────────────────────────────────── */}
      <section className="mt-4 rounded-3xl bg-white p-4 shadow-sm">
        <h2 className="text-[11px] font-bold tracking-wide" style={{ color: 'var(--color-sc-muted)' }}>
          알람 없이 바로
        </h2>
        <p className="mt-1 text-xs" style={{ color: 'var(--color-sc-muted)' }}>
          복용 모델을 거치지 않고 트레이만 연다. 기계가 도는지 확인할 때.
        </p>
        <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(4rem,1fr))] gap-2">
          {numbers.map((tray) => (
            <button
              key={tray}
              onClick={() => send(`${tray}번 배출`, () => clientFor(paired).drop(tray))}
              disabled={busy !== null}
              className="flex aspect-square items-center justify-center rounded-2xl text-xl font-bold disabled:opacity-40"
              style={{ background: 'var(--color-sc-bg)', color: 'var(--color-sc-ink)' }}
            >
              {busy === `${tray}번 배출` ? '…' : tray}
            </button>
          ))}
        </div>
        <button
          onClick={() => send('부저', () => clientFor(paired).beep())}
          disabled={busy !== null}
          className="sc-row mt-2 flex w-full items-center rounded-2xl py-3 text-left disabled:opacity-40"
          style={{ background: 'var(--color-sc-bg)' }}
        >
          <span className="sc-icon" aria-hidden>🔔</span>
          <span className="flex-1 font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
            {busy === '부저' ? '보내는 중…' : '부저를 울린다'}
          </span>
        </button>
      </section>

      {note && <p className="mt-3 text-sm" style={{ color: 'var(--color-sc-muted)' }}>{note}</p>}

      <p className="mt-6 text-[11px] leading-relaxed" style={{ color: 'var(--color-sc-muted)' }}>
        여기서 나온 알람은 기기가 진짜 복용 시각에 도는 것과 **같은 코드**를 돌린다.
        시연을 위해 만든 우회로가 없으므로, 보여준 것이 곧 실제로 돌아가는 것이다.
      </p>
    </main>
  );
}
