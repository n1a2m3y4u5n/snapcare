'use client';

import { NUTRIENT_LABEL, NUTRIENT_UNIT, type NutrientAssessment, type NutrientKey } from '@/lib/nutrition/types';
import { Hear, Speakable } from './Say';
import { barSentence, colorFor } from '@/lib/nutrition/barText';

// 순수 로직은 lib 에 있다(노드 시험이 .tsx 를 못 읽는다). 부르는 쪽이 바뀌지 않게 다시 내보낸다.
export { barSentence, colorFor };

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


/**
 * 영양소 막대 한 줄 — 섭취량이 기준치에서 차지하는 비중.
 * 같은 정보를 길이·색·숫자 세 방식으로 겹쳐 준다 (수치를 못 읽어도 길이와 색으로 읽힌다).
 */
export function NutrientBar({ a }: { a: NutrientAssessment }) {
  const color = colorFor(a);
  const width = Math.max(3, Math.min(100, a.pct));
  const unit = NUTRIENT_UNIT[a.key] === 'kcal' ? ' kcal' : ' g';

  // 듣기 표시를 Speakable 에 맡기지 않고 첫 줄에 직접 둔다. 맡기면 내용 끝 — 막대
  // 아래 — 에 붙어서, 무엇에 대한 소리인지가 한 줄 떨어진다. 누르는 것은 여전히
  // 카드 전체다.
  return (
    <Speakable text={barSentence(a)} bare className="block rounded-2xl bg-white px-3 py-2 shadow-sm">
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
        <Hear text={barSentence(a)} />
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--color-sc-bg)' }}>
        <div className="h-full rounded-full" style={{ width: `${width}%`, background: color }} />
      </div>
    </Speakable>
  );
}

