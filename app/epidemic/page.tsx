'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Screen } from '@/components/Screen';
import { speak } from '@/lib/voice';
import { usePreferences } from '@/stores/preferences';

interface EpidemicAlert {
  id: string;
  name: string;
  level: 1 | 2 | 3 | 4;
  region: string;
  description: string;
  updated_at: string;
}

const LEVEL_META: Record<number, { label: string; bg: string; text: string; emoji: string }> = {
  1: { label: '관심', bg: 'bg-blue-50', text: 'text-blue-800', emoji: '👀' },
  2: { label: '주의', bg: 'bg-amber-50', text: 'text-amber-800', emoji: '⚠️' },
  3: { label: '경계', bg: 'bg-red-50', text: 'text-red-700', emoji: '🚨' },
  4: { label: '심각', bg: 'bg-red-100', text: 'text-red-900', emoji: '🔴' },
};

/**
 * 감염병 경보 화면 — /api/epidemic-poll에서 데이터 가져옴
 */
export default function EpidemicPage() {
  const router = useRouter();
  const { autoTts } = usePreferences();
  const [alerts, setAlerts] = useState<EpidemicAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (autoTts) speak('감염병 경보를 확인해요.', 'ko-KR');
    fetchAlerts();
  }, [autoTts]);

  async function fetchAlerts() {
    try {
      const res = await fetch('/api/epidemic-poll');
      const data: EpidemicAlert[] = await res.json() as EpidemicAlert[];
      setAlerts(data);
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.back()} className="text-amber-600 text-2xl" aria-label="뒤로">‹</button>
        <h1 className="text-2xl font-bold text-amber-800">🦠 감염병 경보</h1>
        <button
          onClick={fetchAlerts}
          className="ml-auto text-amber-600 text-sm font-bold"
        >
          새로고침
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : alerts.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-neutral-400">
          <span className="text-6xl">✅</span>
          <p className="text-lg font-bold text-green-700">현재 경보 없음</p>
          <p className="text-sm text-neutral-500">안전한 상태예요</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {alerts.map((alert) => {
            const meta = LEVEL_META[alert.level] ?? LEVEL_META[1];
            return (
              <div
                key={alert.id}
                style={{ minHeight: 80 }}
                className={`p-4 rounded-2xl border-2 ${meta.bg} border-current`}
              >
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-2xl">{meta.emoji}</span>
                  <p className={`font-bold text-base ${meta.text}`}>{alert.name}</p>
                  <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full bg-white ${meta.text}`}>
                    {meta.label}
                  </span>
                </div>
                <p className="text-xs text-neutral-600">{alert.region}</p>
                <p className="text-xs text-neutral-500 mt-1">{alert.description}</p>
              </div>
            );
          })}
        </div>
      )}
    </Screen>
  );
}
