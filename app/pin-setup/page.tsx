'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { speak } from '@/lib/voice';
import { PICTO_PIN_POOL, PICTO_EMOJI, hashPictoPin, type PictoPinItem } from '@/lib/auth';
import { useAuthStore } from '@/stores/auth';
import { usePreferences } from '@/stores/preferences';
import { supabase } from '@/lib/supabase';

/**
 * 픽토그램 PIN 설정 화면 — 4개 순서대로 선택
 */
export default function PinSetupPage() {
  const router = useRouter();
  const setPinConfigured = useAuthStore((s) => s.setPinConfigured);
  const setPinHash = useAuthStore((s) => s.setPinHash);
  const { autoTts } = usePreferences();
  const [selected, setSelected] = useState<PictoPinItem[]>([]);
  const [step, setStep] = useState<'select' | 'confirm'>('select');
  const [confirmSelected, setConfirmSelected] = useState<PictoPinItem[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (autoTts) speak('그림 비밀번호를 만들어요. 그림 4개를 순서대로 골라주세요.', 'ko-KR');
  }, [autoTts]);

  function handleSelect(item: PictoPinItem) {
    if (step === 'select') {
      if (selected.includes(item)) return;
      const next = [...selected, item];
      setSelected(next);
      if (next.length === 4) {
        setTimeout(() => {
          setStep('confirm');
          if (autoTts) speak('한 번 더 같은 순서로 골라주세요', 'ko-KR');
        }, 300);
      }
    } else {
      if (confirmSelected.includes(item)) return;
      const next = [...confirmSelected, item];
      setConfirmSelected(next);
      if (next.length === 4) {
        setTimeout(() => handleConfirm(next), 300);
      }
    }
  }

  async function handleConfirm(confirm: PictoPinItem[]) {
    if (JSON.stringify(selected) !== JSON.stringify(confirm)) {
      setError('순서가 맞지 않아요. 다시 해주세요.');
      setConfirmSelected([]);
      if (autoTts) speak('순서가 맞지 않아요. 처음부터 다시 해주세요.', 'ko-KR');
      return;
    }
    const hash = await hashPictoPin(selected);
    setPinHash(hash);
    setPinConfigured(true);

    // Supabase user_profiles에 PIN 해시 저장
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('user_profiles').upsert({
        id: user.id,
        pin_hash: hash,
      });
    }

    if (autoTts) speak('비밀번호가 만들어졌어요!', 'ko-KR');
    router.push('/tutorial');
  }

  function handleReset() {
    setSelected([]);
    setConfirmSelected([]);
    setStep('select');
    setError('');
  }

  const currentSelected = step === 'select' ? selected : confirmSelected;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4 py-8">
      <div className="w-full max-w-sm flex flex-col gap-6">
        {/* 헤더 */}
        <div className="text-center">
          <p className="text-2xl font-bold text-neutral-800">
            {step === 'select' ? '그림 비밀번호를 만들어요' : '한 번 더 확인해요'}
          </p>
          <p className="text-sm text-neutral-500 mt-1">그림 4개를 순서대로 골라주세요</p>
        </div>

        {/* 선택된 PIN 표시 */}
        <div className="flex justify-center gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{ minWidth: 56, minHeight: 56 }}
              className={`
                flex items-center justify-center w-14 h-14 rounded-2xl text-3xl border-2 transition-all
                ${i < currentSelected.length
                  ? 'bg-blue-600 border-blue-600'
                  : 'bg-neutral-100 border-neutral-200'}
              `}
            >
              {currentSelected[i] ? PICTO_EMOJI[currentSelected[i]] : ''}
            </div>
          ))}
        </div>

        {/* 에러 */}
        {error && <p className="text-center text-red-600 text-sm">⚠️ {error}</p>}

        {/* 픽토그램 그리드 */}
        <div className="grid grid-cols-4 gap-3">
          {PICTO_PIN_POOL.map((item) => {
            const isSelected = currentSelected.includes(item);
            return (
              <button
                key={item}
                onClick={() => handleSelect(item)}
                disabled={isSelected || currentSelected.length === 4}
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
        {currentSelected.length > 0 && (
          <button
            onClick={handleReset}
            className="text-neutral-500 text-sm underline text-center"
          >
            처음부터 다시
          </button>
        )}
      </div>
    </div>
  );
}
