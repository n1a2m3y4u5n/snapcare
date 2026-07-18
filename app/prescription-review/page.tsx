'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Screen } from '@/components/Screen';
import { BigCheckButton } from '@/components/BigCheckButton';
import { BigXButton } from '@/components/BigXButton';
import { type PictogramResult, type StructuredRxInfo } from '@/lib/pictogram';
import { composePrescriptionTts } from '@/lib/ocr-to-macro';
import { speak } from '@/lib/voice';
import { usePreferences } from '@/stores/preferences';

// ──────────────────────────────────────────────────────────────────────────────
// 복용 시간대 슬롯 정의
// ──────────────────────────────────────────────────────────────────────────────
const TIMING_SLOTS = [
  { key: 'morning' as const, label: '아침', icon: '🌅', bg: 'bg-amber-400',   ring: 'ring-amber-300'   },
  { key: 'noon'    as const, label: '점심', icon: '☀️',  bg: 'bg-orange-400',  ring: 'ring-orange-300'  },
  { key: 'evening' as const, label: '저녁', icon: '🌇', bg: 'bg-rose-400',    ring: 'ring-rose-300'    },
  { key: 'night'   as const, label: '취침', icon: '🌙', bg: 'bg-indigo-500',  ring: 'ring-indigo-300'  },
];

// ──────────────────────────────────────────────────────────────────────────────
// 메인 페이지
// ──────────────────────────────────────────────────────────────────────────────
export default function PrescriptionReviewPage() {
  const router        = useRouter();
  const { autoTts }   = usePreferences();
  const [result, setResult]               = useState<PictogramResult | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [ocrText, setOcrText]             = useState('');
  const [saving, setSaving]               = useState(false);
  const [showPipeline, setShowPipeline]   = useState(false);
  const [isSpeaking, setIsSpeaking]       = useState(false);

  /** rxInfo 기반 TTS 스크립트를 읽는다 */
  async function speakRx(rxInfo: StructuredRxInfo) {
    if (isSpeaking) {
      // 이미 읽는 중이면 중지
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
      setIsSpeaking(false);
      return;
    }
    setIsSpeaking(true);
    const script = composePrescriptionTts(rxInfo);
    await speak(script, 'ko-KR');
    setIsSpeaking(false);
  }

  useEffect(() => {
    const raw  = sessionStorage.getItem('pictogramResult');
    const text = sessionStorage.getItem('ocrText') ?? '';
    const img  = sessionStorage.getItem('capturedImage');
    if (!raw) { router.push('/camera'); return; }
    try {
      const parsed = JSON.parse(raw) as PictogramResult;
      setResult(parsed);
      setOcrText(text);
      setCapturedImage(img);
      // rxInfo가 있으면 구조화된 TTS 스크립트를, 없으면 기본 안내문을 읽는다
      if (parsed.rxInfo) {
        const script = composePrescriptionTts(parsed.rxInfo);
        setIsSpeaking(true);
        speak(script, 'ko-KR').then(() => setIsSpeaking(false));
      } else if (autoTts) {
        speak('이렇게 이해했어요. 맞으면 체크 버튼을 눌러주세요.', 'ko-KR');
      }
    } catch {
      router.push('/camera');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConfirm() {
    if (!result || saving) return;
    setSaving(true);
    sessionStorage.removeItem('capturedImage');
    sessionStorage.removeItem('pictogramResult');
    sessionStorage.removeItem('ocrText');
    if (autoTts) await speak('확인됐어요!', 'ko-KR');
    router.push('/home');
  }

  function handleReject() {
    if (autoTts) speak('다시 찍어볼게요.', 'ko-KR');
    router.push('/camera');
  }

  if (!result) return null;

  const images   = result.images ?? [];
  const dslLines = result.dslLines ?? [];
  const rxInfo   = result.rxInfo;

  return (
    <Screen>
      {/* ── 헤더 ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3">
        <h1 className="text-xl font-bold text-neutral-800 flex-1">이렇게 이해했어요</h1>
        <button
          onClick={() => setShowPipeline((v) => !v)}
          className="text-[11px] text-neutral-400 underline shrink-0"
        >
          {showPipeline ? '파이프라인 ▲' : '파이프라인 ▼'}
        </button>
      </div>

      {/* ── 스크롤 영역 ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-3 pb-2">

        {/* 1. 약품명 헤더 카드 */}
        {rxInfo && <DrugHeader rxInfo={rxInfo} />}

        {/* 2. SIGIL 엔진 픽토그램 출력 */}
        <PictogramStrip images={images} />

        {/* 2-b. VOCA 스크립트 미리보기 */}
        {rxInfo && <VocaScriptCard rxInfo={rxInfo} onSpeak={() => speakRx(rxInfo)} isSpeaking={isSpeaking} />}

        {/* 3. 복용 방법 */}
        {rxInfo && <DosageCard rxInfo={rxInfo} />}

        {/* 4. 투약 기간 */}
        {rxInfo?.durationDays && <DurationCard days={rxInfo.durationDays} />}

        {/* 5. 주의사항 · 금기 */}
        {rxInfo && (rxInfo.warnings.length > 0 || rxInfo.contraindications.length > 0 || rxInfo.needsHandwash || rxInfo.lensRestriction) && (
          <WarningsCard rxInfo={rxInfo} />
        )}

        {/* 6. 보관 방법 */}
        {rxInfo?.storageType && <StorageCard rxInfo={rxInfo} />}

        {/* 7. 파이프라인 상세 (토글) */}
        {showPipeline && (
          <PipelineSection
            capturedImage={capturedImage}
            ocrText={ocrText}
            dslLines={dslLines}
            images={images}
            rxInfo={rxInfo ?? null}
          />
        )}
      </div>

      {/* ── 확인/거절 버튼 ───────────────────────────────────────────────── */}
      <div className="flex justify-center gap-10 pt-4 border-t border-neutral-100">
        <div className="flex flex-col items-center gap-2">
          <BigXButton onClick={handleReject} label="틀려요" />
          <span className="text-sm text-neutral-600">틀려요</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <BigCheckButton onClick={handleConfirm} disabled={saving} label="맞아요" />
          <span className="text-sm text-neutral-600">{saving ? '저장 중...' : '맞아요'}</span>
        </div>
      </div>
    </Screen>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 1. 약품명 헤더 카드
// ──────────────────────────────────────────────────────────────────────────────
function DrugHeader({ rxInfo }: { rxInfo: StructuredRxInfo }) {
  return (
    <div className="rounded-2xl bg-blue-600 text-white px-5 py-4 flex items-center gap-4 shadow-md">
      <span className="text-5xl leading-none">{rxInfo.drugEmoji}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold opacity-70 uppercase tracking-widest mb-0.5">처방 의약품</div>
        <div className="text-base font-extrabold leading-snug break-words">{rxInfo.drugName}</div>
        {rxInfo.frequency > 0 && (
          <div className="text-xs opacity-80 mt-1">1일 {rxInfo.frequency}회 · {rxInfo.durationDays ? `${rxInfo.durationDays}일` : '–'}</div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 2. SIGIL 엔진 픽토그램 출력
// ──────────────────────────────────────────────────────────────────────────────
function PictogramStrip({ images }: { images: string[] }) {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-white overflow-hidden">
      <div className="px-4 py-2 border-b border-emerald-100 flex items-center gap-2 bg-emerald-50">
        <div className="flex items-center justify-center w-6 h-6 rounded-md bg-emerald-600 text-white text-[10px] font-black">SG</div>
        <span className="text-xs font-black text-emerald-800 tracking-tight">SIGIL</span>
        <span className="text-[10px] text-emerald-600">픽토그램 합성 출력</span>
        <span className="text-[10px] text-neutral-400 ml-auto">Python · Pillow</span>
      </div>
      <div className="p-3">
        {images.length > 0 ? (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {images.map((src, i) => (
              <div
                key={i}
                className="shrink-0 rounded-xl bg-neutral-50 border border-neutral-100 flex items-center justify-center p-2"
                style={{ minWidth: 100, minHeight: 90 }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`픽토그램 ${i + 1}`} className="max-h-20 w-auto" />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4 text-neutral-400 text-xs">
            <span className="text-2xl block mb-1">⚠️</span>
            픽토그램을 생성하지 못했어요
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 2-b. VOCA 스크립트 카드
// ──────────────────────────────────────────────────────────────────────────────
function VocaScriptCard({
  rxInfo,
  onSpeak,
  isSpeaking,
}: {
  rxInfo: StructuredRxInfo;
  onSpeak: () => void;
  isSpeaking: boolean;
}) {
  const script = composePrescriptionTts(rxInfo);
  return (
    <div className="rounded-2xl border border-violet-200 bg-white overflow-hidden">
      <div className="px-4 py-2 border-b border-violet-100 flex items-center gap-2 bg-violet-50">
        <div className="flex items-center justify-center w-6 h-6 rounded-md bg-violet-600 text-white text-[10px] font-black">VC</div>
        <span className="text-xs font-black text-violet-800 tracking-tight">VOCA</span>
        <span className="text-[10px] text-violet-600">TTS 스크립트 합성</span>
        {/* 재생 버튼을 VOCA 카드 헤더에 배치 */}
        <button
          onClick={onSpeak}
          aria-label={isSpeaking ? '읽기 중지' : 'TTS 재생'}
          className={`ml-auto flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all active:scale-95
            ${isSpeaking
              ? 'bg-violet-600 text-white animate-pulse'
              : 'bg-violet-100 text-violet-700'
            }`}
        >
          <span>{isSpeaking ? '🔊' : '🔈'}</span>
          <span>{isSpeaking ? '읽는 중' : '재생'}</span>
        </button>
      </div>
      <div className="px-4 py-3">
        <p className="text-[12px] text-violet-900 leading-relaxed">
          &ldquo;{script}&rdquo;
        </p>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 3. 복용 방법 카드
// ──────────────────────────────────────────────────────────────────────────────
function DosageCard({ rxInfo }: { rxInfo: StructuredRxInfo }) {
  const activeTimes = new Set(rxInfo.timings);

  const mealLabel = rxInfo.mealContext === 'after'
    ? `식후${rxInfo.mealMinutes ? ` ${rxInfo.mealMinutes}분` : ''}`
    : rxInfo.mealContext === 'before'
    ? `식전${rxInfo.mealMinutes ? ` ${rxInfo.mealMinutes}분` : ''}`
    : null;

  return (
    <SectionCard
      emoji="💚"
      title="복용 방법"
      accent="green"
    >
      {/* 시간대 슬롯 */}
      <div className="flex gap-2 justify-around mb-3">
        {TIMING_SLOTS.map((slot) => {
          const active = activeTimes.has(slot.key);
          return (
            <div key={slot.key} className="flex flex-col items-center gap-1">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all
                  ${active
                    ? `${slot.bg} shadow-md ring-2 ${slot.ring}`
                    : 'bg-neutral-100 opacity-35'
                  }`}
              >
                {slot.icon}
              </div>
              <span className={`text-[11px] font-bold ${active ? 'text-neutral-700' : 'text-neutral-300'}`}>
                {slot.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* 식전/식후 + 복용량 배지 */}
      <div className="flex flex-wrap gap-2">
        {mealLabel && (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-800 text-xs font-bold">
            🍽️ {mealLabel}
          </span>
        )}
        {rxInfo.amountText && (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-50 text-blue-800 text-xs font-bold">
            📏 {rxInfo.amountText}
          </span>
        )}
        {!mealLabel && !rxInfo.amountText && rxInfo.frequency > 0 && (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-800 text-xs font-bold">
            🔄 1일 {rxInfo.frequency}회
          </span>
        )}
      </div>
    </SectionCard>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 4. 투약 기간 카드
// ──────────────────────────────────────────────────────────────────────────────
function DurationCard({ days }: { days: number }) {
  // 도트 시각화: 최대 14개 표시, 초과 시 숫자만
  const MAX_DOTS = 14;
  const dots = Math.min(days, MAX_DOTS);

  return (
    <SectionCard emoji="📅" title="투약 기간" accent="blue">
      <div className="flex items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: dots }).map((_, i) => (
            <div
              key={i}
              className="w-5 h-5 rounded-full bg-blue-500"
            />
          ))}
          {days > MAX_DOTS && (
            <div className="w-5 h-5 rounded-full bg-blue-200 flex items-center justify-center text-[9px] font-bold text-blue-600">
              +{days - MAX_DOTS}
            </div>
          )}
        </div>
        <div className="ml-auto text-right shrink-0">
          <span className="text-3xl font-extrabold text-blue-600">{days}</span>
          <span className="text-sm font-bold text-blue-400 ml-1">일</span>
        </div>
      </div>
    </SectionCard>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 5. 주의사항 카드
// ──────────────────────────────────────────────────────────────────────────────
function WarningsCard({ rxInfo }: { rxInfo: StructuredRxInfo }) {
  return (
    <SectionCard emoji="⚠️" title="주의사항" accent="amber">
      <div className="flex flex-col gap-2">
        {/* 금기 사항 배지 */}
        {rxInfo.contraindications.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-1">
            {rxInfo.contraindications.map((c) => (
              <span
                key={c}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold"
              >
                🚫 {c === 'pregnant' ? '임산부 금기' : '수유부 주의'}
              </span>
            ))}
          </div>
        )}

        {/* 특이 주의사항 배지 */}
        {rxInfo.needsHandwash && (
          <div className="flex items-center gap-2 text-xs text-amber-700 font-medium">
            <span className="text-base">🙌</span> 점안·도포 전 반드시 손을 씻으세요
          </div>
        )}
        {rxInfo.lensRestriction && (
          <div className="flex items-center gap-2 text-xs text-amber-700 font-medium">
            <span className="text-base">🚫</span> 렌즈 착용 금지 (점안 기간 중)
          </div>
        )}

        {/* 주의사항 목록 */}
        {rxInfo.warnings.map((w, i) => (
          <div key={i} className="flex items-start gap-2 text-xs text-amber-800">
            <span className="mt-0.5 shrink-0 text-amber-400">•</span>
            <span>{w}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 6. 보관 방법 카드
// ──────────────────────────────────────────────────────────────────────────────
function StorageCard({ rxInfo }: { rxInfo: StructuredRxInfo }) {
  const isRefrig = rxInfo.storageType === 'refrigerator';
  return (
    <SectionCard
      emoji={isRefrig ? '❄️' : '🌡️'}
      title="보관 방법"
      accent={isRefrig ? 'sky' : 'neutral'}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl
            ${isRefrig ? 'bg-sky-100' : 'bg-neutral-100'}`}
        >
          {isRefrig ? '❄️' : '🌡️'}
        </div>
        <div>
          <div className={`font-bold text-sm ${isRefrig ? 'text-sky-700' : 'text-neutral-700'}`}>
            {isRefrig ? '냉장 보관' : '실온 보관'}
          </div>
          {rxInfo.storageText && (
            <div className="text-xs text-neutral-500 mt-0.5">
              {rxInfo.storageText.replace(/냉장보관|실온보관|상온보관/g, '').trim()}
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 7. 파이프라인 상세 (시연용) — OCR → SIGIL / VOCA 구조
// ──────────────────────────────────────────────────────────────────────────────
function PipelineSection({
  capturedImage,
  ocrText,
  dslLines,
  images,
  rxInfo,
}: {
  capturedImage: string | null;
  ocrText: string;
  dslLines: string[];
  images: string[];
  rxInfo: StructuredRxInfo | null;
}) {
  return (
    <div className="flex flex-col gap-3 mt-1">
      <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest px-1">
        전체 파이프라인 (시연용)
      </div>

      {/* ── 공통 입력 ── */}
      <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest px-1 mt-1">
        공통 입력
      </div>

      <PipelineStageCard n={1} title="원본 이미지" sub="카메라 / 파일 업로드" accentColor="neutral">
        {capturedImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={capturedImage}
            alt="원본 처방전"
            className="w-full h-auto rounded-lg border border-neutral-200"
            style={{ maxHeight: 200, objectFit: 'contain' }}
          />
        ) : (
          <div className="text-xs text-neutral-400 italic">이미지 없음</div>
        )}
      </PipelineStageCard>

      <PipelineStageCard n={2} title="OCR 추출" sub="Tesseract.js · kor + eng" accentColor="neutral">
        <pre className="text-[11px] leading-relaxed text-neutral-700 whitespace-pre-wrap break-words bg-neutral-50 rounded p-2 max-h-32 overflow-y-auto font-mono">
          {ocrText.trim() || '(텍스트를 추출하지 못했어요)'}
        </pre>
      </PipelineStageCard>

      {/* ── SIGIL 엔진 ── */}
      <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-600 uppercase tracking-widest px-1 mt-1">
        <div className="flex items-center justify-center w-5 h-5 rounded bg-emerald-600 text-white text-[9px] font-black">SG</div>
        SIGIL 엔진 — Symbol Intuitive Glyph Image Lab
      </div>

      <PipelineStageCard n={3} title="DSL 변환" sub="ocr-to-macro · 자체 개발 문법" accentColor="emerald">
        <pre className="text-[12px] leading-relaxed text-emerald-900 whitespace-pre-wrap break-words bg-emerald-50 rounded p-2 font-mono">
          {dslLines.length > 0 ? dslLines.join('\n') : '(DSL을 생성하지 못했어요)'}
        </pre>
        <div className="text-[10px] text-neutral-400 mt-1">
          \operator{'{'}\head{'{'}\modifier{'}'}{'}'}  — 형태소 트리 합성
        </div>
      </PipelineStageCard>

      <PipelineStageCard n={4} title="PNG 합성" sub="Python · Pillow · SIGIL v1" accentColor="emerald">
        {images.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {images.map((src, i) => (
              <div key={i} className="rounded-lg bg-neutral-50 border border-neutral-100 p-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`픽토그램 ${i + 1}`} className="max-h-20 w-auto" />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-neutral-400 italic">픽토그램을 생성하지 못했어요</div>
        )}
      </PipelineStageCard>

      {/* ── VOCA 모듈 ── */}
      <div className="flex items-center gap-2 text-[10px] font-bold text-violet-600 uppercase tracking-widest px-1 mt-1">
        <div className="flex items-center justify-center w-5 h-5 rounded bg-violet-600 text-white text-[9px] font-black">VC</div>
        VOCA 모듈 — Voice-Output Composition Architecture
      </div>

      <PipelineStageCard n={5} title="처방 정보 구조화" sub="extractRxInfo · ocr-to-macro" accentColor="violet">
        {rxInfo ? (
          <div className="text-[11px] text-violet-900 bg-violet-50 rounded p-2 font-mono leading-relaxed">
            <div>약품명: {rxInfo.drugName}</div>
            <div>복용: {rxInfo.frequency}회/일 · {rxInfo.durationDays ?? '-'}일</div>
            <div>시간대: {rxInfo.timings.join(', ') || '-'}</div>
            <div>보관: {rxInfo.storageType ?? '-'}</div>
          </div>
        ) : (
          <div className="text-xs text-neutral-400 italic">구조화 정보 없음</div>
        )}
      </PipelineStageCard>

      <PipelineStageCard n={6} title="TTS 스크립트 합성" sub="composePrescriptionTts · Web Speech API" accentColor="violet">
        {rxInfo ? (
          <div className="text-[12px] text-violet-900 bg-violet-50 rounded p-2 leading-relaxed">
            &ldquo;{composePrescriptionTts(rxInfo)}&rdquo;
          </div>
        ) : (
          <div className="text-xs text-neutral-400 italic">스크립트 없음</div>
        )}
      </PipelineStageCard>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 공통 섹션 카드 컨테이너
// ──────────────────────────────────────────────────────────────────────────────
type AccentColor = 'green' | 'blue' | 'amber' | 'sky' | 'neutral';

const ACCENT: Record<AccentColor, { border: string; header: string; dot: string }> = {
  green:   { border: 'border-green-200',  header: 'bg-green-50  text-green-800',  dot: 'bg-green-500'  },
  blue:    { border: 'border-blue-200',   header: 'bg-blue-50   text-blue-800',   dot: 'bg-blue-500'   },
  amber:   { border: 'border-amber-200',  header: 'bg-amber-50  text-amber-800',  dot: 'bg-amber-500'  },
  sky:     { border: 'border-sky-200',    header: 'bg-sky-50    text-sky-800',    dot: 'bg-sky-500'    },
  neutral: { border: 'border-neutral-200',header: 'bg-neutral-50 text-neutral-700',dot: 'bg-neutral-400'},
};

function SectionCard({
  emoji,
  title,
  accent,
  children,
}: {
  emoji: string;
  title: string;
  accent: AccentColor;
  children: React.ReactNode;
}) {
  const a = ACCENT[accent];
  return (
    <div className={`rounded-2xl border ${a.border} bg-white overflow-hidden`}>
      <div className={`flex items-center gap-2 px-4 py-2.5 ${a.header}`}>
        <span className="text-base">{emoji}</span>
        <span className="font-bold text-sm">{title}</span>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 파이프라인 단계 컨테이너
// ──────────────────────────────────────────────────────────────────────────────
const PIPELINE_ACCENT = {
  neutral: { border: 'border-neutral-200', dot: 'bg-neutral-500', header: 'bg-neutral-50' },
  emerald: { border: 'border-emerald-200', dot: 'bg-emerald-600', header: 'bg-emerald-50' },
  violet:  { border: 'border-violet-200',  dot: 'bg-violet-600',  header: 'bg-violet-50'  },
};

function PipelineStageCard({
  n, title, sub, accentColor, children,
}: {
  n: number;
  title: string;
  sub: string;
  accentColor: keyof typeof PIPELINE_ACCENT;
  children: React.ReactNode;
}) {
  const a = PIPELINE_ACCENT[accentColor];
  return (
    <div className={`rounded-xl border ${a.border} bg-white`}>
      <div className={`flex items-center gap-2 px-3 py-2 border-b ${a.border} ${a.header}`}>
        <span className={`flex items-center justify-center w-6 h-6 rounded-full ${a.dot} text-white text-xs font-bold`}>
          {n}
        </span>
        <div className="flex-1">
          <div className="text-sm font-bold text-neutral-800">{title}</div>
          <div className="text-[10px] text-neutral-500">{sub}</div>
        </div>
      </div>
      <div className="p-2">{children}</div>
    </div>
  );
}
