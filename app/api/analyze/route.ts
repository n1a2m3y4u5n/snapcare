import { NextRequest, NextResponse } from 'next/server';
import { getItem } from '@/lib/snapcare/catalog';
import type { ScanItem } from '@/lib/snapcare/types';
import { validateDensity } from '@/lib/nutrition/validate';
import { densityFromTotals, mergeVisionDetail, MIN_PORTION_G, MAX_PORTION_G } from '@/lib/nutrition/mealModel';
import type { ModelTotals } from '@/lib/nutrition/mealModel';
import type { NutrientAmounts, NutrientProfile } from '@/lib/nutrition/types';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

const execFileAsync = promisify(execFile);
const MEAL_MODEL = join(process.cwd(), 'nutrition_manager', 'predict_cli.py');

/**
 * 사진 의도 판별 + 추출 (하이브리드).
 * - demoItemId 가 오면 카탈로그에서 즉시 반환 (오프라인 데모 경로).
 * - image(base64) 는 두 출처를 함께 쓴다:
 *     · 자체 학습 모델(nutrition_manager) — 열량·질량·지방·탄수·단백. 오프라인, 무료.
 *     · Claude Vision — 이름·종류·알레르기·세부 영양소. 인터넷 필요.
 *   서로를 대체하는 게 아니라 상대가 모르는 칸을 채운다. 한쪽이 없어도 나머지로 답한다.
 *
 * 어느 경로든 결과는 동일한 ScanItem 스키마로 반환된다 (SIGIL/VOCA·판정 엔진이 재검증·소비).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json().catch(() => ({}))) as {
    demoItemId?: string;
    image?: string; // data URL or base64
  };

  // ── 데모 경로 ──────────────────────────────────────────────
  if (body.demoItemId) {
    const item = getItem(body.demoItemId);
    if (!item) return NextResponse.json({ error: 'unknown demo item' }, { status: 404 });
    return NextResponse.json({ intent: item.kind, item, source: 'demo' });
  }

  if (!body.image) {
    return NextResponse.json({ error: 'image or demoItemId required' }, { status: 400 });
  }

  // ── 사진 경로 ──────────────────────────────────────────────
  const key = process.env.ANTHROPIC_API_KEY;

  // 둘을 동시에 돌린다. 모델은 로컬 추론(수 초), Vision 은 왕복이라 직렬로 하면 합이 그대로 늘어난다.
  const [modelTotals, vision] = await Promise.all([
    runMealModel(body.image),
    key ? analyzeWithClaude(body.image, key).catch((err) => {
      console.error('[analyze] vision failed:', err);
      return null;
    }) : Promise.resolve(null),
  ]);

  // 약·처방전으로 판별됐으면 영양 숫자는 의미가 없다 — 모델 값은 버린다.
  if (vision && (vision.kind === 'medicine' || vision.kind === 'prescription')) {
    return NextResponse.json({ intent: vision.kind, item: vision.item, source: 'vision' });
  }

  const measured = modelTotals ? densityFromTotals(modelTotals) : null;
  if (measured && !measured.ok) {
    console.warn('[analyze] meal model rejected:', measured.problems.join('; '));
  }

  // 모델이 검증을 통과했으면 숫자는 모델 것을 쓰고, Vision 은 세부 영양소만 얹는다.
  if (measured?.ok) {
    const { per100, dropped } = mergeVisionDetail(measured.per100, vision?.item.profile?.per100);
    if (dropped.length) console.warn('[analyze] vision detail dropped:', dropped.join(', '));
    const item: ScanItem = {
      id: vision?.item.id ?? `meal_${Math.round(measured.per100.energy ?? 0)}_${measured.servingGrams}`,
      name: vision?.item.name ?? 'Meal',
      kind: 'food',
      emoji: vision?.item.emoji ?? '🍽️',
      detectedVia: vision ? 'photo analysis (measured portion)' : 'on-device meal model',
      flags: [],
      profile: {
        source: 'meal-model',
        name: vision?.item.name ?? 'Meal',
        servingGrams: measured.servingGrams,
        per100,
        allergenTags: vision?.item.profile?.allergenTags ?? [],
      },
    };
    return NextResponse.json({ intent: 'food', item, source: vision ? 'meal-model+vision' : 'meal-model' });
  }

  // 모델이 없거나 빗나갔다 → Vision 단독.
  //
  // 다만 음식인데 무엇인지 못 알아봤다면 결과를 내지 않는다. 판정 엔진은 걸리는 플래그가
  // 없으면 'safe' 를 돌려주므로, 알아보지 못한 사진이 초록 "Safe to eat" 으로 뜬다 —
  // 흰 종이 한 장이 그렇게 나왔다. 글을 못 읽는 사용자에게 초록은 먹어도 된다는 뜻이고,
  // 그건 이 앱이 할 수 있는 가장 나쁜 거짓말이다. 못 알아봤으면 다시 찍으라고 해야 한다.
  if (vision && vision.recognised) {
    return NextResponse.json({ intent: vision.kind, item: vision.item, source: 'vision' });
  }

  // 판별을 못 한 것과 판별 수단이 없는 것은 사용자가 할 일이 다르다.
  // 못 알아본 것이면 다시 찍으면 되고, 수단이 없으면 다시 찍어도 소용없다 —
  // 화면은 이 상태 코드로 두 안내를 가른다. 하나로 묶으면 "연결이 필요합니다"가
  // 인터넷이 멀쩡한 사람에게 뜬다.
  if (vision) {
    return NextResponse.json(
      { error: 'not_recognised', message: 'Could not tell what this is.' },
      { status: 422 },
    );
  }
  return NextResponse.json(
    { error: 'analysis_unavailable', message: 'No photo recognition available on this server.' },
    { status: 501 },
  );
}

/**
 * 자체 학습 모델 추론. 가중치·파이썬 환경이 없으면 null 을 돌려주고 조용히 물러난다 —
 * 이 경로가 없다고 앱이 멈추면 안 된다 (폼시트 파서와 같은 원칙).
 *
 * 가중치는 레포에 없다(용량). SNAPCARE_MEAL_CHECKPOINT 로 위치를 알려주거나
 * nutrition_manager/checkpoints/best.pt 에 두면 이 경로가 살아난다.
 */
async function runMealModel(image: string): Promise<ModelTotals | null> {
  const python = process.env.MEAL_MODEL_PYTHON;
  if (!python) return null; // 명시적으로 켠 환경에서만 시도한다 (torch 는 기본 이미지에 없다)

  const base64 = image.replace(/^data:image\/[a-zA-Z.+-]+;base64,/, '');
  const dir = join(tmpdir(), `meal-${randomUUID()}`);
  const file = join(dir, 'meal.jpg');
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(file, Buffer.from(base64, 'base64'));
    const { stdout } = await execFileAsync(python, [MEAL_MODEL, file], { timeout: 30_000 });
    const parsed = JSON.parse(stdout) as { ok: boolean; error?: string; totals?: ModelTotals };
    if (!parsed.ok || !parsed.totals) {
      console.warn('[analyze] meal model unavailable:', parsed.error);
      return null;
    }
    return parsed.totals;
  } catch (err) {
    console.warn('[analyze] meal model failed:', String(err));
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const SYSTEM = `You identify what a person is about to consume, from one photo.

Return STRICT JSON only. No prose, no markdown fences.

{
  "kind": "food" | "drink" | "medicine" | "prescription",
  "name": string,                 // short, e.g. "Bowl of jollof rice with chicken"
  "emoji": string,
  "confidence": number,           // 0-1, how sure you are of the identification
  "per100": {                     // NUTRIENT DENSITY per 100 g of this food, numbers only, grams
    "energy": number,             // kcal per 100 g
    "carbohydrates": number, "protein": number, "fat": number,
    "sugars": number, "saturatedFat": number, "fiber": number, "salt": number
  },
  "portionGrams": number,         // your estimate of how much is in the photo, in grams
  "allergenTags": string[],       // OpenFoodFacts style: "en:peanuts","en:nuts","en:gluten","en:milk","en:eggs","en:soybeans","en:crustaceans"
  "rx": { "dosageText": string, "durationText": string,
          "schedule": [{"time": string, "label": string, "emoji": string}] }  // only for medicine/prescription
}

Rules:
- per100 is DENSITY (per 100 g), never the amount on the plate. portionGrams carries the amount.
- Energy must be consistent with the macros: energy ~= 4*carbohydrates + 4*protein + 9*fat. The app re-checks this and discards your answer if it does not hold.
- Use typical composition for the dish you recognise. If you cannot recognise it, set confidence below 0.4.
- Omit per100 and portionGrams entirely for medicine/prescription.`;

interface VisionResult {
  item: ScanItem;
  kind: ScanItem['kind'];
  /** 무엇인지 알아봤는가. 못 알아본 것을 'safe' 로 내보내지 않기 위한 신호다. */
  recognised: boolean;
}

async function analyzeWithClaude(image: string, key: string): Promise<VisionResult> {
  const m = image.match(/^data:(image\/[a-zA-Z.+-]+);base64,(.*)$/);
  const mediaType = m ? m[1] : 'image/jpeg';
  const data = m ? m[2] : image;
  const model = process.env.SNAPCARE_VISION_MODEL || 'claude-sonnet-5';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 700,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
            { type: 'text', text: 'Classify this and return only the JSON.' },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = json.content?.find((c) => c.type === 'text')?.text ?? '';
  const parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, '')) as VisionOut;

  const kind = (parsed.kind ?? 'food') as ScanItem['kind'];
  const isRx = kind === 'medicine' || kind === 'prescription';

  // 사진 판별은 LLM이 하고, 판정은 우리 엔진이 한다.
  // LLM이 준 영양 밀도는 물리 제약(범위·부분집합·질량보존·Atwater)을 통과해야만 채택한다.
  // 통과 못 하면 숫자를 버리고 정성 판정으로 떨어뜨린다 — 틀린 수치보다 없는 편이 낫다.
  let profile: NutrientProfile | undefined;
  if (!isRx && parsed.per100 && recognised(parsed)) {
    const check = validateDensity(parsed.per100);
    if (check.ok) {
      profile = {
        source: 'vision',
        name: parsed.name ?? 'Unknown item',
        servingGrams: plausiblePortion(parsed.portionGrams),
        per100: parsed.per100,
        allergenTags: parsed.allergenTags ?? [],
      };
    } else {
      console.warn('[analyze] vision nutrition rejected:', check.problems.join('; '));
    }
  }

  return {
    kind,
    // 약·처방전은 영양 수치가 없는 것이 정상이므로 판별 여부를 confidence 로만 본다.
    recognised: isRx ? confident(parsed) : confident(parsed) && hasAnyNutrient(parsed),
    item: {
      id: `scan_${Math.abs(hash(text))}`,
      name: parsed.name ?? 'Unknown item',
      kind,
      emoji: parsed.emoji ?? '📷',
      detectedVia: profile ? 'photo analysis' : 'photo analysis (nutrition unverified)',
      flags: [],
      profile,
      rx: parsed.rx,
    },
  };
}

interface VisionOut {
  kind?: string;
  name?: string;
  emoji?: string;
  confidence?: number;
  per100?: NutrientAmounts;
  portionGrams?: number;
  allergenTags?: string[];
  rx?: ScanItem['rx'];
}

/**
 * 못 알아본 사진의 숫자는 쓰지 않는다.
 *
 * 프롬프트는 못 알아보면 confidence 를 0.4 아래로 두라고 시키는데, 그럴 때 모델은
 * 영양소를 전부 0 으로 채워 보내는 경향이 있다. 0 은 검증을 전부 통과한다 — 범위 안이고,
 * 질량 보존도 만족하고, 열량이 0 이라 Atwater 검사도 건너뛴다. 그대로 두면 판정 화면에
 * "아무것도 들어있지 않은 음식"이 뜨고, 그건 사용자에게 안전하다는 신호로 읽힌다.
 */
function confident(p: VisionOut): boolean {
  return !(typeof p.confidence === 'number' && p.confidence < 0.4);
}

function hasAnyNutrient(p: VisionOut): boolean {
  const values = Object.values(p.per100 ?? {});
  return values.length > 0 && values.some((v) => typeof v === 'number' && v > 0);
}

function recognised(p: VisionOut): boolean {
  return confident(p) && hasAnyNutrient(p);
}

/** 한 끼로 가능한 범위를 벗어난 추정치는 버리고 100g 기본값으로 돌아간다. */
function plausiblePortion(g: number | undefined): number | undefined {
  return typeof g === 'number' && g >= MIN_PORTION_G && g <= MAX_PORTION_G ? Math.round(g) : undefined;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
