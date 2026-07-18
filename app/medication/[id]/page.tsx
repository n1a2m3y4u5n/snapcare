'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Screen } from '@/components/Screen';
import { speak } from '@/lib/voice';
import { supabase } from '@/lib/supabase';
import { morphemeToEmoji } from '@/lib/pictogram';
import { usePreferences } from '@/stores/preferences';

interface Medication {
  id: string;
  name: string;
  is_active: boolean;
  raw_text: string;
  pictogram_sequence: unknown[];
  created_at: string;
}

interface Schedule {
  id: string;
  scheduled_time: string;
  taken: boolean;
}

interface PictogramPart {
  morpheme_id: string;
}

interface PictogramItem {
  type: string;
  parts: PictogramPart[];
  display_meta: { color: string };
}

/**
 * 약 상세 화면 — 스케줄 + 7일 복약 타임라인
 */
export default function MedicationDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { autoTts } = usePreferences();
  const [med, setMed] = useState<Medication | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function loadData() {
    const { data: medData } = await supabase
      .from('medications')
      .select('*')
      .eq('id', params.id)
      .single();

    if (medData) {
      setMed(medData as Medication);
      if (autoTts) speak(`${(medData as Medication).name} 상세 화면이에요.`, 'ko-KR');
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: schedData } = await supabase
      .from('med_schedules')
      .select('id, scheduled_time, taken')
      .eq('medication_id', params.id)
      .gte('scheduled_time', sevenDaysAgo.toISOString())
      .order('scheduled_time', { ascending: false });

    setSchedules((schedData as Schedule[] | null) ?? []);
    setLoading(false);
  }

  async function toggleActive() {
    if (!med) return;
    await supabase.from('medications').update({ is_active: !med.is_active }).eq('id', med.id);
    setMed({ ...med, is_active: !med.is_active });
  }

  if (loading) return (
    <Screen>
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
      </div>
    </Screen>
  );

  if (!med) return (
    <Screen>
      <div className="flex-1 flex items-center justify-center text-neutral-400">약을 찾을 수 없어요</div>
    </Screen>
  );

  const sequence = (med.pictogram_sequence ?? []) as PictogramItem[];

  return (
    <Screen>
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.back()} className="text-purple-600 text-2xl" aria-label="뒤로">‹</button>
        <h1 className="text-xl font-bold text-purple-800 flex-1 truncate">{med.name}</h1>
        <span className={`text-xs font-bold px-3 py-1 rounded-full ${med.is_active ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-neutral-500'}`}>
          {med.is_active ? '복용 중' : '완료'}
        </span>
      </div>

      {/* 픽토그램 시퀀스 */}
      {sequence.length > 0 && (
        <div className="mb-4">
          <p className="text-sm font-bold text-neutral-600 mb-2">복약 방법</p>
          <div className="flex flex-wrap gap-2">
            {sequence.map((item, i) => (
              <div key={i} className="flex items-center gap-1 bg-purple-50 border border-purple-100 rounded-xl px-3 py-2">
                {item.parts.map((p, j) => (
                  <span key={j} className="text-2xl">{morphemeToEmoji(p.morpheme_id)}</span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 7일 복약 타임라인 */}
      <div className="mb-4">
        <p className="text-sm font-bold text-neutral-600 mb-2">최근 7일 복약 기록</p>
        {schedules.length === 0 ? (
          <p className="text-sm text-neutral-400">복약 기록이 없어요</p>
        ) : (
          <div className="flex flex-col gap-2">
            {schedules.map((s) => (
              <div
                key={s.id}
                style={{ minHeight: 56 }}
                className={`flex items-center gap-3 p-3 rounded-xl border ${
                  s.taken ? 'bg-green-50 border-green-100' : 'bg-neutral-50 border-neutral-200'
                }`}
              >
                <span className="text-2xl">{s.taken ? '✅' : '⭕'}</span>
                <span className="text-sm text-neutral-700">
                  {new Date(s.scheduled_time).toLocaleString('ko-KR', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span className={`ml-auto text-xs font-bold ${s.taken ? 'text-green-600' : 'text-neutral-400'}`}>
                  {s.taken ? '복용' : '미복용'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 복용 상태 토글 */}
      <button
        onClick={toggleActive}
        style={{ minHeight: 56 }}
        className={`w-full rounded-2xl font-bold text-base py-3 transition-colors ${
          med.is_active
            ? 'bg-neutral-100 text-neutral-700'
            : 'bg-green-600 text-white'
        }`}
      >
        {med.is_active ? '복용 완료로 변경' : '복용 중으로 변경'}
      </button>
    </Screen>
  );
}
