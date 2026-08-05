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
      {/*
        글자를 뺐다.

        "Scan" 이 사진기 그림 아래 붙어 있었다. 이 화면을 쓰는 사람은 글을 못 읽는데,
        그러면 그 다섯 글자는 **아무에게도 안 읽히면서 사진기만 작게 만든다.** 뜻은
        이미 그림이 지고 있다 — 사진기는 이 앱에서 배우지 않아도 아는 몇 안 되는
        기호에 속하고, 눌러야 할 것이 화면에 이것 하나뿐이라 헷갈릴 것도 없다.

        읽어 주는 이름은 `aria-label` 로 남아 있다. 없앤 것은 보이는 글자뿐이고,
        귀로 듣는 사람은 전보다 더 긴 설명을 그대로 받는다.
      */}
      <CameraIcon size="44%" />
    </button>
  );
}

/**
 * 아래 한 줄 — 되짚는 곳들과 지금 누구인지.
 *
 * **동그라미 다섯이 아니라 칸 나눈 막대 하나.**
 *
 * 동그라미로 두었을 때 이 줄은 "따로 떠 있는 것 다섯" 으로 보였다. 실제로는 같은
 * 종류의 것 다섯이고 — 전부 "여기 말고 저기로 간다" 이다 — 그러면 한 덩어리로 보이는
 * 편이 그 뜻에 맞는다. 그리고 표적이 커진다: 동그라미는 56px 이었지만 칸은 줄 높이
 * 전체(64px)에 폭도 화면의 1/5 이라, 손이 떨려도 자기 칸 안에 들어간다.
 *
 * 이름을 뺐다
 * -----------
 * 이 저장소는 "그림뿐이면 무엇인지 아는 방법이 눌러 보는 것밖에 없다" 고 적어 두었고,
 * 그 말은 지금도 맞다. 대신 두 가지가 그 자리를 메운다: 칸마다 `aria-label` 로 한
 * 문장이 붙어 있고(스크린리더와 꾹 눌러 듣기가 그것을 읽는다), 홈에 도착하면 인사말이
 * 저절로 나간다. 글자를 지운 만큼 그림이 커졌다 — 28px 에서 30px 로.
 *
 * `extra` 는 프로필이다. 컴포넌트로 받는 이유는 그것이 링크가 아니라 **열리는 것**
 * 이어서다(사람 목록이 위로 펼쳐진다). 여기서 흉내 내면 두 벌이 되고, 두 벌은
 * 언젠가 갈라진다.
 */
export function Dock({ satellites, extra }: { satellites: Satellite[]; extra?: React.ReactNode }) {
  const router = useRouter();
  return (
    /*
      `overflow-hidden` 을 쓰면 안 된다.

      끝 칸의 모서리를 둥글게 자르려고 붙였는데, 그러면 이 줄 **안에서 열리는 것**이
      같이 잘린다 — 프로필 목록이 위로 펼쳐지는데 그림자만 보이고 목록은 안 보였다.
      모서리는 첫 칸과 끝 칸에 따로 둥글게 준다.
    */
    <div className="flex items-stretch rounded-3xl bg-white shadow-sm">
      {satellites.map((s, i) => (
        <button
          key={s.href}
          onClick={() => router.push(s.href)}
          aria-label={s.say}
          /* 위아래 여백을 px 로 못박는다 — 틀은 px, 내용은 rem. rem 이면 가장 큰
             글자에서 이 줄이 98px 로 부풀고, 그만큼이 카메라에서 빠진다. */
          /*
            누르는 동안 **강조 초록**이 옅게 깔린다.

            전에는 배경색(오프화이트)이 깔렸는데, 이 줄 자체가 흰 바탕이라 눌러도
            거의 안 바뀌었다. 글을 못 읽는 사람에게 "눌렸다" 를 알리는 것은 색 하나
            뿐이고, 그 색이 안 보이면 사람은 한 번 더 누른다.

            채움이 아니라 옅은 물이라 그 위의 그림은 여전히 기본색(11:1)이다 — 강조
            초록은 흰 바탕에서 3.06:1 이라 그림 색으로는 못 쓴다.
          */
          className={`relative flex min-w-0 flex-1 items-center justify-center
                      active:bg-[color-mix(in_srgb,var(--color-sc-accent)_18%,white)] transition-colors
                      ${i === 0 ? 'rounded-l-3xl' : ''}`}
          /*
            칸과 칸 사이의 실선. 테두리로 그리면 첫 칸에만 없어야 해서 조건이 붙는데,
            그 조건은 칸 순서가 바뀌는 날 잊힌다. 왼쪽에만 긋고 첫 칸에서 끈다.
          */
          style={{ paddingTop: 16, paddingBottom: 16,
                   ...(i === 0 ? {} : { borderLeft: '1px solid var(--color-sc-line)' }) }}
        >
          <span aria-hidden className="flex items-center justify-center"
                style={{ color: 'var(--color-sc-primary)' }}>
            {s.icon({ size: 30 })}
          </span>
          {s.badge !== undefined && s.badge > 0 && (
            /*
              px 로 박는다. rem 이면 글자를 가장 크게 한 사람에게 배지가 그림의 절반만
              해져서 무엇을 가리키는 표시인지가 그 표시 때문에 안 보인다.
            */
            <span aria-hidden
                  className="absolute flex items-center justify-center rounded-full font-bold text-white"
                  style={{ top: 8, right: '22%', background: 'var(--color-caution)',
                           width: 18, height: 18, fontSize: 10, lineHeight: '18px' }}>
              {s.badge}
            </span>
          )}
        </button>
      ))}
      {extra && (
        <div className="flex min-w-0 flex-1 items-center justify-center rounded-r-3xl"
             style={{ borderLeft: '1px solid var(--color-sc-line)' }}>
          {extra}
        </div>
      )}
    </div>
  );
}
