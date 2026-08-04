import type { SVGProps } from 'react';

/**
 * 이 앱의 그림들. 이모지를 대신한다.
 *
 * 왜 이모지를 걷어내는가
 * ----------------------
 * 이모지는 **우리가 그린 것이 아니다.** 기기마다 다르게 생겼고(같은 💊 이 안드로이드와
 * iOS 에서 다른 물건처럼 보인다), 크기와 광학 무게를 우리가 못 정하며, 나란히 놓으면
 * 저마다 다른 화가가 그린 것들이 한 줄에 선다. 화면 전체가 그런 줄로 채워지면 그것이
 * 곧 "아무도 디자인하지 않았다" 로 읽힌다.
 *
 * 왜 이 모양인가 — 채운 실루엣
 * ----------------------------
 * 기기 화면이 이미 이 문법을 쓴다. 그리고 그건 취향이 아니라 실물에서 잰 결과였다:
 * 반지름 29의 **채운 원은 2629화소**이고 같은 자리의 외곽선 삼각형은 1127화소라,
 * 그 질량 차이만이 방 건너에서 살아남고 색을 못 보는 사람에게도 남는다
 * (`pill_dispenser/firmware/snapcare_dispenser/display/screens.py`).
 *
 * 앱이 같은 문법을 쓰면 상자와 앱이 한 언어를 쓰게 된다. 요즘 흔한 가는 선 아이콘은
 * 정확히 반대쪽이다 — 작아지면 먼저 사라지는 것이 선이다.
 *
 * 규칙 넷
 * -------
 *  · **24 격자.** 모든 좌표가 그 안에서 떨어진다. 눈금 밖의 값은 크기를 바꿀 때
 *    가장자리가 흐려진다.
 *  · **선을 쓰지 않는다.** `stroke` 가 없으면 확대·축소에 두께가 안 흔들리고,
 *    글자 크기를 다섯 단계로 바꾸는 이 앱에서 그 흔들림은 실제로 보인다.
 *  · **색은 하나, `currentColor`.** 부르는 쪽의 글자색을 따라간다. 그림마다 색을
 *    박아 두면 야간 팔레트에서 그림만 낮에 남는다.
 *  · **구멍은 `fill-rule="evenodd"`.** 흰색으로 덮어 파내지 않는다. 덮으면 배경이
 *    바뀌는 순간 구멍이 흰 점으로 남는다.
 */

export type IconProps = SVGProps<SVGSVGElement> & {
  /** 픽셀이 아니라 글자 크기에 붙인다 — 옆 글자와 같이 커진다. */
  size?: number | string;
  /** 읽어 줄 이름. 없으면 장식으로 본다(`aria-hidden`). */
  title?: string;
};

function Svg({ size = '1em', title, children, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...rest}
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

/* ── 홈에서 갈 수 있는 곳들 ─────────────────────────────────────────────── */

/** 사진 찍기. 이 앱에서 사람이 하는 일은 이것 하나다. */
export const CameraIcon = (p: IconProps) => (
  <Svg {...p}>
    <path
      fillRule="evenodd"
      d="M9 3h6l1.5 2.5H20a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2h3.5L9 3Zm3 5.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 2.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z"
    />
  </Svg>
);

/**
 * 음식. 그릇과 담긴 것.
 *
 * 접시가 아니라 그릇인 이유는 옆에서 본 모양이라 실루엣이 하나로 뭉치기 때문이다 —
 * 위에서 본 접시는 원이고, 원은 이 앱에서 이미 "안전" 이라는 뜻을 갖고 있다.
 */
export const FoodIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 11h18a9 9 0 0 1-9 9 9 9 0 0 1-9-9Z" />
    <path d="M7.5 9a4.5 4.5 0 0 1 9 0h-9Z" />
    <path d="M2 21h20v2H2z" />
  </Svg>
);

/** 약. 캡슐을 기울여 둔다 — 가로로 누우면 알약이 아니라 막대로 읽힌다. */
export const PillIcon = (p: IconProps) => (
  <Svg {...p}>
    <path
      fillRule="evenodd"
      d="M14.8 2.6a5.5 5.5 0 0 1 7.8 7.8l-8.4 8.4a5.5 5.5 0 1 1-7.8-7.8l8.4-8.4Zm-2.6 5.7-5.1 5.1a3 3 0 0 0 4.2 4.2l5.1-5.1-4.2-4.2Z"
    />
  </Svg>
);

/** 약통. 뚜껑이 있는 상자. */
export const BoxIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 6.5A1.5 1.5 0 0 1 3.5 5h17A1.5 1.5 0 0 1 22 6.5V10H2V6.5Z" />
    <path
      fillRule="evenodd"
      d="M3 12h18v7.5A1.5 1.5 0 0 1 19.5 21h-15A1.5 1.5 0 0 1 3 19.5V12Zm6 2.5h6V17H9v-2.5Z"
    />
  </Svg>
);

/** 누구를 위한 판정인가. */
export const PersonIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z" />
    <path d="M3.5 21a8.5 8.5 0 0 1 17 0v.5h-17V21Z" />
  </Svg>
);

/** 설정. */
export const GearIcon = (p: IconProps) => (
  <Svg {...p}>
    <path
      fillRule="evenodd"
      d="m13.6 1.5.5 2.6q.9.3 1.7.8l2.5-.9 2.4 4.1-2 1.7q.1.5.1 1t-.1 1l2 1.7-2.4 4.1-2.5-.9q-.8.5-1.7.8l-.5 2.6h-4.8l-.5-2.6q-.9-.3-1.7-.8l-2.5.9-2.4-4.1 2-1.7q-.1-.5-.1-1t.1-1l-2-1.7 2.4-4.1 2.5.9q.8-.5 1.7-.8l.5-2.6h4.8ZM12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Z"
    />
  </Svg>
);

/* ── 아래 줄 ────────────────────────────────────────────────────────────── */

/** 집으로. */
export const HomeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 2.5 23 12h-3v9h-5.5v-6h-5v6H4v-9H1L12 2.5Z" />
  </Svg>
);

/**
 * 읽어 준다. 이 앱에서 가장 자주 눌리는 그림이다.
 *
 * 파동을 둘만 그린다. 셋을 그리면 작은 크기에서 바깥 호가 먼저 뭉개지는데, 뭉개진
 * 호는 없는 것만 못하다 — 그림이 지저분해 보이는 것으로만 남는다.
 */
export const SpeakerIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M11 4.5v15l-5-4H2.5v-7H6l5-4Z" />
    <path d="M14.4 8.2a5 5 0 0 1 0 7.6l1.6 1.9a7.5 7.5 0 0 0 0-11.4l-1.6 1.9Z" />
    <path d="M17.6 4.4a10 10 0 0 1 0 15.2l1.6 1.9a12.5 12.5 0 0 0 0-19l-1.6 1.9Z" />
  </Svg>
);

/** 읽는 중 — 누르면 멈춘다. */
export const PauseIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="4" width="4.5" height="16" rx="1.5" />
    <rect x="14.5" y="4" width="4.5" height="16" rx="1.5" />
  </Svg>
);

/** 소리를 멈춘다. */
export const StopIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="16" height="16" rx="2.5" />
  </Svg>
);

/* ── 화면 안에서 ────────────────────────────────────────────────────────── */

/** 지금 정해져 있는 것. */
export const ListIcon = (p: IconProps) => (
  <Svg {...p}>
    <path
      fillRule="evenodd"
      d="M9 2h6a1 1 0 0 1 1 1v1h2.5A1.5 1.5 0 0 1 20 5.5v16A1.5 1.5 0 0 1 18.5 23h-13A1.5 1.5 0 0 1 4 21.5v-16A1.5 1.5 0 0 1 5.5 4H8V3a1 1 0 0 1 1-1Zm-2 9h10v2H7v-2Zm0 5h10v2H7v-2Z"
    />
  </Svg>
);

/** 좋다 — 판정에서. */
export const FineIcon = (p: IconProps) => (
  <Svg {...p}>
    <path
      fillRule="evenodd"
      d="M12 1a11 11 0 1 1 0 22 11 11 0 0 1 0-22Zm5.4 7.3-7 7-3.8-3.7-1.8 1.8 5.6 5.5 8.8-8.8-1.8-1.8Z"
    />
  </Svg>
);

/** 조심 — 판정에서. 삼각형은 기기 화면의 '주의' 와 같은 모양이다. */
export const CarefulIcon = (p: IconProps) => (
  <Svg {...p}>
    <path
      fillRule="evenodd"
      d="M12 2 23 21H1L12 2Zm-1.2 6.5v6.2h2.4V8.5h-2.4Zm0 7.6V18.5h2.4v-2.4h-2.4Z"
    />
  </Svg>
);

/** 피하라 — 판정에서. */
export const AvoidIcon = (p: IconProps) => (
  <Svg {...p}>
    <path
      fillRule="evenodd"
      d="M12 1a11 11 0 1 1 0 22 11 11 0 0 1 0-22Zm0 2.6c-4.6 0-8.4 3.8-8.4 8.4 0 1.9.6 3.6 1.7 5l11.7-11.7a8.3 8.3 0 0 0-5-1.7Zm6.7 3.4L7 18.7a8.3 8.3 0 0 0 13.4-6.7c0-1.9-.6-3.6-1.7-5Z"
    />
  </Svg>
);

/* ── 그림열쇠의 열두 글자 ───────────────────────────────────────────────────
 *
 * 이것들은 장식이 아니라 **암호를 이루는 글자**다. 둘이 헷갈리면 사람이 자기 열쇠를
 * 못 누르고, 못 누르면 앱을 못 연다. 그래서 뜻이 예쁜 것보다 **바깥 윤곽이 서로
 * 안 겹치는 것**이 먼저다.
 */

/** 해. 뾰족한 살 여덟. 꽃과 갈라지는 것이 이 뾰족함이다. */
export const SunIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="5" />
    <path d="M11 1h2v4h-2zM11 19h2v4h-2zM1 11h4v2H1zM19 11h4v2h-4z" />
    <path d="m4.2 5.6 1.4-1.4 2.8 2.8-1.4 1.4zM15.6 17 17 15.6l2.8 2.8-1.4 1.4zM5.6 19.8 4.2 18.4 7 15.6 8.4 17zM18.4 4.2l1.4 1.4L17 8.4l-1.4-1.4z" />
  </Svg>
);

/** 달. 초승달을 파낸다 — 덮지 않는다. */
export const MoonIcon = (p: IconProps) => (
  <Svg {...p}>
    <path
      fillRule="evenodd"
      d="M13.4 1.5A10.5 10.5 0 1 0 22.5 15 8.5 8.5 0 0 1 13.4 1.5Z"
    />
  </Svg>
);

/** 물. 위가 뾰족하고 아래가 둥근 방울. 종과는 바닥에서 갈라진다. */
export const DropIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 1.5c4.7 5.4 7 9.2 7 12a7 7 0 0 1-14 0c0-2.8 2.3-6.6 7-12Z" />
  </Svg>
);

/** 불. 흔들리는 혀. 방울과 달리 옆이 비대칭이다. */
export const FireIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13 1c.5 3.5-1.5 5-3.4 7C7.4 10.2 6 12 6 14.5a6 6 0 0 0 12 0c0-2.3-1-4.2-2.6-6-.3 1.2-1 2-2 2.4.7-3.6-.2-7-.4-9.9Z" />
  </Svg>
);

/** 꽃. 두꺼운 잎 다섯. 해와 갈라지는 것이 이 두께다. */
export const FlowerIcon = (p: IconProps) => (
  <Svg {...p}>
    <path
      fillRule="evenodd"
      d="M12 1.5a3.6 3.6 0 0 1 3.4 4.8 3.6 3.6 0 0 1 4.9 4.4 3.6 3.6 0 0 1-1.5 6.6 3.6 3.6 0 0 1-6.8 3 3.6 3.6 0 0 1-6.8-3A3.6 3.6 0 0 1 3.7 10.7a3.6 3.6 0 0 1 4.9-4.4A3.6 3.6 0 0 1 12 1.5Zm0 7.6a2.9 2.9 0 1 0 0 5.8 2.9 2.9 0 0 0 0-5.8Z"
    />
  </Svg>
);

/** 새. 날개를 편 옆모습. */
export const BirdIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M22 5.5 18.5 7A5 5 0 0 0 9 8.6L2 11l5.5 1.5L4 21l7.5-6 3 6 2-7.5 5.5-2-4-2 4-4Z" />
  </Svg>
);

/** 산. 봉우리 둘, 높이가 다르다. */
export const MountainIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8.5 5 16 19H1L8.5 5Z" />
    <path d="M16.5 8 23 19h-9l3-5.5-2-3L16.5 8Z" />
  </Svg>
);

/** 길. 가운데 점선이 이 그림의 전부다 — 없으면 그냥 사다리꼴이다. */
export const RoadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path
      fillRule="evenodd"
      d="M8 2h8l4 20H4L8 2Zm3 2.5h2v3.5h-2V4.5Zm0 6h2V14h-2v-3.5Zm0 6h2v3.5h-2V16.5Z"
    />
  </Svg>
);

/** 문. 손잡이가 붙어야 창문과 안 헷갈린다. */
export const DoorIcon = (p: IconProps) => (
  <Svg {...p}>
    <path
      fillRule="evenodd"
      d="M5 2h14v20H5V2Zm10 9.2a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Z"
    />
  </Svg>
);

/** 종. 바닥을 평평하게 자르고 추를 단다 — 물방울과 갈라지는 자리다. */
export const BellIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 1.5a2 2 0 0 1 2 2v.7a7 7 0 0 1 5 6.7v4.6l2 2.5v1.5H3v-1.5l2-2.5v-4.6a7 7 0 0 1 5-6.7v-.7a2 2 0 0 1 2-2Z" />
    <path d="M9.5 21h5a2.5 2.5 0 0 1-5 0Z" />
  </Svg>
);

/** 열쇠. 고리와 이빨. */
export const KeyIcon = (p: IconProps) => (
  <Svg {...p}>
    <path
      fillRule="evenodd"
      d="M16 1.5a6.5 6.5 0 0 0-6.2 8.5L1.5 18.3V22.5H6v-2.5h2.5v-2.5H11l3-3a6.5 6.5 0 1 0 2-13Zm1 3.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z"
    />
  </Svg>
);

/* ── 사람 여덟 ──────────────────────────────────────────────────────────────
 *
 * 프로필에서 자기를 고르는 그림들. 얼굴 이모지를 대신한다.
 *
 * 사람 여덟을 그리면서 제일 어려운 것은 **서로 달라 보이게 하는 것**이다. 사람
 * 실루엣은 다 비슷해서, 나이를 표정으로 그리면(주름·안경) 작은 크기에서 전부 같은
 * 동그라미가 된다. 그래서 표정이 아니라 **머리 모양과 어깨 폭**으로 가른다 — 그
 * 둘은 32px 에서도 남는다.
 *
 * 저장된 값은 그대로 둔다. 프로필에는 이모지 문자열이 들어 있고 그것이 사람을
 * 가리키는 열쇠이므로, 여기서는 그 문자열을 그림에 잇기만 한다. 값을 바꾸면 이미
 * 쓰던 사람의 얼굴이 남의 것이 된다.
 */

/** 어른. 기준이 되는 몸. */
const AdultIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="7" r="4.2" />
    <path d="M4 22a8 8 0 0 1 16 0Z" />
  </Svg>
);

/** 아이. 머리가 크고 어깨가 좁다. */
const ChildIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="7.5" r="5" />
    <path d="M6.5 22a5.5 5.5 0 0 1 11 0Z" />
  </Svg>
);

/** 아기. 머리가 더 크고 몸이 짧다. */
const BabyIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="5.8" />
    <path d="M7.5 22a4.5 4.5 0 0 1 9 0Z" />
    <circle cx="12" cy="2.5" r="1.4" />
  </Svg>
);

/** 노인. 지팡이가 이 그림을 다른 일곱에서 갈라낸다. */
const ElderIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10.5" cy="6.5" r="4" />
    <path d="M3.5 22a7 7 0 0 1 14 0Z" />
    <path d="M19 9h2v13h-2z" />
  </Svg>
);

/** 머리를 묶은 사람. */
const TiedHairIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="7" r="4.2" />
    <path d="M16.4 4.5a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4Z" />
    <path d="M4 22a8 8 0 0 1 16 0Z" />
  </Svg>
);

/** 수염이 있는 사람. */
const BeardIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="6.5" r="4" />
    <path d="M8.4 9.5h7.2a3.6 3.6 0 0 1-7.2 0Z" />
    <path d="M4 22a8 8 0 0 1 16 0Z" />
  </Svg>
);

/** 짧은 머리의 젊은 사람. 어깨가 각지다. */
const BoyIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="7" r="4.2" />
    <path d="M5 22v-3a7 7 0 0 1 14 0v3Z" />
  </Svg>
);

/** 긴 머리의 젊은 사람. */
const GirlIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 2.2a4.6 4.6 0 0 1 4.6 4.6V12h-1.8a4.6 4.6 0 0 1-5.6 0H7.4V6.8A4.6 4.6 0 0 1 12 2.2Z" />
    <path d="M4.5 22a7.5 7.5 0 0 1 15 0Z" />
  </Svg>
);

/**
 * 저장된 얼굴 값 → 그림.
 *
 * 모르는 값이면 어른으로 떨어진다. 옛 기록이나 다른 기기에서 온 값이 그림 없는
 * 빈칸이 되면, 사람을 가리키는 자리가 통째로 비어 보인다.
 */
export const FACE_ICONS: Record<string, (p: IconProps) => React.ReactNode> = {
  '🧑': AdultIcon,
  '🧒': ChildIcon,
  '👶': BabyIcon,
  '🧓': ElderIcon,
  '👩': TiedHairIcon,
  '👨': BeardIcon,
  '👦': BoyIcon,
  '👧': GirlIcon,
};

export function FaceIcon({ face, ...rest }: IconProps & { face: string }) {
  const Found = FACE_ICONS[face] ?? AdultIcon;
  return <Found {...rest} />;
}
