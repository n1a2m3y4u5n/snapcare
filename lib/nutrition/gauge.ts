/**
 * 채워지는 칸으로 정도를 보인다.
 *
 * 왜 이어진 막대가 아니라 칸인가
 * ------------------------------
 * 지금까지 영양소는 이어진 막대 하나로 그렸다. 길이가 비율이고, 옆에 숫자가 있다.
 * 그런데 이 앱의 사용자는 그 숫자를 못 읽는 사람이고, **이어진 막대는 셀 수가 없다.**
 * "절반쯤 찼다" 와 "3분의 2쯤 찼다" 를 눈으로 가르려면 이미 비율이라는 개념을
 * 다룰 줄 알아야 한다.
 *
 * 칸은 세면 된다. 열 칸 중 여섯이 찼다는 것은 손가락으로 짚을 수 있고, 어제 넷이
 * 찼던 것과 견주는 것도 짚어서 된다. 복약 순응도 화면에서 한 칸이 한 번의 복용인
 * 것과 같은 방식이고, 같은 방식을 두 곳에서 쓰면 한 번 배운 것이 두 번 쓰인다.
 *
 * 칸 수
 * -----
 * 열 칸이 기본이다. 다섯은 거칠어서 "조금 넘었다" 와 "많이 넘었다" 가 같은 칸 수로
 * 보이고, 스물은 좁은 화면에서 세다가 놓친다.
 */

/** 한도를 넘었을 때 넘친 만큼을 몇 칸까지 보일 것인가. 그 이상은 의미가 없다. */
const MAX_OVER = 5;

export interface Gauge {
  /** 채운 칸 수 (0 ~ segments) */
  filled: number;
  /** 전체 칸 수 */
  segments: number;
  /**
   * 한도를 넘어선 칸 수 (0 ~ MAX_OVER). 기준치의 100% 를 넘은 만큼이고, 넘지
   * 않았으면 0 이다. 목표 영양소(단백질·식이섬유)에서는 늘 0 — 많이 먹는 것이
   * 문제가 아니다.
   */
  over: number;
}

/**
 * 비율(%)을 칸으로 옮긴다.
 *
 * 두 가지를 반올림 규칙으로 못박는다. 둘 다 조용히 틀린 그림을 만드는 자리다.
 *
 *  - **먹었는데 0칸이 되면 안 된다.** 하루 기준의 2% 라도 먹었으면 한 칸은 찬다.
 *    0칸은 "안 먹었다" 로 읽히고, 실제로 안 먹은 날과 구별되지 않는다.
 *  - **다 안 찼는데 꽉 차 보이면 안 된다.** 96% 는 아홉 칸이다. 열 칸은 "다 됐다"
 *    로 읽히는데, 목표 영양소에서 그것은 아직 모자란 사람에게 다 먹었다고 말하는 것이다.
 */
export function gaugeOf(pct: number, kind: 'limit' | 'target', segments = 10): Gauge {
  const p = Number.isFinite(pct) ? Math.max(0, pct) : 0;
  const per = 100 / segments;

  let filled = Math.floor(p / per);
  if (p > 0 && filled === 0) filled = 1;              // 먹었으면 최소 한 칸
  if (filled >= segments && p < 100) filled = segments - 1;  // 100 미만은 꽉 차지 않는다
  filled = Math.min(filled, segments);

  const over = kind === 'limit' && p > 100
    ? Math.min(MAX_OVER, Math.max(1, Math.round((p - 100) / per)))
    : 0;

  return { filled, segments, over };
}

/**
 * 게이지를 말로. 듣기 버튼이 이걸 읽는다.
 *
 * 칸으로 말한다 — "열 칸 중 여섯" 은 화면에 보이는 것과 같은 말이라, 듣고 나서
 * 화면을 보면 같은 것을 가리킨다. 백분율로 말하면 그 대응이 끊긴다.
 */
export function gaugeSentence(g: Gauge, label: string, kind: 'limit' | 'target'): string {
  if (g.over > 0) {
    return `${label}: full, and over by ${g.over} of ${g.segments}.`;
  }
  if (kind === 'target') {
    if (g.filled >= g.segments) return `${label}: you have had enough today.`;
    return `${label}: ${g.filled} of ${g.segments} filled. Try to have more today.`;
  }
  if (g.filled === 0) return `${label}: none yet today.`;
  return `${label}: ${g.filled} of ${g.segments} of the day's amount.`;
}
