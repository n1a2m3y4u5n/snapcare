'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { speak } from '@/lib/voice';
import { sendOtp } from '@/lib/auth';
import { useAuthStore } from '@/stores/auth';
import { usePreferences } from '@/stores/preferences';

const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

/**
 * 전화번호 입력 화면 — 대형 키패드
 */
export default function PhonePage() {
  const router = useRouter();
  const setPhone = useAuthStore((s) => s.setPhone);
  const { autoTts } = usePreferences();
  const [digits, setDigits] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (autoTts) speak('전화번호를 입력해주세요', 'ko-KR');
  }, [autoTts]);

  function formatDisplay(d: string): string {
    if (d.length <= 3) return d;
    if (d.length <= 7) return `${d.slice(0,3)}-${d.slice(3)}`;
    return `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}`;
  }

  function handleKey(k: string) {
    if (k === '⌫') {
      setDigits((p) => p.slice(0, -1));
    } else if (digits.length < 11) {
      setDigits((p) => p + k);
    }
  }

  async function handleNext() {
    if (digits.length < 10) {
      setError('올바른 전화번호를 입력해주세요');
      return;
    }
    setLoading(true);
    setError('');
    const phone = `+82${digits.replace(/^0/, '')}`;
    const { error: err } = await sendOtp(phone);
    if (err) {
      setError(err);
      setLoading(false);
      return;
    }
    setPhone(phone);
    router.push('/otp');
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4 py-8">
      <div className="w-full max-w-sm flex flex-col gap-6">
        {/* 헤더 */}
        <div className="text-center">
          <p className="text-2xl font-bold text-neutral-800">전화번호를 입력해주세요</p>
          <p className="text-sm text-neutral-500 mt-1">SMS 인증번호를 보내드려요</p>
        </div>

        {/* 표시 */}
        <div className="text-center text-4xl font-bold tracking-widest text-blue-800 min-h-[60px]">
          {digits ? formatDisplay(digits) : <span className="text-neutral-300">010-0000-0000</span>}
        </div>

        {/* 에러 */}
        {error && (
          <p className="text-center text-red-600 text-sm">⚠️ {error}</p>
        )}

        {/* 키패드 */}
        <div className="grid grid-cols-3 gap-3">
          {KEYS.map((k, i) => (
            <button
              key={i}
              onClick={() => k && handleKey(k)}
              disabled={!k}
              style={{ minHeight: 70 }}
              className={`
                rounded-2xl text-2xl font-bold transition-all active:scale-95
                ${k
                  ? 'bg-neutral-100 text-neutral-800 hover:bg-neutral-200 shadow-sm'
                  : 'invisible'}
              `}
              aria-label={k || undefined}
            >
              {k}
            </button>
          ))}
        </div>

        {/* 다음 버튼 */}
        <button
          onClick={handleNext}
          disabled={digits.length < 10 || loading}
          style={{ minHeight: 64 }}
          className="w-full rounded-2xl bg-blue-600 text-white text-xl font-bold py-4 shadow-lg disabled:opacity-40 active:scale-95 transition-transform"
        >
          {loading ? '...' : '다음 →'}
        </button>
      </div>
    </div>
  );
}
