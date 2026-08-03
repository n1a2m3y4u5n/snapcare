'use client';

import { useEffect } from 'react';

import { usePreferences } from '@/stores/preferences';
import { applyTextSize } from '@/lib/a11y/textSize';

/**
 * 고른 글자 크기를 화면 전체에 건다.
 *
 * 뿌리 글꼴 크기 하나만 바꾼다. Tailwind 의 크기가 전부 rem 이라 글자도 여백도
 * 표적도 같은 비율로 커진다 — 글자만 키우면 44px 짜리 버튼은 그대로라, 큰 글씨가
 * 필요한 사람이 여전히 작은 것을 겨눠야 한다.
 *
 * 왜 컴포넌트인가: 저장된 값은 브라우저에만 있고, 서버가 그린 HTML 에는 크기를
 * 실을 수가 없다. 붙은 뒤에 한 번 건다. 그 한 프레임 동안 기본 크기로 보이는데,
 * 뿌리 크기라 다시 그리는 것이 아니라 배율만 바뀌므로 내용이 흔들리지는 않는다.
 */
export function TextSize() {
  const size = usePreferences((s) => s.textSize);
  useEffect(() => { applyTextSize(size); }, [size]);
  return null;
}
