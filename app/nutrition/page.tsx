'use client';

import { MobileScreen } from '@/components/sc/MobileScreen';
import { TimeGlyph } from '@/components/sc/TimeGlyph';
import { NutrientBar } from '@/components/sc/NutrientBar';
import { useScans } from '@/stores/scans';
import { useFamily } from '@/stores/family';
import { useDailyIntake } from '@/lib/nutrition/useDailyIntake';
import { NUTRIENT_LABEL } from '@/lib/nutrition/types';
import { speak } from '@/lib/voice';

/**
 * 하루 누적 분석 — 오늘 이 사람이 먹은 것을 합산해 하루 기준치와 대조한다.
 * 개별 스캔이 "이거 먹어도 되나"라면, 이 화면은 "오늘 전체로 보면 어떤가"에 답한다.
 */
export default function NutritionPage() {
  const scans = useScans((s) => s.scans);
  const { members, activeMemberId, setActiveMember } = useFamily();
  const member = members.find((m) => m.id === activeMemberId) ?? members[0];
  const daily = useDailyIntake(scans, member);

  const energy = daily.assessments?.find((a) => a.key === 'energy');
  const bars = (daily.assessments ?? [])
    .filter((a) => a.key !== 'energy')
    .filter((a) => (a.kind === 'limit' ? a.pct >= 5 : a.level !== 'low'))
    .slice(0, 5);

  const overLimit = (daily.assessments ?? []).filter((a) => a.kind === 'limit' && a.level === 'high');

  const spoken = daily.state === 'ready'
    ? [
        `Today, ${member?.name} has had ${Math.round(energy?.amount ?? 0)} kilocalories.`,
        ...overLimit.map((a) => `${NUTRIENT_LABEL[a.key]} is over half of the daily amount.`),
      ].join(' ')
    : '';

  return (
    <MobileScreen tab="nutrition">
      <div className="px-5 pt-14">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold" style={{ color: 'var(--color-sc-ink)' }}>Today</h1>
          {daily.state === 'ready' && (
            <button onClick={() => speak(spoken, 'en-US')} aria-label="Read today's intake aloud" className="text-xl leading-none">🔊</button>
          )}
        </div>

        {/* 구성원 선택 — 기준치가 사람마다 다르므로 화면 전체가 바뀐다 */}
        <div className="mt-3 flex gap-2">
          {members.map((m) => {
            const on = m.id === member?.id;
            return (
              <button
                key={m.id}
                onClick={() => setActiveMember(m.id)}
                className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ background: m.color, outline: on ? '2px solid var(--color-sc-ink)' : 'none', outlineOffset: 2 }}
                aria-label={m.name}
                aria-pressed={on}
              >
                {m.emoji}
              </button>
            );
          })}
        </div>

        {daily.state === 'loading' && (
          <div className="mt-5 flex flex-col gap-2">
            {[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-2xl bg-white shadow-sm" />)}
          </div>
        )}

        {daily.state === 'ready' && daily.entries.length === 0 && (
          <p className="mt-10 text-center text-sm" style={{ color: 'var(--color-sc-muted)' }}>
            Nothing scanned for {member?.name} today.
          </p>
        )}

        {daily.state === 'ready' && daily.entries.length > 0 && (
          <>
            {/* 에너지 — 오늘의 대표 수치 */}
            {energy && (
              <div className="mt-5 rounded-3xl bg-white px-5 py-4 shadow-sm">
                <div className="flex items-end justify-between">
                  <span className="text-4xl font-extrabold" style={{ color: 'var(--color-sc-ink)' }}>
                    {Math.round(energy.amount)}
                  </span>
                  <span className="pb-1 text-sm" style={{ color: 'var(--color-sc-muted)' }}>
                    of {Math.round(energy.reference)} kcal
                  </span>
                </div>
                <div className="mt-2 h-3 w-full overflow-hidden rounded-full" style={{ background: 'var(--color-sc-bg)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(3, Math.min(100, energy.pct))}%`,
                      background: energy.level === 'high' ? 'var(--color-caution)' : 'var(--color-safe)',
                    }}
                  />
                </div>
              </div>
            )}

            {bars.length > 0 && (
              <div className="mt-3 flex flex-col gap-2">
                {bars.map((a) => <NutrientBar key={a.key} a={a} />)}
              </div>
            )}

            {/* 오늘 먹은 것 */}
            <p className="mt-6 text-[11px] font-bold tracking-wide" style={{ color: 'var(--color-sc-muted)' }}>
              EATEN TODAY
            </p>
            <div className="mt-2 flex flex-col gap-2">
              {daily.entries.map(({ record, amounts }) => (
                <div key={record.id} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full text-lg" style={{ background: 'var(--color-sc-bg)' }}>
                    {record.emoji}
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>{record.name}</span>
                    <span className="mt-0.5 block text-xs" style={{ color: 'var(--color-sc-muted)' }}>
                      <TimeGlyph label={record.timeLabel} />
                    </span>
                  </span>
                  <span className="text-sm font-bold" style={{ color: 'var(--color-sc-ink)' }}>
                    {Math.round(amounts.energy ?? 0)}
                  </span>
                </div>
              ))}
            </div>

            <p className="mt-4 mb-2 text-[10px] leading-snug" style={{ color: 'var(--color-sc-muted)' }}>
              {daily.reference?.basis} Product data from OpenFoodFacts, which is community-edited and may be
              incomplete — always check the package for allergens. Estimates only, not medical advice.
            </p>
          </>
        )}
      </div>
    </MobileScreen>
  );
}
