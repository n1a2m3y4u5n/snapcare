'use client';

import { useRef, useState, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useFamily } from '@/stores/family';
import { useAnalysis } from '@/stores/analysis';
import { getItem } from '@/lib/snapcare/catalog';
import { ocrToScanItem } from '@/lib/snapcare/fromOcr';
import { recognizeText } from '@/lib/ocr';
import type { ScanItem } from '@/lib/snapcare/types';

const DEMO_IDS = ['energy_drink', 'granola_bar', 'amoxicillin', 'ibuprofen'];
const SAMPLE_RX = [
  { src: '/sample-prescription.png', label: 'Antibiotic Rx' },
  { src: '/prescription-eyedrop.png', label: 'Eye drops Rx' },
  { src: '/prescription-syrup.png', label: 'Syrup Rx' },
];

export default function CameraPage() {
  const router = useRouter();
  const { members, activeMemberId, setActiveMember } = useFamily();
  const setCurrent = useAnalysis((s) => s.setCurrent);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

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
        // 텍스트가 없으면(음식 사진 등) Vision 폴백
        return tryVision(image);
      }
      const { item } = ocrToScanItem(text);
      goWith(item);
    } catch {
      setHint('스캔 실패 — 데모 아이템을 눌러 시연하세요.');
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  /** 텍스트가 없는 사진(식사 등)은 Vision으로 (키 있을 때만) */
  async function tryVision(image: string | File | Blob) {
    const dataUrl = typeof image === 'string' ? image : await toDataUrl(image);
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image: dataUrl }),
    });
    if (res.status === 501) {
      setHint('텍스트가 안 읽혀요. 식사 사진 판별은 Vision(API 키) 필요 — 데모 아이템으로 시연하세요.');
      return;
    }
    if (!res.ok) {
      setHint('인식 실패 — 데모 아이템을 눌러 시연하세요.');
      return;
    }
    const { item } = (await res.json()) as { item: ScanItem };
    goWith(item);
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
      setHint('샘플 로드 실패');
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
                {m.name[0]}
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
            {hint && <span className="text-xs" style={{ color: '#FBBF24' }}>{hint}</span>}
          </div>
        </div>

        {/* 캡처 */}
        <div className="flex justify-center pb-2">
          <button onClick={() => fileRef.current?.click()} disabled={busy} className="h-16 w-16 rounded-full bg-white/90 active:scale-95 transition-transform disabled:opacity-50" aria-label="Capture" />
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
        </div>

        {/* 실제 OCR — 샘플 처방전 */}
        <div className="px-5 pt-1">
          <p className="text-[11px] font-bold tracking-wide opacity-60">SCAN A REAL PRESCRIPTION (OCR)</p>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {SAMPLE_RX.map((s) => (
              <button key={s.src} onClick={() => scanSample(s.src)} disabled={busy} className="shrink-0 rounded-2xl px-3 py-2 text-xs font-semibold disabled:opacity-40" style={{ background: 'rgba(255,255,255,0.12)' }}>
                📄 {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* 데모 아이템 */}
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
