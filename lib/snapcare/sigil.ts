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

/** 1회 복용 개수 → 점 그림. 숫자가 아니라 셀 수 있는 점으로 보여준다. */
const QTY: Record<number, string> = {
  1: 'qty_one', 2: 'qty_two', 3: 'qty_three', 4: 'qty_four', 5: 'qty_five',
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

/** 약/처방 → 어떻게 먹는가. 순서가 곧 읽는 순서라, 먼저 할 일부터 놓는다. */
function medicineLabels(item: ScanItem, avoid: boolean): string[] {
  const labels: string[] = [];
  const rx = item.rx;
  // 모르는 제형이면 지금까지 조용히 pill_bottle 로 떨어졌다 — 흡입기든 네뷸라이저든
  // 약병 그림이 떴고, 그런 일이 얼마나 자주 일어나는지 아무 기록도 없었다.
  //
  // 이제 진짜 물건을 앞에 한 칸 세운다 (\? 는 "이 개념의 그림이 없다" 는 표시로,
  // 온라인 판은 그 자리에서 만들어 넣고 온디바이스 판은 없다고 알린다).
  //
  // 부분적인 해결이다: head 는 시각·개수·보관 줄의 **그릇**이기도 해서, 그 줄들은
  // 여전히 일반형 약병 위에 그려진다. 제대로 고치려면 그 개념이 정식 형태소가 되어야
  // 한다 — /api/glyph 가 남기는 목록이 그래서 있다.
  const known = rx?.form ? FORM_HEAD[rx.form] : undefined;
  if (rx?.form && !known) labels.push(`\\?${rx.form}`);
  const head = known || 'pill_bottle';
  const site = rx?.form ? FORM_SITE[rx.form] : undefined;
  const dosage = rx?.dosageText ?? '';
  const freq = rx?.schedule.length ?? 1;

  // 회피면 그것부터. 나머지 지시를 읽기 전에 멈춰야 한다.
  if (avoid) labels.push(`\\no{\\${head}}`);

  // 손을 씻고 시작하는 약이 있다 (안약·연고).
  if (rx?.handwash) labels.push('\\hand_wash');

  // 슬롯은 하나뿐이다. 부위가 있으면 부위가 먼저다 — 안약에 '식사와 함께' 는 뜻이 없고,
  // '눈에' 는 이 지시의 절반이다. 부위가 없으면 식사 맥락이 그 자리를 쓴다.
  //
  // 공복(before meals)은 빈 그릇으로 그린다. 예전에는 '식사와 함께' 만 그렸고 공복은
  // 아무것도 안 그렸는데, 그러면 식전 약과 아무 조건 없는 약이 같은 그림이 된다 —
  // 공복에 먹어야 하는 약을 밥과 함께 먹으면 흡수가 달라진다.
  const meal = /before\s*meal/i.test(dosage) ? 'food_empty_bowl'
    : /food|with\s*meal/i.test(dosage) ? 'food_bowl'
    : undefined;
  const slot = site ?? meal;
  let core = slot ? `\\${head}{\\${slot}}` : `\\${head}`;
  if (CADENCE[freq]) core = `\\${CADENCE[freq]}{${core}}`;
  labels.push(core);

  // 부위가 슬롯을 차지했으면 식사 맥락은 따로 한 칸을 받는다 (둘 다 지시의 일부다).
  if (site && meal) labels.push(`\\${head}{\\${meal}}`);

  for (const s of rx?.schedule ?? []) {
    const tm = TIME_MOD[s.label];
    if (tm) labels.push(`\\${head}{\\${tm}}`);
  }

  // 한 번에 몇 개인가. 숫자를 못 읽는 사용자에게 '1정' 은 점 하나로만 도착한다.
  if (rx?.doseCount && QTY[rx.doseCount]) labels.push(`\\${head}{\\${QTY[rx.doseCount]}}`);

  // 보관. 냉장이라고 적힌 처방전이 그림에는 나오지 않고 있었다 —
  // 상온에 둔 항생제 시럽은 며칠이면 못 쓰게 된다.
  // 보관 표시는 수식어라 단독으로 설 수 없다 — 무엇을 그렇게 보관하라는 것인지가
  // 함께 있어야 뜻이 성립하기도 한다. 약을 머리로 두고 슬롯에 넣는다.
  const storage = rx?.storage === 'refrigerator' ? 'storage_fridge'
    : rx?.storage === 'room' ? 'storage_dry'
    : undefined;
  if (storage) labels.push(`\\${head}{\\${storage}}`);

  // 기간이 정해진 약은 끝까지 먹어야 한다. 증상이 가시면 끊는 것이 내성의 주요 경로인데,
  // 처방전의 '7일간' 이 화면에 도착하지 않으면 그 지시는 없는 것과 같다.
  if (rx?.durationText && rx.durationText !== 'ongoing') labels.push('\\finish_course');

  // 안약을 넣는 동안 렌즈를 끼면 약이 렌즈에 갇힌다. OCR 이 이미 읽고 있던 값이다.
  if (rx?.noLens) labels.push('\\no{\\contact_lens}');

  return labels;
}

export function itemToDsl(item: ScanItem, avoid: boolean): string {
  const isRx = item.kind === 'medicine' || item.kind === 'prescription';
  const labels = isRx
    ? [...medicineLabels(item, avoid), ...contentLabels(item, avoid)]
    : contentLabels(item, avoid);

  return labels.join('\n');
}
