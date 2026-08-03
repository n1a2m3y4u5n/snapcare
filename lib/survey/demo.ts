/**
 * 설문 안에 넣는 데모 사례.
 *
 * 왜 스크린샷이 아니라 동작하는 것을 넣는가. 설문은 "그림과 음성만으로 충분합니까" 를
 * 묻는데, **정지 화면으로는 음성을 판단할 수 없다.** 우리는 보여주지 않은 것을
 * 평가해 달라고 하고 있었다. 소리를 들려주면 그 문항이 처음으로 성립한다.
 *
 * 그리고 모두가 같은 것을 본다. 어떤 사람은 앱을 열어 보고 어떤 사람은 그림만 봤다면
 * 답을 나란히 놓을 수 없다 — 분모가 성립하지 않는다.
 *
 * ## 처방전 원본을 함께 보여준다
 *
 * 처음에는 처방 문구만 한 줄로 적어 두었다. 그것으로는 우리가 무엇을 한 것인지
 * 전해지지 않는다. 우리가 하는 일은 **처방전이라는 문서를 그림으로 바꾸는 것**
 * 이므로, 바뀌기 전의 문서가 보여야 바뀐 뒤가 의미를 갖는다. `image` 는 앱이
 * 표본으로 쓰는 실제 파일이고, 카메라로 찍은 사진과 같은 경로로 들어간다.
 *
 * ## DSL 을 손으로 쓰지 않는다
 *
 * 전에는 이 파일의 DSL 을 사람이 적었다. 그것이 잘못이었다 — 손으로 적으면 우리가
 * 보여주고 싶은 것만 남고, 엔진이 실제로 뽑아내는 것과 어긋난다. 실제로 어긋나 있었다.
 * 손으로 적은 아목시실린 사례는 다섯 줄이었으나, 같은 처방전을 엔진에 넣으면 열 줄이
 * 나온다 — 7일 완주, 금주, 임신 금지, 수유 주의가 손으로 적을 때 빠져 있었다.
 * 우리 엔진을 우리가 과소평가해 보여주고 있었던 셈이다.
 *
 * 그래서 아래 DSL 은 전부 앱의 실제 경로를 태워 받은 것이다.
 *
 *   ocrToScanItem(처방전 문구) → itemToDsl(item, false) → 이 문자열
 *
 * 문장도 같은 경로다 — `dslSentence()` 가 만드는 것을 화면에서 그대로 읽어 준다.
 * 열 줄 전부 /api/pictogram 에 한 줄씩 넣어 그림이 나오는 것을 확인했다.
 */

import type { Lang } from './items';

export type DemoCase = {
  id: string;
  /** 처방전 원본. `public/` 의 실제 표본이며 앱에서 OCR 을 타는 그 파일이다. */
  image: string;
  /** 처방전에 적힌 지시를 사람 말로 옮긴 것. 그림이 안 보이는 경우의 대체 설명이다. */
  rx: Record<Lang, string>;
  /** SIGIL DSL. 한 줄이 픽토그램 한 장이 된다. 엔진 출력을 그대로 옮겼다. */
  dsl: string;
  /** 이 사례가 무엇을 보여주는지. 화면에 나간다. */
  shows: Record<Lang, string>;
  /** 이 사례를 왜 골랐는지. 화면에 나가지 않는다. */
  why: string;
};

export const DEMO: DemoCase[] = [
  {
    id: 'antibiotic',
    image: '/prescription-antibiotic.png',
    rx: {
      ko: '아목시실린 캡슐 250mg — 하루 세 번, 식후 30분. 1회 1캡슐. 7일간. 냉장 보관. 임신 중 금지, 수유 시 주의, 금주.',
      en: 'Amoxicillin capsules 250 mg — three times a day, 30 minutes after meals. One capsule each time. For 7 days. Keep refrigerated. Not in pregnancy, caution if breastfeeding, no alcohol.',
      ro: 'Amoxicilină capsule 250 mg — de trei ori pe zi, 30 de minute după mese. O capsulă de fiecare dată. Timp de 7 zile. A se păstra la frigider. Nu în sarcină, precauție la alăptare, fără alcool.',
    },
    dsl: [
      '\\three_times_daily{\\capsule_strip{\\food_bowl}}',
      '\\capsule_strip{\\time_morning}',
      '\\capsule_strip{\\time_noon}',
      '\\capsule_strip{\\time_evening}',
      '\\capsule_strip{\\qty_one}',
      '\\capsule_strip{\\storage_fridge}',
      '\\finish_course',
      '\\no_alcohol',
      '\\state_pregnant',
      '\\state_breastfeeding',
    ].join('\n'),
    shows: {
      ko: '경고문에 묻혀 있던 것이 그림으로 올라옵니다. "7일간" 은 완주 지시가 되고, 임신·수유·금주는 각각 한 장을 차지합니다. 처방전에서는 작은 글씨 한 줄이었습니다.',
      en: 'What was buried in the warning box becomes a picture of its own. "For 7 days" turns into a finish-the-course instruction, and pregnancy, breastfeeding and alcohol each get their own frame. On the prescription they were one line of small print.',
      ro: 'Ceea ce era ascuns în caseta de avertizare devine o imagine separată. „Timp de 7 zile" devine o instrucțiune de a termina tratamentul, iar sarcina, alăptarea și alcoolul primesc fiecare propriul cadru. Pe rețetă erau un singur rând scris mărunt.',
    },
    why: '가장 흔한 형태. 시간 세 번 + 수량 + 보관에, 경고문에서 끌어올린 완주·금주·임신·수유가 더해진다. 수량 오독이 곧 복용량 오류이므로 가장 위험한 축이 들어 있다.',
  },
  {
    id: 'eyedrop',
    image: '/prescription-eyedrop.png',
    rx: {
      ko: '클로람페니콜 점안액 0.5% — 하루 두 번, 아침과 저녁. 1회 2방울, 해당 눈에. 5일간. 사용 전 손 씻기. 냉장 보관. 치료 중 콘택트렌즈 금지, 임신 중 금지.',
      en: 'Chloramphenicol eye drops 0.5% — twice a day, morning and evening. Two drops into the affected eye. For 5 days. Wash hands before use. Keep refrigerated. No contact lenses during treatment, not in pregnancy.',
      ro: 'Cloramfenicol picături oftalmice 0,5% — de două ori pe zi, dimineața și seara. Două picături în ochiul afectat. Timp de 5 zile. Spălați mâinile înainte de utilizare. A se păstra la frigider. Fără lentile de contact în timpul tratamentului, nu în sarcină.',
    },
    dsl: [
      '\\hand_wash',
      '\\twice_daily{\\dropper_bottle{\\body_eye}}',
      '\\dropper_bottle{\\time_morning}',
      '\\dropper_bottle{\\time_evening}',
      '\\dropper_bottle{\\qty_two}',
      '\\dropper_bottle{\\storage_fridge}',
      '\\finish_course',
      '\\no{\\contact_lens}',
      '\\state_pregnant',
    ].join('\n'),
    shows: {
      ko: '제형이 정해지면 몸의 어디에 쓰는지도 정해집니다. 병만 그리면 지시의 절반이 사라지므로, 안약에는 눈을 함께 넣습니다. 음성도 "드세요" 가 아니라 "넣으세요" 로 갈립니다.',
      en: 'Once the dosage form is known, so is the part of the body. A bottle on its own loses half the instruction, so the eye goes in with the drops. The speech changes too — not "take it" but "put it in".',
      ro: 'Odată ce forma farmaceutică este cunoscută, se știe și partea corpului. Un flacon singur pierde jumătate din instrucțiune, așa că ochiul apare împreună cu picăturile. Se schimbă și vocea — nu „luați", ci „instilați".',
    },
    why: '어려운 쪽. 제형에서 부위를 유도하는 것과 동사가 갈리는 것을 한 사례로 보여준다. 손 씻기와 렌즈 금지는 처방전에서 본문 밖에 적혀 있던 것이다.',
  },
];
