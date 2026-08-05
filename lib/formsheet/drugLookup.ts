'use client';

// 상대 경로 — 시험에서 @/ 별칭이 안 통한다 (prescription.ts 와 같은 이유).
import { normalize, similarity } from '../formulary/match.ts';
import type { DrugLookup } from './lookupTypes.ts';

export type { DrugLookup };

/**
 * 표에 없는 약을 서버에 물어본다 — 그리고 **돌아온 답을 검산한다.**
 *
 * 이 파일이 실제로 하는 일은 부르는 것이 아니라 거르는 것이다. 부르는 것은 세 줄이고
 * 나머지는 전부 "무엇을 안 받을 것인가" 다.
 *
 * 이름을 함부로 안 바꾸는 이유
 * ---------------------------
 * 오타를 고치는 것과 다른 약으로 바꾸는 것은 화면에서 구별이 안 된다. 둘 다 "종이에
 * 쓴 것과 다른 이름" 으로 보이고, 사람은 그 이름을 들고 포장지를 찾는다. 그래서
 * 철자 거리로 잰다 — 읽은 글자와 충분히 닮았으면 오타 교정이고, 아니면 다른 약이다.
 *
 * `match.ts` 의 자를 그대로 쓴다. 그 파일이 이미 "얼마나 닮아야 같은 약인가" 를
 * 정해 두었고, 답이 두 곳에서 다르면 화면이 두 가지 규칙으로 움직인다.
 *
 * 실패는 실패가 아니다
 * --------------------
 * 못 물어보면 `null` 이다. 망이 없는 곳에서 쓰는 앱이고, 이 조회가 없어도 화면은
 * 그대로 뜬다 — 표에 없다는 그 화면이다. 여기서 던지면 종이 한 장이 통째로 사라진다.
 */

/**
 * 기다릴 시간.
 *
 * 재 봤다 — 여섯 가지 약 이름에 3.8~6.6초, 서버가 과부하일 때 한 번 18.8초. 짧게
 * 잡으면 늦게 도착할 뿐인 정답을 버리고, 길게 잡으면 사람이 카메라 앞에서 기다린다.
 * 정상 범위의 두 배쯤에서 끊는다. 이것 없이도 화면은 뜨므로 끊는 쪽이 안전하다.
 */
const TIMEOUT_MS = 13_000;

/**
 * 이름을 고쳐 받아들일 최소 유사도.
 *
 * `match.ts` 의 `MIN_SIMILARITY`(0.72)보다 **높다.** 저쪽은 94종이라는 닫힌 목록
 * 안에서 가장 가까운 것을 고르는 일이라 0.72 로도 답이 하나로 모인다. 여기는 목록이
 * 닫혀 있지 않아서 그 논거가 없다 — 세상의 모든 약 이름 중 아무거나 올 수 있으므로
 * 더 닮아야 같은 것으로 친다.
 */
const RENAME_MIN = 0.82;

/** 같은 종이를 두 번 찍는 일이 흔하다. 한 번 물어본 것은 안 다시 묻는다. */
const seen = new Map<string, DrugLookup | null>();

/**
 * 돌아온 이름을 쓸 것인가.
 *
 * 셋 다여야 한다 — 모델이 확신하고, 이름이 있고, 읽은 글자와 닮았다.
 */
export function renameOk(read: string, out: DrugLookup): boolean {
  if (!out.confident || !out.name) return false;
  const a = normalize(read);
  const b = normalize(out.name);
  if (!a || !b) return false;
  return similarity(a, b) >= RENAME_MIN;
}

export async function lookUpDrug(read: string): Promise<DrugLookup | null> {
  const key = read.trim().toLowerCase();
  if (!key) return null;
  if (seen.has(key)) return seen.get(key) ?? null;

  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), TIMEOUT_MS);
  try {
    const res = await fetch('/api/drug', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ read }),
      signal: stop.signal,
    });
    if (!res.ok) throw new Error(`drug ${res.status}`);
    const out = (await res.json()) as DrugLookup;
    const useful = out?.known ? out : null;
    seen.set(key, useful);
    return useful;
  } catch (err) {
    console.warn('[drug] 못 물어봤다:', err);
    // 못 물어본 것은 캐시하지 않는다 — 망이 돌아오면 다음 장에서 다시 시도한다.
    return null;
  } finally {
    clearTimeout(timer);
  }
}
