/**
 * 읽어 온 글자가 **약 이름일 수 있는가.**
 *
 * 왜 이 파일이 생겼나
 * -------------------
 * 표에 없는 약도 화면에 띄우기로 하면서(`prescription.ts`) 문턱이 하나뿐이었다:
 * 글자가 세 자 이상인가. 그것만으로 통과시켰더니 화면에 이런 것이 떴다.
 *
 *     Sr" 77 eam TR v Spent ee —— eee errr error ——
 *     will drop from layer 2, 12:00 AM everyday. Take 4 each time.
 *
 * 약 이름 자리에 OCR 잡음이 그대로 앉았고, 문장이 그 위에 지어졌고, 소리로도 나갔다.
 * 그전에는 표에 없으면 "이름을 못 읽었다" 로 끝났으니, **고친 것이 안 고친 것보다
 * 나쁜** 상태였다.
 *
 * 같은 구멍에서 나온 것이 하나 더 있다:
 *
 *     Acetaminophen Pill Dispenser Schedule
 *
 * 종이 맨 위에 인쇄된 제목이 이름 뒤에 붙어 왔다. 이쪽은 잡음이 아니라 **우리가
 * 인쇄한 글자**라, 버릴 것이 아니라 떼어내면 된다.
 *
 * 두 가지 일을 한다
 * -----------------
 *   `cleanDrugName`  우리가 종이에 인쇄해 둔 말을 떼어낸다. 무엇이 인쇄돼 있는지
 *                    아는 것은 우리뿐이라, 이 일은 우리만 할 수 있다.
 *   `plausibleName`  남은 것이 약 이름의 모양인가. 아니면 안 받는다.
 *
 * 무엇을 기준으로 삼나
 * --------------------
 * "약 이름 목록에 있는가" 로 물으면 안 된다 — 그 물음의 답은 이미 `match.ts` 가 내고,
 * 여기가 필요한 이유가 정확히 **목록에 없는 약을 받기 위해서**다. 그래서 뜻이 아니라
 * **모양**을 본다: 낱말 몇 개인가, 글자 비율이 어떤가, 같은 글자가 뭉쳐 있지 않은가.
 * 약 이름은 짧고 글자로 되어 있고 사람이 읽을 수 있는 말이다. 잡음은 그 셋을 동시에
 * 만족시키지 못한다.
 */

/**
 * 종이에 **인쇄되어 있는** 말들.
 *
 * 자르는 자리를 라벨 아래로 잡아 두었지만(`lib/formsheet/config.ts`), 종이가 기울거나
 * 손글씨가 칸을 넘으면 크롭에 걸린다. 그리고 사진 판별(`/api/analyze`)은 페이지
 * 전체를 보므로 제목을 읽을 기회가 더 많다.
 *
 * `config.ts` 의 좌표와 달리 이것은 **인쇄된 문구** 목록이다. 종이를 다시 디자인하면
 * 여기도 같이 고쳐야 한다 — 그 사실을 적어 두는 것 말고 두 곳을 묶을 방법이 없다.
 */
const SHEET_WORDS = [
  'pill dispenser schedule',
  'medication name',
  'pill count per slot',
  'days of week',
  'drop time',
  'duration',
  'layer',
  'notes',
  'fill exactly one',
  'prescription',
];

/** 낱말 사이를 하나로. 비교는 여기서 만든 모양으로만 한다. */
function flat(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * 인쇄된 말을 떼어내고 양끝의 잡동사니를 턴다.
 *
 * 긴 문구부터 뗀다 — `layer` 를 먼저 떼면 `pill dispenser schedule` 안의 낱말이
 * 조각나서 남은 것이 무엇인지 알아볼 수 없게 된다.
 */
export function cleanDrugName(raw: string): string {
  let out = ` ${flat(String(raw ?? ''))} `;
  for (const w of [...SHEET_WORDS].sort((a, b) => b.length - a.length)) {
    out = out.split(` ${w} `).join(' ');
    // 끝에 붙은 경우 — "Acetaminophen Pill Dispenser Schedule" 이 이 모양이다.
    if (out.endsWith(`${w} `)) out = `${out.slice(0, -(w.length + 1))} `;
    if (out.startsWith(` ${w}`)) out = ` ${out.slice(w.length + 2)}`;
  }
  return out
    // 글자·숫자·괄호·하이픈만 남긴다. 함량 표기(500mg)는 이름의 일부로 두고,
    // 따옴표와 줄표는 OCR 잡음에서만 나온다.
    .replace(/[^\p{L}\p{N}\s()./-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // 원문의 대소문자는 이미 잃었다. 첫 글자만 세워 화면에 쓸 모양으로 만든다.
    .replace(/^\p{Ll}/u, (c) => c.toUpperCase());
}

/**
 * 이 글자를 약 이름 자리에 앉혀도 되는가.
 *
 * 통과 못 하면 부르는 쪽은 **이름을 못 읽은 것으로 친다.** 지어낸 이름을 띄우고
 * 그 위에 문장을 짓는 것보다, 못 읽었다고 말하고 다시 찍게 하는 편이 낫다.
 */
export function plausibleName(raw: string): boolean {
  const s = cleanDrugName(raw);
  const letters = s.replace(/[^\p{L}]/gu, '');
  // 두 자짜리 약 이름은 없다. 마흔 자를 넘으면 이름이 아니라 문장이다.
  if (letters.length < 3 || s.length > 40) return false;

  // 글자가 반도 안 되면 이름이 아니다. `Sr" 77 eam TR v Spent ee` 가 여기서 걸린다.
  if (letters.length / s.replace(/\s/g, '').length < 0.6) return false;

  const words = s.split(' ');
  // 약 이름은 길어야 세 낱말이다 ("Amoxicillin clavulanate 500mg").
  if (words.length > 3) return false;

  /*
    같은 글자만 뭉친 낱말 — `eee`, `errr`, `aaa`.

    OCR 이 획을 놓치면 이런 것이 나오고, 위의 검사는 전부 통과한다: 글자뿐이고,
    짧고, 낱말 수도 적다. 사람이 쓰는 말에는 같은 글자가 셋 이상 잇달아 오지 않는다.
  */
  if (/(\p{L})\1{2,}/u.test(s)) return false;

  // 한 글자짜리 조각이 섞여 있으면 낱말이 아니라 부스러기다 (`TR v Spent`).
  if (words.length > 1 && words.some((w) => w.replace(/[^\p{L}]/gu, '').length === 1)) return false;

  return true;
}
