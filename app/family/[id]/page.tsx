'use client';

import { useParams, useRouter } from 'next/navigation';
import { MobileScreen } from '@/components/sc/MobileScreen';
import { useFamily } from '@/stores/family';
import { CONDITIONS } from '@/lib/snapcare/conditions';
import type { AgeBand } from '@/lib/snapcare/types';

/**
 * 프로필 편집 — 키보드를 한 번도 쓰지 않는다.
 *
 * 이전 화면은 "TAP TO TOGGLE · NO TYPING NEEDED"라고 써놓고 바로 위에 이름 입력창을
 * 두고 있었다. 글을 못 읽는 사용자가 전제인 앱에서 프로필을 만들려면 타이핑을 해야 하는
 * 구조였다는 뜻이다. 사람은 그림으로 고르고, 나이대도 그림으로 고른다.
 *
 * 나이대가 필요한 이유는 이것이 판정의 입력이기 때문이다 —
 * WHO 권고가 에너지 대비 %라, 나이대가 정해져야 당·소금·포화지방 상한이 정해진다.
 */

/** 사람을 나타내는 그림 — 이름 대신 이것이 신원이 된다. */
const FACES = ['🧑', '🧒', '👶', '🧓', '👩', '👨', '👦', '👧'];

const AGE_BANDS: { band: AgeBand; emoji: string; label: string; role: string }[] = [
  { band: 'child', emoji: '🧒', label: 'Child', role: 'Child · age 7' },
  { band: 'teen', emoji: '🧑‍🎓', label: 'Teen', role: 'Teen · age 15' },
  { band: 'adult', emoji: '🧑', label: 'Adult', role: 'Adult' },
  { band: 'senior', emoji: '🧓', label: 'Older', role: 'Older adult' },
];

/** 화면 묶음 — 진단서가 없어도 답할 수 있는 것부터 묻는다. */
const GROUPS: { key: 'now' | 'experience' | 'diagnosis'; title: string }[] = [
  { key: 'now', title: 'RIGHT NOW' },
  { key: 'experience', title: 'MADE ME SICK BEFORE' },
  { key: 'diagnosis', title: 'A DOCTOR TOLD ME' },
];

export default function MemberEditPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { members, toggleCondition, setMemberFace, setMemberAgeBand, removeMember } = useFamily();
  const member = members.find((m) => m.id === params.id);

  if (!member) {
    return (
      <MobileScreen>
        <div className="px-5 pt-20 text-center" style={{ color: 'var(--color-sc-muted)' }}>
          Not found.
        </div>
      </MobileScreen>
    );
  }

  const currentBand: AgeBand = member.ageBand
    ?? (/\b7\b|child/i.test(member.role) ? 'child'
      : /teen|1[3-8]/i.test(member.role) ? 'teen'
      : 'adult');

  return (
    <MobileScreen>
      <div className="px-5 pt-14 pb-8">
        <button onClick={() => router.push('/family')} className="text-sm font-semibold" style={{ color: 'var(--color-sc-primary)' }}>
          ‹ Back
        </button>

        <div className="mt-4 flex items-center gap-3">
          <span
            className="flex h-16 w-16 items-center justify-center rounded-full text-3xl"
            style={{ background: member.color }}
          >
            {member.emoji}
          </span>
          <span className="text-[11px] font-bold tracking-wide" style={{ color: 'var(--color-sc-muted)' }}>
            TAP A PICTURE — NO TYPING
          </span>
        </div>

        {/* 신원 = 그림 */}
        <div className="mt-4 flex flex-wrap gap-2">
          {FACES.map((f) => (
            <button
              key={f}
              onClick={() => setMemberFace(member.id, f)}
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm"
              style={{ outline: member.emoji === f ? '2px solid var(--color-sc-primary)' : '2px solid transparent' }}
              aria-label={`Face ${f}`}
              aria-pressed={member.emoji === f}
            >
              {f}
            </button>
          ))}
        </div>

        {/* 나이대 = 기준치를 정하는 값 */}
        <p className="mt-6 text-[11px] font-bold tracking-wide" style={{ color: 'var(--color-sc-muted)' }}>
          HOW OLD
        </p>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {AGE_BANDS.map((b) => {
            const on = currentBand === b.band;
            return (
              <button
                key={b.band}
                onClick={() => setMemberAgeBand(member.id, b.band, b.role)}
                className="flex flex-col items-center gap-1 rounded-2xl bg-white py-3 shadow-sm"
                style={{ outline: on ? '2px solid var(--color-sc-primary)' : '2px solid transparent' }}
                aria-pressed={on}
              >
                <span className="text-2xl">{b.emoji}</span>
                <span className="text-[11px] font-semibold" style={{ color: 'var(--color-sc-ink)' }}>{b.label}</span>
              </button>
            );
          })}
        </div>

        {/*
          조건은 "진단명"이 아니라 "당신이 알 수 있는 것" 순서로 묻는다.
          대상 지역엔 알레르기 검사 인프라가 없어서, 진단을 전제하면 프로필이 빈 채로 남는다.
        */}
        {GROUPS.map((g) => {
          const items = CONDITIONS.filter((c) => c.knownBy === g.key);
          if (items.length === 0) return null;
          return (
            <div key={g.key}>
              <p className="mt-6 text-[11px] font-bold tracking-wide" style={{ color: 'var(--color-sc-muted)' }}>
                {g.title}
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {items.map((c) => {
                  const on = member.conditionIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggleCondition(member.id, c.id)}
                      className="flex flex-col items-center gap-1.5 rounded-2xl bg-white px-2 py-4 shadow-sm"
                      style={{ outline: on ? '2px solid var(--color-caution)' : '2px solid transparent' }}
                      aria-pressed={on}
                      aria-label={c.label}
                    >
                      <span className="text-2xl">{c.emoji}</span>
                      <span className="text-center text-[11px] font-semibold leading-tight" style={{ color: on ? 'var(--color-caution)' : 'var(--color-sc-muted)' }}>
                        {c.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        <button
          onClick={() => { removeMember(member.id); router.push('/family'); }}
          className="mt-6 w-full rounded-2xl py-3 text-center text-sm font-semibold"
          style={{ background: 'var(--color-avoid-bg)', color: 'var(--color-avoid)' }}
        >
          Remove
        </button>
      </div>
    </MobileScreen>
  );
}
