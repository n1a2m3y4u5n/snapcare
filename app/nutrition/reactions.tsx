'use client';

import { useProfile, PROFILE_ID } from '@/stores/profile';
import { feedbackFrom, surveyTriggers, type SurveyRow } from '@/lib/pattern/infer';
import { useLearnedConditions } from '@/lib/pattern/useLearned';
import { Hear, sayable, Speakable } from '@/components/sc/Say';
import { ConditionIcon } from '@/components/icons';
import type { ScanRecord } from '@/lib/snapcare/types';

/**
 * 몸이 반응한 것 — 탐색의 **전체**.
 *
 * 왜 이 화면이 필요한가
 * ---------------------
 * 식이 일지 분석은 이미 돌고 있었다. 성분마다 먹었을 때와 안 먹었을 때의 불편 횟수를
 * 세고 Fisher 정확검정까지 한다. 그런데 화면에 나오는 것은 홈의 카드 **하나**뿐이었고,
 * 그것도 문턱을 넘고 아직 프로필에 없는 것만, 한 번 확인하면 카드는 사라졌다.
 *
 * 그래서 사용자가 볼 수 있는 것이 아무것도 남지 않았다:
 *
 *   · 아직 모자란 것 — "땅콩 2번 중 2번 불편했다" 는 제일 궁금한 자리다
 *   · 이미 확인된 것의 근거 — 없으면 "왜 내가 유당불내증이지" 에 답할 수 없고,
 *     답할 수 없으면 되돌릴 수도 없다
 *   · 아니라고 판명된 것 — 밀을 아홉 번 먹고 멀쩡했다는 것도 알아야 계속 피하지 않는다
 *
 * 이 앱은 진단하지 않는다. 이미 진단받았거나 스스로 의심하는 사람이 자기 기록을
 * 되짚는 도구라고 적어 두었는데, 정작 되짚을 자리가 없었다.
 *
 * 무엇을 보여주지 않는가
 * ----------------------
 * p 값. 읽을 수 있는 사람에게도 오해를 부르고("0.03이면 확실한 거네"), 못 읽는
 * 사람에게는 뜻이 없다. 대신 **횟수**로 말한다 — 다섯 번 중 네 번은 누구나 안다.
 */

const STATE_STYLE: Record<SurveyRow['state'], { chip: string; color: string; bg: string }> = {
  confirmed: { chip: 'On your list', color: 'var(--color-avoid)', bg: 'var(--color-avoid-bg)' },
  watching: { chip: 'Watching', color: 'var(--color-caution)', bg: 'var(--color-caution-bg)' },
  unrelated: { chip: 'No pattern', color: 'var(--color-sc-muted)', bg: 'var(--color-sc-bg)' },
};

export function Reactions({ scans }: { scans: ScanRecord[] }) {
  const member = useProfile((s) => s.profile);
  const toggleCondition = useProfile((s) => s.toggleCondition);

  /*
    훅은 이르게 돌아오기 **전**에 다 불러야 한다. 조건부로 부르면 렌더마다 훅의
    개수가 달라지고, 리액트는 그것을 순서로 짝지어서 다른 훅의 상태를 잘못 읽는다.
  */
  const survey = surveyTriggers(feedbackFrom(scans, PROFILE_ID), member?.conditionIds ?? []);
  /*
    알아낸 것을 스스로 목록에 넣는다. 물어보지 않는 이유는 그 훅의 머리말에 있다 —
    "Add to my list" 를 누를 수 있는 사람은 그 글자를 읽을 수 있는 사람이다.
  */
  useLearnedConditions(survey.rows);

  if (!member) return null;
  // 답한 끼니가 없으면 이 화면은 할 말이 없다. 빈 표를 그리면 "찾은 게 없다" 로 읽히는데,
  // 실제로는 "아직 아무것도 안 물어봤다" 이고 둘은 다르다.
  if (survey.answered === 0 || survey.rows.length === 0) return null;

  return (
    <section className="mt-6">
      <Speakable
        text={`What your body reacted to. Based on the ${survey.answered} meals you have answered about.`}
        className="flex w-full items-center gap-2 text-[11px] font-bold tracking-wide"
        style={{ color: 'var(--color-sc-muted)' }}
      >
        <span className="flex-1">WHAT YOUR BODY REACTED TO</span>
        <span>{survey.answered} answered</span>
      </Speakable>

      <div className="mt-2 flex flex-col gap-2">
        {survey.rows.map((r) => {
          const s = STATE_STYLE[r.state];
          return (
            <div key={r.condition.id} className="rounded-2xl bg-white px-3 py-3 shadow-sm">
              {/*
                `flex-wrap`. 이 줄에는 안 줄어드는 것이 셋이다 — 그림, "On your list"
                배지, 듣기 버튼. 제일 큰 글자에서 그 셋이 폭을 다 먹고 이름 칸에 한
                글자 폭만 남아, "Peanuts" 가 세로로 한 글자씩 쌓였다. 이름에 최소폭을
                주고(globals.css 의 빠져나갈 문) 자리가 모자라면 배지와 버튼이 아랫줄로
                내려가게 한다. 이름이 먼저다 — 사람이 판단할 대상의 이름이다.
              */}
              <div className="flex flex-wrap items-center gap-2">
                {/*
                  조건 그림. 이모지를 그대로 쓰고 있었다 — 기기마다 다른 그림으로,
                  하필 **사람이 판단을 내리는 카드**에서. `id` 로 찾는다(이모지로
                  찾으면 조건의 이모지를 바꾸는 날 그림이 조용히 사라진다).
                */}
                <span className="flex items-center text-lg" aria-hidden>
                  <ConditionIcon id={r.condition.id} />
                </span>
                <span className="min-w-[8rem] flex-1 text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
                  {r.condition.label}
                </span>
                <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{ background: s.bg, color: s.color }}>
                  {r.state === 'watching' && r.significant ? 'Found' : s.chip}
                </span>
                {/*
                  꾹 누르면 읽어 주는 것으로는 모자란다. 그 손짓을 이 앱은 딱 한 번
                  알려 주고, 놓친 사람에게 이 카드는 소리가 없는 카드가 된다. 그리고
                  이 카드는 **사람에게 판단을 요구하는** 카드라, 못 읽는 사람이 근거를
                  못 들으면 그 판단을 할 수가 없다.
                */}
                <Hear text={r.text} />
              </div>

              {/*
                근거를 숫자 두 줄로. 막대가 아니라 숫자인 이유: 여기서 견주는 것은
                크기가 아니라 **비율 둘**이고(먹었을 때 / 안 먹었을 때), 그 둘을 나란히
                놓는 것 자체가 이 분석의 논리다. 하나만 보면 아무 뜻이 없다.
              */}
              <div className="mt-2 flex gap-2 text-[11px]">
                <div className="flex-1 rounded-xl px-2 py-1.5" style={{ background: 'var(--color-sc-bg)' }}>
                  <span className="block" style={{ color: 'var(--color-sc-muted)' }}>When eaten</span>
                  <span className="font-bold" style={{ color: 'var(--color-sc-ink)' }}>
                    {r.unwellWhenEaten} of {r.timesEaten} unwell
                  </span>
                </div>
                <div className="flex-1 rounded-xl px-2 py-1.5" style={{ background: 'var(--color-sc-bg)' }}>
                  <span className="block" style={{ color: 'var(--color-sc-muted)' }}>Otherwise</span>
                  <span className="font-bold" style={{ color: 'var(--color-sc-ink)' }}>
                    {r.unwellOtherwise} of {r.timesOtherwise} unwell
                  </span>
                </div>
              </div>

              {r.state === 'watching' && r.moreNeeded > 0 && (
                <p className="mt-1.5 text-[11px]" style={{ color: 'var(--color-sc-muted)' }}>
                  {r.moreNeeded} more {r.moreNeeded === 1 ? 'time' : 'times'} would tell us more
                </p>
              )}

              {/*
                되돌리는 길.

                확인된 것을 끄는 버튼이 여기 있어야 하는 이유: 지금까지 이 조건이
                프로필에 들어가는 길은 홈의 카드 하나뿐이었고, 한 번 들어가면 근거를
                볼 자리도 끌 자리도 없었다. 스스로 붙인 표시를 스스로 뗄 수 없으면
                그것은 앱이 내린 진단이 되고, 이 앱은 진단하지 않기로 했다.
              */}
              {r.state === 'confirmed' && (
                <button
                  onClick={() => toggleCondition(r.condition.id)}
                  className="mt-2 h-11 w-full rounded-xl text-xs font-semibold"
                  style={{ background: 'var(--color-sc-bg)', color: 'var(--color-sc-muted)' }}
                  {...sayable(`Take ${r.condition.label} off your list. You can add it back later.`)}
                >
                  Take it off my list
                </button>
              )}

              {/*
                "Add to my list" 버튼이 여기 있었다. 앱이 스스로 넣으므로 없앴다 —
                누를 수 있는 사람은 읽을 수 있는 사람이고, 이 앱은 못 읽는 사람을
                위해 만들어졌다.

                남은 것은 **뗄 수 있는 길**이다. 그것까지 없애면 앱이 내린 진단이
                되고, 끌 수 없는 경고는 사람이 앱을 끄게 만든다.
              */}
              {/*
                "Add to my list" 버튼이 여기 있었다. 앱이 스스로 넣으므로 없앴다 —
                누를 수 있는 사람은 읽을 수 있는 사람이고, 이 앱은 못 읽는 사람을
                위해 만들어졌다(`lib/pattern/useLearned.ts`).

                남은 것은 **뗄 수 있는 길**이다. 그것까지 없애면 앱이 내린 진단이
                되고, 끌 수 없는 경고는 사람이 앱을 끄게 만든다.
              */}
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-[10px] leading-snug" style={{ color: 'var(--color-sc-muted)' }}>
        This is your own record, not a diagnosis. Counts come from the meals you answered about.
      </p>
    </section>
  );
}
