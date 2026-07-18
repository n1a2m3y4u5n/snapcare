'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Screen } from '@/components/Screen';
import { MedicationStrip } from '@/components/MedicationStrip';
import { speak } from '@/lib/voice';
import { usePreferences } from '@/stores/preferences';
import { requestPermission } from '@/lib/notifications';

/** 샘플 처방전 정의 */
const SAMPLES = [
  {
    id: 'antibiotic',
    label: '항생제 캡슐',
    sub: '아목시실린 250mg · 3회/일 · 5일',
    emoji: '💊',
    src: '/sample-prescription.png',
    color: 'bg-blue-50 border-blue-200 text-blue-800',
  },
  {
    id: 'eyedrop',
    label: '안약',
    sub: '토브라마이신 0.3% · 4회/일 · 5일',
    emoji: '👁️',
    src: '/prescription-eyedrop.png',
    color: 'bg-teal-50 border-teal-200 text-teal-800',
  },
  {
    id: 'syrup',
    label: '소아 시럽',
    sub: '타이레놀 현탁액 · 3회/일 · 3일',
    emoji: '🧴',
    src: '/prescription-syrup.png',
    color: 'bg-amber-50 border-amber-200 text-amber-800',
  },
] as const;

export default function HomePage() {
  const router = useRouter();
  const { autoTts } = usePreferences();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoTts) speak('처방전을 찍거나 사진을 올려주세요.', 'ko-KR');
    requestPermission();
  }, [autoTts]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      sessionStorage.setItem('capturedImage', dataUrl);
      sessionStorage.setItem('docMode', 'prescription');
      router.push('/processing');
    };
    reader.readAsDataURL(file);
  }

  /** 샘플 이미지를 fetch → DataURL 변환 후 바로 처리 화면으로 이동 */
  async function handleSample(src: string) {
    const res = await fetch(src);
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve(ev.target?.result as string);
      reader.readAsDataURL(blob);
    });
    sessionStorage.setItem('capturedImage', dataUrl);
    sessionStorage.setItem('docMode', 'prescription');
    router.push('/processing');
  }

  return (
    <Screen>
      <MedicationStrip />

      <div className="flex-1 flex flex-col gap-5">
        {/* 타이틀 */}
        <div className="text-center pt-2">
          <h1 className="text-2xl font-extrabold text-neutral-900">처방전을 그림으로</h1>
          <p className="text-sm text-neutral-500 mt-1">
            사진 찍기 또는 파일 올리기로 시작하세요
          </p>
        </div>

        {/* 두 버튼 나란히 */}
        <div className="flex gap-4 w-full">
          {/* 카메라 촬영 */}
          <button
            onClick={() => router.push('/camera')}
            style={{ minHeight: 160 }}
            className="flex-1 rounded-3xl bg-blue-600 text-white flex flex-col items-center justify-center gap-3 shadow-lg active:scale-95 transition-transform"
            aria-label="처방전 촬영"
          >
            <span className="text-5xl">📷</span>
            <span className="text-base font-bold">촬영하기</span>
          </button>

          {/* 파일 업로드 */}
          <label
            style={{ minHeight: 160 }}
            className="flex-1 rounded-3xl bg-neutral-800 text-white flex flex-col items-center justify-center gap-3 shadow-lg active:scale-95 transition-transform cursor-pointer"
            aria-label="파일 업로드"
          >
            <span className="text-5xl">📁</span>
            <span className="text-base font-bold">파일 올리기</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>
        </div>

        {/* 파이프라인 흐름 표시 */}
        <div className="flex items-center justify-center gap-2 text-[11px] text-neutral-400 font-mono">
          <span>이미지</span>
          <span>→</span>
          <span>OCR</span>
          <span>→</span>
          <span className="text-emerald-600">DSL</span>
          <span>→</span>
          <span className="text-blue-600">픽토그램</span>
        </div>

        {/* ── 샘플 처방전 ─────────────────────────────── */}
        <div>
          <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-2">
            샘플로 테스트하기
          </p>
          <div className="flex flex-col gap-2">
            {SAMPLES.map((s) => (
              <button
                key={s.id}
                onClick={() => handleSample(s.src)}
                className={`w-full flex items-center gap-3 rounded-2xl border px-4 py-3 active:scale-95 transition-transform text-left ${s.color}`}
              >
                <span className="text-3xl">{s.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm">{s.label}</div>
                  <div className="text-xs opacity-70 truncate">{s.sub}</div>
                </div>
                <span className="text-lg opacity-50">›</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 보관함 */}
      <div className="pt-4 border-t border-neutral-100">
        <button
          onClick={() => router.push('/library')}
          style={{ minHeight: 52 }}
          className="w-full rounded-xl bg-purple-50 text-purple-800 text-sm font-bold flex items-center justify-center gap-2 active:scale-95"
        >
          <span>📚</span> 내 약 보관함
        </button>
      </div>
    </Screen>
  );
}
