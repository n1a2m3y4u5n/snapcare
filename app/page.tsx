'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/stores/session';

export default function Index() {
  const router = useRouter();
  const { onboarded, authed } = useSession();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    if (!onboarded) router.replace('/onboarding');
    else if (!authed) router.replace('/login');
    else router.replace('/home');
  }, [mounted, onboarded, authed, router]);

  return <div className="min-h-screen" style={{ background: 'var(--color-sc-bg)' }} />;
}
