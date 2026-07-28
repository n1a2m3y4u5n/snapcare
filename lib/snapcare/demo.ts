'use client';

import { useEffect, useState } from 'react';

/**
 * 시연용 자료를 채울 것인가.
 *
 * 왜 필요한가
 * -----------
 * 지금까지 시드 기록(Red Bull, Snickers, Amoxicillin…)이 **조건 없이** 들어갔다.
 * 심사 시연에는 좋지만, 몰도바 현지 평가에서 어르신이 앱을 처음 열면 자기가 하지도
 * 않은 스캔이 보이고 "오늘 356 kcal" 이라는 남의 숫자가 뜬다. 우리가 재려는 것이
 * "이 사람이 이 화면을 이해하는가" 인데, 화면이 거짓이면 그 측정이 무의미해진다.
 *
 * 왜 브랜치가 아닌가
 * ------------------
 * 두 갈래로 나누면 본선까지 모든 수정을 두 번씩 해야 한다. 코드는 하나로 두고
 * 자료만 가른다. 배포도 하나면 되고, 시연 도중에도 바꿀 수 있다.
 *
 *   그냥 열면          → 깨끗한 첫 실행 (현지 평가·실사용)
 *   ?demo=1 로 한 번   → 자료가 채워진 상태 (심사 시연). 그 브라우저에 기억된다.
 *   ?demo=0 으로       → 다시 깨끗하게
 *
 * 배포 전체를 시연용으로 두고 싶으면 NEXT_PUBLIC_DEMO=1 로 빌드한다.
 */

const FLAG = 'snapcare-demo';

/**
 * 시연용 자료를 넣을 것인가.
 *
 * 주소를 여기서 같이 읽는다. 따로 "기억해 두는" 함수를 두고 먼저 부르게 하면, 스토어가
 * 모듈을 읽는 시점과 그 함수가 도는 시점 중 어느 쪽이 먼저인지에 결과가 달라진다 —
 * 그런 순서 의존은 조용히 틀리고 재현도 잘 안 된다. 읽을 때 정하면 순서가 없어진다.
 *
 * 한 번 본 값은 그 브라우저에 남긴다. 주소에만 두면 새로고침이나 화면 이동으로
 * 사라져서, 시연 도중 자료가 갑자기 비어 보인다.
 *
 * 서버에서 그릴 때는 항상 false 다 — 주소를 아직 모른다.
 */
export function isDemo(): boolean {
  if (typeof window === 'undefined') return false;
  if (process.env.NEXT_PUBLIC_DEMO === '1') return true;
  const q = new URLSearchParams(window.location.search).get('demo');
  if (q === '1') {
    localStorage.setItem(FLAG, '1');
    return true;
  }
  if (q === '0') {
    localStorage.removeItem(FLAG);
    return false;
  }
  return localStorage.getItem(FLAG) === '1';
}

/**
 * 화면에서 쓰는 형태.
 *
 * isDemo() 를 그리는 중에 그냥 부르면 안 된다 — 서버는 false, 브라우저는 true 라
 * 두 화면이 어긋난다. 붙은 뒤에 한 번 알려주는 방식으로 그 어긋남을 없앤다.
 */
export function useIsDemo(): boolean {
  const [demo, setDemo] = useState(false);
  useEffect(() => setDemo(isDemo()), []);
  return demo;
}
