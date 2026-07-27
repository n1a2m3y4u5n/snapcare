'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/stores/session';

const SLIDES = [
  { emoji: '📷', title: 'Point & scan', body: 'Aim your camera at food, medicine or anything you’re about to use.', tint: 'var(--color-sc-primary)' },
  { emoji: '🚦', title: 'Instant verdict', body: 'Green, amber or red — no reading required.', tint: 'var(--color-safe)' },
  // 가족 명단을 없앤 뒤에도 "Built for family" 가 남아 있었다. 첫 화면이 앱에 없는
  // 기능을 약속하는 자리라, 그대로 두면 처음 여는 사람이 가장 먼저 만나는 것이 거짓이다.
  { emoji: '⚖️', title: 'Judged for you', body: 'The same food can be fine for an adult and too much for a child — the limits come from your age.', tint: 'var(--color-caution)' },
  { emoji: '🔔', title: 'A few permissions', body: 'Camera to scan, and notifications for dose reminders.', tint: 'var(--color-avoid)' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const setOnboarded = useSession((s) => s.setOnboarded);
  const [i, setI] = useState(0);
  const last = i === SLIDES.length - 1;
  const s = SLIDES[i];

  function finish() {
    setOnboarded(true);
    router.replace('/login');
  }

  return (
    <div className="min-h-screen w-full flex justify-center" style={{ background: 'var(--color-sc-bg)' }}>
      <div className="relative w-full max-w-[440px] min-h-screen flex flex-col px-6 pb-8 pt-14">
        <div className="flex items-center justify-between text-sm font-semibold" style={{ color: 'var(--color-sc-muted)' }}>
          <button onClick={() => (i > 0 ? setI(i - 1) : null)} className={i > 0 ? '' : 'invisible'}>Back</button>
          <button onClick={finish}>Skip</button>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="flex h-32 w-32 items-center justify-center rounded-full text-6xl" style={{ background: 'color-mix(in srgb, ' + s.tint + ' 12%, white)' }}>
            {s.emoji}
          </div>
          <h1 className="mt-8 text-2xl font-bold" style={{ color: 'var(--color-sc-ink)' }}>{s.title}</h1>
          <p className="mt-3 max-w-xs text-sm leading-relaxed" style={{ color: 'var(--color-sc-muted)' }}>{s.body}</p>
        </div>

        {/* 인디케이터 */}
        <div className="mb-6 flex justify-center gap-2">
          {SLIDES.map((_, k) => (
            <span key={k} className="h-2 rounded-full transition-all" style={{ width: k === i ? 20 : 8, background: k === i ? 'var(--color-sc-primary)' : 'var(--color-sc-line)' }} />
          ))}
        </div>

        <button
          onClick={() => (last ? finish() : setI(i + 1))}
          className="w-full rounded-2xl py-4 text-base font-bold text-white active:scale-[0.98] transition-transform"
          style={{ background: 'var(--color-sc-primary)' }}
        >
          {last ? 'Get Started' : 'Next'}
        </button>
      </div>
    </div>
  );
}
