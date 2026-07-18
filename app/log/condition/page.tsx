'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Screen } from '@/components/Screen';
import { speak } from '@/lib/voice';
import { supabase } from '@/lib/supabase';
import { usePreferences } from '@/stores/preferences';

const MOODS = ['😖', '😔', '😐', '🙂', '😄'];
const BODY_PARTS = [
  { id: 'head', label: '머리', emoji: '🧠' },
  { id: 'chest', label: '가슴', emoji: '🫀' },
  { id: 'stomach', label: '배', emoji: '🫃' },
  { id: 'back', label: '허리', emoji: '🦴' },
  { id: 'arm', label: '팔', emoji: '💪' },
  { id: 'leg', label: '다리', emoji: '🦵' },
  { id: 'throat', label: '목', emoji: '🗣️' },
  { id: 'eye', label: '눈', emoji: '👁️' },
];

/**
 * 몸 상태 기록 화면 — 무드 이모지 + 신체 부위 그리드
 */
export default function ConditionPage() {
  const router = useRouter();
  const { autoTts } = usePreferences();
  const [mood, setMood] = useState<number | null>(null);
  const [bodyParts, setBodyParts] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (autoTts) speak('지금 몸 어때요? 얼굴을 골라주세요.', 'ko-KR');
  }, [autoTts]);

  function toggleBodyPart(id: string) {
    setBodyParts((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  async function handleSave() {
    if (mood === null) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('health_logs').insert({
      user_id: user?.id,
      mood,
      body_parts: bodyParts,
      created_at: new Date().toISOString(),
    });
    if (autoTts) await speak('기록 끝났어요, 잘하고 있어요', 'ko-KR');
    router.push('/log');
  }

  return (
    <Screen>
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-pink-600 text-2xl" aria-label="뒤로">‹</button>
        <h1 className="text-2xl font-bold text-pink-800">지금 몸 어때요?</h1>
      </div>

      {/* 무드 선택 */}
      <div className="mb-6">
        <p className="text-sm font-bold text-neutral-600 mb-3">여기 얼굴 중에서 골라주세요</p>
        <div className="flex justify-between">
          {MOODS.map((emoji, i) => (
            <button
              key={i}
              onClick={() => setMood(i)}
              style={{ minWidth: 60, minHeight: 60 }}
              className={`
                flex flex-col items-center rounded-2xl text-4xl p-2 transition-all
                ${mood === i
                  ? 'bg-pink-600 shadow-lg scale-110'
                  : 'bg-pink-50 border-2 border-pink-100'}
              `}
              aria-label={`기분 ${i + 1}점`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {/* 신체 부위 */}
      <div className="mb-6">
        <p className="text-sm font-bold text-neutral-600 mb-3">아픈 곳이 있으면 눌러주세요</p>
        <div className="grid grid-cols-4 gap-3">
          {BODY_PARTS.map((part) => (
            <button
              key={part.id}
              onClick={() => toggleBodyPart(part.id)}
              style={{ minHeight: 72 }}
              className={`
                flex flex-col items-center justify-center gap-1 rounded-2xl text-2xl border-2 transition-all
                active:scale-95
                ${bodyParts.includes(part.id)
                  ? 'bg-pink-600 border-pink-600 text-white'
                  : 'bg-pink-50 border-pink-100 text-pink-800'}
              `}
              aria-label={part.label}
            >
              <span>{part.emoji}</span>
              <span className="text-xs font-bold">{part.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 저장 버튼 */}
      <button
        onClick={handleSave}
        disabled={mood === null || saving}
        style={{ minHeight: 72 }}
        className="w-full rounded-3xl bg-pink-600 text-white text-xl font-extrabold py-4 shadow-lg disabled:opacity-40 active:scale-95 transition-transform"
      >
        {saving ? '저장 중...' : '✓ 저장'}
      </button>
    </Screen>
  );
}
