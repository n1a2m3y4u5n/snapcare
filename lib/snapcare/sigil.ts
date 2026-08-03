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

/**
 * 그림이 그 플래그를 **어떤 목소리로** 말하는가.
 *
 * 이 구분이 없어서 뜻이 뒤집혀 나갔다. 2026년 8월 전문가 조사에서 네 나라가 같은 것을
 * 짚었다 — "처방전은 임신 중 사용하지 말라고 적혀 있는데 픽토그램은 임신부를 보여주어
 * 환자가 임신 중 사용해도 안전하다고 생각하게 만든다"(파키스탄 Atif Usman 교수). 뜻이
 * 전달되지 않는 것이 아니라 **정반대로 전달된다.** ISO 9186 의 단순 오독이 아니라
 * ANSI Z535.3 이 말하는 치명적 혼동이다.
 *
 *  content — 들어 있는 것. 땅콩·소금·카페인처럼 "이 안에 무엇이 있는가"를 말한다.
 *            이 사람에게 걸리면 사선을 긋고, 안 걸리면 그냥 둔다. 걸리지 않아도 그림은
 *            남긴다 — 무엇이 들어 있는지는 경고가 아닐 때도 알아야 한다.
 *
 *  forbid  — 하지 말 것인데 **그림 자체는 중립적인 상태**다. `state_pregnant` 는 임신부
 *            그림 한 장이라, 그대로 두면 "임신부용" 으로 읽힌다. 판정과 무관하게 언제나
 *            감싼다. 임신하지 않은 사용자가 찍었다고 해서 임신 금기가 사라지는 것이
 *            아니다 — 그 처방전은 다른 사람에게도 간다.
 *
 *  carries — 그림에 이미 금지나 경고가 들어 있다. 절대 감싸지 않는다.
 *            `no_alcohol` 을 `\no{}` 로 감싸면 금주 표시에 사선이 그어져 **마셔도 된다**가
 *            된다. 위와 정확히 반대 방향의 같은 사고이고, 지금까지 회피 판정에서 실제로
 *            그렇게 나가고 있었다. `warn_bleeding` 은 경고이지 상태가 아니라서, 감싸면
 *            "출혈하지 말 것" 이라는 말이 안 되는 그림이 된다.
 */
type FlagVoice = 'content' | 'forbid' | 'carries';

/** 아이템 플래그 → 그것을 가리키는 형태소와, 그 형태소가 말하는 방식. */
const FLAG_GLYPH: Partial<Record<ItemFlag, { glyph: string; voice: FlagVoice }>> = {
  peanut: { glyph: 'allergen_peanut', voice: 'content' },
  tree_nuts: { glyph: 'allergen_tree_nut', voice: 'content' },
  gluten: { glyph: 'allergen_gluten', voice: 'content' },
  lactose: { glyph: 'allergen_milk', voice: 'content' },
  shellfish: { glyph: 'allergen_shellfish', voice: 'content' },
  egg: { glyph: 'allergen_egg', voice: 'content' },
  soy: { glyph: 'allergen_soy', voice: 'content' },
  sesame: { glyph: 'allergen_sesame', voice: 'content' },
  high_sugar: { glyph: 'food_sugar', voice: 'content' },
  high_salt: { glyph: 'food_salt', voice: 'content' },
  high_sat_fat: { glyph: 'food_oil', voice: 'content' },
  caffeine: { glyph: 'caffeine', voice: 'content' },
  alcohol: { glyph: 'no_alcohol', voice: 'carries' },
  nsaid_bleed: { glyph: 'warn_bleeding', voice: 'carries' },
  unsafe_pregnancy: { glyph: 'state_pregnant', voice: 'forbid' },
  unsafe_breastfeeding: { glyph: 'state_breastfeeding', voice: 'forbid' },
};

/**
 * 이 아이템에 들어 있는 것과, 이 약으로 하지 말아야 할 것.
 *
 * 사선을 언제 긋는지는 위 FlagVoice 가 정한다. 판정(avoid)이 정하는 것은 content 뿐이다.
 */
function contentLabels(item: ScanItem, avoid: boolean): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const flag of item.flags) {
    const entry = FLAG_GLYPH[flag];
    if (!entry || seen.has(entry.glyph)) continue;
    seen.add(entry.glyph);
    const negate = entry.voice === 'forbid' || (entry.voice === 'content' && avoid);
    out.push(negate ? `\\no{\\${entry.glyph}}` : `\\${entry.glyph}`);
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
  // 흔들고 시작하는 약이 있다 (현탁액·시럽). 손 씻기 바로 뒤에 놓는 것은 순서가
  // 곧 읽는 순서이기 때문이다 — 둘 다 약을 입에 대기 **전에** 하는 일이다.
  if (rx?.shake) labels.push('\\shake_bottle');

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

  // 한 번에 몇 개인가. 숫자를 못 읽는 사용자에게 '1정' 은 점 하나로만 도착한다.
  //
  // **시각보다 앞에 온다.** 전에는 뒤였고, 그 순서가 지적을 받았다 — "첫 그림은 하루
  // 세 번을 나타내지만 한 번에 한 캡슐이라는 것을 나타내지 못한다. 그 뒤에 아침·정오·
  // 저녁 그림이 따로 오므로 혼동이 생긴다"(파키스탄 Atif Usman 교수, 2026년 8월 조사).
  // 표 4 에서 전체 오류의 28.4% 가 용량 오류였다.
  //
  // 순서가 곧 읽는 순서다. '한 번에 몇 개' 를 먼저 놓고 '언제' 를 뒤에 놓으면 다섯 장이
  // 한 문장이 된다 — 이만큼을, 이때·이때·이때. 반대로 놓으면 세 번 나온 시각 뒤에
  // 개수가 하나 붙어서, 그 개수가 하루치인지 한 번치인지가 그림만으로는 갈리지 않는다.
  if (rx?.doseCount && QTY[rx.doseCount]) labels.push(`\\${head}{\\${QTY[rx.doseCount]}}`);

  /*
    시각은 **자기 칸**을 갖는다.

    예전에는 약 그림 안에 넣었다(`\tablet_blister{\time_morning}`). 문법으로는 맞는데
    화면에서 무너졌다 — 앱이 그리는 크기(88px)로 줄이면 블리스터의 구멍 여섯 개가 칸을
    채우고 해는 한가운데 20px 창에 갇혀, **아침과 밤이 구별되지 않는다.** 2026년 8월
    전문가 조사에서 아이콘을 키우라고 지적된 자리가 정확히 여기다.

    그래서 그림을 키운 것이 아니라 칸을 줬다. 시각 형태소는 꾸밈이 없어도 뜻이 정해지는
    몇 안 되는 형태소다 — 해 뜨는 그림은 무엇에 붙든 아침이다. 앞 칸이 이미 무슨 약인지
    말했으므로, 이 칸이 다시 말할 필요도 없다.
  */
  for (const s of rx?.schedule ?? []) {
    const tm = TIME_MOD[s.label];
    if (tm) labels.push(`\\${tm}`);
  }

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

/**
 * @param avoid **회피 판정일 때만** 참이다. 주의는 아니다.
 *
 * 부르는 쪽이 `verdict.level !== 'safe'` 를 넘기고 있었다. 그러면 주의가 전부 금지로
 * 그려진다 — `\no{}` 는 사선이고, 사선은 "먹지 마세요" 다. 손글씨 처방전에 주의를
 * 붙이자마자 드러났다: 녹내장 안약 화면에 금지 표시가 떴다. 읽기 어렵다는 이유로
 * 약을 끊으라고 말한 셈이고, 그것은 이 앱이 막으려던 실패의 정확한 거울상이다.
 *
 * 주의는 "확인하고 드세요" 이고 회피는 "드시지 마세요" 다. 글을 못 읽는 사람에게
 * 그 둘을 가르는 것은 사선 하나뿐이라, 사선은 회피에만 나가야 한다.
 */
export function itemToDsl(item: ScanItem, avoid: boolean): string {
  const isRx = item.kind === 'medicine' || item.kind === 'prescription';
  const labels = isRx
    ? [...medicineLabels(item, avoid), ...contentLabels(item, avoid)]
    : contentLabels(item, avoid);

  return labels.join('\n');
}
