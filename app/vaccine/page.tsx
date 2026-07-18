'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Screen } from '@/components/Screen';
import { speak } from '@/lib/voice';
import { supabase } from '@/lib/supabase';
import { usePreferences } from '@/stores/preferences';

const VACCINE_LIST = [
  { id: 'flu', label: '독감', emoji: '🤧', period: '매년' },
  { id: 'covid', label: 'COVID-19', emoji: '🦠', period: '매년' },
  { id: 'hepatitis_a', label: 'A형 간염', emoji: '🏥', period: '2회' },
  { id: 'hepatitis_b', label: 'B형 간염', emoji: '🏥', period: '3회' },
  { id: 'tetanus', label: '파상풍', emoji: '🩹', period: '10년' },
  { id: 'pneumococcal', label: '폐렴구균', emoji: '🫁', period: '1회' },
  { id: 'hpv', label: 'HPV', emoji: '💉', period: '2~3회' },
  { id: 'shingles', label: '대상포진', emoji: '⚡', period: '1회' },
];

interface VaccineStatus {
  vaccine_id: string;
  done: boolean;
  done_at?: string;
}

/**
 * 백신 접종 화면 — 표준 백신 목록 + 완료/예정 토글
 */
export default function VaccinePage() {
  const router = useRouter();
  const { autoTts } = usePreferences();
  const [statuses, setStatuses] = useState<Record<string, VaccineStatus>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (autoTts) speak('백신 일정을 확인해요.', 'ko-KR');
    loadStatuses();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadStatuses() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase
      .from('vaccine_records')
      .select('vaccine_id, done, done_at')
      .eq('user_id', user?.id);

    const map: Record<string, VaccineStatus> = {};
    for (const row of (data ?? []) as VaccineStatus[]) {
      map[row.vaccine_id] = row;
    }
    setStatuses(map);
    setLoading(false);
  }

  async function toggleVaccine(vaccineId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    const current = statuses[vaccineId];
    const newDone = !current?.done;

    await supabase.from('vaccine_records').upsert({
      user_id: user?.id,
      vaccine_id: vaccineId,
      done: newDone,
      done_at: newDone ? new Date().toISOString() : null,
    });

    setStatuses((prev) => ({
      ...prev,
      [vaccineId]: { vaccine_id: vaccineId, done: newDone, done_at: newDone ? new Date().toISOString() : undefined },
    }));
  }

  return (
    <Screen>
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.back()} className="text-amber-600 text-2xl" aria-label="뒤로">‹</button>
        <h1 className="text-2xl font-bold text-amber-800">💉 백신 접종</h1>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {VACCINE_LIST.map((v) => {
            const status = statuses[v.id];
            const isDone = status?.done ?? false;
            return (
              <button
                key={v.id}
                onClick={() => toggleVaccine(v.id)}
                style={{ minHeight: 72 }}
                className={`
                  flex items-center gap-4 p-4 rounded-2xl border-2 transition-all active:scale-[0.98]
                  ${isDone
                    ? 'bg-green-50 border-green-200'
                    : 'bg-amber-50 border-amber-100'}
                `}
              >
                <span className="text-3xl">{v.emoji}</span>
                <div className="flex-1 text-left">
                  <p className={`font-bold ${isDone ? 'text-green-800' : 'text-amber-800'}`}>{v.label}</p>
                  <p className="text-xs text-neutral-500">{v.period}</p>
                  {isDone && status.done_at && (
                    <p className="text-xs text-green-600 mt-0.5">
                      {new Date(status.done_at).toLocaleDateString('ko-KR')} 완료
                    </p>
                  )}
                </div>
                <span className={`text-sm font-bold px-3 py-1 rounded-full ${
                  isDone ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {isDone ? '완료' : '예정'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Screen>
  );
}
