'use client';

import { ReactNode } from 'react';
import { HomeBar } from './HomeBar';
import { ReadScreen } from './ReadScreen';

interface Props {
  children: ReactNode;
  /**
   * 아래 줄을 낸다. 'home' 이면 집으로 가는 버튼을 빼고 낭독 버튼만 남긴다.
   *
   * 전에는 탭 키였다(`'home' | 'nutrition' | 'settings'`). 탭바를 없애면서
   * 남은 것은 "여기가 홈인가" 하나다 — 이유는 HomeBar 맨 위에 적었다.
   */
  bar?: 'home' | 'inner';
  /** 배경색 (기본 오프화이트) */
  bg?: string;
  className?: string;
  /**
   * 화면 낭독 버튼을 이 화면이 직접 두는가.
   *
   * 판정 화면은 머리말에 자기 낭독 버튼이 있고, 그쪽이 더 낫다 — DOM 순서가 아니라
   * 사람이 쓴 판정 대본을 읽는다. 그래도 컴포넌트는 붙여 둔다: 도착 안내와 말하기
   * 속도 적용이 여기 걸려 있어서, 빼면 그 화면만 조용히 다르게 동작한다.
   */
  ownRead?: boolean;
}

/**
 * SnapCare 공통 모바일 셸 — 웹에서 폰 폭(max 440)으로 중앙 정렬.
 * tab 지정 시 하단 탭바 렌더.
 */
export function MobileScreen({
  children, bar, bg = 'var(--color-sc-bg)', className = '', ownRead = false,
}: Props) {
  /*
   * 낭독 버튼은 모든 화면의 같은 자리에 있다 — 읽지 못하는 사람이 버튼을 찾는 방법은
   * '늘 거기 있다' 뿐이다. 탭바가 있으면 그 안의 마지막 칸이 그 자리고, 없으면
   * 떠 있는 버튼이다. 탭바 쪽을 쓰는 이유는 그것이 화면에서 **내용이 지나가지 않는
   * 유일한 자리**이기 때문이다 (떠 있는 원은 어느 구석에 두어도 무언가를 가렸다).
   */
  const variant = ownRead ? 'none' : bar ? 'tab' : 'float';
  return (
    <div className="min-h-screen w-full flex justify-center" style={{ background: bg }}>
      <div className="relative w-full max-w-[440px] min-h-screen flex flex-col" style={{ background: bg }}>
        <main className={`flex-1 flex flex-col ${bar ? 'pb-24' : ''} ${className}`}>{children}</main>
        {!bar && <ReadScreen variant={variant} />}
        {bar && <HomeBar atHome={bar === 'home'}>{!ownRead && <ReadScreen variant="tab" />}</HomeBar>}
        {bar && ownRead && <ReadScreen variant="none" />}
      </div>
    </div>
  );
}
