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
      if (item.rx?.dosageText) parts.push(item.rx.dosageText + '.');
      parts.push('Take as prescribed.');
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
