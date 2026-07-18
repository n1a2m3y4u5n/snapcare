'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { speak } from '@/lib/voice';
import { usePreferences } from '@/stores/preferences';

const STEPS = [
  {
    emoji: '📷',
    title: '사진 찍기',
    body: '진단서를 사진으로 찍어요',
    bg: 'bg-blue-50',
    accent: 'text-blue-600',
  },
  {
    emoji: '🖼️',
    title: '그림으로 이해',
    body: '그림과 음성으로 약 정보를 알려줘요',
    bg: 'bg-green-50',
    accent: 'text-green-600',
  },
  {
    emoji: '⏰',
    title: '알람으로 복약',
    body: '약 먹을 시간에 알려드려요',
    bg: 'bg-amber-50',
    accent: 'text-amber-600',
  },
  {
    emoji: '🩺',
    title: '건강 기록',
    body: '매일 몸 상태를 기록해요',
    bg: 'bg-pink-50',
    accent: 'text-pink-600',
  },
  {
    emoji: '🚨',
    title: '응급 연락',
    body: '도움이 필요하면 바로 연락해요',
    bg: 'bg-red-50',
    accent: 'text-red-600',
  },
];

/**
 * 튜토리얼 화면 — 5단계 슬라이드
 */
export default function TutorialPage() {
  const router = useRouter();
  const { autoTts } = usePreferences();
  const [current, setCurrent] = useState(0);
  const step = STEPS[current];

  useEffect(() => {
    if (step && autoTts) {
      speak(`${step.title}. ${step.body}`, 'ko-KR');
    }
  }, [current, autoTts, step]);

  function handleNext() {
    if (current < STEPS.length - 1) {
      setCurrent((c) => c + 1);
    } else {
      router.push('/home');
    }
  }

  return (
    <div className={`min-h-screen flex flex-col items-center justify-between px-6 py-10 ${step?.bg ?? ''}`}>
      {/* 건너뛰기 */}
      <button
        onClick={() => router.push('/home')}
        className="self-end text-neutral-500 text-sm underline"
      >
        건너뛰기
      </button>

      {/* 슬라이드 내용 */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 text-center max-w-sm">
        <div className="text-[120px] leading-none">{step?.emoji}</div>
        <div>
          <h2 className={`text-3xl font-extrabold ${step?.accent ?? ''}`}>{step?.title}</h2>
          <p className="mt-3 text-lg text-neutral-700">{step?.body}</p>
        </div>
      </div>

      {/* 점 표시기 */}
      <div className="flex gap-2 mb-6">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition-all ${
              i === current ? 'bg-neutral-700 w-6' : 'bg-neutral-300'
            }`}
          />
        ))}
      </div>

      {/* 다음/시작 버튼 */}
      <button
        onClick={handleNext}
        style={{ minHeight: 72 }}
        className="w-full max-w-sm rounded-2xl bg-neutral-800 text-white text-xl font-bold py-4 shadow-lg active:scale-95 transition-transform"
      >
        {current < STEPS.length - 1 ? '다음 →' : '시작하기 🎉'}
      </button>
    </div>
  );
}
