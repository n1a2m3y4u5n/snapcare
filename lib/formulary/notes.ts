import { fuzzyHasAny } from '../fuzzyWord.ts';
import type { ItemFlag, Precaution } from '../snapcare/types.ts';

/**
 * 종이의 **Notes 칸**에 약사가 적은 주의 → 그림.
 *
 * 왜 종이에 적게 하는가
 * ---------------------
 * 주의사항을 어디서 가져올 것인가에 답이 셋 있었다.
 *
 *   양식에 칸을 새로 판다   종이가 이미 다 인쇄되어 있다. 못 한다.
 *   약품표가 들고 있는다    "이 약은 식후" 는 약의 성질이라 표에 맞다. 그런데 표에
 *                          없는 약이면 주의도 같이 없어지고, 같은 약이라도 이 환자에게
 *                          만 해당하는 주의는 담을 수 없다.
 *   약사가 적는다           ← 이것
 *
 * 세 번째가 실제 진료 흐름과 같다. 약사는 이미 봉투에 손으로 주의를 적고 있고, 그것을
 * 적을 자리가 이 종이에 이미 있다 — `Notes` 칸은 폭 전체를 쓰는 빈 줄이고, 아무도
 * 읽지 않고 있었다. 종이를 안 고치고 자리를 얻는 유일한 길이다.
 *
 * 무엇을 알아듣는가
 * -----------------
 * 짧은 구절만이다. 이 칸은 문장을 쓰는 자리가 아니라 **표시를 적는 자리**이고,
 * 약사에게 정해진 말을 쓰라고 부탁하는 것이 이 기능의 절반이다. 아래 표가 그
 * 합의문이고, 여기 없는 말은 못 알아듣는다고 **말한다**.
 *
 * 못 알아들은 것을 버리지 않는다
 * ------------------------------
 * 이것이 이 파일에서 제일 중요하다. 약사가 적었는데 우리가 못 그리는 주의가 반드시
 * 있고, 그때 조용히 버리면 **종이에는 있고 화면에는 없는 지시**가 생긴다. 그것은
 * 주의가 없는 것보다 나쁘다 — 사람은 화면을 봤으니 다 봤다고 여긴다.
 *
 * 그래서 `unknown` 으로 돌려주고, 화면은 그것을 글자와 소리로 낸다. 그림이 없다는
 * 것까지 말한다. 이 저장소가 `\?개념` 으로 하는 것과 같은 판단이다.
 */

export interface NotesReading {
  /** 그림으로 그릴 수 있는 주의. */
  care: Precaution[];
  /** 판정 엔진까지 가는 것들 — 금주, 임신·수유 금기. */
  flags: ItemFlag[];
  /** 쓰기 전에 흔든다. */
  shake: boolean;
  /** 쓰기 전에 손을 씻는다. */
  handwash: boolean;
  /** 렌즈를 빼고 넣는다. */
  noLens: boolean;
  /** 적혀 있는데 우리가 못 그리는 것. 버리지 않고 글자로 낸다. */
  unknown: string[];
}

/**
 * 합의된 말들.
 *
 * 영어와 한국어를 같이 받는다. 화면은 영어지만 종이에 적는 사람은 그 지역 사람이고,
 * 이 저장소는 두 언어를 나란히 받는 파서를 갖고 있었고 그 규칙을 여기가 이어받는다.
 *
 * `words` 는 **흐리게** 맞춘다(`fuzzyHasAny`) — OCR 이 `morning` 을 `moming` 으로
 * 읽는 것이 실측된 이 저장소에서 정확한 철자를 요구하는 것은 안 될 일이다.
 * `re` 는 정확히 맞춘다. 짧거나 부정이 걸린 말들이라 흐리게 맞추면 반대 뜻이 잡힌다 —
 * `no driving` 과 `driving` 은 편집거리 셋이다.
 */
interface Phrase {
  care?: Precaution;
  flag?: ItemFlag;
  set?: 'shake' | 'handwash' | 'noLens';
  words?: string[];
  re?: RegExp;
  /**
   * 이 구절이 **반대 뜻**이면 안 붙인다.
   *
   * 몇몇 개념은 낱말 하나가 아니라 그 낱말에 걸린 부정·시점이 뜻을 정한다. 'food' 가
   * 나왔다고 "음식과 함께" 가 아니고, 'pregnancy' 가 나왔다고 "임신 중 금기" 가 아니다.
   *
   * 정규식이 아니라 함수인 이유: 부정이 안전 표현 **앞에** 오는지를 봐야 하는데,
   * 그것을 한 줄짜리 정규식으로 쓰면 뒤돌아보기(lookbehind)가 필요하고 그 문법은
   * 낡은 폰의 브라우저에서 통째로 문법 오류가 된다 — 이 앱이 서려는 자리가 그런 폰이다.
   */
  not?: (piece: string) => boolean;
}

/**
 * "음식과 **함께 먹지 말라**" 인가.
 *
 * `with_food` 가 `words: ['food']` 였다. 낱말 하나만 보면 'Do not take with food',
 * 'Take 30 minutes before food', 'Avoid food for 2 hours' 가 전부 "음식과 함께" 가
 * 되고, 그것이 `sigil.ts` 의 밥그릇 그림으로 그려진다 — 공복 지시가 정반대 그림이 된다.
 */
function saysWithoutFood(piece: string): boolean {
  // `not` 이 따로 있어야 한다. `no\b` 로는 "Not to be taken with food" 를 못 잡는다 —
  // 'o' 와 't' 사이에 낱말 경계가 없어서다.
  return /\b(do\s*not|don'?t|not|never|avoid|without|no)\b[^.;]*\b(food|meal)/i.test(piece)
      || /before\s*(a\s*)?(meal|food)|empty\s*stomach|공복|빈속|식전|음식\s*없이/i.test(piece);
}

/**
 * "임신·수유 중 **안전하다**" 인가.
 *
 * `unsafe_pregnancy` 가 'pregnancy' 라는 낱말만 봤다. 그래서 'Safe in pregnancy',
 * 'May be used by pregnant women' 가 금기로 뒤집혀, `verdict.ts` 가 빨간 "먹지 마세요"
 * 를 낸다. 같은 파일의 `no_driving`·`alcohol` 은 부정을 정규식에 넣어 이미 막고 있다.
 *
 * 부정이 걸린 안전 표현("not safe")은 **안전 표현이 아니다.** 그래서 안전 낱말이
 * 있어도 위험 낱말이 같이 있으면 여기서 참을 안 낸다.
 *
 * 'unsafe' 는 `\b` 덕에 'safe' 로 안 잡힌다 — 'n' 과 's' 사이에는 낱말 경계가 없다.
 */
function saysSafeInState(piece: string): boolean {
  const danger = /\b(not|never|avoid|contraindicated?)\b|unsafe|않|금기|위험/i;
  if (/\b(safe|suitable|permitted|allowed)\b|안전/i.test(piece)) return !danger.test(piece);
  // 허락하는 말과 되묻는 말. 둘 다 "금기" 라고 단언할 근거가 아니다.
  return /\b(may|can)\s+be\s+(used|taken)\b|\bno\s+known\s+risk\b|\b(ask|check|confirm|discuss)\b|확인|문의/i
    .test(piece);
}

const PHRASES: Phrase[] = [
  { care: 'with_food',
    // 'food' 를 `words` 에서 뺐다. 흐리게 맞추면 부정이 걸린 구절까지 잡히는데, 이
    // 파일이 위에 적어 둔 규칙이 정확히 그것이다 — 짧거나 부정이 걸린 말은 `re` 로.
    re: /식후|식사\s*와?\s*함께|after\s*(a\s*)?(meal|food)|with\s*(a\s*)?(meal|food)|음식과\s*함께/i,
    not: saysWithoutFood },
  { care: 'empty_stomach',
    re: /empty\s*stomach|before\s*(a\s*)?(meal|food)|avoid\s*food|공복|빈속|식전/i },
  { care: 'full_glass', re: /full\s*glass|plenty\s*of\s*water|with\s*water|물\s*한?\s*컵|물과\s*함께/i },
  { care: 'drowsy', words: ['drowsy', 'drowsiness', 'sleepy'], re: /졸음|졸릴|졸릴\s*수/i },
  { care: 'no_driving', re: /(do\s*not|don'?t|no|avoid)\s*driv|운전\s*(금지|하지)/i },
  { care: 'upset_stomach', words: ['nausea'], re: /upset\s*stomach|stomach\s*upset|속쓰림|위장\s*장애/i },
  { care: 'not_for_children', re: /not\s*for\s*(young\s*)?child|do\s*not\s*give\s*to\s*child|소아\s*금기|어린이\s*금지/i },
  { care: 'fridge', words: ['refrigerate', 'refrigerated'], re: /fridge|keep\s*cold|냉장/i },
  { care: 'keep_dark', re: /protect\s*from\s*light|keep\s*in\s*the\s*dark|away\s*from\s*sunlight|차광|빛을\s*피/i },

  { flag: 'alcohol', re: /no\s*alcohol|avoid\s*alcohol|do\s*not\s*drink|금주|술\s*금지/i },
  { flag: 'unsafe_pregnancy', words: ['pregnancy', 'pregnant'], re: /임신|임산부/i,
    not: saysSafeInState },
  { flag: 'unsafe_breastfeeding', words: ['breastfeeding'], re: /수유/i,
    not: saysSafeInState },

  { set: 'shake', words: ['shake'], re: /흔들/i },
  { set: 'handwash', re: /wash\s*(your\s*)?hands|손\s*씻/i },
  { set: 'noLens', re: /contact\s*lens|렌즈/i },
];

/**
 * Notes 칸의 글자를 읽는다.
 *
 * 구절 단위로 가른 뒤 각 구절을 표와 견준다. 통째로 견주지 않는 이유는 한 칸에 여러
 * 주의가 들어오기 때문이고 — `"After food. May cause drowsiness."` — 그리고 **못
 * 알아들은 구절만 따로 세려면** 어디까지가 한 구절인지 알아야 하기 때문이다.
 */
export function readNotes(text: string): NotesReading {
  const out: NotesReading = {
    care: [], flags: [], shake: false, handwash: false, noLens: false, unknown: [],
  };
  const raw = String(text ?? '').trim();
  if (!raw) return out;

  const pieces = raw
    .split(/[.;·•,\n]+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 3);

  for (const piece of pieces) {
    let hit = false;
    for (const p of PHRASES) {
      const matched = (p.re?.test(piece) ?? false)
        || (p.words ? fuzzyHasAny(piece, p.words) : false);
      if (!matched) continue;
      // 낱말은 맞았는데 뜻이 반대인 구절. 여기서 빠지면 `hit` 이 안 서므로 아래에서
      // `unknown` 으로 내려가 원문이 화면에 남는다 — 지어낸 그림보다 그쪽이 낫다.
      if (p.not?.(piece)) continue;
      hit = true;
      if (p.care && !out.care.includes(p.care)) out.care.push(p.care);
      if (p.flag && !out.flags.includes(p.flag)) out.flags.push(p.flag);
      if (p.set) out[p.set] = true;
    }
    /*
      못 알아들은 구절. 길이로 한 번 거른다 — OCR 은 빈 칸에서도 잡음 두세 글자를
      내놓고, 그것을 "약사가 적었는데 우리가 못 읽은 것" 으로 보이면 화면이 매번
      쓰레기를 달고 뜬다. 글자가 넷 이상 이어져야 사람이 쓴 것으로 친다.
    */
    if (!hit && /[A-Za-z가-힣]{4}/.test(piece)) out.unknown.push(piece);
  }
  return out;
}
