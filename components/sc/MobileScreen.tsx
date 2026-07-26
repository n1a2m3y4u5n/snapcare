'use client';

import { ReactNode } from 'react';
import { TabBar, type TabKey } from './TabBar';
import { ReadScreen } from './ReadScreen';

interface Props {
  children: ReactNode;
  /** 하단 탭을 표시할 탭 키 (없으면 탭 없음) */
  tab?: TabKey;
  /** 배경색 (기본 오프화이트) */
  bg?: string;
  className?: string;
}

/**
 * SnapCare 공통 모바일 셸 — 웹에서 폰 폭(max 440)으로 중앙 정렬.
 * tab 지정 시 하단 탭바 렌더.
 */
export function MobileScreen({ children, tab, bg = 'var(--color-sc-bg)', className = '' }: Props) {
  return (
    <div className="min-h-screen w-full flex justify-center" style={{ background: bg }}>
      <div className="relative w-full max-w-[440px] min-h-screen flex flex-col" style={{ background: bg }}>
        <main className={`flex-1 flex flex-col ${tab ? 'pb-24' : ''} ${className}`}>{children}</main>
        {/* 낭독 버튼은 모든 화면의 같은 자리에 있다 — 읽지 못하는 사람이 버튼을
            찾는 방법은 '늘 거기 있다' 뿐이다. */}
        <ReadScreen />
        {tab && <TabBar active={tab} />}
      </div>
    </div>
  );
}
