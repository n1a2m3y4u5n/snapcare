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
  /**
   * 한 화면에 담고 스크롤을 없앤다.
   *
   * 홈만 이것을 켠다. 홈에 들어가는 것은 정해져 있고(제목·얼굴·궤도, 그리고 가끔
   * 카드 한 장) 목록이 아니다. 그런데 셸이 `min-h-screen` 이라 화면 높이는 바닥일
   * 뿐이었고, 카드가 한 장 뜨는 날 궤도가 아래로 밀려 **이 앱에서 사람이 하는 일
   * 하나가 화면 밖으로 나갔다.**
   *
   * 켜면 높이가 `100dvh` 로 못 박히고, 남는 자리를 궤도가 받는다(`min-h-0`) —
   * 카드가 뜨면 궤도가 그만큼 줄어든다. 밀려나는 대신 작아진다.
   *
   * 그래도 `overflow-y-auto` 는 남긴다. 글자를 가장 크게 두고 카드가 둘 뜨는 날처럼
   * 정말 안 들어가는 조합이 있고, 그때 넘친 것을 **잘라내면 되돌릴 방법이 없다**
   * (WCAG 1.4.4). 평소에는 넘칠 것이 없으니 스크롤도 안 생긴다.
   */
  fit?: boolean;
}

/**
 * SnapCare 공통 모바일 셸 — 웹에서 폰 폭(max 440)으로 중앙 정렬.
 * tab 지정 시 하단 탭바 렌더.
 */
export function MobileScreen({
  children, bar, bg = 'var(--color-sc-bg)', className = '', ownRead = false, fit = false,
}: Props) {
  /*
   * 낭독 버튼은 모든 화면의 같은 자리에 있다 — 읽지 못하는 사람이 버튼을 찾는 방법은
   * '늘 거기 있다' 뿐이다. 탭바가 있으면 그 안의 마지막 칸이 그 자리고, 없으면
   * 떠 있는 버튼이다. 탭바 쪽을 쓰는 이유는 그것이 화면에서 **내용이 지나가지 않는
   * 유일한 자리**이기 때문이다 (떠 있는 원은 어느 구석에 두어도 무언가를 가렸다).
   */
  const variant = ownRead ? 'none' : bar ? 'tab' : 'float';
  return (
    <div className={`w-full flex justify-center ${fit ? 'h-[100dvh]' : 'min-h-screen'}`}
         style={{ background: bg }}>
      <div className={`relative w-full max-w-[440px] flex flex-col ${fit ? 'h-full' : 'min-h-screen'}`}
           style={{ background: bg }}>
        {/*
          아래 줄이 화면에 고정(fixed)이라, 본문 끝이 그 밑으로 들어간다. 여백을
          rem 으로 준다 — 글자를 키우면 줄도 같이 커지므로 px 로 박으면 가장 큰
          크기에서 마지막 줄이 가려진다.
        */}
        {/*
          아래 줄이 화면에 고정이라 본문 끝이 그 밑으로 들어간다. 비켜 주는 양은
          `HomeBar` 가 자기 높이를 재서 알려 준다(`--sc-bar-h`). 어림값 `7rem` 은
          그 값이 아직 없는 첫 그림 한 장 동안만 쓰인다.
        */}
        <main className={`flex-1 flex flex-col ${fit ? 'min-h-0 overflow-y-auto' : ''} ${className}`}
              style={bar ? { paddingBottom: 'calc(var(--sc-bar-h, 7rem) + 12px)' } : undefined}>{children}</main>
        {!bar && <ReadScreen variant={variant} />}
        {bar && <HomeBar atHome={bar === 'home'}>{!ownRead && <ReadScreen variant="tab" wide={bar === 'home'} />}</HomeBar>}
        {bar && ownRead && <ReadScreen variant="none" />}
      </div>
    </div>
  );
}
