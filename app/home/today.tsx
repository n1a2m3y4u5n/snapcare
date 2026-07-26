'use client';

import { useFamily } from '@/stores/family';
import { useDailyIntake } from '@/lib/nutrition/useDailyIntake';
import { NutrientBar } from '@/components/sc/NutrientBar';
import { sayable } from '@/components/sc/Say';
import type { ScanRecord } from '@/lib/snapcare/types';

/**
 * 오늘 어디까지 왔나 — 홈에 놓는 하루 누적 요약.
 *
 * 왜 홈인가: 이 앱이 라벨 판독기와 다른 지점은 **같은 과자가 어른에게는 괜찮고
 * 일곱 살에게는 주의**라는 것, 즉 사람마다 다른 기준치다. 그런데 그걸 보려면
 * 지금은 Nutrition 탭을 직접 찾아 들어가야 했다. 처음 여는 사람은 그 탭에
 * 들어갈 이유를 모르므로, 앱에서 제일 중요한 계산이 아무에게도 도착하지 않았다.
 *
 * 왜 상한을 넘긴 것부터인가: 하루 합계 전부를 늘어놓으면 읽어야 할 것이 늘어난다.
 * 오늘 행동을 바꾸는 정보는 "무엇이 이미 많은가" 하나뿐이고, 그것이 다음 끼니를
 * 고르는 근거가 된다. 나머지는 Nutrition 탭에 그대로 있다.
 *
 * 아무것도 넘기지 않았으면 막대를 그리지 않고 한 줄로 끝낸다. 넘긴 게 없다는 것도
 * 답이지만, 그 답에 막대 다섯 줄이 필요하지는 않다.
 */
export function Today({ scans }: { scans: ScanRecord[] }) {
  const { members, activeMemberId } = useFamily();
  const member = members.find((m) => m.id === activeMemberId) ?? members[0];
  const daily = useDailyIntake(scans, member);

  // 로딩 중에는 아무것도 내지 않는다 — 자리를 잡았다가 사라지면 화면이 흔들린다.
  if (daily.state !== 'ready' || daily.entries.length === 0) return null;

  const counted = daily.entries.length;
  const energy = daily.assessments?.find((a) => a.key === 'energy');

  // 상한 대비 높은 순으로 둘까지. 셋을 넘기면 다시 '읽어야 하는 목록'이 된다.
  // 'high' 는 하루 상한의 절반 이상이라는 뜻이지 초과했다는 뜻이 아니다(compute.assess).
  // 문구가 "넘었다"고 말하면 55% 를 초과로 읽게 만든다 — 막대는 55% 라고 정직하게
  // 말하는데 제목만 거짓이 되는 자리다.
  const watch = (daily.assessments ?? [])
    .filter((a) => a.kind === 'limit' && a.level === 'high')
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 2);

  const thingsPhrase = `${counted} ${counted === 1 ? 'thing' : 'things'} checked today`;

  return (
    <section className="mt-8">
      <p className="text-xs font-bold tracking-wide" style={{ color: 'var(--color-sc-muted)' }}
         {...sayable(`Today so far, for ${member?.name ?? 'you'}.`)}>
        TODAY
      </p>

      {/*
        먹은 개수와 열량은 늘 같은 자리에 둔다. 매일 다른 것이 뜨면 어디를 봐야
        하는지 매번 다시 찾아야 하고, 글을 못 읽으면 그 탐색이 곧 포기가 된다.
      */}
      <div className="mt-2 flex items-baseline gap-2 rounded-2xl bg-white px-3 py-2 shadow-sm"
           {...sayable(
             energy
               ? `${thingsPhrase}. About ${Math.round(energy.amount)} calories, ${Math.round(energy.pct)} percent of the day.`
               : `${thingsPhrase}.`,
           )}>
        <span className="text-base" aria-hidden>🍽️</span>
        <span className="flex-1 text-xs font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
          {thingsPhrase}
        </span>
        {energy && (
          <span className="text-xs font-bold" style={{ color: 'var(--color-sc-ink)' }}>
            {Math.round(energy.amount)} kcal
          </span>
        )}
      </div>

      {watch.length > 0 ? (
        <div className="mt-2 flex flex-col gap-2">
          {watch.map((a) => (
            <NutrientBar key={a.key} a={a} />
          ))}
        </div>
      ) : (
        <p className="mt-2 px-1 text-xs" style={{ color: 'var(--color-sc-muted)' }}
           {...sayable('Everything is well within the daily limits so far.')}>
          All well within limits so far
        </p>
      )}
    </section>
  );
}
