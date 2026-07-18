'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface MedSchedule {
  id: string;
  medication_id: string;
  scheduled_time: string;
  medications?: { name: string };
}

/**
 * 오늘 복약 알림 스트립 — 홈 상단에 표시
 */
export function MedicationStrip() {
  const router = useRouter();
  const [upcoming, setUpcoming] = useState<MedSchedule | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const now = new Date();
      const today = now.toISOString().split('T')[0];

      const { data } = await supabase
        .from('med_schedules')
        .select('id, medication_id, scheduled_time, medications(name)')
        .gte('scheduled_time', `${today}T00:00:00`)
        .lte('scheduled_time', `${today}T23:59:59`)
        .eq('taken', false)
        .order('scheduled_time', { ascending: true })
        .limit(1);

      setUpcoming((data?.[0] as MedSchedule | undefined) ?? null);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return null;

  if (!upcoming) {
    return (
      <div className="mx-0 my-2 px-4 py-3 rounded-xl bg-green-50 border border-green-100 text-green-800 text-sm text-center">
        💊 오늘 복약 일정이 없어요
      </div>
    );
  }

  const time = new Date(upcoming.scheduled_time).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <button
      onClick={() => router.push(`/alarm/${upcoming.id}`)}
      className="w-full my-2 px-4 py-3 rounded-xl bg-green-600 text-white flex items-center gap-3 shadow active:scale-95 transition-transform"
      style={{ minHeight: 64 }}
    >
      <span className="text-2xl">⏰</span>
      <div className="flex-1 text-left">
        <p className="font-bold text-sm">지금 드실 약</p>
        <p className="text-xs opacity-90">
          {(upcoming.medications as { name: string } | undefined)?.name ?? '약'} · {time}
        </p>
      </div>
      <span className="text-lg">›</span>
    </button>
  );
}
