'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { speak } from '@/lib/voice';
import { usePreferences } from '@/stores/preferences';

/**
 * 환영 화면 — 앱 진입점
 */
export default function WelcomePage() {
  const router = useRouter();
  const { autoTts } = usePreferences();

  useEffect(() => {
    if (autoTts) {
      speak('건강을 그림으로. IlliHealth. 시작하기 버튼을 눌러주세요.', 'ko-KR');
    }
  }, [autoTts]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-blue-50 px-6">
      <div className="flex flex-col items-center gap-8 max-w-sm w-full text-center">
        {/* 로고 */}
        <div className="flex items-center justify-center w-32 h-32 rounded-3xl bg-blue-600 text-white text-7xl shadow-xl">
          🏥
        </div>

        {/* 앱 이름 */}
        <div>
          <h1 className="text-4xl font-extrabold text-blue-800">IlliHealth</h1>
          <p className="mt-2 text-xl font-semibold text-blue-600">건강을 그림으로</p>
        </div>

        {/* UN SDG 3 뱃지 */}
        <p className="text-sm text-neutral-600 bg-white rounded-full px-4 py-1 shadow-sm border border-neutral-200">
          🌍 UN SDG 3 · 건강과 웰빙
        </p>

        {/* 시작 버튼 */}
        <button
          onClick={() => router.push('/home')}
          style={{ minHeight: 80 }}
          className="w-full mt-4 rounded-2xl bg-blue-600 text-white text-2xl font-bold py-5 shadow-lg active:scale-95 transition-transform"
          aria-label="시작하기"
        >
          시작하기 →
        </button>
      </div>
    </div>
  );
}
