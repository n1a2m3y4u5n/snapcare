import { NextRequest, NextResponse } from 'next/server';
import { getItem } from '@/lib/snapcare/catalog';
import type { ScanItem } from '@/lib/snapcare/types';
import { validateDensity } from '@/lib/nutrition/validate';
import { densityFromTotals, mergeVisionDetail, MIN_PORTION_G, MAX_PORTION_G } from '@/lib/nutrition/mealModel';
import type { ModelTotals } from '@/lib/nutrition/mealModel';
import type { NutrientAmounts, NutrientProfile } from '@/lib/nutrition/types';


/**
 * 사진 의도 판별 + 추출 (하이브리드).
 * - demoItemId 가 오면 카탈로그에서 즉시 반환 (오프라인 데모 경로).
 * - image(base64) 는 두 출처를 함께 쓴다:
 *     · 자체 학습 모델 — 열량·질량·지방·탄수·단백. **브라우저에서** 돈다. 오프라인, 무료.
 *     · Claude Vision — 이름·종류·알레르기·세부 영양소. 인터넷 필요.
 *   서로를 대체하는 게 아니라 상대가 모르는 칸을 채운다. 한쪽이 없어도 나머지로 답한다.
 *
 * 어느 경로든 결과는 동일한 ScanItem 스키마로 반환된다 (SIGIL/VOCA·판정 엔진이 재검증·소비).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json().catch(() => ({}))) as {
    demoItemId?: string;
    image?: string; // data URL or base64
    /**
     * 기기에서 이미 추정한 다섯 값 (lib/nutrition/estimateOnDevice).
     * 모델은 브라우저에서 onnxruntime-web 으로 돈다 — 서버가 파이썬을 띄우던
     * 예전 경로는 이미지에 PyTorch 1.5GB 를 더하면서 정작 오프라인에서 못 썼다.
     */
    modelTotals?: ModelTotals;
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

  // 모델 추정은 클라이언트가 이미 끝내서 보낸다. 여기서는 Vision 만 기다린다.
  const modelTotals = body.modelTotals ?? null;
  /*
    부름이 실패한 것과 부를 수단이 없는 것을 갈라 둔다.

    전에는 둘 다 null 이 되어 아래에서 "이 서버에는 사진 인식이 없습니다" 로 나갔다.
    처방전 60장을 한 번에 보내며 재다가 드러났는데, 상류가 잠깐 밀린 열 장이 전부 그
    문장을 받았다. **지나가는 일에 영구적인 말을 한 것**이고, 그 말을 들은 사람은 다시
    찍어 보지 않는다 — 같은 사진을 혼자 보내면 멀쩡히 읽힌다.
  */
  let visionFailed = false;
  const vision = key
    ? await analyzeWithClaude(body.image, key).catch((err) => {
        console.error('[analyze] vision failed:', err);
        visionFailed = true;
        return null;
      })
    : null;

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
      detectedVia: vision?.recognised ? 'photo analysis (measured portion)' : 'on-device estimate',
      // 모델이 숫자를 냈다고 알아본 것은 아니다. 회귀 모델은 기권할 수 없어서
      // 무엇을 찍었든 다섯 값을 내놓는다 — 무작위 노이즈에도 285 kcal 이 나왔다.
      unidentified: !vision?.recognised,
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

  /*
    부름이 실패했다 — 이것은 **지나가는 일**이다.

    상류가 밀렸거나 망이 한 번 끊긴 것이고, 같은 사진을 잠시 뒤에 다시 보내면 읽힌다.
    아래 501 과 한 덩어리로 묶여 있던 것을 갈랐다. 묶여 있을 때는 잠깐 밀린 사람에게
    "이 서버에는 사진 인식이 없습니다" 라고 말했는데, 그 말은 다시 시도할 이유를
    지운다 — 고칠 수 없는 일로 들리기 때문이다.
  */
  if (visionFailed) {
    return NextResponse.json(
      { error: 'analysis_failed', message: 'Could not read it just now. Try again.' },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { error: 'analysis_unavailable', message: 'No photo recognition available on this server.' },
    { status: 501 },
  );
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
          "schedule": [{"time": string, "label": string, "emoji": string}] },  // only for medicine/prescription
  "handwritten": boolean          // true if ANY of the medical instruction is handwritten
}

Rules:
- per100 is DENSITY (per 100 g), never the amount on the plate. portionGrams carries the amount.
- Energy must be consistent with the macros: energy ~= 4*carbohydrates + 4*protein + 9*fat. The app re-checks this and discards your answer if it does not hold.
- Use typical composition for the dish you recognise. If you cannot recognise it, set confidence below 0.4.
- Omit per100 and portionGrams entirely for medicine/prescription.
- handwritten: true when the drug names, doses or timings are written by hand, even if the
  form around them is printed. A printed hospital letterhead with handwriting under it is
  handwritten. This decides whether the app is allowed to sound certain, so do not guess it
  as false: if the instruction is in a person's handwriting, say so.
- Never convert a frequency into a strength. "8hrly" is every eight hours, not 8 mg; "od"
  is once a day; "bd"/"bid" twice; "tds"/"tid" three times; "qds"/"qid" four; "nocte" at
  night; "mane" in the morning; "prn" as needed. Put what is written in dosageText and
  leave schedule empty rather than inventing clock times that are not on the paper.`;

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
      /*
        700 이었다. 그 자리에서 **약이 많은 처방전이 통째로 실패하고 있었다.**

        방글라데시 처방전 전장 60장으로 재다가 드러났다. 11장이 실패했는데 무작위가
        아니었다 — 전부 약이 5~12가지 적힌 장이었고, 매번 같은 장이었다. 답이 700
        토큰에서 잘리고(`stop_reason: max_tokens`), 잘린 JSON 은 파싱에 실패하고,
        실패는 위에서 잡혀 화면에는 "읽지 못했습니다" 로 나갔다.
        입원 지시서 한 장의 실제 끝부분: `…urinary catheterization. 20.` — 문장
        중간에서 끊겼다.

        **가장 필요한 사람이 못 쓰는 쪽으로 실패하고 있었다.** 약을 열 가지 먹는
        사람이 이 앱을 가장 필요로 하고, 그 사람의 처방전이 정확히 안 읽히는 장이다.

        영양 응답은 700 이면 충분하지만 복약 지시는 약 수에 비례해 길어진다. 넉넉히
        준다 — 짧은 답은 어차피 짧게 끝나므로(end_turn) 이 값이 비용을 늘리지 않는다.
      */
      max_tokens: 3000,
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
  const json = (await res.json()) as {
    content?: { type: string; text?: string }[];
    stop_reason?: string;
  };
  const text = json.content?.find((c) => c.type === 'text')?.text ?? '';
  // 잘려서 온 것을 "형식이 이상하다" 로 잡으면 원인을 찾는 데 오래 걸린다. 실제로
  // 오래 걸렸다 — 약 많은 처방전이 왜 실패하는지 알아내는 데 60장을 재야 했다.
  if (json.stop_reason === 'max_tokens') {
    throw new Error('vision reply was cut off (max_tokens) — raise the limit');
  }
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
      // 손으로 쓴 지시는 확신하고 읽으면 안 된다. 왜인지는 lib/snapcare/types.ts 에 적었다.
      handwritten: isRx ? parsed.handwritten === true : undefined,
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
  handwritten?: boolean;
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
