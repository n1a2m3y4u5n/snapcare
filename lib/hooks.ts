'use client';

import { useSyncExternalStore } from 'react';
import { useSession } from '@/stores/session';
import { isDemo } from '@/lib/snapcare/demo';
import { activeAccount } from '@/lib/snapcare/accounts';

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

/**
 * 시연 모드인지 — 화면에서 쓰는 형태.
 *
 * isDemo() 를 그리는 중에 그냥 부르면 안 된다: 서버는 false, 브라우저는 true 라
 * 두 화면이 어긋난다. 붙은 뒤에 한 번 알려주는 방식으로 그 어긋남을 없앤다.
 */
export function useIsDemo(): boolean {
  // 위 useIsClient 와 같은 방식이다. useEffect + setState 로도 결과는 같은데, 그쪽은
  // 붙은 직후에 한 번 더 그리게 하고 React 19 의 규칙에도 걸린다. 서버 스냅샷을
  // 따로 주는 것이 이 상황을 위해 있는 도구다.
  return useSyncExternalStore(noopSubscribe, isDemo, () => false);
}

/**
 * 내 자리의 색.
 *
 * 잠금화면의 얼굴 배경과 프로필·설정의 아바타 배경이 **같은 색**이어야 한다. 글을
 * 못 읽는 사람이 화면 사이를 잇는 단서가 그 두 가지(얼굴, 색)뿐인데, 같은 사람이
 * 화면마다 다른 색이면 그 단서가 거짓이 된다.
 *
 * 명단은 브라우저에만 있으므로 붙은 뒤에 읽는다.
 */
export function useMyColor(fallback: string): string {
  return useSyncExternalStore(noopSubscribe, () => activeAccount().color, () => fallback);
}
