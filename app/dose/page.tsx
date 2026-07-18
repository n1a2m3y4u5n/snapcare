'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAnalysis } from '@/stores/analysis';
import { useFamily } from '@/stores/family';
import { useScans, nowLabel } from '@/stores/scans';
import { usePreferences } from '@/stores/preferences';
import { speak } from '@/lib/voice';

/** 복약 확인 — 알람 시점의 큰 Taken/Missed (와이어프레임 Metformin dose). */
export default function DosePage() {
  const router = useRouter();
  const item = useAnalysis((s) => s.current);
  const setCurrent = useAnalysis((s) => s.setCurrent);
  const { members, activeMemberId } = useFamily();
  const addScan = useScans((s) => s.addScan);
  const autoTts = usePreferences((s) => s.autoTts);

  const member = members.find((m) => m.id === activeMemberId) ?? members[0];

  useEffect(() => {
    if (!item) {
      router.replace('/home');
      return;
    }
    if (autoTts) {
      speak(`${item.name}. For ${member?.name ?? 'you'}. ${item.rx?.dosageText ?? ''}`, 'en-US');
    }
  }, [item, member, autoTts, router]);

  if (!item || !member) return null;

  function log(taken: boolean) {
    addScan({
      id: `d_${Date.now().toString(36)}`,
      itemId: item!.id,
      name: item!.name,
      kind: item!.kind,
      emoji: item!.emoji,
      memberId: member.id,
      level: taken ? 'safe' : 'caution',
      timeLabel: nowLabel(),
    });
    setCurrent(null);
    router.push('/home');
  }

  return (
    <div className="min-h-screen w-full flex justify-center" style={{ background: 'var(--color-med-bg)' }}>
      <div className="relative w-full max-w-[440px] min-h-screen flex flex-col items-center px-6 pt-24">
        <div className="flex h-28 w-28 items-center justify-center rounded-full bg-white text-6xl shadow-sm">
          {item.emoji}
        </div>
        <h1 className="mt-6 text-2xl font-bold" style={{ color: 'var(--color-sc-ink)' }}>{item.name}</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-sc-muted)' }}>
          For {member.name} · {item.rx?.dosageText ?? 'take with food'}
        </p>

        <div className="mt-12 flex items-center gap-10">
          <button onClick={() => log(false)} className="flex flex-col items-center gap-2" aria-label="Missed">
            <span className="flex h-20 w-20 items-center justify-center rounded-full text-3xl text-white shadow-md active:scale-95 transition-transform" style={{ background: 'var(--color-avoid)' }}>✕</span>
            <span className="text-sm font-semibold" style={{ color: 'var(--color-sc-muted)' }}>Missed</span>
          </button>
          <button onClick={() => log(true)} className="flex flex-col items-center gap-2" aria-label="Taken">
            <span className="flex h-20 w-20 items-center justify-center rounded-full text-3xl text-white shadow-md active:scale-95 transition-transform" style={{ background: 'var(--color-safe)' }}>✓</span>
            <span className="text-sm font-semibold" style={{ color: 'var(--color-sc-muted)' }}>Taken</span>
          </button>
        </div>

        <button onClick={() => { setCurrent(null); router.push('/home'); }} className="mt-auto mb-8 text-sm" style={{ color: 'var(--color-sc-muted)' }}>
          Later
        </button>
      </div>
    </div>
  );
}
