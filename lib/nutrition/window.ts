import type { NutrientKey } from './types.ts';

/**
 * **영양소마다 며칠을 봐야 하는가.**
 *
 * 지금까지 이 앱은 하루를 봤다. 하루는 "지금 이거 먹어도 되나" 에는 맞는 창이지만,
 * 결핍은 하루로 생기지 않는다. 같은 화면이 두 물음에 같은 창으로 답하고 있었다.
 *
 * 왜 하나의 기간으로는 안 되는가
 * ------------------------------
 * 두 가지가 영양소마다 다르고, 둘 다 며칠을 봐야 하는지를 정한다.
 *
 * **하나. 먹는 양이 날마다 얼마나 흔들리는가.** Basiotis 등(1987, J Nutr 117:1638)
 * 이 성인 29명의 1년치 식사 기록으로 잰 것이 이것이다. 한 사람의 평소 섭취량을
 * ±10% 안에서 맞히는 데 필요한 날수가 **열량은 평균 31일, 비타민 A 는 433일** 이었다.
 * 같은 사람, 같은 기록인데 영양소에 따라 열 배가 넘게 벌어진다 — 열량은 매일 비슷하게
 * 먹지만 비타민 A 는 간을 먹은 하루가 한 달치를 만들기 때문이다.
 *
 * **둘. 몸에 얼마나 쌓아 두는가.** 비타민 C 는 수용성이라 몇 주면 바닥나고, 엽산은
 * 실험적 결핍 연구에서 거대적아구성 빈혈까지 **4개월**이 걸린 사례가 있으며, B12 는
 * 간에 몇 년치가 있다. 하루 못 먹은 것이 뜻을 갖는 영양소와 석 달을 봐도 이르다는
 * 영양소가 같은 표에 있다.
 *
 * 그래서 창을 셋으로 나눈다
 * -------------------------
 * 정확한 날수를 흉내 내지 않는다. 위의 연구가 말하는 날수(비타민 A 433일)는 이 앱이
 * 가진 자료(90일)로는 애초에 닿을 수 없고, 닿는 척하는 것이 더 나쁘다. 대신 **답할
 * 수 있는 물음의 크기**로 나눈다.
 *
 *   지금       1일   한도들 — 오늘 더 먹어도 되나
 *   근래      14일   단백질·섬유 — 요즘 부족한가
 *   오래      90일   미량영양소 — 몇 달째 모자란가 (보관 한도 전부)
 *
 * 14일은 Basiotis 의 열량 31일보다 짧다. 그것을 알고 고른 값이다 — 31일을 채우려면
 * 사람이 두 달을 빠짐없이 기록해야 하는데 이 앱의 사용자는 그러지 않는다. 대신 아래의
 * `coverage` 로 **얼마나 채워졌는지를 같이 말한다.**
 *
 * 무엇을 말하지 않는가
 * --------------------
 * 결핍을 선고하지 않는다. DRI 지침이 그것을 못 하는 이유를 그대로 적어 두었다 —
 * "한 사람의 식사가 그 사람의 필요를 채우는지는 정확히 알 수 없다"(NASEM, DRI:
 * Applications in Dietary Assessment, 3장). 개인의 필요량 자체가 잴 수 없는 값이라,
 * 어떤 계산도 "당신은 철분이 부족합니다" 까지 갈 수 없다. 이 앱이 할 수 있는 말은
 * **"요즘 이것이 적게 들어오고 있다"** 까지다.
 */

/** 창의 종류. 숫자가 아니라 물음의 크기다. */
export type Span = 'now' | 'recent' | 'long';

export const SPAN_DAYS: Record<Span, number> = {
  now: 1,
  recent: 14,
  long: 90,
};

/**
 * 영양소를 어느 창에서 볼 것인가.
 *
 * 한도(설탕·소금·포화지방·열량)는 `now` 다. 이것들은 오늘의 결정에 쓰이고, 오늘 많이
 * 먹었다는 것은 오늘 알아야 한다. 긴 창으로 평균 내면 "이번 달 평균은 괜찮다" 가
 * 되면서 오늘 두 배를 먹은 것이 사라진다.
 *
 * 단백질·섬유는 `recent` 다. 하루 못 먹는 것은 흔하고 뜻이 없지만, 두 주가 모자라면
 * 그것은 습관이다.
 *
 * 지금은 여기까지다. 미량영양소(철·B12·엽산·비타민D)는 `long` 이 필요한데 이 앱의
 * 영양 자료원(OpenFoodFacts 성분표)에 그 값이 대체로 없다. 자리를 비워 두는 대신
 * 표에 안 넣는다 — 값이 없는데 창만 있으면 화면이 "모자란다" 도 "괜찮다" 도 아닌
 * 빈칸을 오래 보여주게 된다.
 */
export const NUTRIENT_SPAN: Record<NutrientKey, Span> = {
  energy: 'now',
  sugars: 'now',
  salt: 'now',
  saturatedFat: 'now',
  fat: 'now',
  carbohydrates: 'now',
  protein: 'recent',
  fiber: 'recent',
};

export interface SpanReading {
  /** 그 창에서 하루 평균 얼마나 먹었나. */
  perDay: number;
  /** 그 창에서 하루 평균 기준치. */
  reference: number;
  /** 창의 길이(일). */
  days: number;
  /** 그중 기록이 하나라도 있는 날. */
  logged: number;
  /**
   * 얼마나 채워졌나 (0–1).
   *
   * **이 값이 이 파일에서 제일 중요하다.** 90일 창에 엿새치가 들어 있는 것은 90일을
   * 본 것이 아니라 엿새를 본 것이고, 그 둘을 같은 얼굴로 내놓으면 화면이 거짓말을
   * 한다. 사람이 며칠 기록을 걸렀는지는 이 앱이 통제할 수 없는 값이라, 통제할 수
   * 없는 것은 숨기지 말고 같이 보여야 한다.
   */
  coverage: number;
}

/**
 * 이 읽기를 사람에게 말해도 되는가.
 *
 * 절반이 기준이다. 열나흘 창에 이레, 90일 창에 45일. 그보다 적으면 평균이 아니라
 * **먹은 날들의 평균**이고, 그것을 하루 기준치와 견주면 안 먹은 날이 통째로 빠진 채
 * "충분하다" 가 나온다 — 결핍을 놓치는 방향으로 틀린다.
 */
export function trustworthy(reading: SpanReading): boolean {
  return reading.coverage >= 0.5;
}

/**
 * 한 창의 읽기를 한 문장으로.
 *
 * "부족합니다" 라고 하지 않는다. 이유는 이 파일 머리말에 적었다 — 개인의 필요량은
 * 잴 수 없는 값이고, 이 앱이 아는 것은 들어온 양뿐이다.
 */
export function spanSentence(label: string, reading: SpanReading,
                             span: Span): string {
  const when = span === 'now' ? 'today'
    : span === 'recent' ? 'over the last two weeks'
      : 'over the last three months';

  if (!trustworthy(reading)) {
    return `${label}: only ${reading.logged} of ${reading.days} days have anything recorded, so there is not enough to say yet.`;
  }
  const pct = reading.reference ? Math.round((reading.perDay / reading.reference) * 100) : 0;
  if (pct >= 90) return `${label}: about ${pct} percent of the daily amount ${when}. That is a good level.`;
  if (pct >= 60) return `${label}: about ${pct} percent of the daily amount ${when}. A little more would help.`;
  return `${label}: about ${pct} percent of the daily amount ${when}. This one has been low.`;
}
