import type { Member, ScanItem, Verdict } from './types';
// 확장자를 붙인 상대 경로인 이유: 이 모듈을 node --test 로 번들러 없이 직접 돌린다.
// (@/ 별칭은 그 자리에서 풀리지 않는다)
import { spokenName } from '../tts/speakable.ts';
import { packFor } from '../i18n/index.ts';
import { dslSentence } from './dslSpeech.ts';
import { itemToDsl } from './sigil.ts';
import { splitDslLines } from './dsl.ts';

/**
 * VOCA 음성 스크립트 — 결과를 짧고 핵심만 읽어준다 (접근성 코어).
 * 픽토그램·텍스트와 같은 의미를 세 번째 채널(음성)로 전달한다.
 */
export function itemVoiceScript(item: ScanItem, verdict: Verdict, member: Member,
                                lang = 'en'): string {
  /*
    고른 언어로 **말이 실제로 바뀌는 곳.**

    무엇이 문제였나: 언어를 바꿔도 미리보기만 그 언어로 나오고 나머지는 영어였다.
    까닭이 둘이었고 둘 다 여기서 만난다.

      1. 부르는 쪽이 `speak(..., 'en-US')` 로 못박고 있었다 — 열 곳쯤. 고친 뒤에도
      2. **읽을 문장 자체가 영어**였다. 이 앱의 화면 글은 영어 하나뿐이고, 번역이
         있는 것은 그림말 사전(`lib/i18n/say`)뿐이다. 한국어 목소리에 영어 문장을
         주면 `voiceLangFor` 가 알아채고 영어 목소리로 되돌린다 — 그게 옳다.
         한국 사람이 영어를 소리 나는 대로 읽는 소리는 알아들을 수 없다.

    그래서 번역이 있는 언어에서는 **그림과 같은 문장으로 말한다.** 화면의 픽토그램
    줄이 이미 그렇게 하고 있고(`PictogramStrip`), 그 사전이 이 앱에서 뜻을 정하는
    자리다. 소리와 그림이 같은 표에서 나오면 둘이 어긋날 수도 없다.

    번역이 없는 조각은 넣지 않는다. 빠진 자리를 영어로 메우면 한 문장 안에서 언어가
    섞이고, 그건 못 알아듣는 것보다 나쁘다 — 알아들은 절반으로 행동하게 된다.
  */
  const pack = lang === 'en' ? null : packFor(lang);
  if (pack) {
    const parts: string[] = [spokenName(item.name, item.kind) + '.'];
    const levelKey = verdict.level === 'safe'
      ? (item.kind === 'drink' ? 'verdict.safe.drink' : 'verdict.safe.eat')
      : `verdict.${verdict.level}`;
    const level = pack.phrases[levelKey];
    if (level) parts.push(level);
    for (const line of splitDslLines(itemToDsl(item, verdict.level === 'avoid'))) {
      const said = dslSentence(line, lang);
      if (said) parts.push(said);
    }
    return parts.join(' ');
  }
  return englishVoiceScript(item, verdict, member);
}

function englishVoiceScript(item: ScanItem, verdict: Verdict, member: Member): string {
  // 포장지에서 읽어온 이름은 그 포장지의 언어다. 영어 음성이 못 읽는 이름은
  // 종류를 가리키는 말로 바꾼다 — 화면에는 원래 이름이 그대로 남는다.
  const parts: string[] = [spokenName(item.name, item.kind) + '.'];

  if (item.kind === 'prescription' || item.kind === 'medicine') {
    if (verdict.level === 'avoid') {
      // summary 가 이미 "Do not take." 로 시작한다. 앞에 한 번 더 붙이면 같은 말을
      // 두 번 듣게 되고, 듣는 사람의 주의는 그만큼 낭비된다.
      parts.push(verdict.summary);
    } else {
      // 순서가 곧 중요도다. 듣는 사람은 되감을 수 없으므로 행동에 먼저 필요한 것부터 말한다:
      // 얼마나(1회 용량) → 언제·얼마나 자주(복용법) → 보관.
      //
      // 1회 용량이 맨 앞에 오는 이유: 형성 평가에서 이 항목이 처방 16시행 전부에 빠져 있었고,
      // 그것은 우리가 문제 정의에서 인용한 실패 유형과 같다 — 복용 시점은 알고 용량은 모르는 상태
      // (Davis et al. 2006: 지시를 말할 수 있는 70.7% 중 실제 알약 수를 제시한 것은 34.7%).
      const dose = doseSentence(item.rx);
      if (dose) parts.push(dose);
      // 복용법 원문은 처방전에서 온 조각이라 소문자로 시작한다("after food"). 문장
      // 사이에 그대로 끼우면 앞 문장의 꼬리처럼 읽힌다.
      if (item.rx?.dosageText) parts.push(sentence(item.rx.dosageText));
      parts.push(asPrescribed(item.rx));
      const storage = storageSentence(item.rx);
      if (storage) parts.push(storage);
    }
  } else {
    // 음식/음료
    if (verdict.level === 'safe') {
      parts.push(item.kind === 'drink' ? 'Safe to drink.' : 'Safe to eat.');
    } else if (verdict.level === 'caution') {
      parts.push(`Caution for ${member.name}. ${verdict.summary}`);
    } else {
      parts.push(`Not safe for ${member.name}. ${verdict.summary}`);
    }
    if (item.nutrition?.note) parts.push(item.nutrition.note);
  }

  return parts.join(' ');
}

/**
 * 제형별 투여 동사.
 *
 * "복용"이라는 한 낱말이 제형마다 다른 행위를 뜻한다. 안약을 "드세요" 라고 말하면
 * 그것은 잘못된 지시이지 어색한 표현이 아니다.
 */
const DOSE_VERB: Record<string, string> = {
  eyedrop: 'Put',
  cream: 'Apply',
  inhaler: 'Breathe in',
  injection: 'Receive',
  suppository: 'Use',
};

/** 넣는 자리가 있는 제형은 자리까지 말해야 지시가 완성된다. */
const DOSE_SITE: Record<string, string> = {
  eyedrop: ' in the eye',
  cream: ' on the skin',
};

/**
 * 마무리 한 문장 — "처방대로 하세요".
 *
 * 이것도 제형을 봐야 한다. 위에서 동사를 갈라 놓고도 여기서는 늘 "Take as prescribed."
 * 였다. 안약 하나에 "Put 2 drops in the eye each time." 과 "Take as prescribed." 가
 * 함께 나가면, 동사를 가른 이유가 그 마지막 문장에서 무너진다 — 듣는 사람에게 남는
 * 마지막 말이 "드세요" 다.
 */
function asPrescribed(rx: ScanItem['rx']): string {
  return DOSE_VERB[rx?.form ?? ''] ? 'Use as prescribed.' : 'Take as prescribed.';
}

/** 처방전에서 온 조각을 한 문장으로 세운다. */
function sentence(text: string): string {
  const t = text.trim();
  return t.charAt(0).toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? '' : '.');
}

/**
 * 1회 복용량을 한 문장으로.
 *
 * 원문("1 capsule", "5 mL")을 그대로 쓰되 문장이 되도록 앞뒤만 붙인다. 단위를 우리가
 * 다시 쓰지 않는 이유: 처방전이 mL 로 적었는데 우리가 "숟가락"으로 바꿔 말하면
 * 그 순간 우리가 처방을 해석한 것이 되고, 틀리면 용량 오류가 된다.
 */
export function doseSentence(rx: ScanItem['rx']): string | null {
  const text = rx?.doseText?.trim();
  if (!text) return null;
  const form = rx?.form ?? '';
  const verb = DOSE_VERB[form] ?? 'Take';
  const site = DOSE_SITE[form] ?? '';
  return `${verb} ${text}${site} each time.`;
}

/**
 * 보관 방법을 한 문장으로. 냉장이 필요할 때만 말한다 — 실온은 기본값이고,
 * 듣는 사람에게 굳이 한 문장을 더 얹을 만한 정보가 아니다.
 */
export function storageSentence(rx: ScanItem['rx']): string | null {
  if (rx?.storage !== 'refrigerator') return null;
  return 'Keep it in the fridge.';
}
