import { NextRequest, NextResponse } from 'next/server';

/**
 * 폼시트의 손으로 쓴 줄을 읽는다.
 *
 * 왜 여기가 유일한 읽기인가 — 재 봤다
 * -----------------------------------
 * 전에는 tesseract 가 먼저 돌고 못 읽었을 때만 여기로 왔다. 두 자리에서 나란히 재고
 * tesseract 를 통째로 걷어냈다.
 *
 *   손글씨 약 이름   tesseract 1/3 (conf 33·41·0)   여기 3/3, 각 1.7~1.9초
 *   영양성분표       tesseract 부분 성공             여기 8/8 칸 일치
 *
 * 설정으로 좁혀지는 간격이 아니었다 — tesseract 의 LSTM 은 **인쇄 글씨로 배웠고**,
 * 손글씨는 그 모델이 하는 일이 아니다. 같은 칸을 인쇄 글씨로 주면 conf 96 으로
 * 맞힌다. 못하는 것이 아니라 다른 것을 하는 것이고, 이 앱에서 사람이 찍는 것은
 * 손으로 쓴 종이다.
 *
 * 무엇을 안 하나
 * --------------
 * **철자를 안 고친다.** "Amoxicilin" 이 적혀 있으면 그대로 돌려준다. 고치는 일은
 * `match.ts`(94종 목록에 맞추기)와 `/api/drug`(그 밖의 약)이 하고, 그 둘은 각자
 * 자기 문턱을 갖고 있다. 여기서 미리 고쳐 버리면 그 문턱들이 이미 고쳐진 글자를
 * 보게 되어 무엇을 실제로 읽었는지가 사라진다 — 화면이 "이렇게 읽었습니다" 를
 * 보여줄 수 없게 된다는 뜻이기도 하다.
 */

/*
  사진 판별(`/api/analyze`)과 **다른 모델을 쓴다.**

  저쪽은 접시 위의 음식을 알아보는 일이고 사람이 카메라 앞에서 기다린다. 여기는
  뭉개진 글씨 한 줄에서 약 이름을 뽑는 일이고, 틀리면 **다른 약**이 된다. 공개
  자료 500장으로 잰 sonnet 의 정확도가 45.2% 였다(scripts/handwriting-eval.json).
  이 자리에서 그 숫자는 낮다.
*/
const MODEL = process.env.SNAPCARE_HANDWRITING_MODEL || 'claude-opus-5';

function systemFor(candidates: string[]): string {
  /*
    **어휘를 닫아 준다.**

    이 저장소의 논지가 그것이다 — "아무 글자나 맞히기" 와 "이 목록에서 가장 가까운 것
    고르기" 는 다른 문제이고, 뒤쪽은 글자 몇 개가 망가져도 답이 하나로 모인다
    (`lib/formulary/match.ts`). 지금까지 그 논지를 tesseract 에만 적용하고 있었다:
    모델은 목록을 못 본 채로 읽고, 우리가 그 결과를 나중에 목록에 붙였다.

    500장으로 재 봤다. 나중에 붙이는 것만으로 45.2% → 56.2% 로 오르는데, 대신
    **7.2% 가 다른 약에 가서 붙는다.** 그 실패가 이 앱에서 가장 나쁜 것이라, 붙이는
    일을 모델에게 넘긴다 — 모델은 뭉개진 글자 대신 **획**을 보고 고를 수 있고,
    우리는 문자열 하나만 보고 고른다. 같은 일을 더 나은 증거로 하는 것이다.

    두 값을 따로 받는다. `name` 은 종이에 있는 그대로이고 `match` 는 목록에서 고른
    것이다. 하나로 합치면 화면이 "이렇게 읽었습니다" 를 못 보여주고, 사람이 종이와
    맞춰 볼 방법이 없어진다.
  */
  const list = candidates.length > 0
    ? `\n\nThe app's medicine list is below. The name is often — but NOT always — one of these:\n${candidates.join(', ')}\n\nIf the strokes match one of them, put that entry in "match" and how sure you are in\n"matchConfidence" (0-1). Judge by the SHAPE OF THE STROKES, not by which name is common.\nIf nothing on the list fits the strokes, leave "match" empty — the medicine may simply not\nbe on it, and a wrong entry here becomes a different drug on the screen.`
    : '';

  return `You read handwriting from a paper medication form. You are given up to three
small images, each one cropped line from the form:
  1. the medicine name
  2. the pill count (a single digit)
  3. a notes line, where a pharmacist may have written a warning

Return STRICT JSON only, no prose, no markdown fences:
{"name": string, "count": string, "notes": string, "legible": boolean,
 "match": string, "matchConfidence": number}

Rules:
- "name" is EXACTLY what is written, letter for letter. Do NOT correct spelling, do NOT
  expand abbreviations, and do NOT substitute a medicine you think it was meant to be.
  The app shows this back to the person so they can compare it with their paper.
- A field you were not given, or cannot read at all, is "".
- "count" is digits only. If the line holds something else, return "".
- "legible": false only when none of the lines could be read.
- Never invent a warning in "notes" that is not written there.${list}`;
}


/** 한 줄 크롭이다. 이보다 큰 것이 오면 이 자리로 보낼 그림이 아니다. */
const MAX_BYTES = 900_000;

const EMPTY = { name: '', count: '', notes: '', legible: false, match: '', matchConfidence: 0 };

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

  let body: { name?: unknown; count?: unknown; notes?: unknown; candidates?: unknown };
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

  // 목록은 부르는 쪽이 준다. 서버가 약품표를 다시 수입하면 두 곳이 갈라질 수 있고,
  // 갈라지면 모델이 화면에 없는 이름을 고르게 된다.
  const candidates = Array.isArray(body.candidates)
    ? body.candidates.filter((c): c is string => typeof c === 'string' && c.length > 1).slice(0, 400)
    : [];
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
        system: systemFor(candidates),
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
      // 목록에 없는 것을 골라 오면 안 고른 것으로 친다. 모델이 지어낸 이름이 화면의
      // 약 이름이 되는 경로를 막는다.
      match: candidates.includes(String(out.match ?? '')) ? String(out.match) : '',
      matchConfidence: Number.isFinite(out.matchConfidence) ? Number(out.matchConfidence) : 0,
    });
  } catch (err) {
    // 못 물어본 것은 실패가 아니다. tesseract 가 읽은 것이 그대로 남는다.
    console.error('[handwriting] 실패:', err);
    return NextResponse.json(EMPTY);
  }
}
