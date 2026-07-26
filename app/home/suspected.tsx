'use client';

import type { SuspectedTrigger } from '@/lib/pattern/infer';
import { findTriggers, feedbackFrom } from '@/lib/pattern/infer';
import { useScans } from '@/stores/scans';
import { useFamily } from '@/stores/family';
import { useSuggestions } from '@/stores/suggestions';
import { Speakable } from '@/components/sc/Say';

/**
 * 식사 기록에서 드러난 것을 사용자에게 되묻는 자리.
 *
 * 여기서 지키는 선이 하나 있다: **진단하지 않는다.** "우유 알레르기가 있습니다" 는
 * 이 앱이 할 수 있는 말이 아니고, 없는 알레르기를 있다고 하면 식량이 부족한 곳에서
 * 급원 하나를 지운다. 화면이 말하는 것은 관찰뿐이다 — 이 성분이 든 끼니에서 이만큼
 * 불편했고, 없을 때는 이만큼이었다.
 *
 * 근거를 숫자로 쓰지 않고 점으로 그린다. "5회 중 4회" 는 읽을 수 있는 사람에게만
 * 정보이고, 이 앱은 그렇지 않은 사람을 위한 것이다. 채운 점과 빈 점의 비율은
 * 세지 않아도 보인다.
 */

function Dots({ total, filled }: { total: number; filled: number }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {Array.from({ length: Math.min(total, 12) }, (_, i) => (
        <span
          key={i}
          className="h-3 w-3 rounded-full"
          style={{
            background: i < filled ? 'var(--color-caution)' : 'transparent',
            border: i < filled ? 'none' : '2px solid var(--color-sc-bg)',
            boxShadow: i < filled ? 'none' : 'inset 0 0 0 1px rgba(0,0,0,0.10)',
          }}
        />
      ))}
    </span>
  );
}

function spoken(t: SuspectedTrigger): string {
  const eaten = `Meals with ${t.condition.label.toLowerCase()} made you unwell ${t.unwellWhenEaten} of ${t.timesEaten} times.`;
  const other = t.unwellOtherwise === 0
    ? `Meals without it never did.`
    : `Meals without it, ${t.unwellOtherwise} of ${t.timesOtherwise} times.`;
  return `${eaten} ${other} Should this go on your profile?`;
}

export function SuspectedTriggerCard({ memberId }: { memberId: string }) {
  const scans = useScans((s) => s.scans);
  const { getMember, toggleCondition } = useFamily();
  const { dismiss, shouldAsk } = useSuggestions();

  const member = getMember(memberId);
  if (!member) return null;

  const found = findTriggers(feedbackFrom(scans, memberId))
    // 이미 프로필에 있는 것은 다시 묻지 않는다
    .filter((t) => !member.conditionIds.includes(t.condition.id))
    .filter((t) => shouldAsk(memberId, t.condition.id, t.unwellWhenEaten));

  const t = found[0];
  if (!t) return null;

  return (
    <Speakable
      text={spoken(t)}
      className="mt-6 block rounded-2xl bg-white p-4 shadow-sm"
      style={{ outline: '2px solid var(--color-caution)' }}
    >
      <p className="text-xs font-bold tracking-wide" style={{ color: 'var(--color-caution)' }}>
        SOMETHING KEEPS HAPPENING
      </p>

      <div className="mt-3 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/glyphs/${GLYPH[t.condition.trigger] ?? 'symptom_gut'}.png`}
          alt=""
          aria-hidden
          className="h-12 w-12 shrink-0"
        />
        <span className="flex-1">
          <span className="block text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
            {t.condition.label}
          </span>
          {/* 이 성분이 든 끼니 — 채운 점이 불편했던 횟수 */}
          <span className="mt-1 block">
            <Dots total={t.timesEaten} filled={t.unwellWhenEaten} />
          </span>
          {/* 없던 끼니 — 대조군 */}
          <span className="mt-1.5 flex items-center gap-2 opacity-45">
            <span className="text-[10px]">without</span>
            <Dots total={t.timesOtherwise} filled={t.unwellOtherwise} />
          </span>
        </span>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            dismiss(memberId, t.condition.id, t.unwellWhenEaten);
          }}
          className="flex-1 rounded-2xl bg-[var(--color-sc-bg)] py-3 text-sm font-semibold"
          style={{ color: 'var(--color-sc-muted)' }}
        >
          Not this
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleCondition(memberId, t.condition.id);
          }}
          className="flex-1 rounded-2xl py-3 text-sm font-semibold text-white"
          style={{ background: 'var(--color-caution)' }}
        >
          Add to profile
        </button>
      </div>
    </Speakable>
  );
}

/** 조건이 반응하는 플래그 → 그 성분을 그린 글리프. */
const GLYPH: Record<string, string> = {
  peanut: 'allergen_peanut',
  tree_nuts: 'allergen_tree_nut',
  gluten: 'allergen_gluten',
  lactose: 'allergen_milk',
  shellfish: 'allergen_shellfish',
  egg: 'allergen_egg',
  soy: 'allergen_soy',
  sesame: 'allergen_sesame',
};
