/**
 * 이해도 시험에 낼 형태소 10개.
 *
 * 78개에서 무작위로 뽑지 않는다. 무작위로 뽑으면 잘 되는 것만 걸려서 아무것도
 * 배우지 못할 수 있다. 우리가 **약할 것이라고 의심하는 것** 과 **대조군** 을
 * 섞어서 고른다.
 *
 * 합성된 완성 지시가 아니라 **형태소 단위** 로 낸다. 우리 주장이 "형태소를
 * 문법으로 결합한다" 이므로, 형태소 자체가 읽히지 않으면 결합은 논할 필요가 없다.
 *
 * `intended` 는 응답자에게 **시험 중에 보여주지 않는다.** 10장을 다 끝낸 뒤에만
 * 보여준다. 중간에 정답이 보이면 그 뒤 문항이 오염된다.
 */

export type TestGlyph = {
  name: string;
  /** 의도한 뜻. 채점 기준이며 시험 중에는 노출하지 않는다. */
  intended: { ko: string; en: string; ro: string };
  /** 왜 이것을 골랐는지. 우리 기록용이며 화면에 나가지 않는다. */
  reason: string;
};

export const TEST_GLYPHS: TestGlyph[] = [
  // ── 세트 내부 충돌 의심 ──
  // 참깨와 콩은 둘 다 작은 알갱이라 서로 구별되지 않을 수 있다. 알레르기
  // 표시에서 이 둘이 뒤집히면 곧바로 위험이다.
  {
    name: 'allergen_sesame',
    intended: { ko: '참깨 (알레르기)', en: 'sesame (allergen)', ro: 'susan (alergen)' },
    reason: '콩과 형태가 겹칠 위험. 알레르기 표시에서 혼동은 치명적이다',
  },
  {
    name: 'allergen_soy',
    intended: { ko: '콩 (알레르기)', en: 'soy (allergen)', ro: 'soia (alergen)' },
    reason: '참깨와 짝. 두 장을 함께 내야 충돌이 드러난다',
  },

  // ── 형태 충돌: 고칠 수 없다고 판정한 것 ──
  // 좌약은 알약과 형태가 거의 같다. 투여 경로가 완전히 다른데 그림으로는
  // 구별이 안 된다. 이것이 픽토그램의 원리적 한계인지 우리 실패인지 알고 싶다.
  {
    name: 'suppository',
    intended: { ko: '좌약 (항문·질 투여)', en: 'suppository (rectal or vaginal)', ro: 'supozitor (rectal sau vaginal)' },
    reason: '알약과 형태가 겹친다. 투여 경로가 다른데 구별되지 않는다',
  },

  // ── 대상이 물체가 아닌 개념 ──
  // 피부는 그릴 대상이 없다. 몸의 일부를 가리키는 것과 피부 자체를 가리키는
  // 것을 그림으로 나눌 수 있는지가 문제다.
  {
    name: 'body_skin',
    intended: { ko: '피부', en: 'skin', ro: 'piele' },
    reason: '물체가 아닌 개념. 그릴 대상 자체가 없다',
  },

  // ── 재생성에서 여러 번 실패한 것 ──
  // 자동 검사에서 형태가 뭉쳐 여러 차례 다시 그린 형태소다. 기계가 어려워한
  // 것을 사람도 어려워하는지 본다.
  {
    name: 'food_bread',
    intended: { ko: '빵 (밀가루 음식)', en: 'bread (wheat food)', ro: 'pâine (aliment din grâu)' },
    reason: '자동 검사에서 반복 실패했다. 기계와 사람이 같은 것을 틀리는지',
  },

  // ── 수량 표시 ──
  // 수량은 이 시스템에서 가장 위험한 축이다. 한 알과 두 알을 잘못 읽으면
  // 그것이 곧 복용량 오류다.
  {
    name: 'qty_two',
    intended: { ko: '2개 (두 알)', en: '2 units (two tablets)', ro: '2 unități (două tablete)' },
    reason: '수량 오독은 곧 복용량 오류다. 가장 위험한 축',
  },

  // ── 시간 표시 ──
  // 아침과 정오를 해의 높이로 구별한다. 방향이나 각도가 뜻을 지는 그림은
  // 문화에 따라 다르게 읽힐 수 있다.
  {
    name: 'time_noon',
    intended: { ko: '정오 (점심때)', en: 'noon (midday)', ro: 'amiază (la prânz)' },
    reason: '아침과 해의 높이로만 구별된다. 각도가 뜻을 진다',
  },

  // ── 대조군: 잘 될 것으로 보는 것 ──
  // 아래 셋은 자동 검사를 통과했고 형태가 뚜렷하다. 이것들도 기준에 못 미치면
  // 문제는 개별 그림이 아니라 접근 방식에 있다는 뜻이 된다.
  {
    name: 'no_alcohol',
    intended: { ko: '술을 마시지 말 것', en: 'do not drink alcohol', ro: 'nu consumați alcool' },
    reason: '대조군. 금지 기호가 뚜렷하다',
  },
  {
    name: 'storage_fridge',
    intended: { ko: '냉장 보관', en: 'store in a refrigerator', ro: 'păstrați la frigider' },
    reason: '대조군. 실물이 뚜렷한 개념',
  },
  {
    name: 'inhaler',
    intended: { ko: '흡입기 (숨으로 들이마시는 약)', en: 'inhaler (breathe in)', ro: 'inhalator (inhalați)' },
    reason: '대조군. 다만 실물을 본 적 없는 사람에게는 통하지 않을 수 있다',
  },
];

/** 응답자마다 순서를 섞는다. 앞 그림이 뒤 그림 해석에 주는 영향을 걷어낸다. */
export function shuffled<T>(xs: T[]): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function glyphSrc(name: string): string {
  return `/glyphs/${name}.png`;
}
