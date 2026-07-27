/**
 * OCR 오독을 견디는 낱말 찾기.
 *
 * 왜 필요한가: 숫자는 검증 관문이 걸러내지만(범위·포함관계·질량·열량) 낱말은 걸러낼
 * 방법이 없다. 그런데 처방전에서 행동을 좌우하는 것의 절반은 낱말이다 — 시간대,
 * 금기, 보관.
 *
 * 실측한 오독 (표본 처방전, Tesseract eng):
 *   "Morning, noon and evening."   → "Moming, noon and evening."   (rn → m)
 *   "Caution if breastfeeding."    → "Caution if breastizeding."   (tf → iz)
 *   "Not for use in pregnancy"     → "Notfor use in pregnancy"     (공백 소실)
 *
 * 첫 번째는 아침 복용을 통째로 지웠고, 두 번째는 수유 금기를 판정 엔진에 도달하지
 * 못하게 했다. 둘 다 정규식이 정확한 철자를 요구했기 때문이다.
 *
 * 여기서 하는 것은 철자 하나가 틀려도 같은 낱말로 보는 것뿐이다. 문턱을 넘기면
 * 엉뚱한 낱말이 걸리므로(예: 편집거리 3이면 'morning' 이 'mourning' 과 구별되지 않는다)
 * 기본값을 작게 잡고, 짧은 낱말은 아예 정확히 맞아야 하도록 한다.
 */

/**
 * 알려진 모양 혼동을 한쪽으로 모은다.
 *
 * "morning" → "moming" 은 무작위 오류가 아니라 rn 두 글자가 m 한 글자로 붙어 보이는
 * 모양 혼동이다. 이것을 일반 편집거리로 다루면 편집 2가 필요한데, 7자 낱말에 2를
 * 허용하면 서로 다른 낱말이 뭉개진다. 그래서 혼동은 혼동으로 처리하고, 편집거리는
 * 좁게 유지한다.
 *
 * 양쪽(찾는 낱말과 읽힌 낱말)에 같은 규칙을 적용하므로 방향은 상관없다 —
 * rn 도 m 도 전부 m 이 된다.
 */
function foldConfusions(s: string): string {
  return s
    .replace(/rn/g, 'm')     // morning → moming
    .replace(/cl/g, 'd')     // clear → dear 류
    .replace(/vv/g, 'w');
}

/** 두 문자열의 편집거리. 낱말 길이가 짧아 단순 DP 로 충분하다. */
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  const cur = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur.slice();
  }
  return prev[n];
}

/**
 * 낱말 길이에 따라 허용할 편집 수.
 *
 * 짧은 낱말에 관용을 주면 서로 다른 낱말이 같아진다 — 'noon' 에 1을 주면 'soon',
 * 'moon' 이 전부 걸린다. 그래서 6자 미만은 정확히 맞아야 한다.
 */
export function allowedEdits(word: string): number {
  if (word.length < 6) return 0;
  if (word.length < 10) return 1;
  return 2;
}

/**
 * text 안에 word 가 (오독을 감안해) 들어 있는가.
 *
 * 문자열 전체가 아니라 낱말 단위로 본다. 부분 문자열로 보면 긴 텍스트에서 우연히
 * 맞는 구간이 반드시 생긴다.
 */
export function fuzzyHasWord(text: string, word: string, maxEdits?: number): boolean {
  const limit = maxEdits ?? allowedEdits(word);
  // 혼동을 접은 뒤 비교한다. 접기 전 길이로 예산을 정하는 이유는, 접고 나면
  // 낱말이 짧아져 예산이 줄어드는 쪽으로만 움직여 관용이 커지지 않기 때문이다.
  const target = foldConfusions(word.toLowerCase());
  // 공백이 사라지는 오독("Notfor")이 있어 낱말 경계만으로는 놓친다.
  // 그래서 낱말로도 보고, 붙어버린 경우를 위해 길이가 비슷한 창으로도 훑는다.
  const tokens = text.toLowerCase().split(/[^a-z가-힣]+/).filter(Boolean)
    .map(foldConfusions);
  for (const tk of tokens) {
    if (tk === target) return true;
    if (limit > 0 && Math.abs(tk.length - target.length) <= limit
        && editDistance(tk, target) <= limit) return true;
    // 붙어버린 토큰 안에 들어 있는 경우 ("notfor" 안의 "for")
    if (limit > 0 && tk.length > target.length) {
      for (let i = 0; i + target.length - limit <= tk.length; i++) {
        const win = tk.slice(i, i + target.length + limit);
        if (win.length >= target.length - limit
            && editDistance(win, target) <= limit) return true;
      }
    }
  }
  return false;
}

/** 여러 낱말 중 하나라도 있으면 참. */
export function fuzzyHasAny(text: string, words: string[]): boolean {
  return words.some((w) => fuzzyHasWord(text, w));
}
