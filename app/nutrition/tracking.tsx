'use client';

import { useProfile } from '@/stores/profile';
import { useTracking } from '@/lib/condition/useTracking';
import { trackingSentence, weeklySentence } from '@/lib/condition/tracking';
import { Hear, sayable, Speakable } from '@/components/sc/Say';
import { CarefulIcon, FineIcon } from '@/components/icons';
import type { ScanRecord } from '@/lib/snapcare/types';

/**
 * 조건 추적 — 며칠을 한눈에.
 *
 * 하루 누적 화면은 오늘만 답한다. 당뇨나 고혈압처럼 식이와 직결된 조건은 흐름으로
 * 관리해야 하는데, 그 흐름은 이미 기록에 다 들어 있으면서 아무도 되짚어 주지
 * 않았다.
 *
 * 무엇을 볼지는 조건이 정한다 — 당뇨면 설탕, 고혈압이면 소금. 조건이 없으면 설탕과
 * 소금 둘을 기본으로 본다. 예전에는 조건이 없으면 화면이 통째로 안 떴는데, 그 이유
 * ("모든 영양소를 며칠씩 보여주면 다시 읽어야 하는 표가 된다")가 정당화하는 것은
 * **적게 보여주는 것**이지 아무것도 안 보여주는 것이 아니었다. 진단이 없는 사람도
 * 어제보다 오늘 덜 먹었는지는 알 수 있어야 하고, 그것이 진단을 늦추는 길이다.
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
      {/*
        누를 수 있는 소리 버튼을 단다.

        `Speakable` 은 **꾹 누르면** 읽어 준다. 그것을 아는 사람에게는 충분하지만,
        이 앱은 그 손짓을 화면 어디에도 안 적어 두고 딱 한 번 알려 줄 뿐이다.
        보이는 버튼이 없으면 그 한 번을 놓친 사람에게 이 카드는 소리가 없는 카드다.
      */}
      <div className="flex items-center gap-2">
        <Speakable text={`Last ${tracking.span} days, for what you are managing.`}
                   className="flex flex-1 items-center gap-2 text-[11px] font-bold tracking-wide"
                   style={{ color: 'var(--color-sc-muted)' }}>
          <span className="flex-1">LAST {tracking.span} DAYS</span>
        </Speakable>
        <Hear text={`Last ${tracking.span} days, for what you are managing.`} className="sc-hear" />
      </div>

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
              <span className="flex items-center gap-1 text-xs font-bold"
                    style={{ color: s.summary.over > 0 ? 'var(--color-caution)' : 'var(--color-safe)' }}>
                {/* ⚠️ 와 ✅ 였다. 이 둘은 이 앱에서 판정을 뜻하는 도형이 이미 있다. */}
                <span aria-hidden className="flex items-center leading-none">
                  {s.summary.over > 0 ? <CarefulIcon /> : <FineIcon />}
                </span>
                {s.summary.over > 0 ? s.summary.over : s.summary.logged}
              </span>
              <Hear text={trackingSentence(s.label, s.summary, tracking.span)} />
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

            {/*
              더 멀리 — 주 단위.

              하루 막대는 "어제 어땠나" 에 답하고, 이것은 "요즘 어떤가" 에 답한다.
              둘은 다른 질문이고, 뒤쪽이 만성 조건을 관리하는 사람이 실제로 묻는
              질문이다. 한 주는 하루 평균이다(합이 아니다 — 사흘 찍은 주와 이레 찍은
              주를 합으로 견주면 많이 찍은 주가 나쁜 주로 보인다).

              기록이 있는 주가 둘 미만이면 그리지 않는다. 빈 칸 열둘은 추세가 아니다.
            */}
            {tracking.weeksWorthShowing >= 2 && (
              <div className="mt-3 border-t pt-2" style={{ borderColor: 'var(--color-sc-line)' }}>
                <div className="flex items-center gap-2"
                     {...sayable(weeklySentence(s.label, s.weeks))}>
                  <span className="flex-1 text-[10px] font-bold tracking-wide"
                        style={{ color: 'var(--color-sc-muted)' }}>
                    BY WEEK
                  </span>
                  <Hear text={weeklySentence(s.label, s.weeks)} />
                </div>
                <div className="mt-1 flex items-end gap-1" style={{ height: 26 }}>
                  {s.weeks.map((w, i) => (
                    <div key={i} className="flex flex-1 flex-col justify-end" style={{ height: '100%' }}>
                      {w.pct === null ? (
                        <div className="w-full rounded-sm" style={{ height: 2, background: 'var(--color-sc-bg)' }} />
                      ) : (
                        <div
                          className="w-full rounded-sm"
                          style={{
                            height: `${Math.max(6, Math.min(100, w.pct))}%`,
                            background: w.pct >= 50 ? 'var(--color-caution)' : 'var(--color-safe)',
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-[10px]" style={{ color: 'var(--color-sc-muted)' }}>
                  {weeklySentence(s.label, s.weeks)}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
