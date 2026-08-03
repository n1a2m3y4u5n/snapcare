'use client';

import { useEffect, useState } from 'react';
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

/** 시범을 보일 줄. 기본값이라 아무 생각 없이 따라 눌러도 무난한 자리다. */
const DEMO_ROW = 1;

export default function TextSizePage() {
  const router = useRouter();
  /*
    사람이 한 번 건드리면 시범을 멈춘다.

    이미 알아들은 사람에게 계속 도는 손은 잔소리이고, 무엇보다 **자기 손가락과
    화면 속 손가락이 같은 자리에서 겹친다.** 누가 누른 것인지가 흐려진다.
  */
  const [demoOff, setDemoOff] = useState(false);
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
        {/* 손가락을 함께 낸다. 이 문장을 못 읽는 사람에게 "누르라" 는 말은 그림이다. */}
        <p className="flex items-center justify-center gap-2 text-center text-sm font-semibold"
           style={{ color: 'var(--color-sc-muted)' }}>
          <span aria-hidden className="text-xl leading-none">👆</span>
          Tap the smallest line you can read
        </p>

        <div className="mt-6 flex flex-col gap-3">
          {TEXT_SIZES.map((size, i) => (
            <button
              key={size}
              onClick={() => choose(size)}
              onPointerDown={() => setDemoOff(true)}
              aria-label={`Use this size: ${SAMPLE}`}
              /*
                네모 박스가 아니라 **누르는 것**으로 보이게 한다.

                흰 카드에 글자만 있을 때는 다섯 개의 네모로 보였다 — 누르는 것인지
                그냥 보기인지가 화면에 없었다. 앱을 처음 켠 사람이 만나는 첫 화면이고
                여기서 아무것도 안 누르면 뒤로 갈 수가 없는데.

                셋을 준다: 테두리(경계가 있어야 물건이 된다), 고르는 동그라미(하나를
                고르는 자리라는 표시), 눌리는 반응. 가운데 줄은 천천히 숨쉬어서 눈이
                먼저 가게 한다 — 그것이 기본값이라 아무 생각 없이 눌러도 무난하다.
              */
              className={`flex w-full items-center justify-center gap-4 rounded-2xl border-2 bg-white
                          px-6 py-4 text-center shadow-sm transition-transform
                          active:scale-[0.97] active:bg-[color-mix(in_srgb,var(--color-sc-primary)_10%,white)]
                          ${!demoOff && i === DEMO_ROW ? 'relative sc-demo-press' : 'relative'}`}
              style={{ borderColor: 'var(--color-sc-line)' }}
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

              {/*
                움직임을 안 쓰는 사람 몫. 손이 안 보이는 대신 화살표가 "누르면
                다음으로 간다" 를 말한다 — 이 줄들이 실제로 하는 일이 그것이다.
              */}
              <span aria-hidden className="sc-reduced-only absolute right-4 top-1/2 -translate-y-1/2 text-2xl"
                    style={{ color: 'var(--color-sc-primary)' }}>›</span>

              {/*
                시범 손. 오른쪽에서 들어와 이 줄을 누르고 물러난다.

                줄 **안에** 둔다 — 바깥에 두고 좌표를 재서 맞추면 글자 크기가 바뀔
                때마다 줄 높이가 달라져서 손이 엉뚱한 데를 가리킨다. 안에 두면
                자기 줄을 따라다닌다.
              */}
              {!demoOff && i === DEMO_ROW && (
                <>
                  {/*
                    물결은 손이 닿는 바로 그 자리에서 퍼진다.

                    전에는 왼쪽 동그라미에서 퍼졌는데, 그 동그라미를 없앴다 —
                    **채워지지 않는 동그라미**였기 때문이다. 고르면 곧바로 다음
                    화면으로 가므로 "선택됨" 이라는 상태가 아예 존재하지 않는데,
                    라디오 버튼 모양은 그 상태를 약속한다. 없는 것을 약속하는 표시는
                    없느니만 못하다.
                  */}
                  <span aria-hidden
                        className="sc-demo-ripple pointer-events-none absolute right-4 top-1/2
                                   h-10 w-10 -translate-y-1/2 rounded-full"
                        style={{ background: 'var(--color-sc-primary)' }} />
                  <span aria-hidden
                        className="sc-demo-hand pointer-events-none absolute right-4 top-1/2 -translate-y-1/2
                                   text-3xl leading-none"
                        style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.25))' }}>
                    👆
                  </span>
                </>
              )}
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
