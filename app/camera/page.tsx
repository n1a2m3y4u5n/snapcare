'use client';

import { useRef, useState, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useFamily } from '@/stores/family';
import { useAnalysis } from '@/stores/analysis';
import { getItem } from '@/lib/snapcare/catalog';
import type { ScanItem } from '@/lib/snapcare/types';

const DEMO_IDS = ['energy_drink', 'granola_bar', 'amoxicillin', 'ibuprofen'];

export default function CameraPage() {
  const router = useRouter();
  const { members, activeMemberId, setActiveMember } = useFamily();
  const setCurrent = useAnalysis((s) => s.setCurrent);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  function scanDemo(itemId: string) {
    const item = getItem(itemId);
    if (!item) return;
    setCurrent(item);
    router.push('/scan');
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setHint(null);
    try {
      const image = await toDataUrl(file);
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image }),
      });
      if (res.status === 501) {
        setHint('Photo AI가 아직 설정 안 됨 — 아래 데모 아이템을 눌러 시연하세요.');
        return;
      }
      if (!res.ok) {
        setHint('인식 실패. 데모 아이템으로 시연하세요.');
        return;
      }
      const { item } = (await res.json()) as { item: ScanItem };
      setCurrent(item);
      router.push('/scan');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex justify-center bg-black">
      <div className="relative w-full max-w-[440px] min-h-screen flex flex-col text-white">
        {/* 상단 바 */}
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
                style={{
                  background: on ? m.color : 'rgba(255,255,255,0.15)',
                  color: '#fff',
                  outline: on ? '2px solid #fff' : 'none',
                  outlineOffset: 1,
                }}
                aria-label={`For ${m.name}`}
              >
                {m.name[0]}
              </button>
            );
          })}
        </div>

        {/* 프리뷰 영역 */}
        <div className="relative flex-1 mx-5 my-3 rounded-3xl overflow-hidden" style={{ background: '#1b1b1e' }}>
          <div className="absolute inset-6 rounded-2xl" style={{ border: '2px solid rgba(255,255,255,0.35)' }} />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-8">
            <span className="text-5xl">📷</span>
            <span className="text-xs opacity-60">
              {busy ? 'Analyzing…' : 'camera preview'}
            </span>
            {hint && <span className="text-xs" style={{ color: '#FBBF24' }}>{hint}</span>}
          </div>
        </div>

        {/* 캡처 버튼 */}
        <div className="flex justify-center pb-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="h-16 w-16 rounded-full bg-white/90 active:scale-95 transition-transform disabled:opacity-50"
            aria-label="Capture"
          />
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
        </div>

        {/* 데모 아이템 */}
        <div className="px-5 pb-8">
          <p className="text-[11px] font-bold tracking-wide opacity-60">TRY A DEMO ITEM</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {DEMO_IDS.map((id) => {
              const it = getItem(id)!;
              return (
                <button
                  key={id}
                  onClick={() => scanDemo(id)}
                  className="flex items-center gap-2 rounded-2xl px-3 py-3 text-left"
                  style={{ background: 'rgba(255,255,255,0.1)' }}
                >
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

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
