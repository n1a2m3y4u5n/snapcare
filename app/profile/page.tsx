'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { MobileScreen } from '@/components/sc/MobileScreen';
import { useProfile } from '@/stores/profile';
import { CONDITIONS } from '@/lib/snapcare/conditions';
import { sayable } from '@/components/sc/Say';
import type { AgeBand } from '@/lib/snapcare/types';

/**
 * 내 프로필 — 키보드를 한 번도 쓰지 않는다.
 *
 * 가족 명단을 없애면서 "구성원 목록 → 한 명 고르기 → 편집" 세 화면이 한 화면이 됐다.
 * 등록해야 시작할 수 있는 절차가 사라진 것이 이 변경의 요점이다 — 아무것도 고르지
 * 않아도 성인 기준으로 판정이 나오고, 자기에게 해당하는 것만 눌러 바로잡으면 된다.
 *
 * 나이대가 필요한 이유는 이것이 판정의 입력이기 때문이다. WHO 권고가 에너지 대비
 * 비율이라, 나이대가 정해져야 당·소금·포화지방 상한이 정해진다.
 */

/** 사람을 나타내는 그림 — 이름 대신 이것이 신원이 된다. */
const FACES = ['🧑', '🧒', '👶', '🧓', '👩', '👨', '👦', '👧'];

/**
 * 나이대는 이모지 대신 우리 글리프로 보인다.
 *
 * 아바타는 사용자가 고른 얼굴이라 그대로 두지만(그건 신원이다), 나이대는 기준치를
 * 정하는 입력이라 무엇을 고르는지가 정확해야 한다. 이모지는 기기마다 다르게 그려지고
 * 🧑‍🎓(학사모)는 '십대' 가 아니라 '졸업생' 이다 — 학교를 다니지 않는 아이에게는
 * 아무 뜻도 아니다. 네 글리프는 한 계열로 그려져 나란히 놓으면 나이 차가 보인다.
 */
const AGE_BANDS: { band: AgeBand; glyph: string; label: string; role: string }[] = [
  { band: 'child', glyph: 'state_child', label: 'Child', role: 'Child · age 7' },
  { band: 'teen', glyph: 'state_teen', label: 'Teen', role: 'Teen · age 15' },
  { band: 'adult', glyph: 'state_adult', label: 'Adult', role: 'Adult' },
  { band: 'senior', glyph: 'state_elderly', label: 'Older', role: 'Older adult' },
];

/** 화면 묶음 — 진단서가 없어도 답할 수 있는 것부터 묻는다. */
const GROUPS: { key: 'now' | 'experience' | 'diagnosis'; title: string; say: string }[] = [
  { key: 'now', title: 'RIGHT NOW', say: 'Right now. Things that are true today.' },
  { key: 'experience', title: 'MADE ME SICK BEFORE', say: 'Made me sick before.' },
  { key: 'diagnosis', title: 'A DOCTOR TOLD ME', say: 'A doctor told me.' },
];

export default function ProfilePage() {
  const router = useRouter();
  // 첫 실행에 로그인이 여기로 보낸다. 그때는 설정 탭으로 돌아갈 자리가 없고,
  // 대신 다 골랐다고 말할 자리가 있어야 한다.
  const setup = useSearchParams().get('setup') === '1';
  const { profile, toggleCondition, setFace, setAgeBand, confirm } = useProfile();

  function done() {
    confirm();
    router.replace('/home');
  }

  const currentBand: AgeBand = profile.ageBand ?? 'adult';

  return (
    <MobileScreen tab="settings">
      <div className="px-5 pt-14 pb-8">
        {setup ? (
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold" style={{ color: 'var(--color-sc-ink)' }}
                  {...sayable('Who are we checking for? Your age and conditions decide every verdict.')}>
              Who are we checking for?
            </span>
            {/* 건너뛰기를 남겨 둔다 — 첫 화면에서 막히면 앱을 아예 못 쓴다.
                건너뛰면 홈이 계속 누구 기준인지 보여준다. */}
            <button onClick={() => router.replace('/home')} className="text-sm font-semibold"
                    style={{ color: 'var(--color-sc-muted)' }}>
              Skip
            </button>
          </div>
        ) : (
          <button onClick={() => router.push('/settings')} className="text-sm font-semibold"
                  style={{ color: 'var(--color-sc-primary)' }}>
            ‹ Back
          </button>
        )}

        <div className="mt-4 flex items-center gap-3">
          <span className="flex h-16 w-16 items-center justify-center rounded-full text-3xl"
                style={{ background: profile.color }}>
            {profile.emoji}
          </span>
          <span className="text-[11px] font-bold tracking-wide" style={{ color: 'var(--color-sc-muted)' }}
                {...sayable('Tap a picture. No typing needed.')}>
            TAP A PICTURE — NO TYPING
          </span>
        </div>

        {/* 신원 = 그림 */}
        <div className="mt-4 flex flex-wrap gap-2">
          {FACES.map((f) => (
            <button
              key={f}
              onClick={() => setFace(f)}
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm"
              style={{ outline: profile.emoji === f ? '2px solid var(--color-sc-primary)' : '2px solid transparent' }}
              aria-label={`Face ${f}`}
              aria-pressed={profile.emoji === f}
            >
              {f}
            </button>
          ))}
        </div>

        {/* 나이대 = 기준치를 정하는 값 */}
        <p className="mt-6 text-[11px] font-bold tracking-wide" style={{ color: 'var(--color-sc-muted)' }}
           {...sayable('How old. This decides how much is too much.')}>
          HOW OLD
        </p>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {AGE_BANDS.map((b) => {
            const on = currentBand === b.band;
            return (
              <button
                key={b.band}
                onClick={() => setAgeBand(b.band, b.role)}
                className="flex flex-col items-center gap-1 rounded-2xl bg-white py-3 shadow-sm"
                style={{ outline: on ? '2px solid var(--color-sc-primary)' : '2px solid transparent' }}
                aria-pressed={on}
                aria-label={b.label}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/glyphs/${b.glyph}.png`} alt="" aria-hidden className="h-8 w-8" />
                <span className="text-[11px] font-semibold" style={{ color: 'var(--color-sc-ink)' }}>{b.label}</span>
              </button>
            );
          })}
        </div>

        {/*
          조건은 "진단명" 이 아니라 "당신이 알 수 있는 것" 순서로 묻는다.
          대상 지역엔 알레르기 검사 인프라가 없어서, 진단을 전제하면 프로필이 빈 채로 남는다.
        */}
        {GROUPS.map((g) => {
          const items = CONDITIONS.filter((c) => c.knownBy === g.key);
          if (items.length === 0) return null;
          return (
            <div key={g.key}>
              <p className="mt-6 text-[11px] font-bold tracking-wide" style={{ color: 'var(--color-sc-muted)' }}
                 {...sayable(g.say)}>
                {g.title}
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {items.map((c) => {
                  const on = profile.conditionIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggleCondition(c.id)}
                      className="flex flex-col items-center gap-1.5 rounded-2xl bg-white px-2 py-4 shadow-sm"
                      style={{ outline: on ? '2px solid var(--color-caution)' : '2px solid transparent' }}
                      aria-pressed={on}
                      aria-label={c.label}
                      {...sayable(`${c.label}. ${on ? 'On.' : 'Off.'}`)}
                    >
                      <span className="text-2xl">{c.emoji}</span>
                      <span className="text-center text-[11px] font-semibold leading-tight"
                            style={{ color: on ? 'var(--color-caution)' : 'var(--color-sc-muted)' }}>
                        {c.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {setup && (
          <button onClick={done}
                  className="mt-8 w-full rounded-2xl py-4 text-base font-bold text-white active:scale-[0.98] transition-transform"
                  style={{ background: 'var(--color-sc-primary)' }}
                  {...sayable('Done. Start using SnapCare.')}>
            Done
          </button>
        )}
      </div>
    </MobileScreen>
  );
}
