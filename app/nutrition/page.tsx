'use client';

import { MobileScreen } from '@/components/sc/MobileScreen';
import { TimeGlyph } from '@/components/sc/TimeGlyph';
import { NutrientBar } from '@/components/sc/NutrientBar';
import { useScans } from '@/stores/scans';
import { useProfile } from '@/stores/profile';
import { ConditionTracking } from './tracking';
import { SuspectedTriggerCard } from '@/app/home/suspected';
import { HowDidItSit, pendingFeedback } from '@/app/home/how-did-it-sit';
import { PROFILE_ID } from '@/stores/profile';
import { Reactions } from './reactions';
import { FoodCalendar } from '@/components/sc/FoodCalendar';
import { foodCalendar } from '@/lib/history/foodCalendar';
import { todayKey } from '@/stores/scans';
import { useIsClient } from '@/lib/hooks';
import { useMemo } from 'react';
import { useDailyIntake } from '@/lib/nutrition/useDailyIntake';
import { NUTRIENT_LABEL, type NutrientAssessment } from '@/lib/nutrition/types';
import { ask, Hear, Speakable } from '@/components/sc/Say';

/**
 * 하루 누적 분석 — 오늘 이 사람이 먹은 것을 합산해 하루 기준치와 대조한다.
 * 개별 스캔이 "이거 먹어도 되나"라면, 이 화면은 "오늘 전체로 보면 어떤가"에 답한다.
 */
export default function NutritionPage() {
  const scans = useScans((s) => s.scans);
  // 반응은 먹은 직후에 나오지 않으므로, 아직 답하지 않은 끼니 중 가장 오래된 것을 묻는다.
  const pending = pendingFeedback(scans, PROFILE_ID);
  const member = useProfile((s) => s.profile);
  const ready = useIsClient();
  const today = ready ? todayKey() : '';
  /*
    복약 화면과 같은 격자, 같은 규칙. 다른 것은 무엇이 칸을 칠하는가 하나다 —
    복약은 먹었나 걸렀나 둘 중 하나이고, 음식은 판정이 셋이라 조각이 그 색을 입는다.

    한 번 배운 그림이 두 화면에서 그대로 읽혀야 한다. 두 화면이 같은 물음("요즘
    어떻게 지내고 있나")에 답하는데 그림이 다르면 사람은 두 가지를 배워야 한다.
  */
  const month = useMemo(
    () => (ready && member ? foodCalendar(scans, today, member.id) : []),
    [ready, scans, today, member],
  );
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
              {...ask('Food. What you have eaten today, added up against your daily amount, and the last four weeks day by day.')}>
            Food
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

            {/*
              묻는 것들. 홈에서 옮겨 왔다.

              둘 다 **음식에 대한 물음**이고, 답을 적어 넣을 맥락이 이 화면에 있다 —
              바로 위가 오늘 먹은 것과 몸의 반응이다. 홈에서 물으면 사람은 무엇에
              대해 답하는지를 기억으로 채워야 했다.

              위가 아니라 여기인 이유: 이 화면의 맨 위는 오늘 얼마나 먹었나이고,
              그것은 **지금 결정**에 쓰인다(하나 더 먹어도 되나). 묻는 것들은 오늘
              안에만 답하면 된다.
            */}
            <SuspectedTriggerCard />
            {pending && <HowDidItSit key={pending.id} record={pending} />}

            {/*
              지난 넉 주. 위가 오늘이라면 이쪽은 "요즘" 이다.

              한 주로는 요일이 안 읽힌다 — 각 요일이 한 번씩만 나와서 "주말마다
              무너진다" 가 한 번의 우연과 구별되지 않는다. 넉 주면 같은 요일이 네 번
              줄지어 서고 그때 비로소 세로줄이 뜻을 갖는다.
            */}
            {month.length > 0 && (
              <>
                <Speakable text="The last four weeks. What you checked, day by day."
                           className="mt-6 flex w-full items-center gap-2 text-[11px] font-bold tracking-wide"
                           style={{ color: 'var(--color-sc-muted)' }}>
                  <span aria-hidden className="text-lg leading-none">🥗</span>
                  <span className="flex-1">FOOD · THE LAST FOUR WEEKS</span>
                </Speakable>
                <div className="mt-3 rounded-3xl bg-white px-5 py-4 shadow-sm">
                  <FoodCalendar days={month} />
                </div>
              </>
            )}

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

            {/*
              날짜별 목록이 여기 있었다. 걷어냈다.

              기록을 하나하나 되보여줄 이유가 없다. 이 앱은 그것을 **뒤에서 쌓고
              분석하는** 데 쓴다 — 오늘 누적, 넉 주 달력, 의심되는 것, 몸의 반응이
              전부 그 자료에서 나오고, 그것이 자료가 하는 일이다. 목록은 그 위에
              스물여덟 줄을 더할 뿐이었고 몇 달을 쓰면 아무도 안 내리는 벽이 된다.
            */}

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
