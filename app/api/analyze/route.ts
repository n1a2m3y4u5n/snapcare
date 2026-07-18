import { NextRequest, NextResponse } from 'next/server';
import { getItem } from '@/lib/snapcare/catalog';
import type { ScanItem } from '@/lib/snapcare/types';

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

const SYSTEM = `You are SnapCare's photo intake classifier for low-literacy users.
Given ONE photo of something a person is about to consume, identify what it is and return STRICT JSON only.
Classify intent as one of: "food", "drink", "medicine", "prescription".
Detect any of these risk flags present: "peanut","gluten","lactose","shellfish","high_sugar","caffeine","nsaid_bleed","alcohol".
Return JSON with this exact shape (omit rx unless medicine/prescription; omit nutrition unless food/drink):
{"name":string,"kind":"food|drink|medicine|prescription","emoji":string,"detectedVia":string,
 "flags":string[],
 "nutrition":{"kcal":number,"protein":string,"sugar":string,"note":string},
 "chips":[{"emoji":string,"label":string}],
 "rx":{"dosageText":string,"durationText":string,"schedule":[{"time":string,"label":string,"emoji":string}]}}`;

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
  const parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, '')) as Partial<ScanItem>;

  return {
    id: `scan_${Math.abs(hash(text))}`,
    name: parsed.name ?? 'Unknown item',
    kind: (parsed.kind as ScanItem['kind']) ?? 'food',
    emoji: parsed.emoji ?? '📷',
    detectedVia: parsed.detectedVia ?? 'photo analysis',
    flags: (parsed.flags as ScanItem['flags']) ?? [],
    nutrition: parsed.nutrition,
    alt: parsed.alt,
    chips: parsed.chips,
    rx: parsed.rx,
  };
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
