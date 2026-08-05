import { KEEP_DAYS } from '../snapcare/retention.ts';

/**
 * 달력이 한 번에 보는 길이와, 뒤로 갈 수 있는 끝.
 *
 * 그림에서 떼어 낸 값들이다. `MonthNav.tsx` 안에 있었는데 그 파일은 JSX 라
 * 시험(`node --test --experimental-strip-types`)이 못 읽는다 — 그래서 이 산수를
 * 확인하는 시험을 쓸 수가 없었다. 산수가 틀리면 화면이 반쯤 빈 달력을 그리고,
 * 반만 채워진 달력은 **"이때 안 먹었다" 로 읽힌다.** 확인할 수 없는 자리에 두기에는
 * 비싼 값이다.
 */

/**
 * 한 창의 길이(일). 넉 주.
 *
 * 한 주는 요일을 못 읽는다 — 각 요일이 한 번씩만 나오므로 "주말마다 빠진다" 가 한
 * 번의 우연과 구별되지 않는다. 넉 주면 같은 요일이 네 번 줄지어 선다. 그 이상은 폰
 * 화면에서 칸이 너무 작아진다.
 */
export const WINDOW_DAYS = 28;

/**
 * 뒤로 갈 수 있는 마지막 창의 번호.
 *
 * 창은 0번부터 센다. 보관 한도가 90일이므로 2번 창의 끝이 84일, 3번 창의 끝은
 * 112일 — 한도 밖이다. 그래서 `90/28` 이 아니라 거기서 하나를 뺀 값이다.
 *
 * 상한이 없을 때 실제로 일어난 일: 빈 창에서 카드가 통째로 안 그려지면서 **화살표까지
 * 같이 사라졌다.** 돌아올 길이 화면에서 지워졌고, 그 자리에서 사람이 할 수 있는 일은
 * 앱을 다시 여는 것뿐이었다.
 */
export const MAX_BACK = Math.floor(KEEP_DAYS / WINDOW_DAYS) - 1;

/**
 * `back` 달 전의 달 — `'YYYY-MM'`.
 *
 * 왜 넉 주에서 달로 옮겼나
 * ------------------------
 * 창이 넉 주였다. 산수로는 낫다 — 같은 요일이 정확히 네 번씩 서고 길이가 늘 같다.
 * 그런데 화면에서 그것이 **달로 읽힌다.** 일곱 칸짜리 격자에 요일 머리글자가 붙어
 * 있으면 사람은 달력을 보고, 달력이면 1일에서 시작해 말일에서 끝난다고 읽는다.
 *
 * 그리고 이 앱은 칸에 날짜 숫자를 안 쓴다(글을 못 읽는 사람이 쓰기 때문이다). 그래서
 * 어긋난 것을 바로잡을 단서가 화면에 하나도 없다. 실제로 나온 말 — "지금 8월 5일인데
 * 월말처럼 나온다". 8월 5일이 격자의 서른한 번째 칸에 있었으니 맞는 읽기다.
 *
 * 달로 두면 그 물음이 사라진다. 오늘은 그 달에서 오늘의 자리에 있고, 뒤는 빈 칸이다.
 * "지난달에는 어땠나" 도 그대로 되는데, 이제 **진짜 지난달**이다.
 */
export function monthOf(today: string, back = 0): string {
  const [y, m] = String(today ?? '').split('-').map(Number);
  /*
    빈 값을 그대로 받는다.

    화면이 서버에서 먼저 그려질 때 오늘은 아직 없다(`ready` 가 false 라 `''`). 그때
    `new Date(Date.UTC(NaN, …)).toISOString()` 은 던지고, 던지면 그 페이지의 사전
    렌더링이 통째로 실패한다 — 배포 빌드가 그 자리에서 깨졌다.

    빈 문자열을 돌려주면 아래 `monthDays` 가 빈 배열을 내고 달력은 빈 격자로 그려진다.
    화면이 붙은 뒤 진짜 오늘이 들어오면 다시 그려진다.
  */
  if (!Number.isFinite(y) || !Number.isFinite(m)) return '';
  const at = new Date(Date.UTC(y, m - 1 - back, 1));
  return Number.isNaN(at.getTime()) ? '' : at.toISOString().slice(0, 7);
}

/** 그 달의 모든 날, 오래된 것이 앞에. `'YYYY-MM'` 을 받는다. */
export function monthDays(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return [];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last },
    (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

/**
 * 뒤로 갈 수 있는 마지막 달.
 *
 * 기록이 90일에서 잘리므로(`retention.ts`) 석 달 전의 1일은 이미 한도 밖일 수 있다.
 * 두 달 뒤까지만 연다 — 그 너머는 늘 빈 격자이고, 빈 격자에서 화살표까지 사라지면
 * 돌아올 길이 없어진다(위 `MAX_BACK` 의 사연).
 */
export const MAX_MONTHS_BACK = 2;

/**
 * 이 창이 덮는 날들. `'YYYY-MM'` 이면 그 달, `'YYYY-MM-DD'` 면 거기서 거슬러 `days` 일치.
 *
 * 세 곳이 각자 창을 계산하고 있었다(달력·순응도·약별 게이지). 창의 뜻을 넉 주에서
 * 달로 바꾸면서 그 셋이 어긋나면, 달력은 8월을 그리는데 아래 숫자는 지난 넉 주를
 * 세는 화면이 된다 — 그리고 그 어긋남은 화면에 아무 표시도 안 낸다.
 */
export function spanOf(anchor: string, days = WINDOW_DAYS): string[] {
  if (!anchor) return [];              // 아직 오늘을 모른다 (서버에서 그리는 중)
  return /^\d{4}-\d{2}$/.test(anchor) ? monthDays(anchor) : windowDaysDesc(anchor, days);
}

/** 오래된 날이 앞에 오도록. `windowDays` 가 오늘부터 거꾸로 주는 것을 뒤집는다. */
function windowDaysDesc(anchor: string, days: number): string[] {
  const out: string[] = [];
  const [y, m, d] = anchor.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return out;
  for (let back = days - 1; back >= 0; back--) {
    out.push(new Date(Date.UTC(y, m - 1, d - back)).toISOString().slice(0, 10));
  }
  return out;
}
