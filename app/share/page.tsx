'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Screen } from '@/components/Screen';
import { speak } from '@/lib/voice';
import { supabase } from '@/lib/supabase';
import { usePreferences } from '@/stores/preferences';
import { QRCodeSVG } from 'qrcode.react';

/**
 * 의료진 공유 QR 화면
 */
export default function SharePage() {
  const router = useRouter();
  const { autoTts } = usePreferences();
  const [token, setToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    if (autoTts) speak('QR 코드를 의료진에게 보여주세요.', 'ko-KR');
  }, [autoTts]);

  useEffect(() => {
    if (!expiresAt) return;
    const interval = setInterval(() => {
      const left = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
      setTimeLeft(left);
      if (left === 0) {
        setToken(null);
        setExpiresAt(null);
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  async function generateToken() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const newToken = crypto.randomUUID();
    const exp = new Date(Date.now() + 10 * 60 * 1000); // 10분

    await supabase.from('share_tokens').insert({
      user_id: user?.id,
      token: newToken,
      expires_at: exp.toISOString(),
    });

    setToken(newToken);
    setExpiresAt(exp);
    setTimeLeft(600);
    setLoading(false);

    if (autoTts) speak('QR 코드가 만들어졌어요. 10분 안에 의료진에게 보여주세요.', 'ko-KR');
  }

  const qrUrl = token ? `${typeof window !== 'undefined' ? window.location.origin : ''}/medical-view?token=${token}` : '';

  return (
    <Screen>
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-purple-600 text-2xl" aria-label="뒤로">‹</button>
        <h1 className="text-2xl font-bold text-purple-800">📋 의료진 공유</h1>
      </div>

      <div className="flex flex-col items-center gap-6 flex-1">
        {!token ? (
          <>
            <div className="text-center">
              <span className="text-8xl">🩺</span>
              <p className="mt-4 text-lg text-neutral-700">QR 코드를 만들어서 의료진에게 보여주세요</p>
              <p className="text-sm text-neutral-500 mt-1">10분 동안 사용할 수 있어요</p>
            </div>
            <button
              onClick={generateToken}
              disabled={loading}
              style={{ minHeight: 72 }}
              className="w-full rounded-3xl bg-purple-600 text-white text-xl font-extrabold py-4 shadow-lg disabled:opacity-50 active:scale-95 transition-transform"
            >
              {loading ? '만드는 중...' : 'QR 코드 만들기'}
            </button>
          </>
        ) : (
          <>
            {/* QR 코드 */}
            <div className="bg-white p-6 rounded-3xl shadow-lg border-2 border-purple-100">
              <QRCodeSVG value={qrUrl} size={220} level="H" />
            </div>

            {/* 만료 타이머 */}
            <div className="text-center">
              <p className="text-lg font-bold text-purple-800">
                ⏱️ {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')} 남음
              </p>
              <p className="text-sm text-neutral-500 mt-1">10분 후 만료돼요</p>
            </div>

            {/* 새 코드 */}
            <button
              onClick={generateToken}
              style={{ minHeight: 56 }}
              className="w-full rounded-2xl bg-purple-100 text-purple-800 font-bold py-3 active:scale-95"
            >
              새 코드 만들기
            </button>
          </>
        )}
      </div>
    </Screen>
  );
}
