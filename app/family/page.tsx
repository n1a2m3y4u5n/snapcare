'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MobileScreen } from '@/components/sc/MobileScreen';
import { useFamily } from '@/stores/family';
import { getCondition } from '@/lib/snapcare/conditions';

export default function FamilyPage() {
  const router = useRouter();
  const members = useFamily((s) => s.members);
  const addMember = useFamily((s) => s.addMember);

  function add() {
    const id = addMember();
    router.push(`/family/edit?id=${id}`);
  }

  return (
    <MobileScreen>
      <div className="px-5 pt-14">
        <button
          onClick={() => router.push('/settings')}
          className="text-sm font-semibold"
          style={{ color: 'var(--color-sc-primary)' }}
        >
          ‹ Settings
        </button>
        <h1 className="mt-2 text-2xl font-extrabold" style={{ color: 'var(--color-sc-ink)' }}>Who we check for</h1>

        {/* 범례 */}
        <div className="mt-3 flex gap-4 text-xs" style={{ color: 'var(--color-sc-muted)' }}>
          <Legend color="var(--color-safe)" label="No restrictions" />
          <Legend color="var(--color-caution)" label="Has restrictions" />
          <Legend color="var(--color-avoid)" label="Conflict risk" />
        </div>
        <p className="mt-2 text-xs" style={{ color: 'var(--color-sc-muted)' }}>
          Tap a profile to edit allergies &amp; conditions — no typing needed.
        </p>

        {/* 프로필 리스트 */}
        <div className="mt-4 flex flex-col gap-2">
          {members.map((m) => {
            const dot =
              m.conditionIds.some((c) => getCondition(c)?.severity === 'avoid') ? 'var(--color-avoid)'
              : m.conditionIds.length > 0 ? 'var(--color-caution)'
              : 'var(--color-safe)';
            return (
              <Link
                key={m.id}
                href={`/family/edit?id=${m.id}`}
                className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: m.color }}>
                  {m.emoji}
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-bold" style={{ color: 'var(--color-sc-ink)' }}>{m.name}</span>
                  <span className="block text-xs" style={{ color: 'var(--color-sc-muted)' }}>
                    {m.role}
                    {m.conditionIds.length > 0 && ` · ${m.conditionIds.map((c) => getCondition(c)?.label).filter(Boolean).join(', ')}`}
                  </span>
                </span>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: dot }} />
                <span style={{ color: 'var(--color-sc-muted)' }}>›</span>
              </Link>
            );
          })}

          <button onClick={add} className="flex items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-3 text-left" style={{ borderColor: 'var(--color-sc-line)' }}>
            <span className="flex h-10 w-10 items-center justify-center rounded-full text-xl" style={{ background: 'var(--color-sc-line)', color: 'var(--color-sc-muted)' }}>＋</span>
            <span className="text-sm font-semibold" style={{ color: 'var(--color-sc-muted)' }}>Add member</span>
          </button>
        </div>
      </div>
    </MobileScreen>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} /> {label}
    </span>
  );
}
