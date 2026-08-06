import { NextRequest, NextResponse } from 'next/server';

import { LANGUAGES } from '@/lib/i18n/languages';

/**
 * 말할 문장을 그 나라 말로 옮긴다.
 *
 * 왜 서버에서, 왜 기계 번역인가
 * -----------------------------
 * 이 앱의 화면 글은 영어 하나다. 목소리 언어를 바꾸면 목소리만 바뀌고 문장은 영어라,
 * 루마니아 목소리가 영어를 읽는 소리가 났다. 손으로 옮기려면 화면에 흩어진 발화
 * 문장 백쉰 개를 여섯 나라 말로 적어야 하고, 그것을 다 적어도 **실행 중에 만들어지는
 * 문장**은 남는다 — 처방전에서 읽어 온 지시, 판별이 붙인 음식 이름, 숫자가 들어간
 * 하루 누적. 그 셋이 이 앱에서 가장 중요한 말들이다.
 *
 * 그래서 옮기는 자리를 하나로 만든다. 말하기 직전에 여기를 지나가면 미리 적어 둔
 * 문장과 방금 만들어진 문장이 같은 길을 탄다.
 *
 * 무엇을 건드리지 않는가
 * ----------------------
 * 숫자·시각·용량·제품명·약 이름은 **그대로 둔다**. 사람은 그 이름을 포장지에서 찾고,
 * 숫자를 옮기다 틀리는 것이 이 앱이 막으려는 바로 그 해다. 프롬프트가 그것을 규칙으로
 * 못박고, 아래 `sane()` 이 돌아온 문장에서 숫자가 사라지거나 늘지 않았는지 다시 센다.
 *
 * 검수를 안 받았다는 사실
 * -----------------------
 * 이 번역은 원어민 임상 검수를 받지 않았다. 손으로 적은 그림말 사전(`lib/i18n/say`)이
 * 먼저 확인되고, 거기 있는 문장은 여기까지 오지 않는다 — 사람이 쓴 것이 늘 이긴다.
 * 화면(설정)에도 같은 말이 적혀 있다.
 */

/** 한 번에 옮길 수 있는 문장 수. 이보다 많으면 답이 잘린다. */
const MAX_BATCH = 40;

/** 한 문장의 길이 상한. 이보다 길면 화면 문구가 아니라 다른 것이 들어온 것이다. */
const MAX_CHARS = 600;

/*
  번역은 **빠른 쪽**을 쓴다.

  Opus 로 재 보니 일곱 문장 묶음에 6.5~14초가 걸렸다. 그동안 사람은 아무 소리도 못
  듣고 서 있고, 화면 하나를 읽는 데 그만큼을 기다리게 할 수는 없다. 옮기는 일 자체는
  짧은 문장을 규칙대로 바꾸는 것이라 더 작은 모델로 충분하다 — 그리고 숫자가 어긋나면
  아래에서 잡아낸다.

  **Sonnet 에서 Haiku 로 다시 내렸다.** 같은 일곱 문장으로 나란히 재니 2.8초 대 1.5초로
  Haiku 가 두 배 가깝게 빨랐고, 답을 눈으로 확인하니 숫자도 뜻도 어긋나지 않았다 —
  "임신 중에는 안전하지 않습니다", "이번 달에 저녁 약을 3번…" 처럼 안전이 걸린 문장이
  둘 다 맞게 나온다. Haiku 쪽 한국어가 조금 딱딱하지만("복용하세요" 대 "드세요") 이
  화면에서 1.3초는 그 차이보다 비싸다. 소리가 늦게 나면 사람은 안 눌린 줄 안다.

  올릴 필요가 생기면 `SNAPCARE_TRANSLATE_MODEL` 로 바꾼다.
*/
const MODEL = process.env.SNAPCARE_TRANSLATE_MODEL || 'claude-haiku-4-5';

function systemFor(englishName: string, native: string): string {
  return `You translate short sentences for a medicine and food safety app.
The reader may not be able to read at all — the sentence will be spoken aloud to them.

Translate into ${englishName} (${native}).

Rules:
- Keep every number, time and dose EXACTLY as given. Do not convert, do not round, do not
  spell numbers out. "500mg" stays "500mg". "8:00 AM" stays "8:00 AM".
- Unit SYMBOLS attached to a number stay as written (mg, ml, g, kcal). Unit WORDS spelled
  out in the sentence ("calories", "kilocalories", "grams", "percent") are ordinary words —
  translate them. A spoken sentence that leaves them in English sounds like two languages
  spliced together, and the listener stops trusting the half they did understand.
- Never TRANSLATE a product, brand or drug name — the person has to find that name on the
  package, and a translated name cannot be found. If the target language uses the Latin
  alphabet, keep the name spelled exactly as given. If it does not (Korean, Bengali, Urdu),
  transliterate the sound of the name into that script — a speech engine reading Latin
  letters in those languages produces something nobody recognises.
- Keep it short and plain. Use the simplest everyday words of the language. Prefer the
  imperative a nurse would use with an elderly patient.
- Never add advice, warnings or explanations that are not in the source.
- If a sentence cannot be translated faithfully, return the English unchanged.

Return STRICT JSON only, no prose and no markdown fences:
{"out": ["translated 1", "translated 2", ...]}
The array must have exactly as many items as the input, in the same order.`;
}

/**
 * 돌아온 문장이 원문과 **같은 숫자**를 들고 있는가.
 *
 * 번역 모델이 숫자를 옮기다 틀리는 것은 드물지만, 이 앱에서 그 드문 일이 나면
 * 용량이 바뀐다. 숫자 목록이 다르면 번역을 버리고 영어를 쓴다 — 못 알아듣는 것이
 * 틀린 용량을 알아듣는 것보다 낫다.
 */
function sane(source: string, out: string): boolean {
  if (!out || out.length > MAX_CHARS * 2) return false;
  const nums = (s: string) => (s.match(/\d+/g) ?? []).join(',');
  return nums(source) === nums(out);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ error: 'no translator on this server' }, { status: 501 });

  let body: { texts?: unknown; lang?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }

  const lang = String(body.lang ?? '');
  const target = LANGUAGES.find((l) => l.code === lang);
  // 영어는 원문이다. 옮길 것이 없다.
  if (!target || lang === 'en') return NextResponse.json({ out: {} });

  const texts = Array.isArray(body.texts)
    ? body.texts.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
        .map((t) => t.slice(0, MAX_CHARS))
        .slice(0, MAX_BATCH)
    : [];
  if (texts.length === 0) return NextResponse.json({ out: {} });

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
        max_tokens: 4000,
        system: systemFor(target.english, target.native),
        messages: [{ role: 'user', content: JSON.stringify(texts) }],
      }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);

    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const raw = json.content?.find((c) => c.type === 'text')?.text ?? '';
    const parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, '')) as { out?: unknown };
    const list = Array.isArray(parsed.out) ? parsed.out : [];

    const out: Record<string, string> = {};
    for (let i = 0; i < texts.length; i++) {
      const said = typeof list[i] === 'string' ? (list[i] as string).trim() : '';
      // 숫자가 어긋난 것은 버린다. 그 자리는 영어로 남고, 화면은 그것을 그대로 읽는다.
      if (said && sane(texts[i], said)) out[texts[i]] = said;
      else if (said) console.warn('[translate] 숫자가 어긋나 버렸다:', texts[i], '→', said);
    }
    return NextResponse.json({ out });
  } catch (err) {
    console.error('[translate] 실패:', err);
    return NextResponse.json({ error: 'translate failed' }, { status: 502 });
  }
}
