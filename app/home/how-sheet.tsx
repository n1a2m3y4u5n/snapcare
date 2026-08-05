'use client';

import { useState } from 'react';

import { CameraIcon, HelpIcon } from '@/components/icons';
import { Hear, sayable } from '@/components/sc/Say';
import { useIsClient } from '@/lib/hooks';

/**
 * "이 앱을 어떻게 쓰나요" — 처음 열 때 저절로, 그 뒤로는 눌러서.
 *
 * 왜 필요한가
 * -----------
 * 홈에 있는 것은 큰 단추 하나다. 그 단추가 무엇을 하는지는 사진기 그림이 말하는데,
 * **무엇을 향해 드는가**는 아무 데도 안 적혀 있었다. 처음 여는 사람이 폰을 들고
 * 서서 답해야 하는 물음이 바로 그것이다.
 *
 * 그리고 이 앱의 사용자는 글을 못 읽는다. 그래서 설명이 아니라 **그림**이어야 한다 —
 * 종이 한 장, 식품 한 봉지, 상자 화면의 코드. 셋 다 사람이 실제로 손에 들 물건이라,
 * 화면의 그림과 손에 든 것이 같아 보이면 그것으로 설명이 끝난다.
 *
 * 왜 사진기 동그라미가 맨 위에 있는가
 * -----------------------------------
 * 홈의 그 단추와 **같은 모양 같은 색**이다. 아래 셋과 화살표로 이어 두면 "이 단추가
 * 이 셋을 한다" 가 문장 없이 선다. 다른 그림을 쓰면 그 연결이 끊기고, 끊기면 이
 * 화면은 그냥 예쁜 목록이 된다.
 *
 * 왜 한 번 보고 마는 것이 아닌가
 * ------------------------------
 * 처음 한 번만 뜨면, 그때 못 알아들은 사람에게 두 번째 기회가 없다. 그리고 이 폰은
 * 여럿이 쓴다 — 어머니가 처음 열었다고 딸이 본 것은 아니다. 그래서 카메라 아래에
 * 늘 있는 줄로 다시 열 수 있게 둔다.
 */

/** 한 번 봤는가. 계정별로 안 가른다 — 이 앱을 쓰는 법은 사람마다 다르지 않다. */
const SEEN = 'snapcare-how-seen';

interface Step {
  /** 손에 들 물건의 사진. 글이 아니라 이것이 설명이다. */
  img: string;
  what: string;
  why: string;
  say: string;
}

const STEPS: Step[] = [
  {
    img: '/prescription-antibiotic.png',
    what: 'A prescription',
    why: 'The app reads the times and sends them to the dispenser',
    say: 'Photograph a prescription. The app reads what to take and when, and sends those times to the dispenser.',
  },
  {
    /*
      식품은 **포장지**를 보인다.

      접시에 담긴 음식을 그리고 싶었는데, 그 그림은 "무엇이든 찍어도 된다" 로 읽힌다.
      이 앱이 가장 잘 읽는 것은 뒷면의 성분표이고, 그것을 찍게 하는 것이 사람에게
      가장 정확한 답을 준다. 접시 위의 밥은 기기 안의 모델이 어림하고, 그 어림은
      성분표만큼 정확하지 않다 — 화면이 그 차이를 미리 말해 두는 편이 낫다.
    */
    img: '/label-peanut-bar.png',
    what: 'Food, or the label on it',
    why: 'The app says if it is safe for you',
    say: 'Photograph food, or the label on the back of a package. The app says whether it is safe for you.',
  },
  {
    img: '/device-code-demo.png',
    what: 'The code on the dispenser',
    why: 'This connects the dispenser to this phone',
    say: 'Photograph the code on the dispenser screen. That connects the dispenser to this phone.',
  },
];

/** 위의 사진기에서 아래 셋으로 내려가는 화살표. 이 둘을 잇는 것이 이 화면의 전부다. */
function DownArrow() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
      <path d="M10.5 2h3v13.2l4.4-4.4 2.1 2.1L12 21.5l-8-8.6 2.1-2.1 4.4 4.4Z" />
    </svg>
  );
}

/** 한 번 봤는가. 서버에서 그릴 때는 늘 "봤다" 로 친다 — 그때는 아직 모른다. */
function alreadySeen(ready: boolean): boolean {
  if (!ready || typeof localStorage === 'undefined') return true;
  try { return !!localStorage.getItem(SEEN); } catch { return true; }
}

export function HowSheet() {
  const ready = useIsClient();
  /*
    "처음이라 열렸다" 와 "눌러서 열었다" 를 갈라 둔다.

    `useEffect` 에서 `setOpen(true)` 를 부르는 편이 짧은데, 그러면 그린 뒤에 한 번 더
    그리게 되고 React 19 의 규칙에도 걸린다. 처음 여는가는 **그릴 때 이미 알 수 있는
    것**이라(저장소를 읽으면 된다) 상태로 둘 이유가 없다.
  */
  const [asked, setAsked] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const open = asked || (!dismissed && !alreadySeen(ready));

  function close() {
    try { localStorage.setItem(SEEN, '1'); } catch { /* 저장이 막힌 브라우저 */ }
    setAsked(false);
    setDismissed(true);
  }

  return (
    <>
      {/*
        늘 있는 줄. 카메라 바로 아래다 — 물음이 생기는 자리가 거기이므로.

        글로만 두지 않는다. 물음표 그림이 앞에 서서, 글을 못 읽어도 "여기서 물어볼 수
        있다" 가 남는다.
      */}
      <button
        onClick={() => setAsked(true)}
        aria-label="How do I use this app?"
        className="mx-auto mt-3 flex items-center gap-2 rounded-full px-4 py-2
                   active:scale-95 transition-transform"
        style={{ color: 'var(--color-sc-primary)' }}
      >
        {/*
          채운 동그라미에 물음표를 뚫은 그림(`HelpIcon`). 획으로만 그린 것을 써 봤더니
          옆의 글과 굵기가 비슷해서 문장의 일부로 보였다 — 글을 못 읽는 사람이 "여기서
          물어볼 수 있다" 를 알아채는 단서가 이것뿐인데, 그것이 글로 보이면 단서가
          없는 것과 같다. 채운 덩어리는 그 문제가 없고, 이 앱에서 채운 동그라미는
          이미 "누르는 것" 이다.
        */}
        <span aria-hidden className="flex items-center text-2xl leading-none"><HelpIcon /></span>
        <span className="text-base font-bold underline underline-offset-4">
          How do I use this app?
        </span>
      </button>

      {!open ? null : (
        /*
          바깥을 누르면 닫힌다. 바깥은 화면 전부다 — 닫는 단추 하나를 찾게 하는 것보다
          넓다. 아래의 "Got it" 은 그것을 못 찾는 사람을 위한 두 번째 길이다.
        */
        <div
          onClick={close}
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgb(0 0 0 / 45%)' }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="How to use this app"
            onClick={(e) => e.stopPropagation()}
            className="sc-shell max-h-[92vh] w-full overflow-y-auto rounded-t-3xl px-5 pb-8 pt-6"
            style={{ background: 'var(--color-sc-surface)' }}
          >
            {/*
              홈의 그 단추와 같은 모양 같은 색. 아래 셋과 화살표로 이어져서 "이 단추가
              이 셋을 한다" 가 문장 없이 선다.
            */}
            <div className="flex flex-col items-center">
              <span
                aria-hidden
                className="flex h-20 w-20 items-center justify-center rounded-full text-white"
                style={{ background: 'var(--color-sc-primary)' }}
              >
                <CameraIcon size="46%" />
              </span>
              <span aria-hidden className="mt-1" style={{ color: 'var(--color-sc-muted)' }}>
                <DownArrow />
              </span>
            </div>

            <h2
              className="mt-1 text-center text-xl font-extrabold"
              style={{ color: 'var(--color-sc-ink)' }}
              {...sayable('Point the camera at any of these three things.')}
            >
              Point it at any of these
            </h2>

            <ul className="mt-4 space-y-3">
              {STEPS.map((s) => (
                <li
                  key={s.img}
                  className="flex items-center gap-3 rounded-2xl p-3"
                  style={{ background: 'var(--color-sc-bg)' }}
                >
                  {/*
                    사진을 흰 종이 위에 앉힌다. 잘라내지 않고 통째로 보이는 것이
                    중요하다 — 사람이 손에 든 것과 같아 보여야 하는데, 잘린 그림은
                    같은 물건으로 안 보인다.
                  */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.img}
                    alt=""
                    className="h-20 w-20 shrink-0 rounded-xl object-contain"
                    style={{ background: '#fff' }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-bold" style={{ color: 'var(--color-sc-ink)' }}>
                      {s.what}
                    </span>
                    <span className="block text-xs" style={{ color: 'var(--color-sc-muted)' }}>
                      {s.why}
                    </span>
                  </span>
                  <Hear text={s.say} />
                </li>
              ))}
            </ul>

            <button
              onClick={close}
              className="mt-5 w-full rounded-2xl py-4 text-lg font-bold text-white
                         active:scale-[0.99] transition-transform"
              style={{ background: 'var(--color-sc-primary)' }}
              {...sayable('Got it. Close this.')}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
