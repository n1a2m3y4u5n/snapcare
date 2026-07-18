'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/stores/session';

/** 픽처키 로그인 — 텍스트/숫자 없이 픽토그램 4개를 순서대로 (접근성 코어). */
const TILES = ['☀️', '🌙', '💧', '🔥', '🌸', '🐦', '🏠', '⛰️', '🛣️', '🚪', '🔔', '🔑'];
const KEY_LEN = 4;

export default function LoginPage() {
  const router = useRouter();
  const setAuthed = useSession((s) => s.setAuthed);
  const [picked, setPicked] = useState<number[]>([]);

  function enter() {
    setAuthed(true);
    router.replace('/home');
  }

  function tap(idx: number) {
    const next = [...picked, idx];
    setPicked(next);
    if (next.length >= KEY_LEN) setTimeout(enter, 250);
  }

  return (
    <div className="min-h-screen w-full flex justify-center" style={{ background: 'var(--color-sc-bg)' }}>
      <div className="relative w-full max-w-[440px] min-h-screen flex flex-col items-center px-6 pt-16">
        <div className="flex h-12 w-12 items-center justify-center rounded-full text-2xl" style={{ background: 'color-mix(in srgb, var(--color-sc-primary) 12%, white)' }}>🔒</div>
        <h1 className="mt-4 text-lg font-bold" style={{ color: 'var(--color-sc-ink)' }}>Enter your picture key</h1>

        {/* 진행 점 */}
        <div className="mt-5 flex gap-3">
          {Array.from({ length: KEY_LEN }).map((_, k) => (
            <span key={k} className="h-6 w-6 rounded-full border-2" style={{ borderColor: 'var(--color-sc-line)', background: k < picked.length ? 'var(--color-sc-primary)' : 'transparent' }} />
          ))}
        </div>

        {/* 픽토그램 그리드 */}
        <div className="mt-8 grid grid-cols-4 gap-3">
          {TILES.map((t, idx) => (
            <button
              key={idx}
              onClick={() => tap(idx)}
              className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm active:scale-95 transition-transform"
              aria-label={`picture ${idx + 1}`}
            >
              {t}
            </button>
          ))}
        </div>

        <button onClick={() => setPicked(picked.slice(0, -1))} className="mt-4 text-sm" style={{ color: 'var(--color-sc-muted)' }}>⌫ delete</button>

        <div className="mt-6 flex w-full items-center gap-3">
          <span className="h-px flex-1" style={{ background: 'var(--color-sc-line)' }} />
          <span className="text-xs" style={{ color: 'var(--color-sc-muted)' }}>or</span>
          <span className="h-px flex-1" style={{ background: 'var(--color-sc-line)' }} />
        </div>
        <div className="mt-4 flex gap-3">
          {['🍎', 'G', '✉️'].map((label, k) => (
            <button key={k} onClick={enter} className="flex h-11 w-16 items-center justify-center rounded-2xl bg-white text-lg font-semibold shadow-sm" style={{ color: 'var(--color-sc-ink)' }}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
