import type { SayPack } from './types.ts';
import { ko } from './say/ko.ts';
import { id } from './say/id.ts';
import { ur } from './say/ur.ts';
import { bn } from './say/bn.ts';
import { ha } from './say/ha.ts';
import { ro } from './say/ro.ts';

/**
 * 언어별 말 꾸러미.
 *
 * 영어는 없다 — 원문이 `lib/snapcare/dslSpeech.ts` 의 CONCEPT 에 있고, 그것이 이
 * 앱의 뜻을 정하는 자리다. 여기에 영어를 한 벌 더 두면 둘이 갈라지고, 갈라진 순간
 * 어느 쪽이 참인지 아무도 모르게 된다.
 *
 * ── 번역의 한계를 밝힌다 ──────────────────────────────────────────────────
 *
 * 이 번역은 **원어민 임상 검수를 받지 않았다.** 복약 지시의 오역은 이 앱이 막으려는
 * 바로 그 해를 끼치는 종류라, 그 사실을 코드와 화면 양쪽에 남긴다(설정 화면에도
 * 같은 말이 있다).
 *
 * 검수를 붙이는 방법도 정해 두었다: 조사에 답해 준 34명 중 여섯 나라의 임상가가
 * 있고, 이 표는 열쇠 하나에 문장 하나인 평평한 구조라 그대로 보내 되받을 수 있다.
 * §5.10 의 현장 평가에 이 항목을 넣는다.
 */
export const PACKS: Record<string, SayPack> = { ko, id, ur, bn, ha, ro };

export function packFor(lang: string): SayPack | null {
  return PACKS[lang] ?? null;
}

/**
 * 그 언어의 말을 찾는다. 없으면 null — 부르는 쪽이 영어로 떨어진다.
 *
 * 빠진 열쇠를 지어내지 않는 것이 요점이다. 번역이 없는 자리에서 영어가 나오면
 * 사용자는 "이 줄은 못 알아듣겠다" 로 끝나지만, 비슷한 말을 만들어 넣으면 알아듣고
 * **틀린 것을 한다.**
 */
export function say(lang: string, key: string): string | null {
  return packFor(lang)?.phrases[key] ?? null;
}
