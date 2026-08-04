'use client';

import Link from 'next/link';

import { sayable } from './Say';

/**
 * 화면 아래 고정 줄 — 집으로 가는 길과 낭독 버튼.
 *
 * 왜 탭바를 없앴는가
 * ------------------
 * 탭바는 "어느 탭에 있는가" 를 말하는 물건이고, 탭끼리 오갈 수 있다는 것을 전제한다.
 * 그런데 이 앱의 화면들은 서로 오갈 이유가 없다 — 영양에서 약통으로 바로 갈 일이
 * 없고, 지난 날들에서 설정으로 갈 일도 없다. 그런데도 탭바가 늘 네 갈래를 내밀고
 * 있어서, **어디로 가야 하는지가 매 화면 네 번씩 다시 물어진다.**
 *
 * 그래서 바퀴살 구조로 간다. 홈이 축이고 모든 화면은 홈에서 뻗어 나간다. 세부
 * 화면에서 할 수 있는 이동은 하나뿐이다 — **집으로.**
 *
 * 세 가지를 고쳤다
 * ----------------
 *  · **화면에 붙인다(fixed).** `absolute` 였다. 그러면 이 줄이 화면 바닥이 아니라
 *    **내용 바닥**에 붙어서, 긴 화면에서는 집으로 가려고 끝까지 스크롤해야 했다.
 *    나가는 길이 제일 멀리 있는 셈이었다. 옛 탭바도 같았는데, 탭바 시절에는 그것이
 *    이동 넷 중 하나였고 지금은 **유일한 출구**라 훨씬 아프다.
 *  · **버튼처럼 보이게 한다.** 글자와 그림만 있어서 눌러도 되는 것인지가 안 보였다.
 *    채운 바탕과 둥근 모서리를 준다 — 이 앱에서 파란 채움은 "누르는 것" 이다
 *    (홈의 카메라 버튼과 같은 색).
 *  · **좌우를 같은 크기로.** 하나는 그림과 글자가 가로로, 다른 하나는 세로로
 *    쌓여 있어서 크기도 모양도 어긋났다. 둘 다 세로 쌓기에 같은 폭으로 맞춘다.
 *
 * 홈에서는 왼쪽이 빈다. 채우지 않는다: 채우면 낭독 버튼이 옮겨 앉고, 그 자리가
 * 고정이라는 것이 이 줄의 요점이다 — 읽지 못하는 사람이 그 버튼을 찾는 방법은
 * '늘 거기 있다' 뿐이다.
 */
export function HomeBar({ atHome, children }: {
  /** 지금이 홈인가. 홈이면 집으로 가는 버튼을 안 낸다 */
  atHome: boolean;
  /** 낭독 버튼 */
  children?: React.ReactNode;
}) {
  return (
    <nav
      className="fixed bottom-0 left-1/2 z-30 w-full max-w-[440px] -translate-x-1/2 border-t
                 bg-white/95 backdrop-blur"
      style={{ borderColor: 'var(--color-sc-line)' }}
    >
      {/*
        아래 여백을 기기에 묻는다.

        `pb-6`(24px) 이 박혀 있었다. 아이폰의 홈 인디케이터를 피하려는 값인데, 그것이
        없는 기기에서도 똑같이 먹어서 막대가 103px 이 됐다 — 그중 버튼은 66px 이고
        나머지 37px 은 아무것도 아니었다. 벤치에서 그대로 나온 말: "하단 바가 좀
        필요없이 두꺼워 보이는 느낌."

        `env(safe-area-inset-bottom)` 은 인디케이터가 있는 기기에서만 값을 준다.
        있으면 예전만큼 비켜 주고, 없으면 10px 만 남는다. 버튼은 그대로 크다 —
        줄인 것은 버튼이 아니라 버튼이 아닌 자리다.
      */}
      <div className="flex items-stretch gap-3 px-4 pt-2"
           style={{ paddingBottom: 'calc(0.625rem + env(safe-area-inset-bottom, 0px))' }}>
        {atHome ? (
          // 자리를 비워 둔다. 낭독 버튼이 늘 같은 자리에 있어야 한다.
          <span aria-hidden className="flex-1" />
        ) : (
          <Link
            href="/home"
            className="flex flex-1 flex-col items-center gap-1 rounded-2xl py-2 text-white
                       active:scale-95 transition-transform"
            style={{ background: 'var(--color-sc-primary)' }}
          >
            <span aria-hidden className="text-xl leading-none">🏠</span>
            <span className="text-[11px] font-bold"
                  {...sayable('Go back to the home screen. Everything starts there.')}>
              Home
            </span>
          </Link>
        )}
        {children}
      </div>
    </nav>
  );
}
