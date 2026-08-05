import { NextRequest, NextResponse } from 'next/server';

/**
 * 폼시트의 손으로 쓴 줄을 읽는다 — tesseract 가 못 읽었을 때만.
 *
 * 왜 필요한가 — 재 봤다
 * ---------------------
 * 같은 세 그림(필기체로 쓴 약 이름)에 둘을 붙였다.
 *
 *   tesseract   "Amoxtelllin"(conf 33) · "Amoxicillin"(conf 41) · "Roguvagstatin"(conf 0)
 *   여기        "Amoxicillin" · "Amoxicillin" · "Rosuvastatin"      각 1.7~1.9초
 *
 * 셋 중 하나 맞히는 것과 셋 다 맞히는 것의 차이다. 그리고 이건 설정으로 좁혀지는
 * 간격이 아니다 — tesseract 의 LSTM 은 **인쇄 글씨로 배웠고**, 손글씨는 그 모델이
 * 하는 일이 아니다. 같은 이름칸을 인쇄 글씨로 주면 tesseract 가 conf 96 으로 맞힌다.
 * 못하는 것이 아니라 다른 것을 하는 것이다.
 *
 * 그래서 순서가 이렇다
 * --------------------
 * tesseract 를 **먼저** 돌린다. 공짜이고, 오프라인이고, 인쇄된 칸에서는 이미 완벽하다.
 * 그 답이 약품표에 맞으면 여기까지 오지 않는다. 안 맞을 때만 부른다 — 그때가 정확히
 * 손글씨가 뭉개졌거나 표 밖의 약인 경우다.
 *
 * 무엇을 안 하나
 * --------------
 * **철자를 안 고친다.** "Amoxicilin" 이 적혀 있으면 그대로 돌려준다. 고치는 일은
 * `match.ts`(94종 목록에 맞추기)와 `/api/drug`(그 밖의 약)이 하고, 그 둘은 각자
 * 자기 문턱을 갖고 있다. 여기서 미리 고쳐 버리면 그 문턱들이 이미 고쳐진 글자를
 * 보게 되어 무엇을 실제로 읽었는지가 사라진다 — 화면이 "이렇게 읽었습니다" 를
 * 보여줄 수 없게 된다는 뜻이기도 하다.
 */

const MODEL = process.env.SNAPCARE_VISION_MODEL || 'claude-sonnet-5';

const SYSTEM = `You read handwriting from a paper medication form. You are given up to three
small images, each one cropped line from the form:
  1. the medicine name
  2. the pill count (a single digit)
  3. a notes line, where a pharmacist may have written a warning

Return STRICT JSON only, no prose, no markdown fences:
{"name": string, "count": string, "notes": string, "legible": boolean}

Rules:
- Transcribe EXACTLY what is written, letter for letter. Do NOT correct spelling, do NOT
  expand abbreviations, and do NOT substitute a medicine you think it was meant to be.
  The app matches your text against its own list and needs to see what the paper says.
- A field you were not given, or cannot read at all, is "".
- "count" is digits only. If the line holds something else, return "".
- "legible": false only when none of the lines could be read.
- Never invent a warning in "notes" that is not written there.`;

/** 한 줄 크롭이다. 이보다 큰 것이 오면 이 자리로 보낼 그림이 아니다. */
const MAX_BYTES = 900_000;

const EMPTY = { name: '', count: '', notes: '', legible: false };

function imageBlock(dataUrl: string) {
  const m = dataUrl.match(/^data:(image\/[a-zA-Z.+-]+);base64,(.*)$/);
  const media_type = m ? m[1] : 'image/png';
  const data = m ? m[2] : dataUrl;
  if (data.length > MAX_BYTES) return null;
  return { type: 'image' as const, source: { type: 'base64' as const, media_type, data } };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const key = process.env.ANTHROPIC_API_KEY;
  // 열쇠가 없어도 앱은 돈다. 부르는 쪽이 tesseract 가 읽은 것을 그대로 쓴다.
  if (!key) return NextResponse.json(EMPTY);

  let body: { name?: unknown; count?: unknown; notes?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }

  const parts: ({ type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
    | { type: 'text'; text: string })[] = [];
  for (const field of ['name', 'count', 'notes'] as const) {
    const raw = body[field];
    if (typeof raw !== 'string' || !raw) continue;
    const block = imageBlock(raw);
    if (!block) continue;
    parts.push({ type: 'text', text: `Image below is the ${field} line.` }, block);
  }
  if (parts.length === 0) return NextResponse.json(EMPTY);
  parts.push({ type: 'text', text: 'Read the lines and return only the JSON.' });

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: SYSTEM,
        messages: [{ role: 'user', content: parts }],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}`);

    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = json.content?.find((c) => c.type === 'text')?.text ?? '';
    const out = JSON.parse(text.replace(/^```json\s*|\s*```$/g, '')) as typeof EMPTY;

    return NextResponse.json({
      name: String(out.name ?? '').trim(),
      // 개수칸은 숫자 하나다. 다른 것이 왔으면 안 읽은 것으로 친다.
      count: (String(out.count ?? '').match(/\d/) ?? [''])[0],
      notes: String(out.notes ?? '').trim(),
      legible: out.legible === true,
    });
  } catch (err) {
    // 못 물어본 것은 실패가 아니다. tesseract 가 읽은 것이 그대로 남는다.
    console.error('[handwriting] 실패:', err);
    return NextResponse.json(EMPTY);
  }
}
