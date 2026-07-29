/**
 * 설문 안에 넣는 데모 사례.
 *
 * 왜 스크린샷이 아니라 동작하는 것을 넣는가. 설문의 A3 은 "음성이 문서 설명을
 * 충분히 대신합니까" 를 묻는데, **정지 화면으로는 음성을 판단할 수 없다.** 우리는
 * 보여주지 않은 것을 평가해 달라고 하고 있었다. 소리를 들려주면 그 문항이 처음으로
 * 성립한다.
 *
 * 그리고 모두가 같은 것을 본다. 어떤 사람은 앱을 열어 보고 어떤 사람은 그림만 봤다면
 * 답을 나란히 놓을 수 없다 — 분모가 성립하지 않는다.
 *
 * 카메라·OCR·계정은 넣지 않는다. 판단에 필요한 것은 **출력** 이고, 입력 경로는
 * 설문에서 물어야 할 것이 아니다.
 *
 * DSL 은 배포된 /api/pictogram 으로 한 줄씩 검증했다. `\storage_fridge` 처럼
 * 단독으로 쓸 수 없는 형태소가 있어서(수정자이므로 머리 형태소에 붙여야 한다)
 * 눈으로 짐작하지 않고 실제로 요청해 확인했다.
 */

import type { Lang } from './items';

export type DemoCase = {
  id: string;
  /** 처방 원문. 응답자에게 "우리가 받은 입력" 으로 보여준다. */
  rx: Record<Lang, string>;
  /** SIGIL DSL. 한 줄이 픽토그램 한 장이 된다. */
  dsl: string;
  /** 이 사례를 왜 골랐는지. 화면에 나가지 않는다. */
  why: string;
};

export const DEMO: DemoCase[] = [
  {
    id: 'amoxicillin',
    rx: {
      ko: '아목시실린 캡슐 250mg — 하루 세 번, 식사와 함께. 1회 1캡슐. 냉장 보관.',
      en: 'Amoxicillin capsules 250 mg — three times daily with food. One capsule each time. Keep refrigerated.',
      ro: 'Amoxicilină capsule 250 mg — de trei ori pe zi, cu mâncare. O capsulă de fiecare dată. A se păstra la frigider.',
    },
    dsl: [
      '\\capsule_strip{\\time_morning}',
      '\\capsule_strip{\\time_noon}',
      '\\capsule_strip{\\time_evening}',
      '\\pill_bottle{\\qty_one}',
      '\\pill_bottle{\\storage_fridge}',
    ].join('\n'),
    why: '가장 흔한 형태. 시간 세 번 + 수량 + 보관. 수량 오독이 곧 복용량 오류이므로 가장 위험한 축이 들어 있다.',
  },
  {
    id: 'empty-stomach',
    rx: {
      ko: '공복에 복용. 1회 2정. 술을 마시지 마십시오. 땅콩이 든 음식을 피하십시오.',
      en: 'Take on an empty stomach. Two tablets each time. Do not drink alcohol. Avoid foods containing peanut.',
      ro: 'A se lua pe stomacul gol. Două tablete de fiecare dată. Nu consumați alcool. Evitați alimentele care conțin arahide.',
    },
    dsl: [
      '\\tablet_blister{\\food_empty_bowl}',
      '\\tablet_blister{\\qty_two}',
      '\\no_alcohol',
      '\\no{\\allergen_peanut}',
    ].join('\n'),
    why: '어려운 쪽. 공복은 물체가 아닌 조건이고, 금지와 알레르기는 잘못 읽히면 곧바로 위험하다. 우리 설계가 어디서 무너지는지 보려면 이 사례가 필요하다.',
  },
];
