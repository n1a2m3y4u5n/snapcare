import type { Member, ScanItem, Verdict } from './types';
import { spokenName } from '@/lib/tts/speakable';

/**
 * VOCA 음성 스크립트 — 결과를 짧고 핵심만 읽어준다 (접근성 코어).
 * 픽토그램·텍스트와 같은 의미를 세 번째 채널(음성)로 전달한다.
 */
export function itemVoiceScript(item: ScanItem, verdict: Verdict, member: Member): string {
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
      if (item.rx?.dosageText) parts.push(item.rx.dosageText + '.');
      parts.push('Take as prescribed.');
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
