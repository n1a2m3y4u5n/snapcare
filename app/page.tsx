'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/stores/session';
import { useSessionHydrated } from '@/lib/hooks';

/** 진입 게이트 — 저장된 세션이 복원된 뒤 온보딩/로그인/홈으로 보낸다. */
export default function Index() {
  const router = useRouter();
  const { onboarded, authed } = useSession();
  const hydrated = useSessionHydrated();

  useEffect(() => {
    if (!hydrated) return;
    if (!onboarded) router.replace('/onboarding');
    else if (!authed) router.replace('/login');
    else router.replace('/home');
  }, [hydrated, onboarded, authed, router]);

  return <div className="min-h-screen" style={{ background: 'var(--color-sc-bg)' }} />;
}
