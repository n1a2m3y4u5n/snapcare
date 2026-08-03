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
 * 홈을 궤도로 바꾸면서 그 어긋남이 더 커졌다. 홈에서는 궤도가 길인데 세부 화면에
 * 들어가면 갑자기 탭바가 다시 나타나, 같은 앱이 두 가지 길 안내를 한다.
 *
 * 그래서 바퀴살 구조로 간다. 홈이 축이고 모든 화면은 홈에서 뻗어 나간다. 세부
 * 화면에서 할 수 있는 이동은 하나뿐이다 — **집으로.** 고를 것이 없으면 고르다
 * 틀릴 일도 없다.
 *
 * 왜 아래 줄 자체는 남기는가
 * --------------------------
 * 낭독 버튼 때문이다. 읽지 못하는 사람이 그 버튼을 찾는 방법은 '늘 거기 있다' 뿐이라
 * 화면마다 자리가 달라지면 안 된다. 그리고 나가는 버튼도 위쪽 구석의 작은 글자보다
 * 아래쪽의 큰 버튼이 낫다 — 엄지가 닿는 곳이 거기다.
 *
 * 홈에서는 왼쪽이 빈다. 채우지 않는다: 채우면 낭독 버튼이 옮겨 앉고, 그 자리가
 * 고정이라는 것이 이 줄의 요점이다.
 */
export function HomeBar({ atHome, children }: {
  /** 지금이 홈인가. 홈이면 집으로 가는 버튼을 안 낸다 */
  atHome: boolean;
  /** 낭독 버튼 */
  children?: React.ReactNode;
}) {
  return (
    <nav
      className="absolute bottom-0 left-0 right-0 mx-auto flex max-w-[440px] items-stretch
                 justify-between border-t bg-white/95 px-3 pt-2 pb-6 backdrop-blur"
      style={{ borderColor: 'var(--color-sc-line)' }}
    >
      {atHome ? (
        // 자리를 비워 둔다. 낭독 버튼이 오른쪽에 고정되어야 한다.
        <span aria-hidden className="flex-1" />
      ) : (
        <Link
          href="/home"
          className="flex flex-1 items-center gap-2 rounded-2xl px-3 py-2"
          style={{ color: 'var(--color-sc-primary)' }}
        >
          <span aria-hidden className="text-2xl leading-none">🏠</span>
          <span className="text-base font-bold"
                {...sayable('Go back to the home screen. Everything starts there.')}>
            Home
          </span>
        </Link>
      )}
      {children}
    </nav>
  );
}
