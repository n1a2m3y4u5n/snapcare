import type { ScanRecord } from './types';

/**
 * 기록을 얼마나 오래 들고 있을 것인가.
 *
 * 개수 상한(200건)만 있으면 자주 쓰는 사람은 두 달치, 주 1회 쓰는 사람은 4년치가
 * 남는다. 적게 쓰는 사람일수록 오래된 것을 들고 있게 되는데, 그건 앱이 쓰지도 않는
 * 자료다. 가지고 있지 않은 자료는 샐 수도 없다.
 *
 * 30일이 아니라 90일인 이유: 의심 유발식품 탐지(app/home/suspected.tsx)가 이력
 * 전체에 Fisher 정확검정을 돌린다. 표본이 줄면 검정력이 떨어져서, 짧게 잡으면
 * "이 음식을 먹으면 속이 안 좋다" 를 못 찾아낸다. 하루 누적 추적은 7일만 보므로
 * 영향이 없다.
 */
const KEEP_DAYS = 90;
const KEEP_COUNT = 200;

/** 오래됐거나 넘치는 기록을 떨어낸다. dayKey 가 없는 시드 기록은 건드리지 않는다. */
export function prune(scans: ScanRecord[], todayIso: string): ScanRecord[] {
  // 날짜 계산은 UTC 로 한다. `new Date('2026-07-29T00:00:00')` 은 **현지시각**으로
  // 읽히는데 toISOString() 은 UTC 로 되돌리므로, 한국(UTC+9)에서는 경계가 하루
  // 밀린다 — 사용자가 어느 나라에 있느냐에 따라 보관 기간이 달라진다.
  const [y, m, d] = todayIso.split('-').map(Number);
  const oldest = new Date(Date.UTC(y, m - 1, d - KEEP_DAYS)).toISOString().slice(0, 10);
  return scans
    .filter((r) => !/^\d{4}-\d{2}-\d{2}$/.test(r.dayKey) || r.dayKey >= oldest)
    .slice(0, KEEP_COUNT);
}
