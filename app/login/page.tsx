'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import bcrypt from 'bcryptjs';
import { useSession } from '@/stores/session';

/** 픽처키 로그인 — 텍스트/숫자 없이 픽토그램 4개 순서 (bcrypt로 실제 설정·검증). */
const TILES = ['☀️', '🌙', '💧', '🔥', '🌸', '🐦', '🏠', '⛰️', '🛣️', '🚪', '🔔', '🔑'];
const KEY_LEN = 4;
/** 데모용 기본 픽처키 (stores/session 기본 pinHash와 일치) */
const DEMO_KEY = [0, 1, 2, 3];

export default function LoginPage() {
  const router = useRouter();
  const { pinHash, setPinHash, setAuthed } = useSession();
  const setup = !pinHash; // 최초면 설정 모드
  const [picked, setPicked] = useState<number[]>([]);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function complete(seq: number[]) {
    setBusy(true);
    const keyStr = seq.join(',');
    if (setup) {
      const hash = await bcrypt.hash(keyStr, 10);
      setPinHash(hash);
      setAuthed(true);
      router.replace('/home');
    } else {
      const ok = await bcrypt.compare(keyStr, pinHash!);
      if (ok) {
        setAuthed(true);
        router.replace('/home');
      } else {
        setError(true);
        setPicked([]);
        setBusy(false);
      }
    }
  }

  function tap(idx: number) {
    if (busy) return;
    setError(false);
    const next = [...picked, idx];
    setPicked(next);
    if (next.length >= KEY_LEN) complete(next);
  }

  return (
    <div className="min-h-screen w-full flex justify-center" style={{ background: 'var(--color-sc-bg)' }}>
      <div className="relative w-full max-w-[440px] min-h-screen flex flex-col items-center px-6 pt-16">
        <div className="flex h-12 w-12 items-center justify-center rounded-full text-2xl" style={{ background: 'color-mix(in srgb, var(--color-sc-primary) 12%, white)' }}>🔒</div>
        <h1 className="mt-4 text-lg font-bold" style={{ color: 'var(--color-sc-ink)' }}>
          {setup ? 'Create your picture key' : 'Enter your picture key'}
        </h1>
        <p className="mt-1 text-xs" style={{ color: error ? 'var(--color-avoid)' : 'var(--color-sc-muted)' }}>
          {error ? 'Wrong key — try again' : setup ? 'Tap 4 pictures in an order you’ll remember' : 'Tap your 4 pictures in order'}
        </p>

        <div className="mt-5 flex gap-3">
          {Array.from({ length: KEY_LEN }).map((_, k) => (
            <span key={k} className="h-6 w-6 rounded-full border-2" style={{ borderColor: error ? 'var(--color-avoid)' : 'var(--color-sc-line)', background: k < picked.length ? 'var(--color-sc-primary)' : 'transparent' }} />
          ))}
        </div>

        {/* 데모 힌트 — 검증 모드에서 정답 픽처키 표시 */}
        {!setup && (
          <div className="mt-4 flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'var(--color-caution-bg)' }}>
            <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold" style={{ background: 'var(--color-caution)', color: '#fff' }}>DEMO</span>
            <span className="text-sm" style={{ color: 'var(--color-sc-ink)' }}>Tap in order:</span>
            <span className="text-lg tracking-wide">{DEMO_KEY.map((i) => TILES[i]).join(' ')}</span>
          </div>
        )}

        <div className="mt-6 grid grid-cols-4 gap-3">
          {TILES.map((t, idx) => (
            <button
              key={idx}
              onClick={() => tap(idx)}
              disabled={busy}
              className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm active:scale-95 transition-transform disabled:opacity-50"
              aria-label={`picture ${idx + 1}`}
            >
              {t}
            </button>
          ))}
        </div>

        <button onClick={() => setPicked(picked.slice(0, -1))} disabled={busy} className="mt-4 text-sm disabled:opacity-40" style={{ color: 'var(--color-sc-muted)' }}>⌫ delete</button>
      </div>
    </div>
  );
}
