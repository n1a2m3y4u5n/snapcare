import type { Level, Member, ScanItem, Verdict, VerdictReason } from './types';
// 확장자를 붙이는 이유: 이 모듈을 node --test 로 번들러 없이 직접 돌린다.
import { getCondition } from './conditions.ts';
import type { NutrientAssessment, NutrientKey } from '@/lib/nutrition/types';

/** 경고 문구에 쓸 영양소 이름 (사용자에게 보이는 말투) */
const LIMIT_NOUN: Partial<Record<NutrientKey, string>> = {
  salt: 'salt',
  sugars: 'sugar',
  saturatedFat: 'saturated fat',
  energy: 'calories',
  fat: 'fat',
};

const RANK: Record<Level, number> = { safe: 0, caution: 1, avoid: 2 };

function worst(levels: Level[]): Level {
  return levels.reduce<Level>((acc, l) => (RANK[l] > RANK[acc] ? l : acc), 'safe');
}

/**
 * 신호등 판정 엔진 — 아이템 flags를 구성원 컨디션과 대조.
 * "no reading required": 결과는 초록/앰버/빨강 한 색으로 요약된다.
 */
export function computeVerdict(
  item: ScanItem,
  member: Member,
  assessments?: NutrientAssessment[],
): Verdict {
  const reasons: VerdictReason[] = [];

  for (const condId of member.conditionIds) {
    const cond = getCondition(condId);
    if (!cond) continue;
    if (item.flags.includes(cond.trigger)) {
      reasons.push({ level: cond.severity, text: cond.reason, conditionId: cond.id });
    }
  }

  // 무엇인지 모르면 안전하다고 말할 수 없다.
  // 알레르기 판정은 '이 음식에 무엇이 들었나' 를 아는 데서 출발하는데, 그걸 모르는 채로
  // 걸리는 플래그가 없다는 이유만으로 초록을 내보내면 '확인했고 괜찮다' 로 읽힌다.
  // 글을 못 읽는 사용자에게 초록은 먹어도 된다는 뜻이다.
  if (item.unidentified) {
    reasons.push({ level: 'caution', text: 'Not sure what this is — check the packet' });
  }

  // 등록된 조건과 무관하게, 한 번에 하루 상한을 넘겨버리면 경고한다.
  // 7살이 한 끼에 하루치 소금의 1.7배를 먹는 건 고혈압 진단이 없어도 문제다 —
  // 조건 매칭에만 의존하면 이런 경우가 "Safe"로 나온다 (비빔밥 실측에서 발견).
  for (const a of assessments ?? []) {
    if (a.kind !== 'limit' || a.pct < 100) continue;
    reasons.push({
      level: 'caution',
      text: `A whole day's ${LIMIT_NOUN[a.key] ?? a.key} in one serving`,
    });
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
