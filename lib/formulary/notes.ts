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
 * 이 저장소는 이미 두 언어를 나란히 받는 파서를 갖고 있다(`ocr-to-macro.ts`).
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
}

const PHRASES: Phrase[] = [
  { care: 'with_food', words: ['food'], re: /식후|식사\s*와?\s*함께|after\s*(a\s*)?meal/i },
  { care: 'empty_stomach', re: /empty\s*stomach|before\s*(a\s*)?meal|공복|빈속|식전/i },
  { care: 'full_glass', re: /full\s*glass|plenty\s*of\s*water|with\s*water|물\s*한?\s*컵|물과\s*함께/i },
  { care: 'drowsy', words: ['drowsy', 'drowsiness', 'sleepy'], re: /졸음|졸릴|졸릴\s*수/i },
  { care: 'no_driving', re: /(do\s*not|don'?t|no|avoid)\s*driv|운전\s*(금지|하지)/i },
  { care: 'upset_stomach', words: ['nausea'], re: /upset\s*stomach|stomach\s*upset|속쓰림|위장\s*장애/i },
  { care: 'not_for_children', re: /not\s*for\s*(young\s*)?child|do\s*not\s*give\s*to\s*child|소아\s*금기|어린이\s*금지/i },
  { care: 'fridge', words: ['refrigerate', 'refrigerated'], re: /fridge|keep\s*cold|냉장/i },
  { care: 'keep_dark', re: /protect\s*from\s*light|keep\s*in\s*the\s*dark|away\s*from\s*sunlight|차광|빛을\s*피/i },

  { flag: 'alcohol', re: /no\s*alcohol|avoid\s*alcohol|do\s*not\s*drink|금주|술\s*금지/i },
  { flag: 'unsafe_pregnancy', words: ['pregnancy', 'pregnant'], re: /임신|임산부/i },
  { flag: 'unsafe_breastfeeding', words: ['breastfeeding'], re: /수유/i },

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
