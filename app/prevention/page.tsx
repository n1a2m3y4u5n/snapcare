'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Screen } from '@/components/Screen';
import { PictogramCard } from '@/components/PictogramCard';
import { speak } from '@/lib/voice';
import { usePreferences } from '@/stores/preferences';

/**
 * 예방 허브 화면 — 3카드: 만성질환 / 백신 / 감염병 경보
 */
export default function PreventionPage() {
  const router = useRouter();
  const { autoTts } = usePreferences();

  useEffect(() => {
    if (autoTts) speak('예방 관리를 확인해요. 만성질환, 백신, 감염병 경보 중 하나를 골라주세요.', 'ko-KR');
  }, [autoTts]);

  return (
    <Screen>
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-amber-600 text-2xl" aria-label="뒤로">‹</button>
        <h1 className="text-2xl font-bold text-amber-800">🛡️ 예방</h1>
      </div>

      <div className="flex flex-col gap-4 flex-1">
        <PictogramCard
          emoji="🫀"
          label="만성질환"
          color="amber"
          size="lg"
          onClick={() => router.push('/chronic')}
        />
        <PictogramCard
          emoji="💉"
          label="백신"
          color="amber"
          size="lg"
          onClick={() => router.push('/vaccine')}
        />
        <PictogramCard
          emoji="🦠"
          label="감염병 경보"
          color="amber"
          size="lg"
          onClick={() => router.push('/epidemic')}
        />
      </div>
    </Screen>
  );
}
