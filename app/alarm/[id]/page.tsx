'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { speak } from '@/lib/voice';
import { supabase } from '@/lib/supabase';
import { usePreferences } from '@/stores/preferences';
import { scheduleNotification } from '@/lib/notifications';

interface Schedule {
  id: string;
  scheduled_time: string;
  taken: boolean;
  medication_id: string;
  medications?: { name: string } | { name: string }[];
}

/**
 * 풀스크린 알람 화면 — 복용 완료 / 스누즈
 */
export default function AlarmPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { autoTts } = usePreferences();
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function load() {
    const { data } = await supabase
      .from('med_schedules')
      .select('id, scheduled_time, taken, medication_id, medications(name)')
      .eq('id', params.id)
      .single();

    if (data) {
      setSchedule(data as Schedule);
      if (autoTts) {
        const meds = (data as Schedule).medications;
        const name = (Array.isArray(meds) ? meds[0]?.name : meds?.name) ?? '약';
        speak(`약 먹을 시간이에요. ${name}`, 'ko-KR');
      }
    }
  }

  async function handleTaken() {
    if (!schedule) return;
    await supabase
      .from('med_schedules')
      .update({ taken: true, taken_at: new Date().toISOString() })
      .eq('id', schedule.id);

    setDone(true);
    if (autoTts) await speak('잘했어요. 지금 몸 어때요?', 'ko-KR');
    setTimeout(() => router.push('/log/condition'), 1500);
  }

  async function handleSnooze() {
    if (!schedule) return;
    const medsSnooze = schedule.medications;
    const name = (Array.isArray(medsSnooze) ? medsSnooze[0]?.name : medsSnooze?.name) ?? '약';
    scheduleNotification('약 먹을 시간이에요', name, 15 * 60 * 1000);
    if (autoTts) await speak('15분 후에 다시 알려드릴게요', 'ko-KR');
    router.push('/home');
  }

  const medsRaw = schedule?.medications;
  const medName = (Array.isArray(medsRaw) ? medsRaw[0]?.name : medsRaw?.name) ?? '약';
  const time = schedule
    ? new Date(schedule.scheduled_time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className="min-h-screen flex flex-col items-center justify-between bg-green-50 px-6 py-12">
      {/* 상단 정보 */}
      <div className="flex flex-col items-center gap-6 flex-1 justify-center text-center">
        <div className="text-[120px] leading-none animate-bounce">💊</div>
        <div>
          <h1 className="text-3xl font-extrabold text-green-800">약 먹을 시간이에요</h1>
          <p className="text-xl text-green-700 mt-2">{medName}</p>
          <p className="text-base text-neutral-600 mt-1">{time}</p>
        </div>

        {done && (
          <div className="text-5xl animate-bounce">✅</div>
        )}
      </div>

      {/* 액션 버튼 */}
      {!done && (
        <div className="w-full flex flex-col gap-4 max-w-sm">
          <button
            onClick={handleTaken}
            style={{ minHeight: 80 }}
            className="w-full rounded-3xl bg-green-600 text-white text-2xl font-extrabold py-5 shadow-xl active:scale-95 transition-transform"
          >
            ✓ 먹었어요
          </button>
          <button
            onClick={handleSnooze}
            style={{ minHeight: 64 }}
            className="w-full rounded-3xl bg-white border-2 border-green-300 text-green-700 text-lg font-bold py-4 active:scale-95 transition-transform"
          >
            ⏰ 15분 후
          </button>
        </div>
      )}
    </div>
  );
}
