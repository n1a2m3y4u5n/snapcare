'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Screen } from '@/components/Screen';
import { speak } from '@/lib/voice';
import { supabase } from '@/lib/supabase';
import { usePreferences } from '@/stores/preferences';

const CONDITIONS = [
  { id: 'diabetes', label: '당뇨', emoji: '🍬' },
  { id: 'hypertension', label: '고혈압', emoji: '❤️' },
  { id: 'asthma', label: '천식', emoji: '🫁' },
  { id: 'heart', label: '심장질환', emoji: '🫀' },
  { id: 'kidney', label: '신장질환', emoji: '🩺' },
  { id: 'thyroid', label: '갑상선', emoji: '🦋' },
];

/**
 * 만성질환 관리 화면 — 6개 토글 카드
 */
export default function ChronicPage() {
  const router = useRouter();
  const { autoTts } = usePreferences();
  const [active, setActive] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (autoTts) speak('만성질환을 관리해요. 해당하는 질환을 눌러주세요.', 'ko-KR');
    loadConditions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadConditions() {
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase
      .from('chronic_conditions')
      .select('condition_id')
      .eq('user_id', user?.id);
    setActive((data ?? []).map((d: { condition_id: string }) => d.condition_id));
  }

  async function toggle(id: string) {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();

    if (active.includes(id)) {
      await supabase
        .from('chronic_conditions')
        .delete()
        .eq('user_id', user?.id)
        .eq('condition_id', id);
      setActive((prev) => prev.filter((a) => a !== id));
    } else {
      await supabase.from('chronic_conditions').upsert({
        user_id: user?.id,
        condition_id: id,
      });
      setActive((prev) => [...prev, id]);
    }
    setSaving(false);
  }

  return (
    <Screen>
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-amber-600 text-2xl" aria-label="뒤로">‹</button>
        <h1 className="text-2xl font-bold text-amber-800">🫀 만성질환 관리</h1>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {CONDITIONS.map((c) => {
          const isActive = active.includes(c.id);
          return (
            <button
              key={c.id}
              onClick={() => toggle(c.id)}
              disabled={saving}
              style={{ minHeight: 110 }}
              aria-label={c.label}
              className={`
                flex flex-col items-center justify-center gap-2 rounded-2xl border-2 text-4xl transition-all
                active:scale-95 disabled:opacity-60
                ${isActive
                  ? 'bg-amber-600 border-amber-600 text-white shadow-lg'
                  : 'bg-amber-50 border-amber-100 text-amber-800'}
              `}
            >
              <span>{c.emoji}</span>
              <span className="text-sm font-bold">{c.label}</span>
              {isActive && <span className="text-xs">✓ 등록됨</span>}
            </button>
          );
        })}
      </div>
    </Screen>
  );
}
