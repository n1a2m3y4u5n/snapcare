/**
 * 찍은 것의 사진을 작게 남긴다 — 얼마나, 어디에, 언제까지.
 *
 * 왜 남기는가
 * -----------
 * 지금까지 사진은 판정에 쓰고 버렸다. 그런데 기록을 되짚는 화면에서 "이 날 뭘
 * 먹었나" 에 답하는 것은 이름(`Peanut chocolate bar`)이 아니라 **그림**이다.
 * 이름은 읽어야 하고, 이 앱의 사용자는 그것을 못 읽는 사람이다. 자기가 찍은 사진은
 * 읽을 필요가 없다.
 *
 * 왜 서버로 안 보내는가
 * ---------------------
 * 동기화 블롭은 지금 몇 KB 다. 사진이 들어가면 그것이 몇 MB 가 되고, 매 변경마다
 * 통째로 올라간다 — 대상 지역의 데이터 값을 생각하면 그것만으로 안 될 이유다.
 *
 * 그리고 사진은 이 앱이 다루는 것 중 가장 사적이다. 부엌, 약봉지, 손, 때로는 얼굴이
 * 같이 찍힌다. 판정에 필요한 것은 이미 뽑아냈고 그것만 서버로 간다. 사진 자체는
 * 그 폰을 벗어나지 않는다.
 *
 * 어디에 두는가
 * -------------
 * IndexedDB. localStorage 는 문자열만 담고 한도가 5 MB 안팎이라, 기록과 프로필이
 * 같이 쓰는 그 자리에 사진을 넣으면 **사진이 커진 날 기록이 저장에 실패한다.**
 * 잃으면 안 되는 쪽이 기록이다.
 */

/** 섬네일 한 변의 최대 길이(px). 목록에서 36–96px 로 그리므로 이보다 클 이유가 없다. */
export const THUMB_MAX = 160;

/** JPEG 품질. 0.6 이면 160px 짜리가 대체로 4–8 KB 다. */
export const THUMB_QUALITY = 0.6;

/**
 * 몇 장까지 들고 있을 것인가.
 *
 * 기록 보관이 200개·90일이므로(lib/snapcare/retention.ts) 그보다 많이 들고 있어 봐야
 * 가리킬 기록이 없다. 200장 × 8 KB ≈ 1.6 MB — IndexedDB 에서 문제되지 않는 크기다.
 */
export const MAX_PHOTOS = 200;

/** 한 변을 THUMB_MAX 안에 넣는 크기. 비율은 지킨다. */
export function fitBox(w: number, h: number, max = THUMB_MAX): { w: number; h: number } {
  if (w <= 0 || h <= 0 || !Number.isFinite(w) || !Number.isFinite(h)) return { w: 0, h: 0 };
  // 원본이 이미 작으면 늘리지 않는다. 늘려 봐야 흐릿한 큰 그림이고 용량만 는다.
  if (w <= max && h <= max) return { w: Math.round(w), h: Math.round(h) };
  const scale = max / Math.max(w, h);
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

/**
 * 넘치는 만큼 **오래된 것부터** 버릴 목록.
 *
 * 살아 있는 기록이 가리키는 사진은 남긴다. 기록이 이미 지워진 사진은 아무도 못 보는
 * 것이므로 나이와 상관없이 먼저 버린다 — 그렇게 안 하면 지워진 기록의 사진이
 * 자리를 차지한 채로 최근 사진이 밀려난다.
 *
 * @param stored  가진 사진의 id 와 저장 시각, 새것부터든 옛것부터든 상관없다
 * @param live    지금 기록에 남아 있는 id 들
 */
export function toEvict(
  stored: { id: string; at: number }[],
  live: Set<string>,
  max = MAX_PHOTOS,
): string[] {
  const orphans = stored.filter((p) => !live.has(p.id)).map((p) => p.id);
  const kept = stored.filter((p) => live.has(p.id)).sort((a, b) => b.at - a.at);
  const over = kept.slice(max).map((p) => p.id);
  return [...orphans, ...over];
}
