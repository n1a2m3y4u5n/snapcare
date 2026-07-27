'use client';

import { sayable } from '@/components/sc/Say';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { MobileScreen } from '@/components/sc/MobileScreen';
import { useScans } from '@/stores/scans';
import { useProfile } from '@/stores/profile';
import { useIsClient } from '@/lib/hooks';

/** 의료진 공유 — 스캔 기록을 담은 일회용 QR (15분 만료). */
export default function ProviderPage() {
  const router = useRouter();
  const scans = useScans((s) => s.scans);
  const profile = useProfile((s) => s.profile);
  const isClient = useIsClient();
  const [left, setLeft] = useState(15 * 60);

  // 일회용 토큰은 화면 진입 시 딱 한 번 발급한다.
  // 렌더 중에 만들면 (a) SSR 결과와 달라 하이드레이션이 깨지고 (b) 리렌더마다 QR이 바뀐다.
  // 그래서 발급은 이펙트에서 하고, 그동안 payload 는 null(스켈레톤)로 둔다.
  const [token, setToken] = useState<{ token: string; issuedAt: string } | null>(null);
  useEffect(() => {
    // 난수·시계는 순수 렌더에서 읽을 수 없는 외부 소스라, 발급은 이펙트에서 1회만 한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken({
      token: Math.random().toString(36).slice(2, 10),
      issuedAt: new Date().toISOString(),
    });
    const t = setInterval(() => setLeft((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const payload = useMemo(() => {
    if (!isClient || !token) return null;
    return JSON.stringify({
      ...token,
      records: scans.slice(0, 12).map((s) => ({
        item: s.name,
        for: profile.name,
        level: s.level,
        at: s.timeLabel,
      })),
    });
  }, [isClient, token, scans, profile]);

  const mm = Math.floor(left / 60);
  const ss = (left % 60).toString().padStart(2, '0');

  return (
    <MobileScreen>
      <div className="flex flex-col items-center px-6 pt-14 text-center">
        <button onClick={() => router.push('/settings')} className="self-start text-sm font-semibold" style={{ color: 'var(--color-sc-primary)' }}>‹ Settings</button>
        {/*
          이 화면은 낭독 대상이 하나도 없었다. 여기까지 온 사람은 진료실에 서 있고,
          무엇을 보여주는 화면인지 알아야 상대에게 내밀 수 있다.
        */}
        <h1 className="mt-3 text-xl font-bold" style={{ color: 'var(--color-sc-ink)' }}
            {...sayable('Show this to your provider. It holds what you have taken and what you have checked. The code expires by itself.')}>
          Show this to your provider
        </h1>
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
