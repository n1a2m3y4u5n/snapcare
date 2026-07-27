'use client';

import { useProfile } from '@/stores/profile';
import { useTracking } from '@/lib/condition/useTracking';
import { trackingSentence } from '@/lib/condition/tracking';
import { sayable } from '@/components/sc/Say';
import type { ScanRecord } from '@/lib/snapcare/types';

/**
 * 조건 추적 — 며칠을 한눈에.
 *
 * 하루 누적 화면은 오늘만 답한다. 당뇨나 고혈압처럼 식이와 직결된 조건은 흐름으로
 * 관리해야 하는데, 그 흐름은 이미 기록에 다 들어 있으면서 아무도 되짚어 주지
 * 않았다.
 *
 * 조건이 없으면 아무것도 뜨지 않는다. 모든 영양소를 며칠씩 보여주면 다시 '읽어야
 * 하는 표' 가 되므로, 그 사람의 조건이 무엇을 볼지 정한다.
 *
 * 막대 일곱 개를 쓰는 이유: 숫자 일곱 개를 읽는 것보다 높낮이 일곱 개를 보는 것이
 * 빠르고, 글을 못 읽어도 성립한다. 넘긴 날만 색이 달라지므로 "며칠 넘겼나" 가
 * 세어보지 않아도 보인다. 기록이 없는 날은 빈 칸으로 남긴다 — 0 으로 그리면
 * 안 찍은 날이 잘 지킨 날로 보인다.
 */
export function ConditionTracking({ scans }: { scans: ScanRecord[] }) {
  const profile = useProfile((s) => s.profile);
  const tracking = useTracking(scans, profile);

  if (tracking.state !== 'ready' || tracking.series.length === 0) return null;

  return (
    <section className="mt-6">
      <p className="text-[11px] font-bold tracking-wide" style={{ color: 'var(--color-sc-muted)' }}
         {...sayable(`Last ${tracking.span} days, for what you are managing.`)}>
        LAST {tracking.span} DAYS
      </p>

      <div className="mt-2 flex flex-col gap-2">
        {tracking.series.map((s) => (
          <div key={s.conditionId} className="rounded-2xl bg-white px-3 py-3 shadow-sm">
            <div className="flex items-center gap-2"
                 {...sayable(trackingSentence(s.label, s.summary, tracking.span))}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/glyphs/${s.glyph}.png`} alt="" aria-hidden className="h-5 w-5" />
              <span className="flex-1 text-xs font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
                {s.label}
              </span>
              {/* 넘긴 날 수는 색만으로 싣지 않는다 — 숫자와 기호를 함께 둔다 */}
              <span className="text-xs font-bold"
                    style={{ color: s.summary.over > 0 ? 'var(--color-caution)' : 'var(--color-safe)' }}>
                {s.summary.over > 0 ? `⚠️ ${s.summary.over}` : `✅ ${s.summary.logged}`}
              </span>
            </div>

            {/* 일곱 칸. 높이가 상한 대비 비율이고, 넘긴 날만 색이 다르다. */}
            <div className="mt-2 flex items-end gap-1" style={{ height: 34 }}>
              {s.points.map((p, i) => (
                <div key={i} className="flex flex-1 flex-col justify-end" style={{ height: '100%' }}>
                  {p.pct === null ? (
                    // 기록 없음 — 바닥에 옅은 선만 남긴다
                    <div className="w-full rounded-sm" style={{ height: 2, background: 'var(--color-sc-bg)' }} />
                  ) : (
                    <div
                      className="w-full rounded-sm"
                      style={{
                        height: `${Math.max(6, Math.min(100, p.pct))}%`,
                        background: p.over ? 'var(--color-caution)' : 'var(--color-safe)',
                      }}
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="mt-1 flex items-center justify-between">
              <span className="text-[10px]" style={{ color: 'var(--color-sc-muted)' }}>
                {tracking.span} days ago
              </span>
              <span className="text-[10px]" style={{ color: 'var(--color-sc-muted)' }}>today</span>
            </div>

            {s.summary.streak > 0 && (
              <p className="mt-1 text-[11px] font-semibold" style={{ color: 'var(--color-safe)' }}>
                {s.summary.streak} {s.summary.streak === 1 ? 'day' : 'days'} within the limit
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
