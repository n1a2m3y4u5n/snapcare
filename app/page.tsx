'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/stores/session';
import { useSessionHydrated } from '@/lib/hooks';

/**
 * 진입 게이트 — 저장된 세션이 복원된 뒤 온보딩/로그인/홈으로 보낸다.
 *
 * 사람을 바꾸면 여기로 돌아온다 (lib/snapcare/accounts.ts 의 switchTo). 세션도 사람마다
 * 따로라, 새로 더해진 사람은 안내부터 보고 쓰던 사람은 자기 픽처키 화면으로 간다.
 */
export default function Index() {
  const router = useRouter();
  const { sizePicked, authed } = useSession();
  const hydrated = useSessionHydrated();

  useEffect(() => {
    if (!hydrated) return;
    /*
      앱을 처음 켜면 글자 크기부터 묻는다. 그다음은 바로 쓰는 화면이다.

      전에는 그 사이에 안내 다섯 장이 있었다. 없앤 이유: 다섯 중 넷은 화면 자체가
      이미 말한다 — 카메라는 홈 한가운데 큰 원이고, 판정 색은 판정 화면이 색으로
      보여주고, "당신 기준으로 본다" 는 Who 위성과 배지가 말하고, 알람은 처방을
      찍으면 그 자리에서 만들자고 묻는다. **설명이 필요 없게 만든 것을 다시 설명하는
      것은 그 만듦을 못 믿는다는 뜻이다.**

      남은 하나(꾹 눌러 듣는 손짓)는 화면 어디에도 안 나타나므로 없앨 수 없었다.
      대신 쓰는 자리로 옮겼다 — 판정 화면에 처음 도착했을 때 한 번
      (components/sc/HoldToHear.tsx).
    */
    if (!sizePicked) router.replace('/text-size');
    else if (!authed) router.replace('/login');
    else router.replace('/home');
  }, [hydrated, sizePicked, authed, router]);

  return <div className="min-h-screen" style={{ background: 'var(--color-sc-bg)' }} />;
}
