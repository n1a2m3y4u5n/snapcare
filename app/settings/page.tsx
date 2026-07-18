'use client';

import { useState } from 'react';
import { MobileScreen } from '@/components/sc/MobileScreen';
import { useFamily } from '@/stores/family';

const DEVICES = [
  { id: 'you', device: 'iPhone 14', status: 'safe' },
  { id: 'mia', device: 'iPad Mini', status: 'caution' },
  { id: 'grandpa', device: 'SnapCare Dispenser', status: 'avoid' },
  { id: 'sam', device: 'iPhone 13', status: 'safe' },
] as const;

const STATUS_COLOR = { safe: 'var(--color-safe)', caution: 'var(--color-caution)', avoid: 'var(--color-avoid)' };

export default function SettingsPage() {
  const getMember = useFamily((s) => s.getMember);
  const [sos, setSos] = useState(false);
  const [alerting, setAlerting] = useState(false);

  return (
    <MobileScreen tab="settings">
      <div className="px-5 pt-14">
        <h1 className="text-2xl font-extrabold" style={{ color: 'var(--color-sc-ink)' }}>Settings</h1>

        {/* Emergency SOS */}
        <button
          onClick={() => setSos(true)}
          className="mt-4 flex w-full items-center gap-3 rounded-2xl px-4 py-4 text-left text-white"
          style={{ background: 'var(--color-avoid)' }}
        >
          <span className="text-2xl">🆘</span>
          <span className="flex-1">
            <span className="block text-base font-bold">Emergency SOS</span>
            <span className="block text-xs opacity-90">Alert your emergency contact</span>
          </span>
        </button>

        {/* Connected devices */}
        <p className="mt-6 text-[11px] font-bold tracking-wide" style={{ color: 'var(--color-sc-muted)' }}>CONNECTED DEVICES</p>
        <div className="mt-2 flex flex-col gap-2">
          {DEVICES.map((d) => {
            const m = getMember(d.id);
            return (
              <div key={d.id} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOR[d.status] }} />
                <span className="flex-1">
                  <span className="block text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>{m?.name ?? d.id}</span>
                  <span className="block text-xs" style={{ color: 'var(--color-sc-muted)' }}>{d.device}</span>
                </span>
                <span style={{ color: 'var(--color-sc-muted)' }}>›</span>
              </div>
            );
          })}
        </div>

        {/* More */}
        <p className="mt-6 text-[11px] font-bold tracking-wide" style={{ color: 'var(--color-sc-muted)' }}>MORE</p>
        <div className="mt-2 flex flex-col gap-2">
          <Row emoji="🔗" label="Companion device pairing" />
          <Row emoji="👩‍⚕️" label="Provider share" />
        </div>
      </div>

      {/* SOS 확인 오버레이 */}
      {sos && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-8">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl" style={{ background: 'var(--color-avoid-bg)' }}>❗</div>
            <h2 className="mt-4 text-lg font-bold" style={{ color: 'var(--color-sc-ink)' }}>Alert your emergency contact?</h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-sc-muted)' }}>Your location and safety profile will be shared immediately.</p>
            <button onClick={() => { setSos(false); setAlerting(true); }} className="mt-5 w-full rounded-2xl py-3 text-base font-bold text-white" style={{ background: 'var(--color-avoid)' }}>Yes, alert now</button>
            <button onClick={() => setSos(false)} className="mt-2 w-full rounded-2xl py-3 text-base font-semibold" style={{ color: 'var(--color-sc-ink)' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* SOS 경보 진행 (풀스크린) */}
      {alerting && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center px-10 text-center text-white" style={{ background: 'var(--color-avoid)' }}>
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/20 text-5xl">❗</div>
          <h2 className="mt-6 text-2xl font-bold">Alerting emergency contact</h2>
          <p className="mt-2 text-sm opacity-90">Your location and safety profile are being shared.</p>
          <button onClick={() => setAlerting(false)} className="mt-10 w-full max-w-xs rounded-2xl bg-white py-3 text-base font-bold" style={{ color: 'var(--color-avoid)' }}>Cancel</button>
        </div>
      )}
    </MobileScreen>
  );
}

function Row({ emoji, label }: { emoji: string; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
      <span className="text-lg">{emoji}</span>
      <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>{label}</span>
      <span style={{ color: 'var(--color-sc-muted)' }}>›</span>
    </div>
  );
}
