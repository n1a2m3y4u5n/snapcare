'use client';

import { useRef, useState, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useFamily } from '@/stores/family';
import { useAnalysis } from '@/stores/analysis';
import { getItem } from '@/lib/snapcare/catalog';
import { ocrToScanItem } from '@/lib/snapcare/fromOcr';
import { looksLikeNutritionLabel, looksLikePrescription, parseNutritionLabel } from '@/lib/nutrition/labelOcr';
import { recognizeText } from '@/lib/ocr';
import { Hint } from '@/components/sc/Hint';
import type { ScanItem } from '@/lib/snapcare/types';
import type { NutrientProfile } from '@/lib/nutrition/types';

const DEMO_IDS = ['energy_drink', 'granola_bar', 'amoxicillin', 'ibuprofen'];
const SAMPLE_RX = [
  { src: '/prescription-antibiotic.png', label: 'Antibiotic Rx' },
  { src: '/prescription-eyedrop.png', label: 'Eye drops Rx' },
  // 상호작용 엔진을 건드리는 유일한 샘플 — 혈액희석제를 쓰는 구성원에게 회피가 뜬다
  { src: '/prescription-painkiller.png', label: 'Painkiller Rx' },
  { src: '/prescription-syrup.png', label: 'Syrup Rx' },
];const SAMPLE_LABELS = [
  { src: '/label-eu-biscuit.png', label: 'Biscuit label' },
  { src: '/label-kr-snack.png', label: 'Korean snack label' },
  { src: '/label-us-cereal.png', label: 'Cereal label' },
];

export default function CameraPage() {
  const router = useRouter();
  const { members, activeMemberId, setActiveMember } = useFamily();
  const setCurrent = useAnalysis((s) => s.setCurrent);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  /**
   * 대안 경로(샘플 처방전·데모 아이템)는 처음엔 감춰둔다.
   * 사진 찍기가 한 번의 동작으로 끝나야 습관이 되는데, 선택지를 먼저 보여주면
   * 무엇을 눌러야 할지 고르는 일부터 시작된다. 인식이 실패했을 때만 펼친다.
   */
  const [showOptions, setShowOptions] = useState(false);

  function fail(message: string) {
    setHint(message);
    setShowOptions(true);
  }

  function goWith(item: ScanItem) {
    setCurrent(item);
    router.push('/scan');
  }

  function scanDemo(itemId: string) {
    const item = getItem(itemId);
    if (item) goWith(item);
  }

  /** 실제 OCR (Tesseract, 오프라인) → 구조화 처방 */
  async function runOcr(image: string | File | Blob) {
    setBusy(true);
    setHint(null);
    setStatus('Reading text… 0%');
    try {
      const text = await recognizeText(image, (p) => setStatus(`Reading text… ${Math.round(p * 100)}%`));
      if (!text || text.trim().length < 4) {
        // 글자가 없는 사진(음식 그 자체) → 사진 판별
        await tryVision(image);
        return;
      }

      // 영양성분표라면 표를 읽어 그대로 계산 엔진에 넣는다.
      // 제품 DB도 인터넷도 필요 없는 경로 — 대상 지역 로컬 식품에서 유일하게 작동한다.
      if (looksLikeNutritionLabel(text)) {
        const parsed = parseNutritionLabel(text);

        // 오프라인으로 전 항목을 검증까지 통과했으면 그대로 쓴다 — 네트워크를 타지 않는다.
        if (parsed.profile && parsed.rejected.length === 0) {
          goWith(labelItem(parsed.profile, parsed.servingGrams));
          return;
        }

        // 일부를 못 읽었다면 인터넷이 있을 때만 판별로 보강한다.
        // 실측상 표 읽기는 Vision이 Tesseract보다 정확했다 (같은 라벨에서 8/8 대 부분성공).
        setStatus('Checking the label…');
        if (await tryVision(image)) return;

        // 보강도 실패 — 부분적으로라도 읽힌 게 있으면 그것만이라도 쓴다.
        if (parsed.profile) {
          goWith(labelItem(parsed.profile, parsed.servingGrams));
          return;
        }
        fail('Could not read the table reliably. Hold steady and fill the frame with the label.');
        return;
      }

      // 처방전도 명시적 신호가 있을 때만 그 경로로 보낸다.
      // 글자가 읽혔다는 이유만으로 처방전 취급하면 음식 사진이 처방전이 된다.
      if (looksLikePrescription(text)) {
        const { item } = ocrToScanItem(text);
        goWith(item);
        return;
      }

      // 글자는 있지만 성분표도 처방전도 아니다 → 음식 사진으로 보고 판별에 맡긴다
      await tryVision(image);
      return;
    } catch {
      fail('Could not read that. Try again, or pick one below.');
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  /** 사진 판별 (Vision). 성공하면 결과 화면으로 넘어가고 true를 돌려준다. */
  async function tryVision(image: string | File | Blob): Promise<boolean> {
    const dataUrl = typeof image === 'string' ? image : await toDataUrl(image);
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image: dataUrl }),
    });
    if (res.status === 501) {
      fail('Photo recognition needs a connection. Photograph the nutrition label instead, or pick one below.');
      return false;
    }
    if (!res.ok) {
      fail('Could not recognise that. Try again, or pick one below.');
      return false;
    }
    const { item } = (await res.json()) as { item: ScanItem };
    goWith(item);
    return true;
  }

  /** 성분표에서 읽어낸 프로필을 스캔 아이템으로. */
  function labelItem(profile: NutrientProfile, servingGrams?: number): ScanItem {
    return {
      // 라벨 내용에서 결정론적으로 만든 id (같은 라벨은 같은 id)
      id: `label_${Math.round(profile.per100.energy ?? 0)}_${servingGrams ?? 100}`,
      name: profile.name,
      kind: 'food',
      emoji: '🥫',
      detectedVia: 'nutrition label',
      flags: [],
      profile,
    };
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) runOcr(file);
  }

  async function scanSample(src: string) {
    setBusy(true);
    setStatus('Loading sample…');
    try {
      const blob = await (await fetch(src)).blob();
      await runOcr(blob);
    } catch {
      fail('Sample could not be loaded.');
      setBusy(false);
      setStatus(null);
    }
  }

  return (
    <div className="min-h-screen w-full flex justify-center bg-black">
      <div className="relative w-full max-w-[440px] min-h-screen flex flex-col text-white">
        <div className="flex items-center justify-between px-5 pt-14 pb-3">
          <button onClick={() => router.push('/home')} aria-label="Close" className="text-2xl leading-none">×</button>
          <span className="text-sm font-semibold">Point at something</span>
          <span className="w-6" />
        </div>

        {/* FOR 가족 선택 */}
        <div className="flex items-center gap-2 px-5 pb-2">
          <span className="text-xs opacity-70">FOR</span>
          {members.map((m) => {
            const on = m.id === activeMemberId;
            return (
              <button
                key={m.id}
                onClick={() => setActiveMember(m.id)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold"
                style={{ background: on ? m.color : 'rgba(255,255,255,0.15)', color: '#fff', outline: on ? '2px solid #fff' : 'none', outlineOffset: 1 }}
                aria-label={`For ${m.name}`}
              >
                {m.emoji}
              </button>
            );
          })}
        </div>

        {/* 프리뷰 */}
        <div className="relative flex-1 mx-5 my-3 rounded-3xl overflow-hidden min-h-[180px]" style={{ background: '#1b1b1e' }}>
          <div className="absolute inset-6 rounded-2xl" style={{ border: '2px solid rgba(255,255,255,0.35)' }} />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-8">
            <span className="text-5xl">📷</span>
            <span className="text-xs opacity-70">{busy ? (status ?? 'Analyzing…') : 'camera preview'}</span>
            {hint && <Hint text={hint} />}
          </div>
        </div>

        {/* 캡처 */}
        <div className="flex justify-center pb-2">
          <button onClick={() => fileRef.current?.click()} disabled={busy} className="h-16 w-16 rounded-full bg-white/90 active:scale-95 transition-transform disabled:opacity-50" aria-label="Capture" />
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
        </div>

        {/*
          인식이 실패하기 전까지는 대안 경로를 감춘다 — 주된 동작은 셔터 하나뿐이다.
          완전히 막아두면 카메라를 못 쓰는 상황에서 갇히므로, 눈에 띄지 않는 링크로만 열어둔다.
        */}
        {!showOptions ? (
          <div className="px-5 pb-8 pt-3 text-center">
            <button
              onClick={() => setShowOptions(true)}
              className="text-xs underline underline-offset-4 opacity-60"
            >
              Can&apos;t take a photo?
            </button>
          </div>
        ) : (
          <>
            <div className="px-5 pt-1">
              <p className="text-[11px] font-bold tracking-wide opacity-60">SCAN A NUTRITION LABEL (OCR)</p>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {SAMPLE_LABELS.map((s) => (
                  <button key={s.src} onClick={() => scanSample(s.src)} disabled={busy} className="shrink-0 rounded-2xl px-3 py-2 text-xs font-semibold disabled:opacity-40" style={{ background: 'rgba(255,255,255,0.12)' }}>
                    🥫 {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-5 pt-3">
              <p className="text-[11px] font-bold tracking-wide opacity-60">SCAN A REAL PRESCRIPTION (OCR)</p>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {SAMPLE_RX.map((s) => (
                  <button key={s.src} onClick={() => scanSample(s.src)} disabled={busy} className="shrink-0 rounded-2xl px-3 py-2 text-xs font-semibold disabled:opacity-40" style={{ background: 'rgba(255,255,255,0.12)' }}>
                    📄 {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-5 pb-8 pt-3">
              <p className="text-[11px] font-bold tracking-wide opacity-60">TRY A DEMO ITEM</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {DEMO_IDS.map((id) => {
                  const it = getItem(id)!;
                  return (
                    <button key={id} onClick={() => scanDemo(id)} disabled={busy} className="flex items-center gap-2 rounded-2xl px-3 py-3 text-left disabled:opacity-40" style={{ background: 'rgba(255,255,255,0.1)' }}>
                      <span className="text-lg">{it.emoji}</span>
                      <span className="text-xs font-semibold">{it.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function toDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
