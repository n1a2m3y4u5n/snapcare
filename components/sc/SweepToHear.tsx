'use client';

import { useEffect } from 'react';
import { speak } from '@/lib/voice';

/**
 * 화면 어디든 **꾹 누르면** 그 자리의 글을 읽고, **누른 채 미끄러뜨리면** 지나가는
 * 것을 차례로 읽는다.
 *
 * 앞의 절반은 원래 있던 것이다(TapToHear). 뒤의 절반이 새로 붙었고, 붙인 이유는
 * 화면에서 스피커 원을 걷어내기 위해서다.
 *
 * 왜 원을 걷어내는가
 * ------------------
 * 소리를 붙일 수 있는 곳에는 다 붙였는데, 붙였다는 것을 알리는 방법이 자리마다
 * 회색 원을 하나씩 그리는 것이었다. 화면 하나에 여덟, 열 개가 격자로 깔렸다. 보기
 * 불편할 뿐 아니라 — 그 원들은 **아무 일도 하지 않는다.** 누르는 것은 줄 전체이고
 * 원은 "여기 소리가 있다" 는 광고다. 화면에서 가장 많은 자리를 차지하는 것이 기능이
 * 아니라 광고인 상태였다.
 *
 * 광고가 필요했던 이유는 소리가 **어디에 있는지 미리 알려 줘야 한다**고 봤기
 * 때문이다. 훑을 수 있으면 그 전제가 사라진다. 손가락을 얹고 미끄러뜨리면 지나가는
 * 것이 차례로 말하므로, 소리가 어디 있는지는 찾는 것이 아니라 지나가면서 알게 된다.
 * 스크린리더가 오래전에 같은 답에 도달한 이유이기도 하다.
 *
 * 그래서 표시는 **읽는 동안에만** 나타난다(`html[data-hearing]`, app/globals.css).
 * 훑는 중에는 소리를 가진 자리가 전부 드러나고, 손을 떼면 화면이 다시 조용해진다.
 *
 * 스크롤과 어떻게 나누는가
 * ------------------------
 * 대자마자 훑기 시작하면 화면을 넘길 수 없다. 그래서 머무름이 조건이다 — 500ms 안에
 * 손가락이 움직이면 스크롤이고, 움직이지 않으면 읽기다. 이 규칙은 원래도 그랬고,
 * 첫 화면의 애니메이션이 이미 그것을 가르치고 있다. 새로 배울 것은 **누른 채 손을
 * 움직여도 된다**는 것 하나뿐이다.
 *
 * 읽기가 시작된 뒤에는 그 손짓이 끝날 때까지만 스크롤을 막는다. 전역으로 막으면
 * 모드가 되고, 모드는 끄는 법을 아는 사람만 빠져나올 수 있다.
 */

/**
 * 브라우저의 기본 길게 누르기(맥락 메뉴·텍스트 선택)와 비슷한 감각이면서, 스크롤하려고
 * 손을 댄 것과는 구분되는 시간. 손이 움직이면 취소한다.
 */
const HOLD_MS = 500;
/** 그 안에 이만큼 움직이면 넘기려는 것으로 본다. 떨리는 손을 감안한 값이다. */
const MOVE_TOLERANCE = 10;

export function SweepToHear() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let start: { x: number; y: number } | null = null;
    let reading = false;
    let current: HTMLElement | null = null;
    let swallowClick = false;

    /** 그 자리에서 가장 가까운 말할 거리. 손가락이 글자를 정조준하지 않아도 된다. */
    function sayableAt(x: number, y: number): HTMLElement | null {
      return document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-say]') ?? null;
    }

    function moveTo(el: HTMLElement | null): void {
      if (!el || el === current) return;
      const text = el.getAttribute('data-say');
      if (!text) return;
      current?.removeAttribute('data-reading');
      current = el;
      el.setAttribute('data-reading', '');
      // 가장자리에 걸친 것만 끌어온다. 짚을 때마다 화면이 뛰면 손가락 밑의 것이
      // 계속 바뀌어 훑기가 성립하지 않는다.
      el.scrollIntoView({ block: 'nearest' });
      void speak(text);
    }

    function begin(el: HTMLElement): void {
      timer = null;
      reading = true;
      // 화면 전체 낭독이 돌고 있으면 먼저 비켜 준다. 둘이 같이 말하면 아무것도 안
      // 들린다. 이 순서여야 하는 이유: 낭독이 멈추며 자기가 켠 표시를 끄는데, 우리가
      // 먼저 켜 두면 그 정리에 같이 꺼진다.
      window.dispatchEvent(new Event('sc:sweep'));
      document.documentElement.setAttribute('data-hearing', '');
      // 눌렸다는 것을 몸으로 알린다. 소리가 나기까지 잠깐 비는데, 그 사이에 아무
      // 반응이 없으면 사용자는 실패한 줄 알고 손을 뗀다.
      navigator.vibrate?.(30);
      moveTo(el);
    }

    function clear(): void {
      if (timer) clearTimeout(timer);
      timer = null;
      start = null;
      if (!reading) return;
      reading = false;
      // 손을 떼도 마지막 문장은 끝까지 읽는다 — 듣고 싶어서 짚은 것이다.
      current?.removeAttribute('data-reading');
      current = null;
      document.documentElement.removeAttribute('data-hearing');
      // 읽기로 끝난 손짓이 클릭까지 되면 안 된다. 500ms 를 들여 짚은 것은 "이게
      // 뭔지 들려줘" 이지 "눌러줘" 가 아니다. 예전에는 이것이 없어서, 꾹 눌러 들은
      // 줄이 눌리기까지 하고 낭독이 한 번 더 겹쳐 시작됐다.
      swallowClick = true;
      setTimeout(() => { swallowClick = false; }, 400);
    }

    const onDown = (e: PointerEvent) => {
      // 말할 거리 위에서 시작한 눌림만 읽기가 된다. 아무 데서나 시작하게 하면
      // 촬영 버튼을 오래 누른 것까지 손짓으로 가로채게 된다.
      const el = sayableAt(e.clientX, e.clientY);
      if (!el?.getAttribute('data-say')) return;
      start = { x: e.clientX, y: e.clientY };
      timer = setTimeout(() => begin(el), HOLD_MS);
    };

    const onMove = (e: PointerEvent) => {
      if (reading) { moveTo(sayableAt(e.clientX, e.clientY)); return; }
      if (!start) return;
      if (Math.abs(e.clientX - start.x) > MOVE_TOLERANCE
        || Math.abs(e.clientY - start.y) > MOVE_TOLERANCE) clear();
    };

    // touch-action 은 손짓이 시작될 때 이미 정해져서 도중에 바꿀 수 없다. 훑는 동안
    // 스크롤을 막을 수 있는 자리는 여기뿐이라 수동 리스너로 붙이지 않는다.
    const onTouchMove = (e: TouchEvent) => { if (reading) e.preventDefault(); };
    const onClickCapture = (e: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.stopPropagation();
      e.preventDefault();
    };
    // 길게 누르면 브라우저가 글자 선택이나 메뉴를 띄운다 — 읽는 중에는 막는다.
    const onContextMenu = (e: Event) => { if (reading) e.preventDefault(); };

    document.addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerup', clear, { passive: true });
    document.addEventListener('pointercancel', clear, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('click', onClickCapture, true);
    document.addEventListener('contextmenu', onContextMenu);

    return () => {
      clear();
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', clear);
      document.removeEventListener('pointercancel', clear);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('click', onClickCapture, true);
      document.removeEventListener('contextmenu', onContextMenu);
    };
  }, []);

  return null;
}
