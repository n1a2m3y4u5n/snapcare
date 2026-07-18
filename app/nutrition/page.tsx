'use client';

import { MobileScreen } from '@/components/sc/MobileScreen';
import { useScans } from '@/stores/scans';
import { useFamily } from '@/stores/family';
import { LEVEL_META } from '@/lib/snapcare/verdict';

export default function NutritionPage() {
  const scans = useScans((s) => s.scans);
  const getMember = useFamily((s) => s.getMember);
  const food = scans.filter((s) => s.kind === 'food' || s.kind === 'drink');

  return (
    <MobileScreen tab="nutrition">
      <div className="px-5 pt-14">
        <h1 className="text-2xl font-extrabold" style={{ color: 'var(--color-sc-ink)' }}>Nutrition</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-sc-muted)' }}>
          Everything scanned for the family, with an instant verdict.
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {food.length === 0 && (
            <p className="mt-8 text-center text-sm" style={{ color: 'var(--color-sc-muted)' }}>No food scans yet.</p>
          )}
          {food.map((s) => {
            const meta = LEVEL_META[s.level];
            const member = getMember(s.memberId);
            return (
              <div key={s.id} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
                <span className="flex h-9 w-9 items-center justify-center rounded-full text-lg" style={{ background: meta.bg }}>{s.emoji}</span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>{s.name}</span>
                  <span className="block text-xs" style={{ color: 'var(--color-sc-muted)' }}>
                    {member ? `${member.name} · ` : ''}{s.timeLabel}
                  </span>
                </span>
                <span className="rounded-full px-2 py-1 text-[11px] font-bold" style={{ background: meta.bg, color: meta.color }}>
                  {meta.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </MobileScreen>
  );
}
