'use client';

import { gaugeOf } from '@/lib/nutrition/gauge';

/**
 * 채워지는 칸.
 *
 * 왜 이어진 막대를 대신하는지는 lib/nutrition/gauge.ts 맨 위에 적었다 — 요약하면,
 * **이어진 막대는 셀 수가 없다.** 이 앱의 사용자는 옆의 숫자를 못 읽는 사람이고,
 * "절반쯤" 과 "3분의 2쯤" 을 눈으로 가르려면 이미 비율을 다룰 줄 알아야 한다.
 *
 * 색만으로 넘긴 것을 말하지 않는다. 넘친 칸은 **테두리만 있는 빈 칸**이라 색을 못
 * 보는 사람에게도 모양이 다르고, 복약 순응도 화면의 "거른 복용" 과 같은 모양이다 —
 * 두 화면에서 같은 뜻으로 쓰이면 한 번 배운 것이 두 번 쓰인다.
 */
export function Gauge({ pct, kind, color, segments = 10 }: {
  pct: number;
  kind: 'limit' | 'target';
  /** 채운 칸 색. 판정 색과 같은 것을 쓴다 */
  color: string;
  segments?: number;
}) {
  const g = gaugeOf(pct, kind, segments);
  return (
    // aria-hidden: 이 줄이 말하는 것을 바로 옆의 듣기 버튼이 문장으로 읽는다.
    // 스크린리더가 칸 열다섯 개를 하나씩 읽으면 그게 더 나쁘다.
    <div aria-hidden className="mt-1.5 flex items-center gap-[3px]">
      {Array.from({ length: g.segments }, (_, i) => (
        <span
          key={i}
          className="h-3 flex-1 rounded-[3px]"
          style={{ background: i < g.filled ? color : 'var(--color-sc-bg)' }}
        />
      ))}
      {g.over > 0 && (
        <>
          {/* 넘친 자리는 한 칸 띄운다. 붙여 두면 열 칸이 열셋으로 보여서 기준이 흐려진다. */}
          <span className="w-1.5" />
          {Array.from({ length: g.over }, (_, i) => (
            <span
              key={`o${i}`}
              className="h-3 flex-1 rounded-[3px] border-2"
              style={{ borderColor: 'var(--color-avoid)', background: 'transparent' }}
            />
          ))}
        </>
      )}
    </div>
  );
}
