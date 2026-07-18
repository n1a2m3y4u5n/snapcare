'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { speak } from '@/lib/voice';
import { verifyOtp } from '@/lib/auth';
import { useAuthStore } from '@/stores/auth';
import { usePreferences } from '@/stores/preferences';

/**
 * OTP 인증 화면 — 6자리 숫자 입력, TTS로 코드 읽어줌
 */
export default function OtpPage() {
  const router = useRouter();
  const phone = useAuthStore((s) => s.phone);
  const setSession = useAuthStore((s) => s.setSession);
  const pinConfigured = useAuthStore((s) => s.pinConfigured);
  const { autoTts } = usePreferences();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoTts) speak('문자로 인증번호를 보냈어요. 6자리를 입력해주세요.', 'ko-KR');
    inputRef.current?.focus();
  }, [autoTts]);

  async function handleChange(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    setError('');

    if (digits.length === 6) {
      // TTS로 코드 읽어주기
      if (autoTts) {
        await speak(`인증번호는 ${digits.split('').join(' ')}`, 'ko-KR');
      }
      await submit(digits);
    }
  }

  async function submit(token: string) {
    if (!phone) {
      router.push('/phone');
      return;
    }
    setLoading(true);
    const { error: err } = await verifyOtp(phone, token);
    if (err) {
      setError('인증번호가 올바르지 않아요');
      setCode('');
      setLoading(false);
      if (autoTts) speak('인증번호가 올바르지 않아요. 다시 입력해주세요.', 'ko-KR');
      return;
    }
    // 성공: 세션은 supabase가 자동 설정
    if (pinConfigured) {
      router.push('/pin-login');
    } else {
      router.push('/pin-setup');
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4 py-8">
      <div className="w-full max-w-sm flex flex-col gap-8 items-center">
        {/* 헤더 */}
        <div className="text-center">
          <div className="text-5xl mb-4">📱</div>
          <p className="text-2xl font-bold text-neutral-800">인증번호를 입력해주세요</p>
          <p className="text-sm text-neutral-500 mt-2">
            {phone ?? '전화번호'}로 문자를 보냈어요
          </p>
        </div>

        {/* 숨겨진 input */}
        <input
          ref={inputRef}
          type="tel"
          inputMode="numeric"
          value={code}
          onChange={(e) => handleChange(e.target.value)}
          className="sr-only"
          aria-label="인증번호 6자리"
          maxLength={6}
        />

        {/* 코드 박스 표시 */}
        <div
          className="flex gap-3 cursor-text"
          onClick={() => inputRef.current?.focus()}
          role="button"
          tabIndex={0}
          aria-label="인증번호 입력칸"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              style={{ minWidth: 44, minHeight: 56 }}
              className={`
                flex items-center justify-center w-11 h-14 rounded-xl border-2 text-2xl font-bold
                ${i < code.length ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-neutral-200 bg-neutral-50 text-neutral-300'}
                ${i === code.length ? 'border-blue-600 animate-pulse' : ''}
              `}
            >
              {code[i] ?? (i === code.length ? '|' : '·')}
            </div>
          ))}
        </div>

        {/* 에러 */}
        {error && (
          <p className="text-red-600 text-sm">⚠️ {error}</p>
        )}

        {/* 로딩 */}
        {loading && (
          <div className="flex items-center gap-2 text-blue-600">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span>확인 중...</span>
          </div>
        )}

        {/* 재전송 */}
        <button
          onClick={() => router.push('/phone')}
          className="text-blue-600 text-sm underline"
        >
          인증번호 다시 받기
        </button>
      </div>
    </div>
  );
}
