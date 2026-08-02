/**
 * 픽토그램 한 장을 한 문장으로.
 *
 * 왜 필요한가
 * -----------
 * 픽토그램은 이 앱의 핵심 기여인데, 화면에서 **유일하게 말을 하지 않는 요소**였다.
 * 판정도 제품명도 영양 수치도 누르면 읽히는데, 정작 그림만 조용했다.
 *
 * 그것이 왜 문제인지는 연구가 말해 준다. 저문해 환자 대상 약품 픽토그램 연구
 * (Merks 외, Patient Education and Counseling 2017)에서 열 개 중 절반만 67% 이해에
 * 도달했고, 저문해 집단에서는 두 개뿐이었다. 그리고 셋에서 **거짓 확신**이 나타났다 —
 * 못 알아봤는데 알아봤다고 믿는 것이다. 그림이 없는 것보다 나쁜 실패다. 못 알아본
 * 사람은 물어보기라도 하지만, 잘못 알아본 사람은 그대로 행동한다.
 *
 * 같은 연구가 내놓은 처방이 이것이다: **약사가 그림의 뜻을 함께 짚어 주면** 이해도가
 * 올라간다. 그림은 말을 대체할 때가 아니라 말을 **받칠 때** 가장 잘 듣는다.
 *
 * 우리 사용자 곁에는 약사가 없다. 그래서 앱이 그 역할을 한다 — 그림을 누르면 그
 * 그림이 무엇을 뜻하는지 말한다. 거짓 확신을 깨는 유일한 방법은 확인할 길을 주는
 * 것이고, 우리는 이미 음성 통로를 갖고 있었다.
 *
 * 무엇을 말하는가
 * ---------------
 * 그림의 **생김새**가 아니라 **지시**를 말한다. "알약과 그릇" 이 아니라 "밥과 함께
 * 드세요" 다. 생김새를 말하면 이미 보고 있는 것을 되풀이할 뿐이고, 정작 모르는 것 —
 * 그래서 무엇을 하라는 것인가 — 은 그대로 남는다.
 */

/** DSL 한 줄의 뼈대. `\no{\x}` · `\head{\mod}` · `\cadence{\head{\mod}}` · `\x` */
interface Parsed {
  head: string;
  modifier?: string;
  cadence?: string;
  negated: boolean;
  /** `\?concept` — 우리 세트에 그림이 없는 개념. */
  missing?: string;
}

const CADENCE = new Set(['twice_daily', 'three_times_daily', 'four_times_daily']);

/**
 * 줄을 뜯어 본다.
 *
 * 정규식 하나로 끝내지 않는 이유: 중첩이 세 겹까지 간다
 * (`\three_times_daily{\tablet_blister{\food_bowl}}`). 겉을 벗기면서 무엇을 벗겼는지
 * 기억해 두는 편이 읽기도 쉽고, 새 연산자가 생겨도 갈래 하나만 더하면 된다.
 */
export function parseDslLine(line: string): Parsed | null {
  let s = line.trim();
  if (s.startsWith('\\?')) return { head: '', negated: false, missing: s.slice(2) };

  let negated = false;
  let cadence: string | undefined;

  for (let guard = 0; guard < 4; guard++) {
    const m = /^\\([a-z_?]+)\{(.*)\}$/i.exec(s);
    if (!m) break;
    const [, op, inner] = m;
    if (op === 'no') { negated = true; s = inner.trim(); continue; }
    if (CADENCE.has(op)) { cadence = op; s = inner.trim(); continue; }
    // 연산자가 아니라 머리+슬롯이다. 여기가 바닥이다.
    return { head: op, modifier: inner.replace(/^\\/, '').trim(), cadence, negated };
  }

  const bare = /^\\([a-z_]+)$/i.exec(s);
  if (!bare) return null;
  return { head: bare[1], cadence, negated };
}

/**
 * 개념 → 말.
 *
 * `no` 를 따로 두는 이유: 부정이 늘 "…이 없는" 이 아니다. 알레르겐은 "땅콩이 들어
 * 있지 않은 것을 고르세요" 지만, 약은 "이 약을 드시지 마세요" 다. 한쪽은 고르는
 * 기준이고 한쪽은 금지라, 같은 틀로 찍으면 둘 중 하나가 반드시 어색해진다.
 */
/**
 * `alone` 은 그 형태소가 **혼자 한 칸을 차지할 때** 하는 말이다.
 *
 * 시각 형태소가 그렇다. 약 그림 안에 들어가 있을 때는 "아침에" 라는 꾸밈말이지만,
 * 자기 칸을 얻고 나면 그 칸이 하는 말 전체가 되어야 한다 — "아침에." 만 들리면
 * 무엇을 아침에 하라는 것인지 문장이 끝나지 않는다.
 */
const CONCEPT: Record<string, { yes: string; no?: string; alone?: string }> = {
  // 무엇이 들어 있는가
  allergen_peanut: { yes: 'It has peanuts.', no: 'Do not eat this. It has peanuts.' },
  allergen_tree_nut: { yes: 'It has nuts.', no: 'Do not eat this. It has nuts.' },
  allergen_milk: { yes: 'It has milk.', no: 'Do not eat this. It has milk.' },
  allergen_egg: { yes: 'It has egg.', no: 'Do not eat this. It has egg.' },
  allergen_shellfish: { yes: 'It has shellfish.', no: 'Do not eat this. It has shellfish.' },
  allergen_gluten: { yes: 'It has wheat.', no: 'Do not eat this. It has wheat.' },
  allergen_soy: { yes: 'It has soy.', no: 'Do not eat this. It has soy.' },
  allergen_sesame: { yes: 'It has sesame.', no: 'Do not eat this. It has sesame.' },
  food_sugar: { yes: 'It has a lot of sugar.', no: 'Too much sugar for you.' },
  food_salt: { yes: 'It has a lot of salt.', no: 'Too much salt for you.' },
  food_oil: { yes: 'It has a lot of fat.', no: 'Too much fat for you.' },
  caffeine: { yes: 'It has caffeine.', no: 'No caffeine for you.' },
  no_alcohol: { yes: 'No alcohol while you take this.' },
  warn_bleeding: { yes: 'This can make bleeding worse.' },
  state_pregnant: { yes: 'Not safe while pregnant.' },
  state_breastfeeding: { yes: 'Not safe while breastfeeding.' },

  // 무엇을 먹는가 (머리)
  capsule_strip: { yes: 'A capsule.', no: 'Do not take this capsule.' },
  tablet_blister: { yes: 'A tablet.', no: 'Do not take this tablet.' },
  pill_bottle: { yes: 'This medicine.', no: 'Do not take this medicine.' },
  liquid_bottle: { yes: 'The liquid medicine.', no: 'Do not take this medicine.' },
  dropper_bottle: { yes: 'The drops.', no: 'Do not use these drops.' },
  cream_tube: { yes: 'The cream.', no: 'Do not use this cream.' },
  inhaler: { yes: 'The inhaler.', no: 'Do not use this inhaler.' },
  syringe: { yes: 'The injection.', no: 'Do not use this injection.' },
  sachet: { yes: 'The powder sachet.', no: 'Do not take this sachet.' },
  suppository: { yes: 'The suppository.', no: 'Do not use this suppository.' },

  // 어떻게 (수식어)
  body_eye: { yes: 'in the eye' },
  body_skin: { yes: 'on the skin' },
  body_mouth: { yes: 'in the mouth' },
  food_bowl: { yes: 'with food' },
  food_empty_bowl: { yes: 'on an empty stomach' },
  time_morning: { yes: 'in the morning', alone: 'Take it in the morning.' },
  time_noon: { yes: 'at midday', alone: 'Take it at midday.' },
  time_evening: { yes: 'in the evening', alone: 'Take it in the evening.' },
  time_night: { yes: 'at night', alone: 'Take it at night.' },
  storage_fridge: { yes: 'keep it in the fridge' },
  storage_dry: { yes: 'keep it dry, away from heat' },
  qty_one: { yes: 'one at a time' },
  qty_two: { yes: 'two at a time' },
  qty_three: { yes: 'three at a time' },
  qty_four: { yes: 'four at a time' },
  qty_five: { yes: 'five at a time' },
  contact_lens: { yes: 'contact lenses', no: 'Take your contact lenses out first.' },

  // 혼자 서는 지시
  hand_wash: { yes: 'Wash your hands first.' },
  finish_course: { yes: 'Finish all of it, even when you feel better.' },
};

const CADENCE_SAY: Record<string, string> = {
  twice_daily: 'twice a day',
  three_times_daily: 'three times a day',
  four_times_daily: 'four times a day',
};

/** 문장 끝을 마침표로 맞춘다 — 음성 합성이 여기서 숨을 쉰다. */
function period(s: string): string {
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

/**
 * DSL 한 줄 → 읽어 줄 문장. 뜻을 모르면 null (그때는 아무 말도 하지 않는다).
 *
 * 모르는 것을 지어내지 않는 것이 요점이다. 틀린 설명은 거짓 확신을 만들고, 그것이
 * 이 그림들이 막으려는 바로 그 실패다.
 */
export function dslSentence(line: string): string | null {
  const p = parseDslLine(line);
  if (!p) return null;
  if (p.missing) return 'We have no picture for this one.';

  const head = CONCEPT[p.head];
  if (!head) return null;

  // 혼자 선 형태소는 자기 칸의 말을 통째로 한다. 꾸밈말로 쓰일 때(`\head{\mod}`)는
  // 아래 modifier 가지로 가므로 여기 오지 않는다.
  const base = p.negated
    ? (head.no ?? `No ${head.yes.replace(/\.$/, '').toLowerCase()}.`)
    : (head.alone ?? head.yes);

  const parts = [base.replace(/\.$/, '')];
  if (p.modifier) {
    const mod = CONCEPT[p.modifier];
    if (mod) parts.push(mod.yes);
  }
  if (p.cadence && CADENCE_SAY[p.cadence]) parts.push(CADENCE_SAY[p.cadence]);

  return period(parts.join(', '));
}
