'use client';

import { useRouter } from 'next/navigation';

/**
 * SOS 응급 버튼 — 모든 화면 우측 상단에 고정
 */
export function SOSButton() {
  const router = useRouter();

  return (
    <button
      aria-label="응급"
      onClick={() => router.push('/emergency')}
      style={{ minWidth: 64, minHeight: 64 }}
      className="fixed top-3 right-3 z-50 flex items-center justify-center w-16 h-16 rounded-full bg-red-600 text-white text-2xl shadow-lg active:scale-95 transition-transform"
    >
      🚨
    </button>
  );
}
