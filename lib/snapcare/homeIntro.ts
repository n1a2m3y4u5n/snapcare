import { say } from '../i18n/index.ts';

/**
 * 홈이 도착하자마자 하는 말.
 *
 * 왜 따로 꺼내 두는가
 * -------------------
 * 두 곳이 **같은 문장**을 말해야 하기 때문이다 — 홈 화면과, 설정에서 언어를 고를 때의
 * 미리듣기. 미리듣기가 다른 문장을 읽으면 방금 고른 것이 무엇인지 확인할 방법이 없다.
 * 두 곳에 따로 적어 두면 언젠가 한쪽만 고쳐진다.
 *
 * 영어 원문이 여기 있고 번역은 말 꾸러미에 있다(`home.intro`). 번역이 없는 언어는
 * 영어로 떨어진다 — 그 규칙은 이 저장소 전체가 같다.
 */
export const HOME_INTRO_EN =
  'SnapCare. Photograph food or medicine to check it. The big black button takes a photograph.';

/** 그 언어의 홈 인사. 번역이 없으면 영어. */
export function homeIntro(lang: string): string {
  return say(lang, 'home.intro') ?? HOME_INTRO_EN;
}
