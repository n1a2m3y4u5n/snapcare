import type { Member, ScanItem, Verdict } from './types';

/**
 * VOCA 음성 스크립트 — 결과를 짧고 핵심만 읽어준다 (접근성 코어).
 * 픽토그램·텍스트와 같은 의미를 세 번째 채널(음성)로 전달한다.
 */
export function itemVoiceScript(item: ScanItem, verdict: Verdict, member: Member): string {
  const parts: string[] = [item.name + '.'];

  if (item.kind === 'prescription' || item.kind === 'medicine') {
    if (verdict.level === 'avoid') {
      parts.push(`Do not take. ${verdict.summary}`);
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
