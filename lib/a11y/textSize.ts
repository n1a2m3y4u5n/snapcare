/**
 * 글자 크기.
 *
 * 왜 기본을 크게 두는가
 * ---------------------
 * 이 앱의 사용자는 노안이 온 어르신을 포함하고, 그런 분들은 폰 자체를 큰 글씨로
 * 맞춰 쓰는 경우가 많다. 그러니 설정을 만들어 두면 되지 않느냐 — 그런데 **그
 * 설정을 찾으려면 글을 읽어야 한다.** 작아서 못 읽는 화면 안에 "글자 크기" 라는
 * 작은 글자가 있는 셈이고, 그 설정은 필요한 사람이 못 켠다.
 *
 * 그래서 기본을 한 단계 키운다. 큰 글씨가 필요 없는 사람은 줄이면 되는데, 그쪽은
 * 화면을 읽을 수 있으므로 설정을 찾을 수 있다. **못 읽는 쪽을 기본으로 두는 것이
 * 맞다.**
 *
 * 어떻게 키우는가
 * ---------------
 * 뿌리 글꼴 크기 하나만 바꾼다. Tailwind 의 크기가 전부 rem 이라(`text-sm` 은
 * 0.875rem, `h-11` 은 2.75rem) 글자도 여백도 표적도 같은 비율로 커진다. 글자만
 * 키우면 44px 표적이 그대로 남아 손끝은 여전히 작은 것을 겨눠야 한다.
 *
 * 다만 그래서 **레이아웃이 밀린다.** 한 단계씩만 두고 실제 화면에서 확인한 값이다.
 */

export const TEXT_SIZES = ['normal', 'large', 'largest'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

/**
 * 뿌리 글꼴 크기(px). 브라우저 기본이 16 이다.
 *
 * `large` 가 기본값이다. 18px 은 16 대비 12.5% 인데, 이보다 키우면 판정 화면의
 * 픽토그램 줄과 영양 게이지가 한 화면에 안 들어간다 — 그 둘이 같이 보이는 것이
 * 그 화면의 요점이라 거기서 끊었다.
 */
export const ROOT_PX: Record<TextSize, number> = {
  normal: 16,
  large: 18,
  largest: 21,
};

/** 화면에 낼 이름. 크기 차이를 글자 자체로도 보인다 — 이름을 못 읽어도 고를 수 있게. */
export const TEXT_SIZE_LABEL: Record<TextSize, string> = {
  normal: 'Normal',
  large: 'Large',
  largest: 'Largest',
};

export function isTextSize(v: unknown): v is TextSize {
  return typeof v === 'string' && (TEXT_SIZES as readonly string[]).includes(v);
}

/**
 * 뿌리에 크기를 건다.
 *
 * `document.documentElement.style.fontSize` 를 쓴다. CSS 변수로 두고 `html` 에서
 * 읽게 하면 한 단계 더 도는데, 그 사이에 첫 그림이 기본 크기로 한 번 그려진다 —
 * 큰 글씨가 필요한 사람에게 화면이 한 번 깜빡이며 작아졌다 커진다.
 */
export function applyTextSize(size: TextSize): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.fontSize = `${ROOT_PX[size]}px`;
}
