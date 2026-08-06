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
 *
 * 색만 말하지 않는다
 * ------------------
 * "큰 **검은** 단추" 였다. 단추가 어두운 초록이 되면서 그 말이 틀렸다 — 그리고 색
 * 하나에 기대는 문장은 색이 바뀔 때마다 일곱 군데(영어 + 여섯 언어)가 같이 낡는다.
 * 그 일이 실제로 일어났고, 화면과 말이 어긋난 채로 남아 있었다.
 *
 * 그래서 **자리와 크기를 같이 말한다** — "가운데 큰 초록 단추". 색을 못 가리는 사람
 * 에게도 "가운데 큰 것" 은 남고, 색이 또 바뀌어도 문장의 절반은 계속 맞는다.
 */
export const HOME_INTRO_EN =
  'SnapCare. Photograph food or medicine to check it. The big green button in the middle takes a photograph.';

/** 그 언어의 홈 인사. 번역이 없으면 영어. */
export function homeIntro(lang: string): string {
  return say(lang, 'home.intro') ?? HOME_INTRO_EN;
}
