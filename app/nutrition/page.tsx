'use client';

import { MobileScreen } from '@/components/sc/MobileScreen';
import { TimeGlyph } from '@/components/sc/TimeGlyph';
import { NutrientBar } from '@/components/sc/NutrientBar';
import { useScans } from '@/stores/scans';
import { useProfile } from '@/stores/profile';
import { ConditionTracking } from './tracking';
import { Reactions } from './reactions';
import { useDailyIntake } from '@/lib/nutrition/useDailyIntake';
import { NUTRIENT_LABEL, type NutrientAssessment } from '@/lib/nutrition/types';
import { ask, Hear, Speakable } from '@/components/sc/Say';

/**
 * 하루 누적 분석 — 오늘 이 사람이 먹은 것을 합산해 하루 기준치와 대조한다.
 * 개별 스캔이 "이거 먹어도 되나"라면, 이 화면은 "오늘 전체로 보면 어떤가"에 답한다.
 */
export default function NutritionPage() {
  const scans = useScans((s) => s.scans);
  const member = useProfile((s) => s.profile);
  const daily = useDailyIntake(scans, member);

  const energy = daily.assessments?.find((a) => a.key === 'energy');
  /*
    무엇을 보여줄지.

    한도(설탕·소금·포화지방)는 **많을 때** 알려주는 것이고, 목표(단백질·식이섬유)는
    **모자랄 때** 알려주는 것이다. 방향이 반대인데 여기서는 같은 조건으로 걸러
    내고 있었다 — `a.level !== 'low'` 라, 목표 영양소는 **이미 충분할 때만** 보였다.
    하루 종일 단백질을 거의 못 먹은 사람 화면에 단백질 얘기가 아예 없었다는 뜻이다.

    대상 지역을 생각하면 이 방향이 특히 아프다. 과잉만이 아니라 결핍이 문제이고,
    "오늘 단백질이 모자랍니다" 는 이 앱이 해 줄 수 있는 말 중 드물게 행동으로
    이어지는 말이다. 계산은 이미 하고 있었다(reference.ts 가 WHO/FAO 로 체중 ×
    0.83 g/kg 을 뽑는다) — 뽑아 놓고 화면에서 버리고 있었다.

    빨강으로 칠하지 않는다. `colorFor` 가 목표 영양소에는 회색과 초록만 쓴다 —
    결핍은 위험 신호가 아니라 **채우면 되는 것**이고, 빨강은 "먹지 말라" 로 읽힌다.

    순서: 넘긴 것 → 모자란 것 → 나머지. 급한 것이 위로 온다.
  */
  const rank = (a: NutrientAssessment) =>
    a.kind === 'limit' && a.level === 'high' ? 0
      : a.kind === 'target' && a.level === 'low' ? 1
        : 2;
  const bars = (daily.assessments ?? [])
    .filter((a) => a.key !== 'energy')
    .filter((a) => (a.kind === 'limit' ? a.pct >= 5 : true))
    .sort((x, y) => rank(x) - rank(y))
    .slice(0, 5);

  const overLimit = (daily.assessments ?? []).filter((a) => a.kind === 'limit' && a.level === 'high');

  const spoken = daily.state === 'ready'
    ? [
        `Today, ${member?.name} has had ${Math.round(energy?.amount ?? 0)} kilocalories.`,
        ...overLimit.map((a) => `${NUTRIENT_LABEL[a.key]} is over half of the daily amount.`),
      ].join(' ')
    : '';

  return (
    <MobileScreen bar="inner">
      <div className="px-5 pt-14">
        {/*
          제목 옆 듣기 버튼이 20px 짜리 이모지였다. 다른 화면을 전부 44 로 맞추면서
          여기만 남았는데, 하필 이 화면은 숫자로만 말하는 화면이라 소리가 제일 필요하다.
        */}
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-extrabold" style={{ color: 'var(--color-sc-ink)' }}
              {...ask('Today. Everything you have eaten so far, added up against your daily amount.')}>
            Today
          </h1>
          {daily.state === 'ready' && <Hear text={spoken} />}
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
            {/* 조건이 있으면 며칠치 추이를 함께 낸다 (조건이 없으면 스스로 뜨지 않는다) */}
            <ConditionTracking scans={scans} />

            {/*
              몸이 반응한 것. 추세 바로 밑에 둔다 — 위가 "무엇을 얼마나 먹었나" 라면
              이쪽은 "그래서 몸이 어땠나" 라, 같은 줄기의 다음 물음이다.
            */}
            <Reactions scans={scans} />

            <Speakable text="Eaten today. Everything you checked since this morning."
                       className="mt-6 flex w-full items-center gap-2 text-[11px] font-bold tracking-wide"
                       style={{ color: 'var(--color-sc-muted)' }}>
              <span className="flex-1">EATEN TODAY</span>
            </Speakable>
            <div className="mt-2 flex flex-col gap-2">
              {/*
                이 줄들은 소리로 닿는 길이 시각 글리프에 붙은 표시 하나뿐이었다 —
                누르면 "오전 8시" 만 들리고 무엇을 먹었는지는 안 들렸다. 홈의 최근
                목록과 같은 모양으로 맞춘다: 줄 전체를 한 문장으로 읽는 버튼 하나.
              */}
              {daily.entries.map(({ record, amounts }) => (
                <div key={record.id} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg" style={{ background: 'var(--color-sc-bg)' }}>
                    {record.emoji}
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>{record.name}</span>
                    <span className="mt-0.5 block text-xs" style={{ color: 'var(--color-sc-muted)' }}>
                      <TimeGlyph label={record.timeLabel} mute compact />
                    </span>
                  </span>
                  <span className="text-sm font-bold" style={{ color: 'var(--color-sc-ink)' }}>
                    {Math.round(amounts.energy ?? 0)}
                  </span>
                  <Hear text={`${record.name}, ${record.timeLabel}. About ${Math.round(amounts.energy ?? 0)} calories.`} />
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
