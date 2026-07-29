'use client';

import { useEffect } from 'react';
import { speak } from '@/lib/voice';

/**
 * 화면 어디든 **꾹 누르면** 그 자리의 글을 읽는다.
 *
 * 무엇이 문제였나
 * ---------------
 * `sayable()` 은 클릭 핸들러가 아니라 `data-say` 표시만 붙인다. 그 표시는 화면 전체
 * 낭독 버튼이 읽을 목록일 뿐이라, 글자를 눌러도 아무 일이 없었다. 소리를 듣는 길은
 * 오른쪽 아래 떠 있는 버튼 하나뿐이었는데, 그 버튼은 눈에 잘 안 띄고 **화면 전체**를
 * 처음부터 읽는다 — 지금 궁금한 한 줄만 듣고 싶은 사람에게는 맞지 않는다.
 *
 * 왜 꾹 누르기인가
 * ----------------
 * 그냥 탭으로 하면 기존 동작과 부딪힌다. 이 앱의 글자는 대부분 버튼 안에 있고
 * (나이 선택, 조건 선택, 표본 타일), 탭이 낭독으로 가로채이면 앱이 아예 안 눌린다.
 * 꾹 누르기는 어느 동작과도 겹치지 않는다.
 *
 * 글자가 아니라 **누른 자리에서 가장 가까운 말할 거리**를 찾는다. 손가락이 정확히
 * 글자 위에 닿지 않아도 된다 — 떨리는 손으로 작은 글씨를 정조준하게 만들면 안 된다.
 *
 * 500ms 로 잡은 이유: 브라우저의 기본 길게 누르기(맥락 메뉴·텍스트 선택)와 비슷한
 * 감각이면서, 스크롤하려고 손을 댄 것과는 구분된다. 손이 움직이면 취소한다.
 */
const HOLD_MS = 500;
const MOVE_TOLERANCE = 10;

export function TapToHear() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let start: { x: number; y: number } | null = null;

    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      start = null;
    };

    const onDown = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-say]') as HTMLElement | null;
      if (!el) return;
      const text = el.getAttribute('data-say');
      if (!text) return;

      start = { x: e.clientX, y: e.clientY };
      timer = setTimeout(() => {
        // 눌렀다는 것을 몸으로 알린다. 소리가 나기까지 잠깐 비는데, 그 사이에
        // 아무 반응이 없으면 사용자는 실패한 줄 알고 손을 뗀다.
        navigator.vibrate?.(30);
        el.animate?.(
          [{ opacity: 1 }, { opacity: 0.45 }, { opacity: 1 }],
          { duration: 320, easing: 'ease-out' },
        );
        void speak(text);
        clear();
      }, HOLD_MS);
    };

    const onMove = (e: PointerEvent) => {
      if (!start) return;
      // 스크롤하려고 손을 댄 것이면 취소한다.
      if (Math.abs(e.clientX - start.x) > MOVE_TOLERANCE
        || Math.abs(e.clientY - start.y) > MOVE_TOLERANCE) clear();
    };

    document.addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerup', clear, { passive: true });
    document.addEventListener('pointercancel', clear, { passive: true });
    return () => {
      clear();
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', clear);
      document.removeEventListener('pointercancel', clear);
    };
  }, []);

  return null;
}
