'use client';

import { NUTRIENT_LABEL, NUTRIENT_UNIT, type NutrientAssessment, type NutrientKey } from '@/lib/nutrition/types';
import { Speakable } from './Say';

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
    <Speakable text={barSentence(a)} className="block rounded-2xl bg-white px-3 py-2 shadow-sm">
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
    </Speakable>
  );
}

/**
 * 막대 한 줄을 한 문장으로.
 *
 * 이 줄은 눈으로는 한눈에 읽히지만(길이·색·숫자) 글로는 네 조각이다 —
 * 이름, 양, 기준 대비 비율, 그리고 그게 많다는 것인지 적다는 것인지.
 * 네 조각을 따로 누르게 하면 듣는 쪽이 조립해야 하므로, 줄 전체를 한 문장으로 읽는다.
 */
export function barSentence(a: NutrientAssessment): string {
  const unit = NUTRIENT_UNIT[a.key] === 'kcal' ? 'kilocalories' : 'grams';
  const of = a.kind === 'limit' ? "today's limit" : "today's target";
  const verdict =
    a.level === 'high' ? ' That is high.'
    : a.level === 'good' ? ' That is a good amount.'
    : '';
  return `${NUTRIENT_LABEL[a.key]}: ${a.amount} ${unit}. ${Math.round(a.pct)} percent of ${of}.${verdict}`;
}
