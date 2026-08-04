'use client';

import { useEffect, useRef, useState } from 'react';
import { BoxIcon } from '@/components/icons';
import { useRouter } from 'next/navigation';

import { claimFromPairUrl } from '@/lib/dispenser/claim';
import { pairWith } from '@/lib/dispenser/paired';
import { DEFAULT_RELAY } from '@/lib/dispenser/relayUrl';
import { requestPermission } from '@/lib/notifications';
import { speak } from '@/lib/voice';
import { useIsClient } from '@/lib/hooks';
import { CameraIcon } from '@/components/icons';

/**
 * 기기 화면의 QR 이 여는 자리. 여기 도착하면 짝은 이미 맺어지는 중이다.
 *
 * 왜 이 화면이 있는가
 * -------------------
 * 짝짓기는 앱의 카메라로 상자를 찍어도 된다. 그런데 그 길은 **한 장짜리 사진**에
 * 걸려 있고, 사진 한 장은 QR 을 읽는 도구로는 최악이다 — 초점을 맞출 기회가 한 번,
 * 각도를 고칠 기회가 없고, 모듈이 몇 픽셀인지는 찍고 나서야 알게 된다. 2.8인치
 * 화면을 팔 길이에서 찍으면 그 몇 픽셀이 모자란다. 실제로 그렇게 실패했고, 판별
 * 모델은 같은 사진을 보고 "QR 코드" 라고 답했다 — 그림에 코드는 있는데 우리
 * 판독기에 닿는 픽셀이 없었다는 뜻이다.
 *
 * 폰의 기본 카메라는 그 일을 훨씬 잘한다. 초당 수십 프레임을 보고, 초점을 맞추고,
 * 읽힐 때까지 계속 시도한다. 그 도구를 쓰려면 QR 이 **열 수 있는 주소**여야 하고,
 * 그 주소가 여기다. 사람은 상자에 카메라를 비추고, 뜨는 알림을 누르면 된다.
 *
 * 코드는 조각(fragment)에 있다
 * ---------------------------
 * `#` 뒤는 브라우저가 서버로 보내지 않는다. 그래서 이 코드는 우리 서버의 접속
 * 기록에도, 사이에 낀 어떤 프록시에도 남지 않고 이 페이지의 자바스크립트에만
 * 도착한다. 열 글자는 이 기기에 일정을 쓰고 트레이를 여는 권한 전부라, 그것이
 * 로그에 남는 것과 안 남는 것의 차이는 크다.
 */
export default function PairPage() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const done = useRef(false);

  /*
    조각은 서버 렌더에 없다. 붙은 뒤에 읽되, **그릴 때** 읽는다 — 이펙트에서
    setState 로 "코드가 없다" 를 켜면 한 프레임 동안 "연결 중" 이 스쳐 지나가고,
    코드가 아예 없는 주소에서도 잠깐 연결되는 것처럼 보인다.
  */
  const ready = useIsClient();
  const claim = ready ? claimFromPairUrl(window.location.href) : '';
  const state: 'working' | 'bad' = !ready || (claim && !failed) ? 'working' : 'bad';

  useEffect(() => {
    if (!claim || done.current) return;
    done.current = true;

    void (async () => {
      try {
        await pairWith(claim, DEFAULT_RELAY);
      } catch (err) {
        console.error('[pair] 짝짓기 실패:', err);
        setFailed(true);
        return;
      }
      /* 상자를 방금 자기 것이라고 말한 사람에게 이어지는 말이다. */
      void requestPermission();
      void speak('This box is now yours. It will tell you when your medicine is ready.');
      router.replace('/device');
    })();
  }, [router]);

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 px-8 text-center"
         style={{ background: 'var(--color-sc-bg)' }}>
      {state === 'working' ? (
        <>
          <span aria-hidden className="flex items-center text-6xl"><BoxIcon /></span>
          <p className="text-lg font-bold" style={{ color: 'var(--color-sc-ink)' }}>
            Connecting to your box…
          </p>
        </>
      ) : (
        <>
          {/*
            여기까지 왔는데 코드가 없거나 안 맞는다. 사람이 할 수 있는 일이 하나뿐이라
            그것만 말한다 — 다시 비추기. 원인을 설명해도 고칠 수 있는 것이 아니다.
          */}
          <span aria-hidden className="leading-none" style={{ fontSize: 64 }}><CameraIcon /></span>
          <p className="text-lg font-bold" style={{ color: 'var(--color-sc-ink)' }}>
            That code did not work
          </p>
          <button
            onClick={() => router.replace('/camera')}
            className="mt-2 flex h-14 items-center gap-2 rounded-2xl px-6 font-bold text-white"
            style={{ background: 'var(--color-sc-primary)' }}
          >
            <span aria-hidden className="flex items-center text-xl leading-none"><CameraIcon /></span>
            Photograph the box
          </button>
        </>
      )}
    </div>
  );
}
