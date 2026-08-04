'use client';

import { useEffect, useState } from 'react';
import { BellIcon, BoxIcon } from '@/components/icons';

import { PAIRED_EVENT, clientFor, loadPaired, type PairedDevice } from '@/lib/dispenser/paired';
import { isDemo, setDemo } from '@/lib/snapcare/demo';
import { useReminders } from '@/stores/reminders';
import { planTrays, FITTED_TRAYS } from '@/lib/hardware/dispenser';
import { shortName } from '@/lib/snapcare/shortName';
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

/**
 * 상자 자신의 시계로 지금 몇 시인가, 그리고 그것을 믿을 수 있는가.
 *
 * 시각을 앞에 두는 이유는 발표자가 이 줄에서 실제로 답을 얻는 질문이 그것이기
 * 때문이다. **여기서 누르는 알람은 상자의 시계로 지금 이 분에 걸린다.** 그러니
 * 폰의 시계가 아니라 상자의 시계가 몇 시인지가 눌러도 되는지를 정한다. 둘이
 * 어긋나 있으면 알람이 엉뚱한 분에 걸리고, 그것을 알아챌 자리가 이 화면밖에 없다.
 *
 * 예전에는 믿음 여부만 적었고, 보고가 오기 전에는 줄표 하나였다. 줄표는 아무것도
 * 말하지 않으면서 뭔가 말하는 것처럼 보이는 최악의 자리 표시라, 발표 중에 저것을
 * 본 사람은 그게 "모른다" 인지 "없다" 인지 알 수 없다.
 */
function clockLine(status: DeviceReport['status'] | undefined): string {
  if (!status) return '아직 소식 없음';
  const at = status.clock.now?.slice(11, 16) ?? '';
  const vouched = status.clock.trusted
    ? `믿음 · ${status.clock.source}`
    : '못 믿음, 아무것도 안 나온다';
  return at ? `${at} · ${vouched}` : vouched;
}

/**
 * 기기가 보내는 `"1437"` 을 사람이 읽는 `14:37` 로.
 *
 * 네 자리 그대로 두면 옆의 트레이 번호와 붙어 `2번 1437` 이 되고, 그것은 시각이
 * 아니라 일련번호처럼 읽힌다. 발표 중에 한 번 더 생각하게 만드는 자리가 아니다.
 */
function hhmm(time: string): string {
  return /^\d{4}$/.test(time) ? `${time.slice(0, 2)}:${time.slice(2)}` : time;
}

/**
 * 마지막 보고가 몇 초 전 것인가.
 *
 * 이 화면은 실패를 조용히 삼킨다 — 발표 중에 붉은 글씨를 띄우지 않으려고 그렇게
 * 만들었고, 그 판단 자체는 옳다. 대신 **멈춘 화면과 살아 있는 화면이 똑같이
 * 생겼다**는 대가를 치른다. 발표자는 6분 전 상태를 보면서 지금이라고 믿게 된다.
 *
 * 나이를 적으면 그 대가가 사라진다. 붉은 글씨도, 경고도, 사람을 놀라게 하는 것도
 * 없이 숫자 하나가 커지는 것으로 끝난다.
 *
 * 실제로 이것이 없어서 한참을 헤맸다. 이 화면이 6분 전 스냅샷을 붙들고 있었고,
 * 원인은 화면이 **다른 상자**를 보고 있었다는 것이었는데, 화면 어디에도 그 둘을
 * 구별할 것이 없었다. 그래서 위에 상자 번호도 같이 적는다.
 */
function heardOf(report: DeviceReport | null): string {
  if (!report?.at) return '아직 소식 없음';
  const age = Math.round((Date.now() - new Date(report.at).getTime()) / 1000);
  if (!Number.isFinite(age) || age < 0) return report.at.slice(11, 16);
  if (age < 60) return `${age}초 전`;
  return `${Math.floor(age / 60)}분 전 — 멈춰 있다`;
}

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
  const reminders = useReminders((st) => st.reminders);
  //: 마지막으로 물어본 시각. 값 자체는 안 쓰고, 소식이 끊겨도 나이 표시가 계속
  //: 흐르게 하려고 다시 그리는 용도로만 둔다.
  const [, setSeen] = useState(0);

  /*
    열릴 때 한 번 읽고, **짝이 생기면 다시 읽는다.** 시연에서는 이 화면이 먼저
    그려지고 그 뒤에 시연 블롭이 도착해 스스로 짝이 맺어진다 — 그 순서를 모르면
    화면이 "짝이 없다" 에서 안 벗어난다.
  */
  /*
    이 화면은 **시연 화면이다.**

    그래서 열리는 순간 시연 모드를 켠다. 켜지 않으면 이 폰은 자기 파일을 보고, 시연
    블롭에 적힌 상자를 못 찾는다 — 발표자가 폰을 바꿀 때마다 상자 QR 을 다시 찍어야
    한다는 뜻이고, 그것이 정확히 없애려던 걸음이다.

    통째로 다시 읽는 이유(`location.replace`): 스토어들은 만들어질 때 어느 저장소를
    쓸지 정한다. 도중에 깃발만 바꾸면 이미 만들어진 스토어는 옛 저장소를 계속 본다 —
    화면마다 다른 자료가 보이는, 재현이 어려운 상태가 된다. 이 앱이 `?demo=1` 을
    첫 화면에서만 받는 것도 같은 이유다.

    이 주소는 앱 어디에서도 링크하지 않는다. 발표자만 손으로 친다.
  */
  useEffect(() => {
    if (!isDemo()) {
      setDemo(true);
      window.location.replace('/present');
      return;
    }
  }, []);

  /*
    열릴 때 한 번 읽고, **짝이 생기면 다시 읽는다.** 시연에서는 이 화면이 먼저
    그려지고 그 뒤에 시연 블롭이 도착해 스스로 짝이 맺어진다 — 그 순서를 모르면
    화면이 "짝이 없다" 에서 안 벗어난다.
  */
  useEffect(() => {
    const read = () => { void loadPaired().then(setPaired); };
    read();
    window.addEventListener(PAIRED_EVENT, read);
    return () => window.removeEventListener(PAIRED_EVENT, read);
  }, []);

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
      .catch(() => { /* 발표 중에 붉은 글씨를 띄우지 않는다 */ })
      // 실패해도 다시 그린다. 이것이 없으면 소식이 끊긴 순간 나이 표시도 같이
      // 멈추고, 멈춘 화면이 다시 살아 있는 화면과 똑같아진다.
      .finally(() => { if (alive) setSeen(Date.now()); });
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
        <span aria-hidden className="flex items-center text-5xl"><BoxIcon /></span>
        <p className="text-lg font-bold" style={{ color: 'var(--color-sc-ink)' }}>
          이 폰은 아직 상자와 짝이 없다
        </p>
        <p className="text-sm" style={{ color: 'var(--color-sc-muted)' }}>
          카메라로 상자 화면의 코드를 찍으면 된다.
        </p>
        {/*
          왜 한 번은 찍어야 하는가.

          상자 열쇠는 꺼낼 수 없게 만들어 두었고(`paired.ts`), 그래서 이미 짝을 맺은
          폰에서 그것을 뽑아 나눠 줄 방법이 없다. 나눌 수 있는 것은 **코드**뿐이고,
          코드는 짝을 맺는 그 순간에만 손에 있다.

          그러니 시연 모드에서 **한 번** 짝을 맺어야 그 코드가 시연 블롭에 적히고,
          그때부터 다른 폰들이 스스로 이어받는다. 이 문장이 없으면 발표자는 "된다고
          했는데 왜 또 짝지으라고 하지" 에서 멈춘다.
        */}
        <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--color-sc-muted)' }}>
          한 번만 하면 된다. 시연 모드에서 맺은 짝은 다른 폰이 이어받는다 —
          이미 짝이 있는 폰이라도, 그 짝을 맺을 때 코드가 안 남았으면 여기서 한 번 더 찍어야 한다.
        </p>
      </main>
    );
  }

  const status = report?.status;
  const waiting = status?.awaitingRelease ?? [];

  /*
    **약이 실제로 든 칸만** 낸다.

    상자가 스스로 말한 칸 수(8)로 버튼을 만들고 있었다. 그런데 이 콘솔에서 누르는
    일은 "그 약의 알람을 지금 울린다" 이고, 약이 안 든 칸을 울리면 상자는 빈 칸을
    열려고 서보를 돌린다 — 시연에서 그것은 아무 일도 안 일어난 것처럼 보인다.

    그리고 여덟 개를 늘어놓으면 발표자가 **어느 것을 눌러야 하는지 그 자리에서
    골라야 한다.** 무대에서 고르게 만드는 화면은 잘못 만든 화면이다.

    칸은 알람에서 온다 — 자동 전송이 상자로 보내는 것과 같은 배치라(`planTrays`),
    화면에 보이는 칸과 상자가 아는 칸이 어긋날 수 없다. 알람이 하나도 없으면 상자가
    말한 수로 떨어진다.
  */
  const planned = planTrays(reminders, status?.trayCount ?? FITTED_TRAYS).plan;
  const numbers = planned.length > 0
    ? [...new Set(planned.map((t) => t.tray))].sort((a, b) => a - b)
    : Array.from({ length: status?.trayCount ?? FITTED_TRAYS }, (_, i) => i + 1);
  const nameOf = Object.fromEntries(planned.map((t) => [t.tray, t.name]));

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
        <Line label="상자" value={paired.deviceId.slice(0, 8)} />
        <Line label="마지막 소식" value={heardOf(report)} />
        <Line label="시계" value={clockLine(status)} />
        <Line label="트레이" value={status ? `${status.trayCount}칸 · 서보 ${status.servoUsable ? '정상' : '없음'}` : '아직 소식 없음'} />
        <Line label="지금 밀린 복용" value={waiting.length ? waiting.map((d) => `${d.tray}번 ${hhmm(d.time)}`).join(', ') : '없음'} />
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
              className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-2xl text-white disabled:opacity-40"
              style={{ background: 'var(--color-safe)' }}
            >
              <span className="text-xl font-bold">{busy === `${tray}번 알람` ? '…' : tray}</span>
              {/* 칸 번호만으로는 무대에서 어느 약인지 안 떠오른다. */}
              {nameOf[tray] && (
                <span className="px-1 text-[9px] font-semibold leading-tight opacity-80">
                  {shortName(nameOf[tray], 12)}
                </span>
              )}
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
          <span className="sc-icon flex items-center" aria-hidden><BellIcon /></span>
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
