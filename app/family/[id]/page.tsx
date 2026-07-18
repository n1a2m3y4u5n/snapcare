'use client';

import { useParams, useRouter } from 'next/navigation';
import { MobileScreen } from '@/components/sc/MobileScreen';
import { useFamily } from '@/stores/family';
import { CONDITIONS } from '@/lib/snapcare/conditions';

export default function MemberEditPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { members, toggleCondition, setMemberName, removeMember } = useFamily();
  const member = members.find((m) => m.id === params.id);

  function remove() {
    if (member) removeMember(member.id);
    router.push('/family');
  }

  if (!member) {
    return (
      <MobileScreen>
        <div className="px-5 pt-20 text-center" style={{ color: 'var(--color-sc-muted)' }}>
          Member not found.
        </div>
      </MobileScreen>
    );
  }

  return (
    <MobileScreen>
      <div className="px-5 pt-14">
        <button onClick={() => router.push('/family')} className="text-sm font-semibold" style={{ color: 'var(--color-sc-primary)' }}>
          ‹ Family
        </button>
        <input
          value={member.name}
          onChange={(e) => setMemberName(member.id, e.target.value)}
          className="mt-3 w-full bg-transparent text-2xl font-extrabold outline-none"
          style={{ color: 'var(--color-sc-ink)' }}
          aria-label="Member name"
        />
        <p className="mt-2 text-[11px] font-bold tracking-wide" style={{ color: 'var(--color-sc-muted)' }}>
          TAP TO TOGGLE · NO TYPING NEEDED
        </p>

        <div className="mt-3 grid grid-cols-2 gap-3">
          {CONDITIONS.map((c) => {
            const on = member.conditionIds.includes(c.id);
            return (
              <button
                key={c.id}
                onClick={() => toggleCondition(member.id, c.id)}
                className="flex flex-col items-center gap-2 rounded-2xl bg-white px-3 py-5 shadow-sm"
                style={{ outline: on ? '2px solid var(--color-caution)' : '2px solid transparent' }}
                aria-pressed={on}
              >
                <span className="text-3xl">{c.emoji}</span>
                <span className="text-center text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>{c.label}</span>
                <span className="text-xs font-bold" style={{ color: on ? 'var(--color-caution)' : 'var(--color-sc-muted)' }}>
                  {on ? 'ON' : 'off'}
                </span>
              </button>
            );
          })}
        </div>

        <button onClick={remove} className="mt-5 w-full rounded-2xl py-3 text-center text-sm font-semibold" style={{ background: 'var(--color-avoid-bg)', color: 'var(--color-avoid)' }}>
          Remove member
        </button>
      </div>
    </MobileScreen>
  );
}
