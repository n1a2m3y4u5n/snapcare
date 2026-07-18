'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Screen } from '@/components/Screen';
import { speak } from '@/lib/voice';
import { supabase } from '@/lib/supabase';
import { usePreferences } from '@/stores/preferences';

interface HealthLog {
  id: string;
  mood: number;
  body_parts: string[];
  created_at: string;
  note?: string;
}

const MOOD_EMOJI = ['😖', '😔', '😐', '🙂', '😄'];

/**
 * 건강 기록 목록 화면 (분홍 테마)
 */
export default function LogPage() {
  const router = useRouter();
  const { autoTts } = usePreferences();
  const [logs, setLogs] = useState<HealthLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (autoTts) speak('건강 기록을 보여드릴게요.', 'ko-KR');
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    const { data } = await supabase
      .from('health_logs')
      .select('id, mood, body_parts, created_at, note')
      .order('created_at', { ascending: false })
      .limit(30);
    setLogs((data as HealthLog[] | null) ?? []);
    setLoading(false);
  }

  return (
    <Screen>
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.back()} className="text-pink-600 text-2xl" aria-label="뒤로">‹</button>
        <h1 className="text-2xl font-bold text-pink-800 flex items-center gap-2">🩺 건강 기록</h1>
      </div>

      {/* 기록 추가 버튼들 */}
      <div className="flex gap-3 mb-4">
        <button
          onClick={() => router.push('/log/condition')}
          style={{ minHeight: 64 }}
          className="flex-1 rounded-2xl bg-pink-600 text-white font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
        >
          😊 오늘 기록
        </button>
        <button
          onClick={() => router.push('/log/photo')}
          style={{ minHeight: 64 }}
          className="flex-1 rounded-2xl bg-pink-100 text-pink-800 font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
        >
          📸 사진 경과
        </button>
      </div>

      {/* 타임라인 */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-pink-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-neutral-400">
          <span className="text-6xl">📋</span>
          <p className="text-lg">아직 기록이 없어요</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {logs.map((log) => (
            <div
              key={log.id}
              style={{ minHeight: 72 }}
              className="flex items-center gap-4 p-4 rounded-2xl border-2 border-pink-100 bg-pink-50"
            >
              <span className="text-4xl">{MOOD_EMOJI[log.mood] ?? '😐'}</span>
              <div className="flex-1">
                <p className="text-sm font-bold text-pink-800">
                  {new Date(log.created_at).toLocaleDateString('ko-KR', {
                    month: 'short', day: 'numeric', weekday: 'short',
                  })}
                </p>
                {log.body_parts?.length > 0 && (
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {log.body_parts.join(' · ')}
                  </p>
                )}
                {log.note && (
                  <p className="text-xs text-neutral-600 mt-0.5">{log.note}</p>
                )}
              </div>
              <span className="text-lg font-bold text-pink-600">
                {log.mood + 1}/5
              </span>
            </div>
          ))}
        </div>
      )}
    </Screen>
  );
}
