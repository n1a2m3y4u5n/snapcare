'use client';

import { useEffect, useState } from 'react';
import { CloseIcon, TapIcon } from '@/components/icons';

import { speak } from '@/lib/voice';
import { useIsClient } from '@/lib/hooks';

/**
 * "글자를 꾹 누르면 읽어 줍니다" — 딱 한 번, 쓰는 자리에서.
 *
 * 왜 이것만 남았는가
 * ------------------
 * 첫 실행 안내 다섯 장을 없앴다. 넷은 화면 자체가 이미 말한다 — 카메라는 홈 한가운데
 * 큰 원이고, 판정 색은 판정 화면이 색으로 보여주고, "당신 기준으로 본다" 는 `Who`
 * 위성과 배지가 말하고, 알람은 처방을 찍으면 그 자리에서 만들자고 묻는다.
 *
 * 그런데 **꾹 눌러 듣는 손짓만은 화면 어디에도 안 나타난다.** 기능이 있는 것과
 * 사람에게 닿는 것은 다르다. 아래 줄의 낭독 버튼이 화면 전체를 읽어 주므로 소리
 * 자체는 막히지 않지만, "이 줄만 다시" 는 그 손짓으로만 된다 — 약 이름 하나, 복용
 * 시각 하나를 다시 듣고 싶을 때가 정확히 그 경우다.
 *
 * 그래서 안내를 없애는 대신 **쓰는 자리로 옮겼다.** 판정 화면에 처음 도착했을 때
 * 한 번 뜬다. 여기가 그 손짓이 실제로 쓸모 있는 첫 자리다 — 배운 것을 그 화면에서
 * 바로 해 볼 수 있고, 다섯 장을 넘긴 뒤 잊어버리는 일이 없다.
 *
 * 한 번 보고 나면 다시 안 뜬다. 안내는 두 번째부터 잔소리다.
 */

const SEEN = 'snapcare-hold-hint';

export function HoldToHear() {
  /*
    붙은 뒤에 읽는다. localStorage 는 브라우저에만 있어서, 그릴 때 읽으면 서버가
    그린 화면과 어긋난다.

    이펙트에서 setState 로 켜지 않는다. 그러면 그리자마자 한 번 더 그리고, 그
    한 프레임 동안 안내가 없다가 튀어나온다. `useIsClient` 로 "붙었는가" 만 받고
    보일지 말지는 **그릴 때** 판단한다.
  */
  const ready = useIsClient();
  const [dismissed, setDismissed] = useState(false);
  const show = ready && !dismissed && !localStorage.getItem(SEEN);

  // 소리로도 말한다. 이 안내를 읽어야 아는 것이라면 안내가 아니다.
  useEffect(() => {
    if (show) void speak('Press and hold any words to hear them read out.');
  }, [show]);

  if (!show) return null;

  return (
    <button
      onClick={() => { localStorage.setItem(SEEN, '1'); setDismissed(true); }}
      aria-label="Got it. Press and hold any words to hear them read out."
      /*
        가로줄이 아니라 한 문단이다.

        전에는 손가락 · 글 · 닫기를 flex 로 나란히 놓았다. 기본 크기에서는 멀쩡한데,
        글자를 가장 크게 두면 좌우 여백과 두 그림이 231px 중 108px 을 가져가고 남은
        99px 안에서 문장이 **한 낱말씩 일곱 줄로** 쏟아졌다.

        손가락을 문장 앞에 붙여 같이 흐르게 하면 그 다툼이 없어진다 — 글자가 커져도
        칸을 나눠 갖는 일이 없으니 문장이 폭을 다 쓴다. 닫기 표시는 줄 흐름에서 빼서 오른쪽
        위에 얹고, 글이 그 밑으로 들어가지 않게 오른쪽만 비워 둔다.
      */
      className="relative mx-5 mt-2 block w-[calc(100%-2.5rem)] rounded-2xl px-4 py-3 pr-12 text-left text-sm font-semibold"
      style={{ background: 'color-mix(in srgb, var(--color-sc-primary) 12%, white)', color: 'var(--color-sc-ink)' }}
    >
      <TapIcon className="inline align-[-0.15em]" aria-hidden />{' '}
      Press and hold any words to hear them
      {/* 닫기 표시. 누르면 사라진다는 것이 보여야 이 줄이 영구 장식으로 안 읽힌다. */}
      <span aria-hidden className="absolute right-4 top-3 flex items-center text-lg" style={{ color: 'var(--color-sc-muted)' }}><CloseIcon /></span>
    </button>
  );
}
