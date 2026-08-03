import { NUTRIENT_LABEL, NUTRIENT_UNIT, type NutrientAssessment } from './types.ts';

/**
 * 막대 한 줄이 말하는 것과 입는 색.
 *
 * 컴포넌트에서 떼어 온 이유는 시험 때문이다 — 노드의 타입 제거는 `.tsx` 를 읽지
 * 못한다. 그리고 이 둘은 그릴 것이 없는 순수 함수라, 원래 여기 있는 편이 맞다.
 *
 * 방향이 반대인 두 종류를 다룬다:
 *
 *   limit  (설탕·소금·포화지방) — 많을수록 나쁘다. 넘치면 빨강.
 *   target (단백질·식이섬유)    — 모자랄수록 아쉽다. **빨강을 쓰지 않는다.**
 *
 * 두 번째 줄이 요점이다. 결핍은 위험이 아니라 채우면 되는 것인데, 빨강으로 칠하면
 * 글을 못 읽는 사람에게 "먹지 말라" 로 도착한다 — 정반대의 지시다.
 */

/** 레벨 → 색. */
export function colorFor(a: NutrientAssessment): string {
  if (a.kind === 'limit') {
    return a.level === 'high' ? 'var(--color-avoid)'
      : a.level === 'moderate' ? 'var(--color-caution)'
      : 'var(--color-safe)';
  }
  return a.level === 'good' ? 'var(--color-safe)' : 'var(--color-sc-muted)';
}

/**
 * 막대 한 줄을 한 문장으로.
 *
 * 이 줄은 눈으로는 한눈에 읽히지만(길이·색·숫자) 글로는 네 조각이다 —
 * 이름, 양, 기준 대비 비율, 그리고 그게 많다는 것인지 적다는 것인지.
 * 네 조각을 따로 누르게 하면 듣는 쪽이 조립해야 하므로, 줄 전체를 한 문장으로 읽는다.
 */
export function barSentence(a: NutrientAssessment): string {
  const unit = NUTRIENT_UNIT[a.key] === 'kcal' ? 'kilocalories' : 'grams';
  const of = a.kind === 'limit' ? "today's limit" : "today's target";
  /*
    모자란 목표 영양소에 할 말이 없었다.

    한도가 높으면 "That is high." 라고 하고 목표가 충분하면 "That is a good amount."
    라고 하는데, **목표가 모자랄 때는 아무 말도 안 했다.** 소리로만 듣는 사람에게는
    그 자리가 통째로 비어서, 숫자를 못 읽으면 부족하다는 것 자체가 도착하지 않는다.

    "부족합니다" 라고 하지 않고 "아직 많지 않습니다" 라고 하는 이유: 하루는 아직
    끝나지 않았다. 아침에 듣는 사람에게 결핍을 선고하면 그것은 틀린 말이고, 저녁에
    듣는 사람에게는 같은 문장이 여전히 맞다.
  */
  const verdict =
    a.level === 'high' ? ' That is high.'
      : a.level === 'good' ? ' That is a good amount.'
        : a.kind === 'target' && a.level === 'low' ? ' Not much yet — try to have more today.'
          : '';
  return `${NUTRIENT_LABEL[a.key]}: ${a.amount} ${unit}. ${Math.round(a.pct)} percent of ${of}.${verdict}`;
}
