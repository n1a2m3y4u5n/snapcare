import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

import type { ItemFlag } from '@/lib/snapcare/types';
import { EMPTY_LOOKUP, LOOKUP_FORMS, MED_FLAGS, type DrugLookup } from '@/lib/formsheet/lookupTypes';

/**
 * 표에 없는 약을 **묻는다.**
 *
 * 무엇이 문제였나
 * ---------------
 * 약품표는 WHO 필수의약품 94종이고 세상의 처방은 그보다 많다. 표에 없으면 화면이
 * 할 수 있는 말이 "이 약은 모르겠습니다" 하나였다. 종이를 스스로 못 읽어서 온
 * 사람에게 그것은 아무것도 아니다.
 *
 * 그런데 **빠진 경고가 검증 안 된 경고보다 나쁘다.** 임신 중인 사람이 94종 밖의
 * ACE 억제제를 받았을 때 "모르겠다" 는 아무도 구하지 못한다. 틀린 경고가 뜨면
 * 그 사람은 약사에게 묻는데, 그것은 어차피 옳은 행동이다. 두 실패의 무게가 다르다.
 *
 * 그래서 무엇을 지키나
 * --------------------
 * 여기서 온 것은 **경고를 더하기만 한다.** 지우지 않고, 초록을 켜지 않는다.
 * 사람이 쓴 표(`who.ts`)가 이긴다는 규칙은 그대로다 — 표에서 맞은 약은 여기까지
 * 오지도 않는다. 이 자리는 표가 침묵할 때만 열린다.
 *
 * 세 가지를 못 하게 막아 두었다:
 *
 *  · **플래그는 닫힌 목록에서만.** 아래 `MED_FLAGS` 넉 자만 받는다. 모델이 "peanut"
 *    을 내면 알레르기 판정이 없는 근거로 켜지는데, 그 판정은 사람이 등록한 조건과
 *    맞물려 빨강까지 간다. 음식 알레르겐은 성분표에서 오는 것이지 약 이름에서 추측할
 *    것이 아니다.
 *  · **이름은 읽은 글자와 닮았을 때만 고친다.** 부르는 쪽(`drugLookup.ts`)이 철자
 *    거리로 검산한다. 안 그러면 "이건 사실 다른 약입니다" 가 조용히 통과한다.
 *  · **모르면 모른다고 한다.** `known: false` 가 정상적인 답이고, 프롬프트가 그것을
 *    권한다. 지어내는 것보다 침묵이 낫다는 규칙은 `match.ts` 와 같다.
 */

/*
  받아들이는 플래그 — 약에서 나올 수 있고, 우리 판정 엔진이 아는 것.

  `ItemFlag` 전체가 아니라 넷이다. 나머지(견과·유당·글루텐…)는 음식 성분에서 오는
  것이고, 약 이름만 보고 그것을 붙이면 근거 없는 알레르기 경고가 된다. 타입으로
  묶어 두어 `ItemFlag` 가 늘어나도 여기가 저절로 넓어지지 않는다.
*/
// 이 줄이 깨지면 `MED_FLAGS` 에 판정 엔진이 모르는 값이 들어간 것이다.
const _flagsAreItemFlags: readonly ItemFlag[] = MED_FLAGS;
void _flagsAreItemFlags;

const SCHEMA = {
  type: 'object',
  properties: {
    known: { type: 'boolean' },
    name: { type: 'string' },
    inn: { type: 'string' },
    form: { type: 'string', enum: LOOKUP_FORMS },
    flags: { type: 'array', items: { type: 'string', enum: MED_FLAGS } },
    handwash: { type: 'boolean' },
    shake: { type: 'boolean' },
    storage: { type: 'string', enum: ['refrigerator', 'room', 'unknown'] },
    purpose: { type: 'string' },
    confident: { type: 'boolean' },
  },
  required: ['known', 'name', 'inn', 'form', 'flags', 'handwash', 'shake',
    'storage', 'purpose', 'confident'],
  additionalProperties: false,
} as const;

const SYSTEM = `You identify medicines for an app used by people who cannot read the
prescription themselves. The text you receive was read by handwriting OCR from a paper
form, so it may contain character-level errors.

Return what you know about that medicine, or say you do not know it.

Rules:
- If the text is not recognisably a medicine name, set "known": false and leave the other
  fields at their empty or "unknown" values. Not knowing is a correct and expected answer.
  A wrong medicine is worse than no medicine — this app is what stands between the reader
  and a drug they cannot look up themselves.
- "name" may correct obvious OCR damage ("Amoxicilin" -> "Amoxicillin"), but must stay the
  same medicine. Never substitute a different drug that merely looks similar. If the text
  could plausibly be two different medicines, set "confident": false.
- "flags" carries only hazards you are sure of for this medicine:
    unsafe_pregnancy      must not be taken while pregnant
    unsafe_breastfeeding  must not be taken while breastfeeding
    nsaid_bleed           NSAID — raises bleeding risk, matters with blood thinners
    alcohol               must not be combined with alcohol
  Omit a flag you are unsure of. Do not add a flag that is merely common advice for the
  drug class if it does not apply to this drug.
- "purpose" is ONE short sentence in plain words, of the kind you would say to someone
  who has never heard of the medicine: "This medicine lowers high blood pressure."
  No dosing, no numbers, no warnings — the warnings are the flags. It will be spoken aloud.
- "handwash" is true for eye drops, ear drops and creams. "shake" is true for suspensions
  and syrups that settle.

Return STRICT JSON matching the schema. No prose, no markdown fences.`;

/*
  왜 Opus 인가 — 번역(`/api/translate`)은 Sonnet 을 쓴다.

  거기는 짧은 문장을 규칙대로 옮기는 일이고 사람이 그 소리를 기다리고 서 있다. 여기는
  다르다. 한 번 부르고, 답이 그 사람이 볼 유일한 약 정보가 된다. 틀린 답의 값이 훨씬
  비싸므로 더 나은 쪽을 쓴다.

  `effort: 'low'` 로 둔다. 이것은 어려운 추론이 아니라 아는 것을 꺼내 규칙대로 담는
  일이고, 낮은 단계가 이 모델에서 충분히 강하다. 사람이 카메라 앞에서 기다린다.
*/
const MODEL = process.env.SNAPCARE_DRUG_MODEL || 'claude-opus-5';

/** 사람이 손으로 쓸 수 있는 길이. 이보다 길면 이름칸이 아닌 것이 들어온 것이다. */
const MAX_CHARS = 80;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const key = process.env.ANTHROPIC_API_KEY;
  // 열쇠가 없는 서버에서도 앱은 돌아야 한다. 부르는 쪽이 이 답을 "없음" 으로 받는다.
  if (!key) return NextResponse.json(EMPTY_LOOKUP);

  let body: { read?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }

  const read = String(body.read ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);
  // 글자가 세 자도 안 되면 물어볼 것이 없다 (`prescription.ts` 의 `unread` 와 같은 문턱).
  if (read.replace(/[^A-Za-z]/g, '').length < 3) return NextResponse.json(EMPTY_LOOKUP);

  try {
    /*
      서버 쪽에서 스스로 시간을 묶는다.

      SDK 는 529(과부하)를 기본 두 번 다시 시도하고, 그 백오프가 화면 쪽 기다림보다
      길어질 수 있다. 그러면 사람은 이미 포기한 화면을 보고 있는데 서버만 계속 붙들고
      있는 상태가 된다. 한 번만 다시 걸고, 그 안에 안 되면 없는 것으로 친다 —
      화면은 "표에 없다" 로 멀쩡히 뜬다.
    */
    const client = new Anthropic({ apiKey: key, maxRetries: 1, timeout: 11_000 });
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: SCHEMA },
      },
      system: SYSTEM,
      messages: [{ role: 'user', content: read }],
    });

    // 안전 분류기가 거절하면 `content` 가 비어 있다. 읽기 전에 확인한다.
    if (res.stop_reason === 'refusal') {
      console.warn('[drug] 거절됨:', read);
      return NextResponse.json(EMPTY_LOOKUP);
    }

    const text = res.content.find((b) => b.type === 'text')?.text ?? '';
    const out = JSON.parse(text) as DrugLookup;

    // 스키마가 모양을 보장하지만 값의 뜻까지는 아니다. 못 알아본 답에서 나머지를 턴다 —
    // `known: false` 인데 플래그가 붙어 오면 그것은 근거 없는 경고가 된다.
    if (!out.known) return NextResponse.json(EMPTY_LOOKUP);
    return NextResponse.json(out);
  } catch (err) {
    // 못 물어본 것은 실패가 아니다. 표에 없다는 화면이 그대로 뜬다.
    console.error('[drug] 실패:', err);
    return NextResponse.json(EMPTY_LOOKUP);
  }
}
