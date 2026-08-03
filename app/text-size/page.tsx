'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { usePreferences } from '@/stores/preferences';
import { useSession } from '@/stores/session';
import { ROOT_PX, TEXT_SIZES, applyTextSize, type TextSize } from '@/lib/a11y/textSize';
import { speak } from '@/lib/voice';

/**
 * 앱을 처음 켰을 때 가장 먼저 나오는 화면 — 글자 크기 고르기.
 *
 * 왜 시력검사표인가
 * -----------------
 * 설정 안에 글자 크기를 두면 **정작 필요한 사람이 못 찾는다.** 작아서 못 읽는
 * 화면 안에 "글자 크기" 라는 작은 글자가 있는 셈이다. 그래서 첫 화면으로 끌어올렸다.
 *
 * 그런데 첫 화면으로 올려도 "어느 것을 고르시겠습니까" 라고 물으면 같은 문제가
 * 남는다 — 그 물음을 읽어야 한다. 시력검사표는 그 물음이 필요 없다. 같은 글이
 * 여러 크기로 놓여 있고, **읽히는 줄을 누르면 된다.** 안과에서 하는 그 일이라
 * 어르신에게는 이미 배운 동작이기도 하다.
 *
 * 게임이 밝기를 맞출 때 쓰는 방식과 같은 계열이다: 값을 묻지 않고 **보이는 것을
 * 고르게** 한다. 값과 결과 사이에 상상이 끼지 않는다.
 *
 * 세 가지를 지켰다
 * ----------------
 *  · **작은 것이 위, 큰 것이 아래.** 검사표와 같은 순서다. 그리고 못 읽는 사람의
 *    눈은 아래로 내려오면서 처음으로 읽히는 줄에서 멈춘다 — 그 줄이 답이다.
 *  · **누르기 전에 소리로 말한다.** 도착하자마자 무엇을 하라는 것인지 읽어 준다.
 *    글자를 못 읽는 사람에게는 이것이 유일한 안내다.
 *  · **줄 전체가 버튼이다.** 글자만 표적이면 큰 줄과 작은 줄의 표적 크기가 달라져서,
 *    정작 작은 글자를 고르려는 사람이 가장 작은 표적을 눌러야 한다.
 */

/** 검사표에 쓸 글. 이 앱이 실제로 하는 말이라, 고른 크기가 곧 앱에서 볼 크기다. */
const SAMPLE = 'Take one pill';

export default function TextSizePage() {
  const router = useRouter();
  const setTextSize = usePreferences((s) => s.setTextSize);
  const setSizePicked = useSession((s) => s.setSizePicked);

  useEffect(() => {
    speak('Tap the smallest line you can read comfortably. The words will stay that size everywhere.');
  }, []);

  function choose(size: TextSize) {
    setTextSize(size);
    // 고른 크기를 바로 건다. 다음 화면부터가 아니라 **이 누름의 결과로** 커져야
    // 무엇을 고른 것인지가 붙는다.
    applyTextSize(size);
    setSizePicked(true);
    router.replace('/');
  }

  return (
    <div className="min-h-screen w-full flex justify-center" style={{ background: 'var(--color-sc-bg)' }}>
      <div className="w-full max-w-[440px] px-5 py-10">
        {/*
          제목은 작게 둔다. 이 화면에서 크기를 말하는 것은 아래 줄들이고, 제목이
          크면 그 비교를 방해한다. 어차피 소리가 같은 말을 이미 했다.
        */}
        <p className="text-center text-sm font-semibold" style={{ color: 'var(--color-sc-muted)' }}>
          Tap the smallest line you can read
        </p>

        <div className="mt-6 flex flex-col gap-2">
          {TEXT_SIZES.map((size) => (
            <button
              key={size}
              onClick={() => choose(size)}
              aria-label={`Use this size: ${SAMPLE}`}
              className="w-full rounded-2xl bg-white px-4 py-4 text-center shadow-sm
                         active:scale-[0.98] transition-transform"
            >
              {/*
                px 로 박는다. rem 이면 지금 걸려 있는 뿌리 크기를 따라가서 다섯 줄이
                다 같이 커지고, 그러면 검사표가 아니라 그냥 목록이 된다.
              */}
              <span aria-hidden
                    className="font-bold"
                    style={{ fontSize: ROOT_PX[size] * 1.15, lineHeight: 1.3, color: 'var(--color-sc-ink)' }}>
                {SAMPLE}
              </span>
            </button>
          ))}
        </div>

        <p className="mt-6 text-center text-xs" style={{ color: 'var(--color-sc-muted)' }}>
          You can change this later in Settings.
        </p>
      </div>
    </div>
  );
}
