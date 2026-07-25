'use client';

import { NUTRIENT_LABEL, NUTRIENT_UNIT, type NutrientAssessment, type NutrientKey } from '@/lib/nutrition/types';

export const NUTRIENT_EMOJI: Record<NutrientKey, string> = {
  energy: '🔥',
  sugars: '🍬',
  salt: '🧂',
  saturatedFat: '🧈',
  fat: '🫒',
  protein: '💪',
  fiber: '🌾',
  carbohydrates: '🍚',
};

/** 레벨 → 색. limit 은 많을수록 위험, target 은 적을수록 아쉬움(위험 아님)이라 색을 다르게 쓴다. */
export function colorFor(a: NutrientAssessment): string {
  if (a.kind === 'limit') {
    return a.level === 'high' ? 'var(--color-avoid)'
      : a.level === 'moderate' ? 'var(--color-caution)'
      : 'var(--color-safe)';
  }
  return a.level === 'good' ? 'var(--color-safe)' : 'var(--color-sc-muted)';
}

/**
 * 영양소 막대 한 줄 — 섭취량이 기준치에서 차지하는 비중.
 * 같은 정보를 길이·색·숫자 세 방식으로 겹쳐 준다 (수치를 못 읽어도 길이와 색으로 읽힌다).
 */
export function NutrientBar({ a }: { a: NutrientAssessment }) {
  const color = colorFor(a);
  const width = Math.max(3, Math.min(100, a.pct));
  const unit = NUTRIENT_UNIT[a.key] === 'kcal' ? ' kcal' : ' g';

  return (
    <div className="rounded-2xl bg-white px-3 py-2 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-base">{NUTRIENT_EMOJI[a.key]}</span>
        <span className="flex-1 text-xs font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
          {NUTRIENT_LABEL[a.key]}
        </span>
        <span className="text-xs font-bold" style={{ color }}>
          {a.amount}{unit}
        </span>
        <span className="w-11 text-right text-[11px]" style={{ color: 'var(--color-sc-muted)' }}>
          {Math.round(a.pct)}%
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--color-sc-bg)' }}>
        <div className="h-full rounded-full" style={{ width: `${width}%`, background: color }} />
      </div>
    </div>
  );
}
