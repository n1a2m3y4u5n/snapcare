'use client';

import type { Member } from '@/lib/snapcare/types';
import { useNutrition } from '@/lib/nutrition/useNutrition';
import { NUTRIENT_LABEL, type NutrientProfile } from '@/lib/nutrition/types';
import { NutrientBar } from './NutrientBar';
import { speak } from '@/lib/voice';

/**
 * 이름을 소유격으로. 기본 이름이 "You" 라서 그냥 붙이면 "YOU'S DAY" 가 됐다.
 * s 로 끝나는 이름은 아포스트로피만 붙인다 (JAMES' DAY).
 */
function possessive(name: string) {
  const n = name.trim();
  if (n.toLowerCase() === 'you') return 'YOUR';
  const up = n.toUpperCase();
  return up.endsWith('S') ? `${up}’` : `${up}’S`;
}

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
  /*
    경고가 될 수 있는 것 우선, 그 다음 채워야 할 것. 화면이 길어지지 않게 3개까지.

    여기는 **음식 하나**를 보는 자리라 하루 누적 화면과 기준이 다르다. 저기서는
    모자란 목표 영양소를 반드시 보여준다("오늘 단백질이 부족하다" 는 행동으로
    이어진다). 여기서 같은 규칙을 쓰면 비스킷 한 조각이 "단백질 0%" 라고 말하게
    되는데, 그건 이 비스킷에 대한 정보가 아니라 비스킷이 단백질 식품이 아니라는
    뜻일 뿐이다. 그래서 여기서는 한도든 목표든 **실제로 기여할 때만** 그린다.
  */
  const shown = assessments
    .filter((a) => a.pct >= 5)
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
          {grams} G · SHARE OF {possessive(member.name)} DAY
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
