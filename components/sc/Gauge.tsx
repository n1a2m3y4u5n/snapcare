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
export function Gauge({ pct, kind, color, need = false, segments = 10 }: {
  pct: number;
  kind: 'limit' | 'target';
  /** 채운 칸 색. 판정 색과 같은 것을 쓴다 */
  color: string;
  /**
   * 아직 모자란 목표인가. 남은 칸을 **채워야 할 자리**로 그린다.
   *
   * 이것이 없으면 두 종류가 같은 그림이 된다. 짧은 막대가 "소금이 적다(잘하고
   * 있다)" 인지 "단백질이 모자라다(더 먹어야 한다)" 인지 색 말고는 단서가 없었고,
   * 색 하나는 색을 못 보는 사람에게 아무것도 아니다. 벤치에서 그대로 나온 말:
   * "이게 넘친 건지 부족한 건지 구분이 안 됨."
   *
   * 한도에서는 켜지 않는다. 안 채운 칸이 곧 좋은 것이라 채우라고 그릴 이유가 없다.
   */
  need?: boolean;
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
          style={i < g.filled
            ? { background: color }
            : need
              // 아직 비어 있고 채워야 하는 칸. 점선 테두리라 "여기가 남았다" 로
              // 읽히고, 넘친 칸의 실선 테두리와도 모양이 다르다 — 한 화면에 두
              // 종류의 빈 칸이 있어도 서로 헷갈리지 않는다.
              ? { background: 'transparent', border: '2px dashed var(--color-sc-primary)' }
              : { background: 'var(--color-sc-bg)' }}
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
