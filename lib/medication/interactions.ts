import type { ScanItem } from '@/lib/snapcare/types';

/**
 * 복약 안전 검사 — 새 약과 이미 먹고 있는 약을 대조한다.
 *
 * 영양 쪽에는 WHO 기준 유도와 4중 검증이 있는데 복약 쪽은 정규식 두 줄뿐이었다.
 * 원래 논지의 중심이 더 얇았던 셈이다.
 *
 * 여기서 다루는 것은 **글을 못 읽는 사람에게 특히 자주 일어나는** 두 가지다:
 *
 *  1. 성분 중복 — 같은 성분이 다른 상품명으로 팔린다. 감기약과 진통제를 함께 먹고
 *     아세트아미노펜을 두 배로 삼키는 일이 흔하고, 간독성은 용량 의존적이라 치명적이다.
 *     상품명을 읽을 수 없으면 이걸 스스로 피할 방법이 없다.
 *  2. 잘 알려진 약물 상호작용 — 항응고제와 NSAID 병용 출혈 위험 등.
 *
 * 외부 DB를 쓰지 않는다. 대상 지역에서 인터넷을 전제할 수 없고, 여기 담은 것은
 * 규모가 아니라 빈도·중증도로 고른 소수의 항목이다. 표를 넓히는 것은 dictionary 추가로 끝난다.
 */

/** 상품명이 달라도 같은 것으로 묶는 활성 성분. */
export type Ingredient =
  | 'acetaminophen' | 'ibuprofen' | 'naproxen' | 'aspirin'
  | 'amoxicillin' | 'metformin' | 'warfarin';

/**
 * 성분 인식 — 일반명과 상품명을 함께 본다.
 *
 * 상품명을 빼면 안 된다. 포장지에 크게 인쇄되는 것은 상품명이고, 성분명은 작은 글씨로
 * 뒤에 있다. 성분 중복 사고가 바로 여기서 난다 — 이름이 다르니 같은 약인 줄 모른다.
 * (지역별 상품명은 여기에 추가하면 되고, 코드는 바뀌지 않는다)
 */
const INGREDIENT_PATTERNS: { ingredient: Ingredient; match: RegExp }[] = [
  { ingredient: 'acetaminophen', match: /acetaminophen|paracetamol|tylenol|panadol|calpol|doliprane|아세트아미노펜|타이레놀|세토펜|펜잘|써스펜/i },
  { ingredient: 'ibuprofen', match: /ibuprofen|advil|motrin|nurofen|brufen|이부프로펜|부루펜|애드빌/i },
  { ingredient: 'naproxen', match: /naproxen|aleve|naprosyn|나프록센/i },
  { ingredient: 'aspirin', match: /aspirin|acetylsalicyl|아스피린/i },
  { ingredient: 'amoxicillin', match: /amoxicillin|amoxil|아목시실린/i },
  { ingredient: 'metformin', match: /metformin|glucophage|메트포르민|메트폴민/i },
  { ingredient: 'warfarin', match: /warfarin|coumadin|와파린/i },
];

/** NSAID 계열 — 서로 겹치면 위장 출혈 위험이 커진다. */
const NSAIDS: Ingredient[] = ['ibuprofen', 'naproxen', 'aspirin'];

export interface InteractionWarning {
  level: 'caution' | 'avoid';
  /** 화면·음성에 그대로 쓰는 짧은 문장 */
  text: string;
  /** 어떤 성분끼리 걸렸는지 (설명·디버깅용) */
  between: Ingredient[];
}

/** 이름·처방 문구에서 활성 성분을 뽑는다. */
export function ingredientsOf(item: ScanItem): Ingredient[] {
  const text = [item.name, item.rx?.dosageText, item.detectedVia].filter(Boolean).join(' ');
  return INGREDIENT_PATTERNS.filter((p) => p.match.test(text)).map((p) => p.ingredient);
}

/**
 * 새로 스캔한 약 vs 이미 복용 중인 약들.
 * 반환이 비어 있으면 아는 범위에서 문제가 없다는 뜻이지, 안전을 보증하는 것은 아니다.
 */
export function checkInteractions(incoming: ScanItem, active: ScanItem[]): InteractionWarning[] {
  const mine = ingredientsOf(incoming);
  if (mine.length === 0) return [];

  const theirs = new Set(active.flatMap(ingredientsOf));
  const warnings: InteractionWarning[] = [];

  for (const ing of mine) {
    // ① 같은 성분을 두 번 — 용량이 합쳐진다
    if (theirs.has(ing)) {
      warnings.push({
        level: 'avoid',
        text: `Already taking ${LABEL[ing]} — taking both doubles the dose`,
        between: [ing],
      });
      continue;
    }

    // ② NSAID 끼리
    if (NSAIDS.includes(ing)) {
      const other = NSAIDS.find((n) => theirs.has(n));
      if (other) {
        warnings.push({
          level: 'avoid',
          text: `${LABEL[ing]} with ${LABEL[other]} raises the risk of stomach bleeding`,
          between: [ing, other],
        });
        continue;
      }
    }

    // ③ 항응고제 + NSAID
    if (NSAIDS.includes(ing) && theirs.has('warfarin')) {
      warnings.push({
        level: 'avoid',
        text: `${LABEL[ing]} with a blood thinner raises the risk of bleeding`,
        between: [ing, 'warfarin'],
      });
    }
    if (ing === 'warfarin') {
      const nsaid = NSAIDS.find((n) => theirs.has(n));
      if (nsaid) {
        warnings.push({
          level: 'avoid',
          text: `A blood thinner with ${LABEL[nsaid]} raises the risk of bleeding`,
          between: ['warfarin', nsaid],
        });
      }
    }
  }

  return warnings;
}

const LABEL: Record<Ingredient, string> = {
  acetaminophen: 'paracetamol',
  ibuprofen: 'ibuprofen',
  naproxen: 'naproxen',
  aspirin: 'aspirin',
  amoxicillin: 'amoxicillin',
  metformin: 'metformin',
  warfarin: 'a blood thinner',
};
