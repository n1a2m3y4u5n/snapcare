'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { speak } from '@/lib/voice';
import { PICTO_PIN_POOL, PICTO_EMOJI, verifyPictoPin, type PictoPinItem } from '@/lib/auth';
import { useAuthStore } from '@/stores/auth';
import { usePreferences } from '@/stores/preferences';

/**
 * 픽토그램 PIN 로그인 화면
 */
export default function PinLoginPage() {
  const router = useRouter();
  const pinHash = useAuthStore((s) => s.pinHash);
  const { autoTts } = usePreferences();
  const [selected, setSelected] = useState<PictoPinItem[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (autoTts) speak('그림 비밀번호를 입력해요. 그림 4개를 순서대로 골라주세요.', 'ko-KR');
  }, [autoTts]);

  async function handleSelect(item: PictoPinItem) {
    if (selected.includes(item)) return;
    const next = [...selected, item];
    setSelected(next);
    if (next.length === 4) {
      setTimeout(() => checkPin(next), 200);
    }
  }

  async function checkPin(pin: PictoPinItem[]) {
    if (!pinHash) {
      // PIN 미설정 → 재가입
      router.push('/phone');
      return;
    }
    const ok = await verifyPictoPin(pin, pinHash);
    if (ok) {
      if (autoTts) await speak('환영해요!', 'ko-KR');
      router.push('/home');
    } else {
      setError('비밀번호가 맞지 않아요');
      setSelected([]);
      if (autoTts) speak('비밀번호가 맞지 않아요. 다시 골라주세요.', 'ko-KR');
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4 py-8">
      <div className="w-full max-w-sm flex flex-col gap-6">
        {/* 헤더 */}
        <div className="text-center">
          <div className="text-5xl mb-3">🔐</div>
          <p className="text-2xl font-bold text-neutral-800">그림 비밀번호를 입력해요</p>
          <p className="text-sm text-neutral-500 mt-1">그림 4개를 순서대로 골라주세요</p>
        </div>

        {/* 선택된 PIN */}
        <div className="flex justify-center gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{ minWidth: 56, minHeight: 56 }}
              className={`
                flex items-center justify-center w-14 h-14 rounded-2xl text-3xl border-2 transition-all
                ${i < selected.length ? 'bg-blue-600 border-blue-600' : 'bg-neutral-100 border-neutral-200'}
              `}
            >
              {selected[i] ? PICTO_EMOJI[selected[i]] : ''}
            </div>
          ))}
        </div>

        {/* 에러 */}
        {error && <p className="text-center text-red-600 text-sm">⚠️ {error}</p>}

        {/* 픽토그램 그리드 */}
        <div className="grid grid-cols-4 gap-3">
          {PICTO_PIN_POOL.map((item) => {
            const isSelected = selected.includes(item);
            return (
              <button
                key={item}
                onClick={() => handleSelect(item)}
                disabled={isSelected || selected.length === 4}
                style={{ minHeight: 72 }}
                aria-label={item}
                className={`
                  flex flex-col items-center justify-center rounded-2xl text-3xl border-2 transition-all
                  active:scale-95
                  ${isSelected
                    ? 'bg-blue-100 border-blue-400 opacity-40'
                    : 'bg-neutral-50 border-neutral-200 hover:bg-blue-50 hover:border-blue-300'}
                `}
              >
                {PICTO_EMOJI[item]}
              </button>
            );
          })}
        </div>

        {/* 다시하기 */}
        {selected.length > 0 && (
          <button onClick={() => setSelected([])} className="text-neutral-500 text-sm underline text-center">
            처음부터 다시
          </button>
        )}

        {/* 전화번호로 로그인 */}
        <button onClick={() => router.push('/phone')} className="text-blue-600 text-sm underline text-center">
          전화번호로 로그인
        </button>
      </div>
    </div>
  );
}
