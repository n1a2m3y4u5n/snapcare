import type { NutrientAmounts, NutrientKey, NutrientProfile } from './types';

/**
 * 영양성분표 OCR → 검증된 영양 프로필.
 *
 * 왜 이 경로가 필요한가: 제품 DB(OpenFoodFacts)는 크라우드소싱이라 대상 지역의
 * 로컬 제품이 거의 없다. 바코드를 읽어도 not found다. 성분표는 그 지역 포장지에도
 * 인쇄돼 있고 인터넷도 DB도 필요 없다. 그리고 성분표는 "글을 읽어야만 쓸 수 있는
 * 정보"의 전형 — 처방전과 같은 구조의 문제다.
 *
 * 왜 검증이 필요한가: 실측해보면 Tesseract는 성분표에서 단위 'g'를 숫자 9/8/¢ 로 읽고
 * 소수점을 자주 흘린다. "Fat 22.4 g" → "Fat 2249". 그대로 믿으면 10배 오류가
 * 그대로 건강 판정에 들어간다. 그래서 읽은 값을 그대로 쓰지 않고,
 *   ① 후보를 여러 개 만들고
 *   ② 영양학적 제약으로 거르고
 *   ③ Atwater 열량 항등식으로 조합을 고른다.
 * 어느 것도 통과하지 못하면 숫자를 보여주지 않고 "다시 찍어달라"고 한다.
 * 틀린 숫자를 보여주는 것보다 못 읽었다고 말하는 편이 안전하다.
 */

/** 100g당 물리적으로 가능한 범위. 벗어나면 OCR 오류로 본다. */
const BOUNDS: Partial<Record<NutrientKey, [number, number]>> = {
  energy: [0, 900],
  fat: [0, 100],
  saturatedFat: [0, 100],
  carbohydrates: [0, 100],
  sugars: [0, 100],
  protein: [0, 100],
  fiber: [0, 100],
  salt: [0, 30],
};

/** Atwater 계수 — 열량 = 4·탄수 + 4·단백 + 9·지방 */
const ATWATER = { carbohydrates: 4, protein: 4, fat: 9 } as const;
/** 열량 항등식 허용 오차. 식이섬유·당알코올 때문에 정확히 맞지는 않는다. */
const ATWATER_TOLERANCE = 0.25;
/** 원문을 한 번 고칠 때마다 매기는 페널티 (Atwater 점수와 같은 척도) */
const EDIT_PENALTY = 0.3;
/** 이 점수 차 안에 드는 조합들을 '경쟁 후보'로 본다 */
const AMBIGUITY_MARGIN = 0.25;
/** 경쟁 후보들의 값이 이 비율 이상 벌어지면 판별 불가로 본다 (20%) */
const VALUE_AGREEMENT = 0.2;
/** 100g당 영양소 합의 상한. 반올림·수분 오차를 감안해 약간 여유를 둔다. */
const MASS_LIMIT = 105;

const PATTERNS: { key: NutrientKey; aliases: string[] }[] = [
  // 더 구체적인 이름을 먼저 — 'saturated fat' 안에 'fat'이 들어있다
  { key: 'saturatedFat', aliases: ['of which saturates', 'saturated fat', 'saturates', '포화지방'] },
  { key: 'sugars', aliases: ['of which sugars', 'total sugars', 'sugars', 'sugar', '당류'] },
  { key: 'fiber', aliases: ['dietary fiber', 'fibre', 'fiber', '식이섬유'] },
  { key: 'carbohydrates', aliases: ['total carbohydrate', 'carbohydrate', 'carbs', '탄수화물'] },
  { key: 'protein', aliases: ['protein', '단백질'] },
  { key: 'fat', aliases: ['total fat', 'fat', '지방'] },
  { key: 'salt', aliases: ['salt', '소금'] },
];

const SODIUM_ALIASES = ['sodium', '나트륨'];
/** 소금(g) = 나트륨(g) × 2.5 (NaCl 58.44 / Na 22.99) */
const SODIUM_TO_SALT = 2.5;
const ENERGY_ALIASES = ['calories', 'energy', '열량', '에너지'];

export interface LabelParseResult {
  profile: NutrientProfile | null;
  basis: 'per100' | 'perServing' | 'unknown';
  servingGrams?: number;
  /** 검증을 통과하지 못해 버린 항목 — 화면에서 "다시 찍어주세요" 근거 */
  rejected: NutrientKey[];
  /** Atwater 항등식 상대 오차 (검사했을 때만) */
  atwaterError?: number;
}

/** 이 텍스트가 영양성분표인가 — 카메라가 처방전 경로와 갈라야 해서 필요하다. */
export function looksLikeNutritionLabel(text: string): boolean {
  const t = text.toLowerCase();
  const markers = ['nutrition', 'per 100', 'serving size', 'calories', 'energy',
    '영양정보', '영양성분', '1회 제공량', '열량'];
  const nutrients = [...PATTERNS.flatMap((p) => p.aliases), ...SODIUM_ALIASES]
    .filter((a) => t.includes(a)).length;
  return markers.some((m) => t.includes(m)) && nutrients >= 2;
}

/**
 * 이 텍스트가 처방전·약 라벨인가.
 *
 * 음식 사진에도 글자는 흔하다 (포장지, 컵, 젓가락 봉투, 메뉴판).
 * "글자가 읽혔으니 처방전"으로 기본값을 두면 밥상 사진이 처방전으로 인식된다 —
 * 실제로 비빔밥 사진에서 그렇게 됐다. 그래서 처방전도 명시적 신호를 요구한다.
 */
export function looksLikePrescription(text: string): boolean {
  const t = text.toLowerCase();
  const signals = [
    /\b\d+\s*mg\b/, /\b\d+\s*ml\b/,
    /tablet|capsule|syrup|ointment|inhaler|suppositor/,
    /once|twice|three times|daily|per day|before meal|after meal/,
    /prescription|pharmacy|dosage|rx\b/,
    /정\b|캡슐|시럽|연고|점안|좌약/,
    /1일\s*\d+회|하루\s*\d+번|식전|식후|복용|처방|약국/,
  ];
  return signals.filter((re) => re.test(t)).length >= 2;
}

/**
 * 라벨 위쪽에서 제품명으로 보이는 줄을 찾는다.
 * 성분표 자체엔 제품명이 없는 경우가 많아, 못 찾으면 정직하게 일반 이름을 쓴다.
 */
function guessProductName(lines: string[]): string {
  const noise = /nutrition|facts|information|typical|values|per\s*100|serving|amount|ingredient|영양|성분|제공량|원재료/i;
  const nutrientish = new RegExp(
    [...PATTERNS.flatMap((p) => p.aliases), ...SODIUM_ALIASES, ...ENERGY_ALIASES].join('|'), 'i',
  );
  for (const line of lines.slice(0, 4)) {
    const t = line.trim();
    if (t.length < 3 || t.length > 40) continue;
    if (noise.test(t) || nutrientish.test(t)) continue;
    if (!/[A-Za-z가-힣]{3}/.test(t)) continue;   // 숫자·기호만인 줄 제외
    return t;
  }
  return 'Packaged food';
}

export function parseNutritionLabel(text: string, name?: string): LabelParseResult {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const servingGrams = parseServingSize(text);
  const per100 = /per\s*100\s*(g|ml)|100\s*g\s*당|100g당/i.test(text);
  const basis: LabelParseResult['basis'] = per100 ? 'per100' : servingGrams ? 'perServing' : 'unknown';

  // ── ① 항목별 후보 생성 ────────────────────────────────
  const candidates = new Map<NutrientKey, Candidate[]>();

  const energy = pickEnergy(lines);
  if (energy !== undefined) candidates.set('energy', [{ value: energy, cost: 0 }]);

  for (const { key, aliases } of PATTERNS) {
    const raw = findRawNumber(lines, aliases);
    if (raw) candidates.set(key, expandCandidates(raw.text, raw.unit, key));
  }
  if (!candidates.has('salt')) {
    const sodium = findRawNumber(lines, SODIUM_ALIASES);
    if (sodium) {
      const asSalt = expandCandidates(sodium.text, sodium.unit, 'salt')
        .map((c) => ({ value: round2(c.value * SODIUM_TO_SALT), cost: c.cost }))
        .filter((c) => within('salt', c.value));
      if (asSalt.length) candidates.set('salt', asSalt);
    }
  }

  // ── ② Atwater로 지방·탄수·단백 조합 선택 ──────────────
  const chosen: NutrientAmounts = {};
  const rejected: NutrientKey[] = [];
  let atwaterError: number | undefined;

  const kcal = candidates.get('energy')?.[0].value;
  const macroKeys = ['carbohydrates', 'protein', 'fat'] as const;

  if (kcal !== undefined && macroKeys.every((k) => candidates.has(k))) {
    // 점수 = 열량 불일치 + 보정 페널티.
    // 원문을 덜 고친 조합을 선호한다 — 그러지 않으면 값들을 잘게 쪼개 열량만 맞춘
    // 그럴듯한 오답이 이긴다 (US 라벨에서 실제로 관측됨).
    const scored: { combo: Record<string, number>; err: number; score: number }[] = [];
    for (const c of candidates.get('carbohydrates')!) {
      for (const p of candidates.get('protein')!) {
        for (const f of candidates.get('fat')!) {
          const predicted =
            c.value * ATWATER.carbohydrates + p.value * ATWATER.protein + f.value * ATWATER.fat;
          const err = Math.abs(predicted - kcal) / kcal;
          if (err > ATWATER_TOLERANCE) continue;
          const score = err / ATWATER_TOLERANCE + EDIT_PENALTY * (c.cost + p.cost + f.cost);
          scored.push({
            combo: { carbohydrates: c.value, protein: p.value, fat: f.value },
            err,
            score,
          });
        }
      }
    }
    scored.sort((a, b) => a.score - b.score);
    const winner = scored[0];

    if (!winner) {
      // 어떤 조합도 열량과 맞지 않는다 → 셋 다 신뢰할 수 없다
      rejected.push(...macroKeys);
    } else {
      atwaterError = round2(winner.err);

      // 상위권 조합들이 "같은 답"에 수렴하는지 본다.
      // 점수 차가 작은 것 자체는 문제가 아니다 — 22.4 와 22 가 다투는 건 둘 다 맞는 것이다.
      // 위험한 건 값이 크게 갈릴 때다 (US 라벨: 지방 1.5 vs 15.9).
      // 그래서 근소한 후보들이 값에서 합의할 때만 채택한다.
      const contenders = scored.filter((s) => s.score - winner.score < AMBIGUITY_MARGIN);
      for (const k of macroKeys) {
        const vals = contenders.map((s) => s.combo[k]);
        const lo = Math.min(...vals);
        const hi = Math.max(...vals);
        // 0 근처는 비율이 무의미하므로 절대 오차도 함께 본다
        const agrees = hi - lo <= 1 || hi / Math.max(lo, 1e-6) <= 1 + VALUE_AGREEMENT;
        if (agrees) chosen[k] = winner.combo[k];
        else rejected.push(k);
      }
    }
    chosen.energy = kcal;
  } else {
    // 열량이 없거나 매크로가 부족하면 Atwater를 못 쓴다 — 단독 후보만 채택
    if (kcal !== undefined) chosen.energy = kcal;
    for (const k of macroKeys) {
      const list = candidates.get(k);
      if (!list) continue;
      if (list.length === 1) chosen[k] = list[0].value;
      else rejected.push(k);
    }
  }

  // ── ③ 나머지 항목: 종속 제약으로 좁힌다 ────────────────
  //     당류 ≤ 탄수화물, 포화지방 ≤ 지방
  resolveDependent('sugars', 'carbohydrates');
  resolveDependent('saturatedFat', 'fat');

  for (const k of ['fiber', 'salt'] as NutrientKey[]) {
    accept(k, candidates.get(k));
  }

  function resolveDependent(child: NutrientKey, parent: NutrientKey) {
    const list = candidates.get(child);
    if (!list) return;
    const cap = chosen[parent];
    // 당류 ≤ 탄수화물, 포화지방 ≤ 지방
    accept(child, cap === undefined ? list : list.filter((c) => c.value <= cap));
  }

  /**
   * 검증 수단이 열량 항등식뿐인 항목의 채택 규칙.
   * 가장 적게 고친 후보들만 남기고, 그것들이 값에서 합의할 때만 받아들인다.
   * ("3459" → 34.59 와 34.5 는 같은 답이지만, 3.45 는 한 자리 더 고쳐야 나오는 다른 답이다)
   */
  function accept(key: NutrientKey, list?: Candidate[]) {
    if (!list || list.length === 0) return;
    const minCost = Math.min(...list.map((c) => c.cost));
    const tier = list.filter((c) => c.cost === minCost);
    const lo = Math.min(...tier.map((c) => c.value));
    const hi = Math.max(...tier.map((c) => c.value));
    const agrees = hi - lo <= 1 || hi / Math.max(lo, 1e-6) <= 1 + VALUE_AGREEMENT;
    if (agrees) chosen[key] = tier[0].value;
    else rejected.push(key);
  }

  // ── ④ 질량 보존 검사 ──────────────────────────────────
  // 100g 안에 든 영양소의 합은 100g을 넘을 수 없다.
  // 교차검증 수단이 없는 항목(식이섬유 등)의 10배 오류를 잡는 마지막 그물이다.
  // 포화지방은 지방의 부분집합이라 합에서 제외한다.
  enforceMassBalance();

  function enforceMassBalance() {
    const massKeys: NutrientKey[] = ['carbohydrates', 'fat', 'protein', 'fiber', 'salt'];
    const total = () => massKeys.reduce((s, k) => s + (chosen[k] ?? 0), 0);
    // 표가 1회 제공량 기준이면 합의 상한도 제공량이다 (100g이 아니라).
    const limit = basis === 'perServing' && servingGrams
      ? servingGrams * (MASS_LIMIT / 100)
      : MASS_LIMIT;
    if (total() <= limit) return;

    // 초과하면, 교차검증이 없는 항목부터 더 작은 후보로 낮춰본다.
    for (const k of ['fiber', 'salt'] as NutrientKey[]) {
      if (chosen[k] === undefined) continue;
      const smaller = (candidates.get(k) ?? [])
        .filter((c) => c.value < chosen[k]!)
        .sort((a, b) => b.value - a.value);
      for (const c of smaller) {
        const before: number | undefined = chosen[k];
        chosen[k] = c.value;
        if (total() <= limit) return;
        chosen[k] = before;
      }
      // 어떤 후보로도 못 맞추면 그 항목을 버린다
      delete chosen[k];
      rejected.push(k);
      if (total() <= limit) return;
    }
  }

  const usable = chosen.energy !== undefined && Object.keys(chosen).length >= 2;
  if (!usable) return { profile: null, basis, servingGrams, rejected, atwaterError };

  // 1회 제공량 기준 표는 100g 기준으로 되돌린다 (엔진 전제)
  const scale = basis === 'perServing' && servingGrams ? 100 / servingGrams : 1;
  const per100g: NutrientAmounts = {};
  for (const [k, v] of Object.entries(chosen) as [NutrientKey, number][]) {
    per100g[k] = round2(v * scale);
  }

  return {
    profile: {
      source: 'label-ocr',
      name: name ?? guessProductName(lines),
      servingGrams,
      per100: per100g,
      allergenTags: parseAllergens(text.toLowerCase()),
    },
    basis,
    servingGrams,
    rejected,
    atwaterError,
  };
}

/**
 * OCR이 흘린 것을 되돌린 후보들.
 *
 * 관측된 오류 유형:
 *   "22.4 g" → "2249"   (소수점 소실 + g→9)
 *   "2.8 g"  → "284"    (소수점 소실 + g→4)
 *   "9 g"    → "98"     (g→8)
 *   "6.1 g"  → "6.19"   (g→9)
 * 그래서 ⓐ 원본 ⓑ 끝자리를 단위로 보고 제거 ⓒ 소수점 한 칸 삽입 조합을 만든다.
 */
export interface Candidate {
  value: number;
  /** 원문에 가한 보정 횟수. 적을수록 신뢰도가 높다. */
  cost: number;
}

export function expandCandidates(numText: string, _unitFound: boolean, key: NutrientKey): Candidate[] {
  const best = new Map<number, number>(); // value → 최소 cost
  const push = (v: number, cost: number) => {
    if (!Number.isFinite(v) || !within(key, v)) return;
    const r = round2(v);
    const prev = best.get(r);
    if (prev === undefined || cost < prev) best.set(r, cost);
  };

  const base = Number(numText.replace(',', '.'));
  // "03" 처럼 선행 0이 붙은 정수는 소수점을 흘린 것으로 본다 ("0.3").
  // 라벨에 3을 03으로 적는 경우는 없다.
  const leadingZero = /^0\d/.test(numText);
  push(base, leadingZero ? 1 : 0);

  // 소수점만 흘린 경우
  if (!numText.includes('.')) {
    push(base / 10, leadingZero ? 0 : 1);
    push(base / 100, 2);
  }

  // 끝자리가 사실은 단위 글자였던 경우.
  // 단위 g를 찾았더라도 시도한다 — Tesseract가 g를 숫자로 읽고 g도 함께 뱉는 경우가 있다
  // ("1.5 g" → "159g"). 단위 유무로 후보를 좁히면 정답이 아예 후보에서 빠진다.
  if (/\d$/.test(numText)) {
    const dropped = numText.slice(0, -1);
    if (dropped && /\d/.test(dropped)) {
      const d = Number(dropped.replace(',', '.'));
      push(d, 1);
      if (!dropped.includes('.')) {
        push(d / 10, 2);
        push(d / 100, 3);
      }
    }
  }

  return [...best.entries()]
    .map(([value, cost]) => ({ value, cost }))
    .sort((a, b) => a.cost - b.cost || b.value - a.value);
}

function within(key: NutrientKey, v: number): boolean {
  const b = BOUNDS[key];
  if (!b) return v >= 0;
  return v >= b[0] && v <= b[1];
}

export function parseServingSize(text: string): number | undefined {
  const m = text.match(/(?:serving\s*size|1회\s*제공량|1회분)\D{0,12}(\d+(?:[.,]\d+)?)\s*(g|ml)?/i);
  if (!m) return undefined;
  let v = Number(m[1].replace(',', '.'));
  // "30g" → "308" 처럼 단위가 숫자로 읽힌 경우 (제공량은 보통 세 자리를 넘지 않는다)
  if (!m[2] && v > 200 && v % 10 !== 0) v = Math.floor(v / 10);
  return Number.isFinite(v) && v > 0 && v <= 2000 ? v : undefined;
}

/** 에너지: kcal 우선, 없으면 kJ ÷ 4.184. 열량은 자릿수가 커서 g 혼동이 적다. */
function pickEnergy(lines: string[]): number | undefined {
  for (const line of lines) {
    if (!ENERGY_ALIASES.some((a) => line.toLowerCase().includes(a))) continue;
    const kcal = line.match(/(\d+(?:[.,]\d+)?)\s*k?cal/i);
    if (kcal) return clampEnergy(Number(kcal[1].replace(',', '.')));
    const kj = line.match(/(\d+(?:[.,]\d+)?)\s*kj/i);
    if (kj) return clampEnergy(Number(kj[1].replace(',', '.')) / 4.184);
    const bare = line.match(/(\d+(?:[.,]\d+)?)\s*$/);
    if (bare) return clampEnergy(Number(bare[1].replace(',', '.')));
  }
  return undefined;
}

function clampEnergy(v: number): number | undefined {
  return Number.isFinite(v) && within('energy', v) ? round2(v) : undefined;
}

/** 별칭이 있는 줄에서 숫자와 "단위 글자를 찾았는지"를 함께 돌려준다. */
function findRawNumber(
  lines: string[],
  aliases: string[],
): { text: string; unit: boolean } | undefined {
  for (const line of lines) {
    const l = line.toLowerCase();
    if (!aliases.some((a) => l.includes(a))) continue;

    // mg 는 자릿수가 커서 별도 처리 (Sodium 190 mg)
    const mg = line.match(/(\d+(?:[.,]\d+)?)\s*mg\b/i);
    if (mg) return { text: String(Number(mg[1].replace(',', '.')) / 1000), unit: true };

    const withUnit = line.match(/(\d+(?:[.,]\d+)?)\s*g\b/i);
    if (withUnit) return { text: withUnit[1], unit: true };

    // 단위 없이 줄 끝의 숫자 — OCR이 g를 숫자로 먹은 경우
    const bare = line.match(/(\d+(?:[.,]\d+)?)\s*[^\d\s]?\s*$/);
    if (bare) return { text: bare[1], unit: false };
  }
  return undefined;
}

/** 라벨 하단 알레르기 문구 → OpenFoodFacts와 같은 태그 형식 (엔진이 같은 경로로 처리) */
function parseAllergens(lower: string): string[] {
  const tags: string[] = [];
  const map: [RegExp, string][] = [
    [/peanut|땅콩/, 'en:peanuts'],
    [/tree nut|\bnuts?\b|아몬드|호두|견과/, 'en:nuts'],
    [/wheat|gluten|barley|rye|밀가루|글루텐/, 'en:gluten'],
    [/milk|dairy|우유|유제품/, 'en:milk'],
    [/\beggs?\b|계란|달걀/, 'en:eggs'],
    [/\bsoy|대두/, 'en:soybeans'],
    [/sesame|참깨|깨/, 'en:sesame'],
    [/shellfish|crustacean|새우|갑각류/, 'en:crustaceans'],
  ];
  for (const [re, tag] of map) if (re.test(lower)) tags.push(tag);
  return tags;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
