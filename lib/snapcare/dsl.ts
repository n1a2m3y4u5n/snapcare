/**
 * SIGIL DSL 소스를 라벨(줄) 단위로 쪼개고, 줄마다 안정적인 캐시 키를 만든다.
 *
 * 엔진(engine/main.py)은 소스의 non-blank 한 줄 = 픽토그램 1장으로 컴파일하고,
 * '%'/'#' 이후는 주석으로 버린다. 여기서도 같은 규칙을 쓴다 —
 * 서버(렌더·캐시 기록)와 클라이언트(캐시 조회)가 반드시 같은 키를 얻어야 하기 때문.
 */

/** 소스 → 라벨 줄 배열 (주석·빈 줄 제거). 엔진의 _strip_comments 와 동일 규칙. */
export function splitDslLines(source: string): string[] {
  return source
    .split('\n')
    .map((l) => l.replace(/[%#].*$/, '').trim())
    .filter((l) => l.length > 0);
}

/**
 * 라벨 줄 → 캐시 키. FNV-1a 32bit.
 * 암호용이 아니라 파일명용이므로 sync·의존성 없음이 중요하다
 * (crypto.subtle 은 async + secure context 요구라 클라이언트 폴백에 부적합).
 */
export function dslKey(line: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < line.length; i++) {
    h ^= line.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** 캐시된 픽토그램의 public 경로. */
export function cachedPictogramPath(line: string): string {
  return `/pictograms/${dslKey(line)}.png`;
}

/** 캐시 매니페스트 — 키 → 원본 DSL 줄 (디버깅·검증용). */
export type PictogramManifest = Record<string, string>;
