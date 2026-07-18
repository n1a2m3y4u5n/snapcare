'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { recognizeText } from '@/lib/ocr';
import composer from '@/lib/pictogram';
import { ocrToMacro, extractRxInfo, composePrescriptionTts, type StructuredRxInfo } from '@/lib/ocr-to-macro';
import { speak } from '@/lib/voice';
import { usePreferences } from '@/stores/preferences';

/**
 * 처방전 변환 파이프라인 시각화 화면.
 *
 * SIGIL (Symbol Intuitive Glyph Image Lab)
 *   OCR 텍스트 → DSL 변환 → Python/Pillow PNG 합성
 *
 * VOCA (Voice-Output Composition Architecture)
 *   OCR 텍스트 → 처방 구조화 → TTS 스크립트 합성
 */

type PipelineStage = 'ocr' | 'engines' | 'done' | 'error';

// ──────────────────────────────────────────────────────────────────────────────
// DSL 들여쓰기 포맷터
// ──────────────────────────────────────────────────────────────────────────────
function formatDslLabel(raw: string): string {
  let out   = '';
  let depth = 0;
  for (const ch of raw) {
    if (ch === '{') {
      out += ' {\n' + '  '.repeat(depth + 1);
      depth++;
    } else if (ch === '}') {
      depth--;
      out += '\n' + '  '.repeat(depth) + '}';
    } else {
      out += ch;
    }
  }
  return out;
}

function parseDslStats(source: string) {
  const labels    = source.split('\n').filter(l => l.trim().length > 0);
  const morphemes = (source.match(/\\\w+/g) ?? []).length;
  const operators = labels.filter(l => /\\(no|twice_daily|three_times_daily|four_times_daily|half)\b/.test(l)).length;
  return { labelCount: labels.length, morphemes, operators };
}

const TIMING_LABEL: Record<string, string> = {
  morning: '아침', noon: '점심', evening: '저녁', night: '취침 전',
};

// ──────────────────────────────────────────────────────────────────────────────
// 메인 컴포넌트
// ──────────────────────────────────────────────────────────────────────────────
export default function ProcessingPage() {
  const router                = useRouter();
  const { autoTts, language } = usePreferences();

  const [stage, setStage]               = useState<PipelineStage>('ocr');
  const [ocrProgress, setOcrProgress]   = useState(0);
  const [ocrText, setOcrText]           = useState('');

  // SIGIL
  const [sigilDsl, setSigilDsl]         = useState('');
  const [sigilImages, setSigilImages]   = useState<string[]>([]);
  const [sigilDone, setSigilDone]       = useState(false);

  // VOCA
  const [rxInfo, setRxInfo]             = useState<StructuredRxInfo | null>(null);
  const [vocaScript, setVocaScript]     = useState('');
  const [vocaDone, setVocaDone]         = useState(false);

  const [errorMsg, setErrorMsg]         = useState('');

  useEffect(() => { run(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function run() {
    try {
      const imageData = sessionStorage.getItem('capturedImage');
      const docMode   = sessionStorage.getItem('docMode') ?? 'prescription';
      if (!imageData) { router.push('/camera'); return; }

      // ── 1. OCR ──────────────────────────────────────────────────────────
      if (autoTts) speak('처방전을 읽고 있어요.', 'ko-KR');
      setStage('ocr');
      const text = await recognizeText(imageData, p => setOcrProgress(Math.round(p * 100)));
      setOcrText(text);

      // ── 2. 두 엔진 병렬 시작 ────────────────────────────────────────────
      setStage('engines');
      if (autoTts) speak('두 엔진이 처리 중이에요.', 'ko-KR');

      // SIGIL DSL (동기)
      const source = ocrToMacro(text);
      setSigilDsl(source);

      // VOCA 구조화 + 스크립트 (동기)
      const info   = extractRxInfo(text);
      const script = composePrescriptionTts(info);
      setRxInfo(info);
      setVocaScript(script);
      setVocaDone(true);

      await new Promise(r => setTimeout(r, 400));

      // SIGIL PNG (비동기 · Python/Pillow)
      const result = await composer.compose({
        text, lang: language === 'ko' ? 'ko' : 'en',
        docType: docMode as 'prescription' | 'device_manual',
      });
      setSigilImages(result.images);
      setSigilDone(true);

      sessionStorage.setItem('ocrText', text);
      sessionStorage.setItem('pictogramResult', JSON.stringify(result));

      setStage('done');
      if (autoTts) speak('완성됐어요! 결과 보기 버튼을 눌러주세요.', 'ko-KR');
    } catch (err) {
      console.error(err);
      setStage('error');
      setErrorMsg('처리 중 오류가 발생했어요.');
      if (autoTts) speak('사진을 한 번 더 찍어주세요.', 'ko-KR');
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-neutral-50 px-4 py-5 gap-3">

      {/* ── 헤더 ──────────────────────────────────────────────────────────── */}
      <div className="text-center">
        <h1 className="text-lg font-bold text-neutral-800">처방전 변환 중</h1>
        <p className="text-[11px] text-neutral-400 font-mono mt-0.5">OCR → SIGIL · VOCA</p>
      </div>

      {/* ── OCR 카드 ──────────────────────────────────────────────────────── */}
      <OcrCard state={stage === 'ocr' ? 'active' : 'done'} progress={ocrProgress} text={ocrText} />

      {/* ── 엔진 분기 ─────────────────────────────────────────────────────── */}
      {stage !== 'ocr' && (
        <>
          <EngineDivider />
          <SigilCard dsl={sigilDsl} images={sigilImages} isDone={sigilDone} isPngPending={!sigilDone} />
          {rxInfo && <VocaCard rxInfo={rxInfo} script={vocaScript} isDone={vocaDone} />}
        </>
      )}

      {/* ── 완료 — 결과 보기 버튼 ────────────────────────────────────────── */}
      {stage === 'done' && (
        <div className="flex flex-col items-center gap-2 pt-1 pb-2">
          <p className="text-xs text-emerald-600 font-bold">✓ 두 엔진 처리 완료</p>
          <button
            onClick={() => router.push('/prescription-review')}
            className="w-full rounded-2xl bg-emerald-600 text-white text-base font-bold py-4 shadow-lg active:scale-95 transition-transform"
          >
            결과 보기 →
          </button>
        </div>
      )}

      {/* ── 에러 ──────────────────────────────────────────────────────────── */}
      {stage === 'error' && (
        <div className="flex flex-col items-center gap-3 border-t border-neutral-100 pt-4">
          <p className="text-red-600 text-sm text-center">{errorMsg}</p>
          <button onClick={() => router.push('/camera')} className="px-8 py-3 rounded-2xl bg-blue-600 text-white font-bold active:scale-95">
            다시 찍기
          </button>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// OCR 카드
// ──────────────────────────────────────────────────────────────────────────────
function OcrCard({ state, progress, text }: { state: 'active' | 'done'; progress: number; text: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-neutral-50 border-b border-neutral-200">
        <StatusDot state={state} color="blue" />
        <div className="flex-1">
          <span className="text-sm font-bold text-neutral-800">OCR 텍스트 추출</span>
          <span className="text-[10px] text-neutral-400 ml-2">Tesseract.js · kor + eng</span>
        </div>
        {state === 'active' && <span className="text-xs font-bold text-blue-600">{progress}%</span>}
        {state === 'done'   && <span className="text-xs font-bold text-emerald-600">완료</span>}
      </div>

      {state === 'active' && (
        <div className="px-4 pt-2 pb-1">
          <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {text && (
        <div className="px-4 py-2">
          <pre className="text-[11px] font-mono leading-relaxed text-neutral-600 whitespace-pre-wrap break-words bg-neutral-50 rounded-lg p-2.5 max-h-28 overflow-y-auto border border-neutral-100">
            {text.trim()}
          </pre>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 분기 구분선
// ──────────────────────────────────────────────────────────────────────────────
function EngineDivider() {
  return (
    <div className="flex items-center gap-2 text-[11px] text-neutral-400 font-mono">
      <div className="flex-1 h-px bg-neutral-200" />
      <span>OCR 완료 — 두 엔진 병렬 처리</span>
      <div className="flex-1 h-px bg-neutral-200" />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// SIGIL 엔진 카드
// ──────────────────────────────────────────────────────────────────────────────
function SigilCard({ dsl, images, isDone, isPngPending }: {
  dsl: string;
  images: string[];
  isDone: boolean;
  isPngPending: boolean;
}) {
  const labels      = dsl.split('\n').filter(l => l.trim().length > 0);
  const stats       = parseDslStats(dsl);
  const formatted   = labels.map(l => formatDslLabel(l));

  return (
    <div className="rounded-2xl border border-emerald-200 bg-white overflow-hidden shadow-sm">
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600">
        <span className="text-white text-[11px] font-black tracking-widest">SIGIL</span>
        <span className="text-emerald-200 text-[10px]">Symbol Intuitive Glyph Image Lab</span>
        <StatusDot state={isDone ? 'done' : 'active'} color="white" className="ml-auto" />
      </div>

      <div className="flex flex-col divide-y divide-emerald-50">

        {/* Step 1: DSL 변환 */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold flex items-center justify-center">1</span>
            <span className="text-xs font-bold text-emerald-800">DSL 변환</span>
            <span className="text-[10px] text-emerald-500 ml-1">ocr-to-macro</span>
            <span className="ml-auto text-[10px] text-emerald-600 font-bold">✓ 완료</span>
          </div>

          {/* 포맷된 DSL 라벨 */}
          <div className="flex flex-col gap-2">
            {formatted.map((f, i) => (
              <div key={i} className="rounded-lg bg-emerald-950 overflow-hidden">
                <div className="px-2.5 py-1 bg-emerald-800 flex items-center gap-1.5">
                  <span className="text-emerald-300 text-[9px] font-bold uppercase tracking-widest">Label {i + 1}</span>
                </div>
                <pre className="text-[12px] font-mono leading-relaxed text-emerald-300 px-3 py-2 whitespace-pre-wrap">
                  {f}
                </pre>
              </div>
            ))}
          </div>

          {/* 형태소 통계 */}
          <div className="flex gap-3 mt-2">
            <Stat label="라벨" value={stats.labelCount} color="emerald" />
            <Stat label="형태소" value={stats.morphemes} color="emerald" />
            <Stat label="연산자" value={stats.operators} color="emerald" />
          </div>
        </div>

        {/* Step 2: PNG 합성 */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold flex items-center justify-center">2</span>
            <span className="text-xs font-bold text-emerald-800">PNG 합성</span>
            <span className="text-[10px] text-emerald-500 ml-1">Python · Pillow</span>
            {isDone
              ? <span className="ml-auto text-[10px] text-emerald-600 font-bold">✓ 완료</span>
              : <span className="ml-auto text-[10px] text-blue-500 font-bold animate-pulse">렌더링 중…</span>
            }
          </div>

          {/* PNG 로딩 / 결과 */}
          {isPngPending && !isDone && (
            <div className="flex items-center justify-center gap-2 py-4 rounded-lg bg-emerald-50 border border-emerald-100">
              <span className="text-lg animate-spin inline-block">⟳</span>
              <span className="text-xs text-emerald-600">Python 엔진 합성 중…</span>
            </div>
          )}
          {isDone && images.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {images.map((src, i) => (
                <div key={i} className="shrink-0 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center p-2" style={{ minWidth: 90 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`픽토그램 ${i + 1}`} className="max-h-24 w-auto" />
                </div>
              ))}
            </div>
          )}
          {isDone && images.length === 0 && (
            <div className="text-xs text-neutral-400 italic text-center py-3">픽토그램을 생성하지 못했어요</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// VOCA 모듈 카드
// ──────────────────────────────────────────────────────────────────────────────
function VocaCard({ rxInfo, script, isDone }: {
  rxInfo: StructuredRxInfo;
  script: string;
  isDone: boolean;
}) {
  const fields: { icon: string; label: string; value: string }[] = [
    { icon: rxInfo.drugEmoji, label: '약품명',   value: rxInfo.drugName },
    { icon: '🔄',             label: '복용횟수', value: `하루 ${rxInfo.frequency}회` },
    ...(rxInfo.timings.length > 0 ? [{
      icon: '⏰', label: '시간대',
      value: rxInfo.timings.map(t => TIMING_LABEL[t] ?? t).join(' · '),
    }] : []),
    ...(rxInfo.mealContext ? [{
      icon: '🍽️', label: '식사',
      value: `식${rxInfo.mealContext === 'after' ? '후' : '전'}${rxInfo.mealMinutes ? ` ${rxInfo.mealMinutes}분` : ''}`,
    }] : []),
    ...(rxInfo.amountText ? [{ icon: '📏', label: '1회량',   value: rxInfo.amountText }] : []),
    ...(rxInfo.durationDays != null ? [{ icon: '📅', label: '투약기간', value: `${rxInfo.durationDays}일` }] : []),
    ...(rxInfo.storageType ? [{
      icon: rxInfo.storageType === 'refrigerator' ? '❄️' : '🌡️',
      label: '보관',
      value: rxInfo.storageText || (rxInfo.storageType === 'refrigerator' ? '냉장보관' : '실온보관'),
    }] : []),
    ...(rxInfo.contraindications.includes('pregnant')     ? [{ icon: '🚫', label: '금기', value: '임산부 금기' }] : []),
    ...(rxInfo.contraindications.includes('breastfeeding')? [{ icon: '🚫', label: '금기', value: '수유부 주의' }] : []),
    ...(rxInfo.lensRestriction ? [{ icon: '🚫', label: '금지', value: '렌즈 착용 금지' }] : []),
  ];

  // 예상 읽기 시간 (한국어 평균 분당 약 250자)
  const estSec = Math.max(3, Math.round((script.length / 250) * 60));

  return (
    <div className="rounded-2xl border border-violet-200 bg-white overflow-hidden shadow-sm">
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-violet-600">
        <span className="text-white text-[11px] font-black tracking-widest">VOCA</span>
        <span className="text-violet-200 text-[10px]">Voice-Output Composition Architecture</span>
        <StatusDot state={isDone ? 'done' : 'active'} color="white" className="ml-auto" />
      </div>

      <div className="flex flex-col divide-y divide-violet-50">

        {/* Step 1: 처방 정보 구조화 */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="w-4 h-4 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold flex items-center justify-center">1</span>
            <span className="text-xs font-bold text-violet-800">처방 정보 구조화</span>
            <span className="text-[10px] text-violet-500 ml-1">extractRxInfo</span>
            <span className="ml-auto text-[10px] text-violet-600 font-bold">✓ 완료</span>
          </div>

          <div className="rounded-xl overflow-hidden border border-violet-100">
            {fields.map((f, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs ${i % 2 === 0 ? 'bg-violet-50' : 'bg-white'}`}
              >
                <span className="text-base w-5 text-center shrink-0">{f.icon}</span>
                <span className="text-violet-500 font-bold w-14 shrink-0">{f.label}</span>
                <span className="text-violet-900 font-medium">{f.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Step 2: TTS 스크립트 합성 */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="w-4 h-4 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold flex items-center justify-center">2</span>
            <span className="text-xs font-bold text-violet-800">TTS 스크립트 합성</span>
            <span className="text-[10px] text-violet-500 ml-1">composePrescriptionTts</span>
            <span className="ml-auto text-[10px] text-violet-600 font-bold">✓ 완료</span>
          </div>

          <div className="rounded-xl bg-violet-950 px-3 py-2.5">
            <p className="text-[12px] font-mono text-violet-200 leading-relaxed whitespace-pre-wrap break-words">
              &ldquo;{script}&rdquo;
            </p>
          </div>

          <div className="flex gap-3 mt-2">
            <Stat label="글자수" value={script.length} color="violet" />
            <Stat label={`예상 ${estSec}초`} value={'🔊'} color="violet" isText />
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 공통 작은 통계 배지
// ──────────────────────────────────────────────────────────────────────────────
function Stat({ label, value, color, isText }: {
  label: string; value: number | string; color: 'emerald' | 'violet'; isText?: boolean;
}) {
  const bg   = color === 'emerald' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-violet-50 text-violet-700 border-violet-200';
  return (
    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${bg}`}>
      {!isText && <span>{value}</span>}
      <span className="font-normal opacity-70">{label}</span>
      {isText && <span>{value}</span>}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 상태 점
// ──────────────────────────────────────────────────────────────────────────────
function StatusDot({ state, color, className = '' }: {
  state: 'pending' | 'active' | 'done';
  color: 'blue' | 'emerald' | 'violet' | 'white';
  className?: string;
}) {
  const base = 'w-2.5 h-2.5 rounded-full shrink-0';
  const colors = {
    blue:    { active: 'bg-blue-400 animate-pulse',    done: 'bg-blue-400',    pending: 'bg-neutral-200' },
    emerald: { active: 'bg-emerald-400 animate-pulse', done: 'bg-emerald-300', pending: 'bg-neutral-200' },
    violet:  { active: 'bg-violet-400 animate-pulse',  done: 'bg-violet-300',  pending: 'bg-neutral-200' },
    white:   { active: 'bg-white/60 animate-pulse',    done: 'bg-white',       pending: 'bg-white/30'    },
  };
  const c = colors[color];
  return (
    <div className={`${base} ${state === 'active' ? c.active : state === 'done' ? c.done : c.pending} ${className}`} />
  );
}
