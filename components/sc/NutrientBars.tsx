'use client';

import type { Member } from '@/lib/snapcare/types';
import { useNutrition } from '@/lib/nutrition/useNutrition';
import { NUTRIENT_LABEL, type NutrientProfile } from '@/lib/nutrition/types';
import { NutrientBar } from './NutrientBar';
import { speak } from '@/lib/voice';

/**
 * 스캔한 제품 1회 섭취량이 그 사람의 하루 기준치에서 차지하는 비중.
 * 기준치는 구성원마다 다르므로 같은 제품도 사람이 바뀌면 막대가 달라진다.
 */
export function NutrientBars(
  { barcode, profile, member }: { barcode?: string; profile?: NutrientProfile; member: Member },
) {
  const n = useNutrition({ barcode, profile }, member);

  if (n.state === 'unavailable') return null;

  if (n.state === 'loading') {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-9 animate-pulse rounded-xl bg-white shadow-sm" />
        ))}
      </div>
    );
  }

  const { assessments = [], grams, summary } = n;
  // 경고가 될 수 있는 것 우선, 그 다음 채워야 할 것. 화면이 길어지지 않게 3개까지.
  const shown = assessments
    .filter((a) => (a.kind === 'limit' ? a.pct >= 5 : a.level !== 'low'))
    .slice(0, 3);

  if (shown.length === 0) return null;

  const spoken = [
    summary,
    ...shown.map((a) => `${NUTRIENT_LABEL[a.key]}, ${Math.round(a.pct)} percent of the daily amount.`),
  ].filter(Boolean).join(' ');

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold tracking-wide" style={{ color: 'var(--color-sc-muted)' }}>
          {grams} G · SHARE OF {member.name.toUpperCase()}&apos;S DAY
        </p>
        <button onClick={() => speak(spoken, 'en-US')} aria-label="Read nutrition aloud" className="text-base leading-none">
          🔊
        </button>
      </div>

      <div className="mt-2 flex flex-col gap-2">
        {shown.map((a) => <NutrientBar key={a.key} a={a} />)}
      </div>
    </div>
  );
}
