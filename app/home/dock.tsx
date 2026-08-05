'use client';

import { useRouter } from 'next/navigation';

import { CameraIcon } from '@/components/icons';

/**
 * 홈의 두 덩어리 — 가운데의 카메라와, 아래 한 줄에 늘어선 나머지.
 *
 * 궤도에서 줄로
 * -------------
 * 나머지 넷을 카메라 둘레의 원 위에 놓고 있었다. 그 배치가 답하려던 물음은 옳았다 —
 * 이 앱에서 사람이 하는 일은 사진을 찍는 것 하나이고 나머지는 그 결과를 되짚는 것인데,
 * 세로로 긴 목록에서는 그 하나가 여덟 중 하나로 보였다.
 *
 * 그런데 원은 **자리를 비싸게 쓴다.** 넷을 둘레에 놓으려면 카메라 지름의 두 배쯤
 * 되는 정사각형이 필요하고, 그 사각형의 네 귀퉁이는 늘 빈다. 화면을 못박고 나서
 * (홈은 스크롤이 없다) 그 빈 귀퉁이가 곧 카메라가 못 쓴 자리가 됐다.
 *
 * 줄로 내리면 그 자리가 카메라로 간다. 그리고 원 위의 표적보다 줄 위의 표적이 겨누기
 * 쉽다 — 손가락이 가로로만 움직이면 되고, 아래 낭독 줄과 같은 높이대에 모여 "누르는
 * 것들은 여기 아래" 라는 규칙이 하나로 선다.
 *
 * 접근성에서 지킨 것
 * ------------------
 *  · **DOM 순서가 화면 순서와 같다.** 원일 때는 절대 위치라 둘이 어긋났고, 그래서
 *    카메라를 DOM 맨 앞에 억지로 두어야 했다. 줄에서는 그럴 필요가 없다.
 *  · **표적은 56px.** WCAG 2.5.8 이 요구하는 24 의 두 배가 넘는다. 이 앱은 손이
 *    떨리는 사람을 포함한다.
 *  · **글자를 지우지 않았다.** 그림뿐이면 무엇인지 아는 방법이 눌러 보는 것뿐이고,
 *    잘못 누르면 되돌아오는 길을 또 찾아야 한다.
 */

export interface Satellite {
  /**
   * 그림. 이모지가 아니라 우리가 그린 것을 받는다.
   *
   * 이모지는 기기마다 다르게 생기고 크기와 광학 무게를 우리가 못 정한다. 넷을 나란히
   * 놓으면 저마다 다른 화가가 그린 것들이 한 줄에 서고, 그 줄은 곧 "아무도 디자인하지
   * 않았다" 로 읽힌다.
   */
  icon: (props: { size?: number | string }) => React.ReactNode;
  label: string;
  href: string;
  /** 소리로 읽어 줄 문장. 이름만으로는 무엇을 하는 곳인지 안 서는 것들이 있다. */
  say: string;
  /** 눈에 띄어야 하는 것 — 지금 볼 것이 있다는 표시 */
  badge?: number;
}

/**
 * 사진 찍기. 이 화면에서 사람이 하는 일이다.
 *
 * 남는 자리를 다 쓰되 상한을 둔다. 태블릿에서 지름 400px 짜리 원이 되면 손가락이
 * 가장자리까지 가야 하고, 그 크기는 더 이상 겨누기 쉬운 것이 아니다.
 *
 * 검정인 이유: 이 앱에서 뜻이 안 붙은 유일한 진한 색이다. 초록·주황·빨강은 판정이고,
 * 파랑은 "누르는 것", 크림색은 복약이다. 둘레의 넷과 색이 갈려야 종류가 갈린다.
 */
export function BigCamera() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push('/camera')}
      aria-label="Scan something with the camera. Point it at food or medicine."
      /*
        지름을 **칸의 짧은 쪽**에서 뽑는다(`sc-round`, globals.css).

        처음에는 `aspect-square h-full` 이었다. 높이를 꽉 채우라고 하면서 폭에 상한을
        두면 둘이 싸우고, 정사각형 규칙이 진다 — 화면에 길쭉한 타원이 떴다. 궤도에서
        이미 같은 결함을 만났다. 한 변만 정해 주면 나머지는 따라온다.
      */
      className="sc-round mx-auto flex aspect-square items-center justify-center
                 rounded-full text-white shadow-lg active:scale-95 transition-transform"
      style={{ background: 'var(--color-sc-ink)' }}
    >
      <span className="flex flex-col items-center justify-center gap-1">
        <CameraIcon size="44%" />
        {/*
          이름을 단추 **안**에 둔다. 밖에 얹으면 아래 줄과 겹치고, 원 밖으로 내보내면
          무엇의 이름인지가 안 붙는다.
        */}
        <span aria-hidden className="text-[13px] font-bold leading-none">Scan</span>
      </span>
    </button>
  );
}

/**
 * 아래 한 줄 — 되짚는 곳들과 지금 누구인지.
 *
 * `extra` 는 프로필이다. 컴포넌트로 받는 이유는 그것이 링크가 아니라 **열리는 것**
 * 이어서다(사람 목록이 위로 펼쳐진다). 여기서 흉내 내면 두 벌이 되고, 두 벌은
 * 언젠가 갈라진다.
 */
export function Dock({ satellites, extra }: { satellites: Satellite[]; extra?: React.ReactNode }) {
  const router = useRouter();
  return (
    <div className="flex items-start justify-between gap-1 px-1">
      {satellites.map((s) => (
        <button
          key={s.href}
          onClick={() => router.push(s.href)}
          aria-label={s.say}
          className="relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl py-1
                     active:scale-95 transition-transform"
        >
          <span aria-hidden
                className="flex shrink-0 items-center justify-center rounded-full bg-white shadow-sm"
                style={{ width: 56, height: 56, color: 'var(--color-sc-primary)' }}>
            {s.icon({ size: 28 })}
          </span>
          <span aria-hidden className="w-full text-center text-[10px] font-bold leading-tight"
                style={{ color: 'var(--color-sc-muted)' }}>
            {s.label}
          </span>
          {s.badge !== undefined && s.badge > 0 && (
            /*
              px 로 박는다. rem 이면 글자를 가장 크게 한 사람에게 배지가 그림의 절반만
              해져서 무엇을 가리키는 표시인지가 그 표시 때문에 안 보인다.
            */
            <span aria-hidden
                  className="absolute flex items-center justify-center rounded-full font-bold text-white"
                  style={{ top: 0, right: '18%', background: 'var(--color-caution)',
                           width: 18, height: 18, fontSize: 10, lineHeight: '18px' }}>
              {s.badge}
            </span>
          )}
        </button>
      ))}
      {/* `py-1` 은 위의 단추들과 **같은 값**이어야 한다. 없으면 이 하나만 이름이
          몇 px 아래로 내려가고, 한 줄에서 그 어긋남은 눈에 띈다. */}
      {extra && <div className="flex min-w-0 flex-1 justify-center py-1">{extra}</div>}
    </div>
  );
}
