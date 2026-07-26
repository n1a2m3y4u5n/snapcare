import type { ItemFlag, ScanItem } from './types';

/**
 * ScanItem → SIGIL DSL (.p 소스).
 *
 * 오래 비어 있던 자리다. 형태소는 예순 개가 넘는데 이 파일이 아는 낱말은 셋뿐이라
 * (pill_bottle · food_bowl · no) 안약을 찍어도 알약통이 나왔고, 땅콩이 든 과자를 찍어
 * 회피 판정이 떠도 땅콩 그림은 어디에도 없었다. 글을 읽지 않아도 되게 만들겠다는 앱에서
 * 그림을 맡은 엔진이 화면 절반에서 빠져 있던 셈이다.
 *
 * 여기서 정하는 것은 "무엇을 그릴까"가 아니라 "이 판정에서 사용자가 알아야 할 것이
 * 무엇인가"다. 순서가 곧 읽는 순서이므로 위험한 것부터 앞에 놓는다.
 */

const CADENCE: Record<number, string> = {
  2: 'twice_daily',
  3: 'three_times_daily',
  4: 'four_times_daily',
};

const TIME_MOD: Record<string, string> = {
  Morning: 'time_morning',
  Noon: 'time_noon',
  Evening: 'time_evening',
  Night: 'time_night',
};

/** 제형 → 그림의 머리. OCR 이 알아낸 값을 그대로 쓴다. */
const FORM_HEAD: Record<string, string> = {
  tablet: 'tablet_blister',
  capsule: 'capsule_strip',
  syrup: 'liquid_bottle',
  eyedrop: 'dropper_bottle',
  cream: 'cream_tube',
  inhaler: 'inhaler',
  injection: 'syringe',
  suppository: 'suppository',
  sachet: 'sachet',
};

/** 아이템 플래그 → 그것을 가리키는 형태소. */
const FLAG_GLYPH: Partial<Record<ItemFlag, string>> = {
  peanut: 'allergen_peanut',
  tree_nuts: 'allergen_tree_nut',
  gluten: 'allergen_gluten',
  lactose: 'allergen_milk',
  shellfish: 'allergen_shellfish',
  egg: 'allergen_egg',
  soy: 'allergen_soy',
  sesame: 'allergen_sesame',
  high_sugar: 'food_sugar',
  high_salt: 'food_salt',
  high_sat_fat: 'food_oil',
  caffeine: 'caffeine',
  alcohol: 'no_alcohol',
  nsaid_bleed: 'warn_bleeding',
  unsafe_pregnancy: 'state_pregnant',
  unsafe_breastfeeding: 'state_breastfeeding',
};

/**
 * 이 아이템에 들어 있는 것들.
 *
 * 판정이 안전이 아니면 금지 기호를 씌운다. 안전할 때도 그림은 남긴다 — "무엇이 들어
 * 있는가"는 경고가 아닐 때도 알아야 하는 정보이고, 이 앱에서 그걸 전할 통로는 그림뿐이다.
 */
function contentLabels(item: ScanItem, avoid: boolean): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const flag of item.flags) {
    const glyph = FLAG_GLYPH[flag];
    if (!glyph || seen.has(glyph)) continue;
    seen.add(glyph);
    out.push(avoid ? `\\no{\\${glyph}}` : `\\${glyph}`);
  }
  return out;
}

/**
 * 제형 → 몸의 어디에 쓰는가.
 *
 * 안약을 '눈에' 넣는다는 것은 지시의 절반인데, 그림에는 병만 있고 눈이 없었다.
 * OCR 이 제형을 알아내는 순간 부위도 정해지므로 따로 물을 필요가 없다.
 */
const FORM_SITE: Record<string, string> = {
  eyedrop: 'body_eye',
  cream: 'body_skin',
  inhaler: 'body_mouth',
  syrup: 'body_mouth',
};

/** 약/처방 → 어떻게 먹는가. 제형·횟수·식사·시간대를 그림으로 옮긴다. */
function medicineLabels(item: ScanItem, avoid: boolean): string[] {
  const labels: string[] = [];
  const rx = item.rx;
  const head = (rx?.form && FORM_HEAD[rx.form]) || 'pill_bottle';
  const site = rx?.form ? FORM_SITE[rx.form] : undefined;
  const withFood = /food|meal/i.test(rx?.dosageText ?? '');
  const freq = rx?.schedule.length ?? 1;

  // 회피면 그것부터. 나머지 지시를 읽기 전에 멈춰야 한다.
  if (avoid) labels.push(`\\no{\\${head}}`);

  // 손을 씻고 시작하는 약이 있다 (안약·연고). 순서가 곧 읽는 순서이므로 앞에 놓는다.
  if (rx?.handwash) labels.push('\\hand_wash');

  // 슬롯은 하나뿐이다. 부위가 있으면 부위가 먼저다 — 안약에 '식사와 함께' 는 뜻이 없고,
  // '눈에' 는 이 지시의 절반이다.
  const slot = site ?? (withFood ? 'food_bowl' : undefined);
  let core = slot ? `\\${head}{\\${slot}}` : `\\${head}`;
  if (CADENCE[freq]) core = `\\${CADENCE[freq]}{${core}}`;
  labels.push(core);

  for (const s of rx?.schedule ?? []) {
    const tm = TIME_MOD[s.label];
    if (tm) labels.push(`\\${head}{\\${tm}}`);
  }
  return labels;
}

export function itemToDsl(item: ScanItem, avoid: boolean): string {
  const isRx = item.kind === 'medicine' || item.kind === 'prescription';
  const labels = isRx
    ? [...medicineLabels(item, avoid), ...contentLabels(item, avoid)]
    : contentLabels(item, avoid);

  return labels.join('\n');
}
