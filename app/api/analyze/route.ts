import { NextRequest, NextResponse } from 'next/server';
import { getItem } from '@/lib/snapcare/catalog';
import type { ScanItem } from '@/lib/snapcare/types';
import { validateDensity } from '@/lib/nutrition/validate';
import type { NutrientAmounts, NutrientProfile } from '@/lib/nutrition/types';

/**
 * 사진 의도 판별 + 추출 (하이브리드).
 * - demoItemId 가 오면 카탈로그에서 즉시 반환 (오프라인 데모 경로).
 * - image(base64) + ANTHROPIC_API_KEY 가 있으면 Claude Vision으로 판별·추출.
 * - 둘 다 없으면 400.
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

  // ── Vision 경로 ────────────────────────────────────────────
  if (body.image) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      return NextResponse.json(
        { error: 'vision_unconfigured', message: 'ANTHROPIC_API_KEY 미설정 — 데모 아이템으로 시연하세요.' },
        { status: 501 },
      );
    }
    try {
      const item = await analyzeWithClaude(body.image, key);
      return NextResponse.json({ intent: item.kind, item, source: 'vision' });
    } catch (err) {
      return NextResponse.json({ error: 'vision_failed', detail: String(err) }, { status: 502 });
    }
  }

  return NextResponse.json({ error: 'image or demoItemId required' }, { status: 400 });
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

async function analyzeWithClaude(image: string, key: string): Promise<ScanItem> {
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
  if (!isRx && parsed.per100) {
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
    id: `scan_${Math.abs(hash(text))}`,
    name: parsed.name ?? 'Unknown item',
    kind,
    emoji: parsed.emoji ?? '📷',
    detectedVia: profile ? 'photo analysis' : 'photo analysis (nutrition unverified)',
    flags: [],
    profile,
    rx: parsed.rx,
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

/** 한 끼로 가능한 범위를 벗어난 추정치는 버리고 100g 기본값으로 돌아간다. */
function plausiblePortion(g: number | undefined): number | undefined {
  return typeof g === 'number' && g >= 10 && g <= 1500 ? Math.round(g) : undefined;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
