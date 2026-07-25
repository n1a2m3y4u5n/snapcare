'use client';

import { useSyncExternalStore } from 'react';
import { useSession } from '@/stores/session';

const noopSubscribe = () => () => {};

/**
 * 클라이언트에서 렌더 중인지.
 *
 * SSR 스냅샷이 false 라 서버 렌더·하이드레이션 첫 렌더가 일치하고,
 * 하이드레이션 직후 true 로 넘어간다. useEffect + setState(mounted) 패턴과 결과는 같지만
 * 이펙트 안에서 동기 setState 를 하지 않는다.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/**
 * zustand persist(localStorage) 복원이 끝났는지.
 *
 * 복원 전에 onboarded/authed 를 읽으면 항상 초기값(false)이라
 * 이미 온보딩한 사용자를 온보딩 화면으로 되돌려보내게 된다. 진입 게이트는 이 값을 기다려야 한다.
 */
export function useSessionHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useSession.persist.onFinishHydration(onChange),
    () => useSession.persist.hasHydrated(),
    () => false,
  );
}
