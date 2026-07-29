'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/stores/session';
import { useSessionHydrated } from '@/lib/hooks';
import { isDemo } from '@/lib/snapcare/demo';
import { activeAccountId, PRIMARY_ID } from '@/lib/snapcare/accounts';

/**
 * 진입 게이트 — 저장된 세션이 복원된 뒤 온보딩/로그인/홈으로 보낸다.
 *
 * 사람을 바꾸면 여기로 돌아온다 (lib/snapcare/accounts.ts 의 switchTo). 세션도 사람마다
 * 따로라, 새로 더해진 사람은 안내부터 보고 쓰던 사람은 자기 픽처키 화면으로 간다.
 */
export default function Index() {
  const router = useRouter();
  const { onboarded, authed, setOnboarded } = useSession();
  const hydrated = useSessionHydrated();

  useEffect(() => {
    if (!hydrated) return;
    // 시연 모드의 두 번째 사람은 안내를 건너뛴다.
    //
    // 실제로는 안내를 다시 보는 것이 맞다 — 더해진 사람에게 이 앱은 처음이다. 하지만
    // 심사에서 얼굴을 바꿔 보일 때마다 슬라이드 다섯 장을 다시 넘기게 되면, 정작
    // 보여주려던 것(같은 것을 찍어도 판정이 다르다)에 닿기 전에 시간을 쓴다.
    // 첫 사람은 그대로 안내를 본다 — 첫 실행 흐름 자체도 보여줄 것이기 때문이다.
    if (isDemo() && activeAccountId() !== PRIMARY_ID && !onboarded) {
      setOnboarded(true);
      return;
    }
    if (!onboarded) router.replace('/onboarding');
    else if (!authed) router.replace('/login');
    else router.replace('/home');
  }, [hydrated, onboarded, authed, router, setOnboarded]);

  return <div className="min-h-screen" style={{ background: 'var(--color-sc-bg)' }} />;
}
