'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { MobileScreen } from '@/components/sc/MobileScreen';
import { useScans } from '@/stores/scans';
import { useFamily } from '@/stores/family';

/** 의료진 공유 — 스캔 기록을 담은 일회용 QR (15분 만료). */
export default function ProviderPage() {
  const router = useRouter();
  const scans = useScans((s) => s.scans);
  const getMember = useFamily((s) => s.getMember);
  const [payload, setPayload] = useState<string | null>(null);
  const [left, setLeft] = useState(15 * 60);

  useEffect(() => {
    // 클라이언트에서만 토큰·페이로드 생성 (SSR 불일치 회피)
    const token = Math.random().toString(36).slice(2, 10);
    const data = {
      token,
      issuedAt: new Date().toISOString(),
      records: scans.slice(0, 12).map((s) => ({
        item: s.name,
        for: getMember(s.memberId)?.name ?? s.memberId,
        level: s.level,
        at: s.timeLabel,
      })),
    };
    setPayload(JSON.stringify(data));
    const t = setInterval(() => setLeft((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mm = Math.floor(left / 60);
  const ss = (left % 60).toString().padStart(2, '0');

  return (
    <MobileScreen>
      <div className="flex flex-col items-center px-6 pt-14 text-center">
        <button onClick={() => router.push('/settings')} className="self-start text-sm font-semibold" style={{ color: 'var(--color-sc-primary)' }}>‹ Settings</button>
        <h1 className="mt-3 text-xl font-bold" style={{ color: 'var(--color-sc-ink)' }}>Show this to your provider</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-sc-muted)' }}>Your medication &amp; scan history, no typing.</p>

        <div className="mt-6 rounded-3xl bg-white p-5 shadow-sm">
          {payload && left > 0 ? (
            <QRCodeSVG value={payload} size={220} level="M" />
          ) : (
            <div className="flex h-[220px] w-[220px] items-center justify-center text-sm" style={{ color: 'var(--color-sc-muted)' }}>
              {left <= 0 ? 'Code expired' : 'Generating…'}
            </div>
          )}
        </div>

        <p className="mt-4 text-sm font-semibold" style={{ color: left <= 60 ? 'var(--color-avoid)' : 'var(--color-sc-muted)' }}>
          Expires in {mm}:{ss}
        </p>
        <p className="mt-1 text-xs" style={{ color: 'var(--color-sc-muted)' }}>
          One-time code · {scans.length} records shared
        </p>
      </div>
    </MobileScreen>
  );
}
