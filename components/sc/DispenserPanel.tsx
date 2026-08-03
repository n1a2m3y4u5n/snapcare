'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Speakable, sayable } from '@/components/sc/Say';
import { formatClaim, isValidClaim } from '@/lib/dispenser/claim';
import { forgetPaired, pairWith, type PairedDevice } from '@/lib/dispenser/paired';
import { DEFAULT_RELAY, RELAY_MISSING } from '@/lib/dispenser/relayUrl';
import { requestPermission } from '@/lib/notifications';
import type { DeviceReport } from '@/lib/dispenser/types';

/**
 * 기기와 짝짓고, 기기가 지금 무엇을 하고 있는지 보여준다.
 *
 * 이 화면은 돌보는 사람의 자리다. 약을 꺼내는 사람이 보는 것은 DoseRelease 쪽이고,
 * 여기는 "기계가 살아 있는가, 시계가 서 있는가, 다음은 언제인가" 를 답한다.
 *
 * 상태에서 무엇을 보여줄지는 dh 의 통합 문서가 표로 정해 두었다. 그중 둘이 특히
 * 중요하다 — 시계가 서 있지 않으면 기기는 **아무것도 내보내지 않고**, 전원이 뽑힌
 * 기기는 여기서 보면 건강한 것과 구별되지 않는다.
 */

function hhmm(text: string): string {
  return text.length === 4 ? `${text.slice(0, 2)}:${text.slice(2)}` : text;
}

/** 마지막 소식이 언제였는지 — 사람이 읽는 말로. */
function sinceWords(at: string): string {
  const then = Date.parse(at);
  if (Number.isNaN(then)) return 'at an unknown time';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function DispenserPanel({ paired, report, stale, loading, error, onChanged }: {
  paired: PairedDevice | null;
  report: DeviceReport | null;
  stale: boolean;
  loading: boolean;
  error: Error | null;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [relay, setRelay] = useState(DEFAULT_RELAY);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function pair(claim: string) {
    setBusy(true);
    setNote(null);
    try {
      await pairWith(claim, relay);
      setCode('');
      setNote('Paired. Waiting for the box to say hello…');
      onChanged();
      /*
        알림 권한은 **여기서** 묻는다.

        상자를 방금 자기 것이라고 말한 사람에게 "약이 나오면 알려 드릴까요" 를 묻는
        것은 이어지는 말이다. 앱을 처음 열자마자 묻는 창은 무엇에 쓰는지 모르는 채로
        거절당하고, 한 번 거절하면 브라우저가 다시 묻지 못하게 막는다.

        거절해도 아무것도 잃지 않는다 — 화면의 배출 카드는 그대로다.
      */
      void requestPermission();
    } catch (err) {
      console.error('[dispenser] 페어링 실패:', err);
      setNote('That code did not work. Ten characters, exactly as printed.');
    } finally {
      setBusy(false);
    }
  }

  async function unpair() {
    await forgetPaired();
    setNote(null);
    onChanged();
  }

  // ── 아직 짝이 없다 ────────────────────────────────────────────────────────
  if (!paired) {
    const typed = formatClaim(code);
    return (
      <section className="rounded-3xl bg-white p-4 shadow-sm">
        <Speakable text="Connect the pill box. Photograph it with the camera — its screen is showing a code."
                   className="flex w-full items-center gap-2 text-[11px] font-bold tracking-wide"
                   style={{ color: 'var(--color-sc-muted)' }}>
          <span className="flex-1">CONNECT THE PILL BOX</span>
        </Speakable>

        {/*
          짝을 맺는 길은 **하나**다 — 상자를 찍는 것.

          전에는 여기 세 가지가 나란히 있었다: 라벨 QR 을 읽는 사진 입력, 열 글자를
          치는 칸, 그리고 릴레이 주소. 메인 카메라가 QR 을 알아보게 되면서 첫 번째는
          같은 일을 하는 두 번째 자리가 됐고, 두 자리는 두 가지 결과를 낳는다 —
          하나가 고쳐질 때 다른 하나는 안 고쳐진다. 실제로 `SNAPCARE-PAIR:` 형식을
          못 읽던 버그가 이 화면에만 있었다.

          그래서 이 자리는 **상태를 보는 곳**으로 두고, 하는 일은 카메라로 보낸다.
          이 앱의 다른 모든 것이 이미 그 한 손짓이다.
        */}
        <button
          onClick={() => router.push('/camera')}
          className="sc-row mt-3 flex w-full items-center rounded-2xl py-3 text-left"
          style={{ background: 'var(--color-sc-primary)', color: '#fff' }}
        >
          <span className="sc-icon" aria-hidden>📷</span>
          <span className="flex-1">
            <Speakable text="Photograph the box. Its screen is showing a code — point the camera at it."
                       className="block font-semibold" bare>
              Photograph the box
            </Speakable>
            <span className="block text-xs opacity-80">Its screen is showing a code</span>
          </span>
        </button>

        {/*
          글자로 치는 길은 남기되 접어 둔다. 사진이 안 읽히는 경우가 실제로 있고
          (어두운 방, 화면 반사, 초점), 그때 이것이 없으면 상자를 못 붙인다. 카메라
          화면이 자기 대안들을 감춰 두는 것과 같은 방식이다 — 주된 동작은 하나이되
          막혔을 때 빠져나갈 곳은 있다.
        */}
        <details className="mt-3">
          <summary className="cursor-pointer text-xs underline underline-offset-4"
                   style={{ color: 'var(--color-sc-muted)' }}>
            Can&apos;t photograph it? Type the code instead
          </summary>
          <input
            value={typed}
            onChange={(e) => setCode(e.target.value)}
            placeholder="6V9F5-9QK67"
            inputMode="text"
            autoCapitalize="characters"
            aria-label="Pairing code from the label"
            className="mt-2 w-full rounded-2xl px-4 py-3 text-center text-lg font-bold tracking-widest"
            style={{ background: 'var(--color-sc-bg)' }}
          />
          <button
            onClick={() => pair(code)}
            disabled={busy || !isValidClaim(code)}
            className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-2xl
                       font-bold text-white disabled:opacity-40"
            style={{ background: 'var(--color-sc-primary)' }}
          >
            {/* 사슬 고리. 이 버튼이 하는 일이 폰과 상자를 잇는 것이다. 글자만 있으면
                글을 못 읽는 사람은 여기서 멈추는데, 하필 이 화면은 약통을 처음
                붙이는 자리라 그 앞의 모든 그림이 소용없어진다. */}
            <span aria-hidden className="text-lg leading-none">🔗</span>
            Connect
          </button>
        </details>

        {RELAY_MISSING && (
          <Speakable text="This app was built without a mailbox address, so the box cannot be reached from here. Ask for the address and type it below."
                     className="mt-3 flex w-full items-center gap-2 rounded-2xl p-3 text-sm font-semibold"
                     style={{ background: 'var(--color-sc-bg)', color: 'var(--color-caution)' }}>
            <span aria-hidden className="text-xl">📭</span>
            <span className="flex-1">No mailbox address in this build — type one below.</span>
          </Speakable>
        )}

        <details className="mt-3" open={RELAY_MISSING}>
          <summary className="cursor-pointer text-[11px] font-bold tracking-wide"
                   style={{ color: 'var(--color-sc-muted)' }}>
            RELAY ADDRESS
          </summary>
          <input
            value={relay}
            onChange={(e) => setRelay(e.target.value)}
            aria-label="Relay address"
            className="mt-2 w-full rounded-xl px-3 py-2 text-sm"
            style={{ background: 'var(--color-sc-bg)' }}
          />
        </details>

        {note && <p className="mt-2 text-sm" style={{ color: 'var(--color-sc-muted)' }}>{note}</p>}
      </section>
    );
  }

  // ── 짝이 있다 ─────────────────────────────────────────────────────────────
  const s = report?.status;
  const untrusted = s ? !s.clock.trusted : false;

  return (
    <section className="rounded-3xl bg-white p-4 shadow-sm">
      <Speakable text="The pill box. What it is doing right now."
                 className="flex w-full items-center gap-2 text-[11px] font-bold tracking-wide"
                 style={{ color: 'var(--color-sc-muted)' }}>
        <span className="flex-1">THE PILL BOX</span>
      </Speakable>

      {loading && !report && (
        <p className="mt-3 text-sm" style={{ color: 'var(--color-sc-muted)' }}>Listening for the box…</p>
      )}

      {/*
        전원이 뽑힌 기기는 여기서 보면 건강한 것과 구별되지 않는다. 그래서 "연결됨"
        이라는 말을 쓰지 않고 **마지막으로 말한 시각**으로 판단한다 — "화요일부터
        소식이 없습니다" 가 돌보는 사람에게 해 줄 수 있는 가장 쓸모 있는 말이다.
      */}
      {report && stale && (
        <Speakable text={`The pill box has not been heard from since ${sinceWords(report.at)}. It may be unplugged.`}
                   className="mt-3 flex w-full items-center gap-2 rounded-2xl p-3 text-sm font-semibold"
                   style={{ background: 'var(--color-sc-bg)', color: 'var(--color-avoid)' }}>
          <span aria-hidden className="text-xl">🔌</span>
          <span className="flex-1">No word since {sinceWords(report.at)} — it may be unplugged.</span>
        </Speakable>
      )}

      {/*
        시계가 서 있지 않으면 기기는 아무것도 내보내지 않는다. 이 화면에서 가장
        중요한 불리언이고, 폰이 시각을 보증해 주면 풀린다.
      */}
      {untrusted && (
        <Speakable text={`The box does not know the time, so it will not release anything. ${s?.blockedReason ?? ''}`}
                   className="mt-3 flex w-full items-center gap-2 rounded-2xl p-3 text-sm font-semibold"
                   style={{ background: 'var(--color-sc-bg)', color: 'var(--color-caution)' }}>
          <span aria-hidden className="text-xl">🕐</span>
          <span className="flex-1">It does not know the time — nothing will come out.</span>
        </Speakable>
      )}

      {s && !untrusted && (
        <dl className="mt-3 space-y-2 text-sm">
          <Row label="Next dose"
               value={s.nextDose ? `Tray ${s.nextDose.tray} at ${hhmm(s.nextDose.time)}` : 'Nothing scheduled'} />
          <Row label="Trays fitted" value={String(s.trayCount)} />
          {report && <Row label="Last heard" value={sinceWords(report.at)} />}
        </dl>
      )}

      {/*
        실려 오면서 무엇을 잃었는지.

        기기가 말한 그대로 보여주되, **지금 실린 일정이 짧은 형식일 때만**이다.
        펌웨어는 `loses_detail()` 을 조건 없이 붙이는데(device.py 의 status()), 그
        함수가 답하는 질문은 "이 일정을 SC1*S* 로 보냈다면 무엇을 잃었겠는가" 이지
        "지금 실린 일정이 무엇을 잃었는가" 가 아니다. dh 의 주석도 보내기 전에
        확인하라고 적어 두었다.

        그대로 내보냈더니 무손실 SC1*W* 로 보낸 월·수·금 7일 처방에 "요일을 실을 수
        없어 매일 떨어집니다" 라는 경고가 붙었다. 일어나지 않은 손실을 알리는 경고이고,
        글을 못 읽는 사람에게는 확인할 방법도 없다. 화면이 사실이 아닌 말을 하느니
        아무 말도 안 하는 편이 낫다. (펌웨어 쪽도 고치도록 dh 에게 전한다.)
      */}
      {s?.payload?.toUpperCase().startsWith('SC1*S*') && s.notes?.length ? (
        <ul className="mt-3 space-y-1">
          {s.notes.map((n, i) => (
            <li key={i} {...sayable(n)} className="text-xs" style={{ color: 'var(--color-caution)' }}>⚠ {n}</li>
          ))}
        </ul>
      ) : null}

      {report?.lastError ? (
        <p {...sayable(`The box reported a problem: ${report.lastError}`)}
           className="mt-2 text-xs" style={{ color: 'var(--color-avoid)' }}>
          {report.lastError}
        </p>
      ) : null}

      {error && (
        <p className="mt-2 text-xs" style={{ color: 'var(--color-sc-muted)' }}>
          Cannot reach the relay right now — retrying.
        </p>
      )}

      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px]" style={{ color: 'var(--color-sc-muted)' }}>
          Paired {sinceWords(paired.pairedAt)}
        </span>
        <button onClick={unpair} className="text-xs font-semibold underline"
                style={{ color: 'var(--color-sc-muted)' }}>
          Forget this box
        </button>
      </div>

      {/*
        "아직 소식을 기다린다" 는 말은 소식이 오면 사라져야 한다. 안 그러면 트레이
        개수까지 나와 있는 화면이 동시에 기다리고 있다고 말하고, 읽지 못하는 사람에게는
        둘 중 어느 쪽이 지금인지 가릴 방법이 없다. 지우는 대신 **그리지 않는다** —
        상태를 하나 더 만들면 화면이 두 번 그려질 뿐 말하는 내용은 같다.
      */}
      {note && !report && (
        <p className="mt-2 text-sm" style={{ color: 'var(--color-sc-muted)' }}>{note}</p>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Speakable text={`${label}. ${value}.`} className="flex w-full items-baseline gap-2">
      <dt className="text-[11px] font-bold tracking-wide" style={{ color: 'var(--color-sc-muted)' }}>
        {label.toUpperCase()}
      </dt>
      <dd className="flex-1 text-right font-semibold">{value}</dd>
    </Speakable>
  );
}
