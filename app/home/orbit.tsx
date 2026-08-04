'use client';

import { useRouter } from 'next/navigation';

import { orbitSpots } from '@/lib/home/orbit';
import { CameraIcon } from '@/components/icons';

/**
 * 카메라를 가운데, 나머지를 그 둘레에.
 *
 * 왜 이 모양인지는 lib/home/orbit.ts 맨 위에 적었다. 요약하면, 이 앱에서 사람이
 * 하는 일은 사진을 찍는 것 하나이고 나머지는 그 결과를 되짚는 것인데, 홈이 세로로
 * 긴 목록이라 그 하나가 여덟 개 중 하나로 보였다.
 *
 * 접근성에서 조심한 것 셋
 * -----------------------
 *  · **DOM 순서가 화면 순서와 다르다.** 위성은 절대 위치라 눈에는 원형이지만,
 *    키보드와 스위치 스캐닝은 DOM 순서를 따른다. 그래서 카메라를 DOM 에서 맨 앞에
 *    둔다 — 훑어 나가는 사람이 가장 먼저 만나는 것이 이 앱의 요점이어야 한다.
 *  · **위성이 44px 보다 훨씬 크다.** 원 위에 놓인 표적은 사각형 목록보다 겨누기
 *    어렵다. 손이 떨리는 사람을 포함하는 앱이라 그만큼 키웠다(컨테이너의 20%,
 *    440px 폭에서 88px).
 *  · **글자를 지우지 않았다.** 그림 밑에 이름이 붙는다. 위성이 그림뿐이면 무엇인지
 *    아는 방법이 눌러 보는 것밖에 없고, 이 화면에서 잘못 누르면 되돌아오는 길을
 *    또 찾아야 한다.
 */

export interface Satellite {
  /**
   * 그림. 이모지가 아니라 우리가 그린 것을 받는다.
   *
   * 이모지는 기기마다 다르게 생기고 크기와 광학 무게를 우리가 못 정한다. 다섯 개를
   * 나란히 놓으면 저마다 다른 화가가 그린 것들이 한 줄에 서고, 그 줄은 곧 "아무도
   * 디자인하지 않았다" 로 읽힌다.
   */
  icon: (props: { size?: number | string }) => React.ReactNode;
  label: string;
  href: string;
  /** 소리로 읽어 줄 문장. 이름만으로는 무엇을 하는 곳인지 안 서는 것들이 있다. */
  say: string;
  /** 눈에 띄어야 하는 것 — 지금 볼 것이 있다는 표시 */
  badge?: number;
}

export function Orbit({ satellites }: { satellites: Satellite[] }) {
  const router = useRouter();
  const spots = orbitSpots(satellites.length);

  return (
    /*
      폭을 화면에 맞추되 상한을 둔다.

      300px 이었다. 그러면 폰에서 화면 폭의 8할만 쓰고 나머지가 여백으로 남는데,
      이 원이 홈의 전부인 화면에서 그 여백은 "덜 만든 화면" 으로 읽힌다. 상한을
      올리고 세로로도 남는 자리에 맞춘다(`min()` 이 둘 중 작은 쪽을 고른다) —
      그래야 카드가 하나 뜬 날에도 원이 잘리지 않는다.

      상한이 여전히 있는 이유: 태블릿에서 지름 400px 짜리 원이 되면 위성 사이가
      한 엄지로 닿지 않는 거리가 된다.
    */
    <div className="relative mx-auto aspect-square w-full"
         style={{ maxWidth: 'min(100%, 68vh, 420px)' }}>
      {/*
        가운데. DOM 에서 맨 앞이라 키보드·스캐닝이 여기부터 만난다.
        컨테이너의 40% — 340px 상자에서 136px 이다. 전에는 96px 였다.
      */}
      {/*
        가운데는 **검정**이다. 파랑이었다.

        둘레의 다섯이 이미 파랑이라, 가운데도 파랑이면 여섯 개가 한 색으로 앉는다.
        한 벌로 읽히는 것은 맞는데 그 대가로 **가운데가 다른 것들 중 하나**가 된다.
        이 화면은 여섯 중 하나를 고르라는 화면이 아니라 사진을 찍으라는 화면이고,
        나머지 다섯은 그 결과를 되짚는 곳이다.

        크기로는 부족했다 — 가운데가 이미 두 배 넘게 큰데도 같은 색이면 "같은 것들
        중 큰 것" 으로 읽힌다. 색이 갈려야 종류가 갈린다.

        검정을 고른 것은 이 앱에서 뜻이 안 붙은 유일한 진한 색이어서다. 초록·주황·
        빨강은 판정이고, 파랑은 "누르는 것", 크림색은 복약이다. 검정은 글자 색이라
        어디에도 안 묶여 있고, 흰 그림과 20:1 로 붙는다.
      */}
      <button
        onClick={() => router.push('/camera')}
        aria-label="Scan something with the camera. Point it at food or medicine."
        className="absolute left-1/2 top-1/2 flex aspect-square w-[46%] -translate-x-1/2 -translate-y-1/2
                   flex-col items-center justify-center gap-1 rounded-full text-white shadow-lg
                   active:scale-95 transition-transform"
        style={{ background: 'var(--color-sc-ink)' }}
      >
        {/*
          이 카메라만 외곽선이었다. 둘레의 다섯이 채운 실루엣인데 가운데 하나가
          선으로 그려져 있으면, 화면에서 가장 큰 그림이 나머지와 다른 화가의 것이
          된다 — 그리고 이 앱에서 가장 큰 그림이 곧 이 앱이 하는 일이다.
        */}
        <CameraIcon size="38%" />
        {/*
          이름을 버튼 **안**에 둔다.

          두 번 옮겼다. 처음에는 버튼 밑에 절대 위치로 얹었는데 아래 위성 둘에
          깔렸고, 그래서 원 밖으로 내보냈더니 이번에는 버튼에서 반 통이나 떨어져
          무엇의 이름인지가 안 붙었다. 안에 두면 둘 다 안 생긴다.
        */}
        <span aria-hidden className="text-[13px] font-bold leading-none">Scan</span>
      </button>

      {satellites.map((s, i) => (
        <button
          key={s.href}
          onClick={() => router.push(s.href)}
          aria-label={s.say}
          className="absolute flex aspect-square w-[20%] -translate-x-1/2 -translate-y-1/2 flex-col
                     items-center justify-center rounded-full bg-white shadow-sm
                     active:scale-95 transition-transform"
          style={{ left: `${spots[i].left}%`, top: `${spots[i].top}%` }}
        >
          {/*
            둘레는 파랑이다.

            검정으로 두면 다섯이 배경 위의 얼룩처럼 앉는다. 파랑은 이 앱에서 이미
            "누르는 것" 의 색이라 뜻과 색이 맞고, 다섯이 한 벌로 읽힌다.

            가운데가 검정이 되면서 이 파랑이 하는 일이 하나 늘었다 — **가운데와 다른
            색**인 것 자체가 "저기가 본론이고 여기는 곁" 이라는 말이 된다.

            이름은 파랑으로 안 칠한다. 색을 다 파랑으로 덮으면 그림과 글자의 무게가
            같아져서 어느 쪽을 먼저 보는지가 안 정해진다.
          */}
          <span aria-hidden className="flex items-center justify-center text-2xl leading-none"
                style={{ color: 'var(--color-sc-primary)' }}>{s.icon({})}</span>
          <span aria-hidden className="mt-0.5 px-1 text-center text-[9px] font-bold leading-tight"
                style={{ color: 'var(--color-sc-muted)' }}>
            {s.label}
          </span>
          {/*
            지금 볼 것이 있다는 표시. 숫자를 못 읽어도 **점이 붙었다**는 것은 보이고,
            그것만으로도 "여기 뭔가 있다" 는 뜻이 선다.
          */}
          {s.badge !== undefined && s.badge > 0 && (
            /*
              px 로 박는다. rem 이면 글자 크기를 가장 크게 한 사람에게 배지가
              위성의 절반만 해져서 **얼굴 그림을 덮는다** — 무엇을 가리키는
              표시인지가 그 표시 때문에 안 보이게 된다.

              배지는 "여기 뭔가 있다" 만 말하면 되고, 그 뜻은 크기와 무관하다.
            */
            <span aria-hidden
                  className="absolute right-0 top-0 flex items-center justify-center rounded-full
                             font-bold text-white"
                  style={{
                    background: 'var(--color-caution)',
                    width: 20, height: 20, fontSize: 11, lineHeight: '20px',
                  }}>
              {s.badge > 9 ? '9+' : s.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
