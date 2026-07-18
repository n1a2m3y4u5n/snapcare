'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Screen } from '@/components/Screen';
import { speak } from '@/lib/voice';
import { supabase } from '@/lib/supabase';
import { usePreferences } from '@/stores/preferences';

interface Medication {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

/**
 * 보관함 화면 — 등록된 약 목록 (보라 테마)
 */
export default function LibraryPage() {
  const router = useRouter();
  const { autoTts } = usePreferences();
  const [meds, setMeds] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');

  useEffect(() => {
    if (autoTts) speak('보관함이에요. 등록된 약을 확인해요.', 'ko-KR');
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    const { data } = await supabase
      .from('medications')
      .select('id, name, is_active, created_at')
      .order('created_at', { ascending: false });
    setMeds((data as Medication[] | null) ?? []);
    setLoading(false);
  }

  const filtered = meds.filter((m) => {
    if (filter === 'active') return m.is_active;
    if (filter === 'inactive') return !m.is_active;
    return true;
  });

  return (
    <Screen>
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.back()} className="text-purple-600 text-2xl" aria-label="뒤로">‹</button>
        <h1 className="text-2xl font-bold text-purple-800 flex items-center gap-2">
          📚 보관함
        </h1>
      </div>

      {/* 필터 탭 */}
      <div className="flex gap-2 mb-4">
        {(['all', 'active', 'inactive'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{ minHeight: 40 }}
            className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${
              filter === f
                ? 'bg-purple-600 text-white'
                : 'bg-purple-50 text-purple-700'
            }`}
          >
            {f === 'all' ? '전체' : f === 'active' ? '복용 중' : '복용 완료'}
          </button>
        ))}
      </div>

      {/* 목록 */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-neutral-400">
          <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-neutral-400">
          <span className="text-6xl">📭</span>
          <p className="text-lg">아직 등록된 약이 없어요</p>
          <button
            onClick={() => router.push('/camera')}
            style={{ minHeight: 56 }}
            className="px-6 py-3 rounded-2xl bg-blue-600 text-white font-bold"
          >
            📷 사진으로 등록하기
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((med) => (
            <button
              key={med.id}
              onClick={() => router.push(`/medication/${med.id}`)}
              style={{ minHeight: 80 }}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-purple-100 bg-purple-50 active:scale-[0.98] transition-transform"
            >
              <span className="text-4xl">💊</span>
              <div className="flex-1 text-left">
                <p className="font-bold text-purple-800 text-base">{med.name}</p>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {new Date(med.created_at).toLocaleDateString('ko-KR')} 등록
                </p>
              </div>
              <span
                className={`text-xs font-bold px-2 py-1 rounded-full ${
                  med.is_active ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-neutral-500'
                }`}
              >
                {med.is_active ? '복용 중' : '완료'}
              </span>
            </button>
          ))}
        </div>
      )}
    </Screen>
  );
}
