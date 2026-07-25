'use client';

import { useRouter } from 'next/navigation';
import { MobileScreen } from '@/components/sc/MobileScreen';
import { useScans } from '@/stores/scans';
import { useFamily } from '@/stores/family';
import { useAnalysis } from '@/stores/analysis';
import { useReminders } from '@/stores/reminders';
import { getItem } from '@/lib/snapcare/catalog';
import { LEVEL_META } from '@/lib/snapcare/verdict';
import type { Reminder } from '@/stores/reminders';

export default function HomePage() {
  const router = useRouter();
  const scans = useScans((s) => s.scans);
  const { setActiveMember, getMember } = useFamily();
  const setCurrent = useAnalysis((s) => s.setCurrent);
  const reminders = useReminders((s) => s.reminders);

  // 처방을 스캔해 알람을 만들었을 때만 뜬다.
  // 예전에는 존재하지도 않는 Metformin 알람이 항상 박혀 있었다 —
  // 눌러도 실제 알람과 무관했고, 데모에서 눌러보면 어긋나는 자리였다.
  const nextDose: Reminder | undefined = reminders[0];

  function openDose(r: Reminder) {
    setCurrent(r.item);
    setActiveMember(r.memberId);
    router.push('/dose');
  }

  function openScan(itemId: string, memberId: string) {
    const item = getItem(itemId);
    if (!item) return;
    setCurrent(item);
    setActiveMember(memberId);
    router.push('/scan');
  }

  return (
    <MobileScreen tab="home">
      <div className="px-5 pt-14">
        <h1 className="text-2xl font-extrabold" style={{ color: 'var(--color-sc-ink)' }}>
          SnapCare
        </h1>

        {/* 복약 리마인더 — 실제로 만든 알람이 있을 때만 */}
        {nextDose && (
          <button
            onClick={() => openDose(nextDose)}
            className="mt-4 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left"
            style={{ background: 'var(--color-med-bg)' }}
          >
            <span className="text-xl">{nextDose.item.emoji}</span>
            <span className="flex-1">
              <span className="block text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
                {nextDose.item.name} · {nextDose.time}
              </span>
              <span className="block text-xs" style={{ color: 'var(--color-sc-muted)' }}>
                {getMember(nextDose.memberId)?.name ?? ''}
              </span>
            </span>
            <span style={{ color: 'var(--color-sc-muted)' }}>›</span>
          </button>
        )}

        {/* 스캔 버튼 */}
        <div className="mt-8 flex flex-col items-center">
          <button
            onClick={() => router.push('/camera')}
            className="flex h-24 w-24 items-center justify-center rounded-full text-white shadow-lg active:scale-95 transition-transform"
            style={{ background: 'var(--color-sc-primary)' }}
            aria-label="Scan something"
          >
            <CameraGlyph />
          </button>
          <span className="mt-2 text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
            Scan something
          </span>
        </div>

        {/* 최근 */}
        <p className="mt-8 text-xs font-bold tracking-wide" style={{ color: 'var(--color-sc-muted)' }}>
          RECENT
        </p>
        <div className="mt-2 flex flex-col gap-2">
          {scans.map((s) => {
            const meta = LEVEL_META[s.level];
            const member = getMember(s.memberId);
            return (
              <button
                key={s.id}
                onClick={() => openScan(s.itemId, s.memberId)}
                className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-sm"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full text-lg" style={{ background: meta.bg }}>
                  {s.emoji}
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
                    {s.name}
                  </span>
                  <span className="block text-xs" style={{ color: 'var(--color-sc-muted)' }}>
                    {member ? `${member.name} · ` : ''}{s.timeLabel}
                  </span>
                </span>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />
              </button>
            );
          })}
        </div>
      </div>
    </MobileScreen>
  );
}

function CameraGlyph() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
