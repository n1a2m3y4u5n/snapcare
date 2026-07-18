import type { Level, Member, ScanItem, Verdict, VerdictReason } from './types';
import { getCondition } from './conditions';

const RANK: Record<Level, number> = { safe: 0, caution: 1, avoid: 2 };

function worst(levels: Level[]): Level {
  return levels.reduce<Level>((acc, l) => (RANK[l] > RANK[acc] ? l : acc), 'safe');
}

/**
 * 신호등 판정 엔진 — 아이템 flags를 구성원 컨디션과 대조.
 * "no reading required": 결과는 초록/앰버/빨강 한 색으로 요약된다.
 */
export function computeVerdict(item: ScanItem, member: Member): Verdict {
  const reasons: VerdictReason[] = [];

  for (const condId of member.conditionIds) {
    const cond = getCondition(condId);
    if (!cond) continue;
    if (item.flags.includes(cond.trigger)) {
      reasons.push({ level: cond.severity, text: cond.reason, conditionId: cond.id });
    }
  }

  const level = worst(reasons.map((r) => r.level));
  const kindNoun = item.kind === 'drink' ? 'drink' : item.kind === 'food' ? 'eat' : 'take';

  let headline: string;
  let summary: string;
  if (level === 'safe') {
    headline = item.kind === 'drink' ? 'Safe to drink'
      : item.kind === 'food' ? 'Safe to eat'
      : 'Safe to take';
    summary = 'No conflicts found.';
  } else if (level === 'caution') {
    headline = `Caution for ${member.name}`;
    summary = reasons.map((r) => r.text).join(' · ');
  } else {
    headline = `Not safe for ${member.name}`;
    summary = `Do not ${kindNoun}. ${reasons.map((r) => r.text).join(' · ')}.`;
  }

  return { level, headline, summary, reasons, member };
}

export const LEVEL_META: Record<
  Level,
  { label: string; emoji: string; color: string; bg: string }
> = {
  safe: { label: 'Safe', emoji: '✅', color: 'var(--color-safe)', bg: 'var(--color-safe-bg)' },
  caution: { label: 'Caution', emoji: '⚠️', color: 'var(--color-caution)', bg: 'var(--color-caution-bg)' },
  avoid: { label: 'Avoid', emoji: '⛔', color: 'var(--color-avoid)', bg: 'var(--color-avoid-bg)' },
};
