/**
 * 약 이름을 화면에 앉을 만한 길이로.
 *
 * 왜 이름이 길어지는가
 * --------------------
 * 처방전에서 읽은 이름은 **종이의 한 줄 통째**다(`lib/ocr-to-macro.ts` 가 그렇게
 * 뽑는다 — 38자에서 자르고 말줄임표를 붙인다). 약국이 인쇄하는 그 줄에는 약 이름
 * 말고도 함량, 제형, 약전 표시, 포장 수량, 복용 주기가 다 들어 있다.
 *
 *   AMOXICILLIN TRIHYDRATE 500MG CAPSULES BP 21'S
 *   G. Combigan 12hrly
 *
 * 기기 일정 화면은 한 줄에 트레이 번호와 시각도 같이 놓는다. 거기에 저 줄이 들어오면
 * 이름이 두 줄로 넘치고, 트레이 번호와 시각이 서로 다른 줄에 앉는다 — 어느 약이
 * 몇 번 칸인지가 **그 화면의 유일한 요점**인데 그것이 흐려진다.
 *
 * 무엇을 버리는가
 * ---------------
 * 버리는 것은 전부 **화면의 다른 곳에 이미 있는 것**이다. 함량과 복용법은 처방
 * 카드가 들고 있고, 시각은 같은 줄 오른쪽에 있고, 제형은 그림이 말한다. 여기서
 * 지우는 것은 중복이지 정보가 아니다.
 *
 * 그리고 **전체 이름은 사라지지 않는다.** 부르는 쪽이 소리와 `title` 로 원문을
 * 그대로 들고 있어야 한다 — 짧게 만든 이름이 틀렸을 때 되짚을 데가 없으면 이
 * 함수는 정보를 지운 것이 된다.
 *
 * 무엇을 안 버리는가
 * ------------------
 * 앞에 붙는 `G.`·`T.`·`Cap.` 같은 것은 남긴다. 두 글자밖에 안 되고, **먹는
 * 것인지 눈에 넣는 것인지**를 말한다 — 라고스 안과 처방전의 `G. Xalatan` 에서
 * `G.` 를 떼면 그것을 삼키라는 말로 읽힌다.
 */

/** 함량. 여기서부터 뒤는 이름이 아니다. */
const STRENGTH = /\s\d+(\.\d+)?\s?(mg|mcg|ug|µg|g|ml|l|iu|%)\b.*$/i;

/** 복용 주기 표기. 종이에는 이름 뒤에 붙지만 화면에는 시각이 따로 있다. */
const FREQUENCY = /\s(\d+\s?hrly|nocte|mane|om|on|od|bd|bid|tds|tid|qds|qid|prn|stat)\b.*$/i;

/** 제형과 약전 표시, 포장 수량. */
const TRAILING = new RegExp(
  '\\s+(' +
  'tablets?|caplets?|capsules?|softgels?|lozenges?|sachets?|' +
  'syrup|suspension|solution|drops?|cream|ointment|gel|patch|inhaler|' +
  'injections?|ampoules?|vials?|suppositor(y|ies)|' +
  'film[- ]?coated|sugar[- ]?coated|enteric[- ]?coated|' +
  'prolonged[- ]?release|modified[- ]?release|sustained[- ]?release|' +
  'bp|usp|usnf|ip|ep|jp|sr|mr|xl|xr|cr' +
  ')\\b',
  'gi',
);

/** `21'S`, `x30`, `30 tabs`, `pack of 20`. */
const COUNT = /\s+(\d+\s?['’]?s|x\s?\d+|\d+\s?(tabs?|caps?|pcs)|pack of \d+)\b/gi;

/**
 * 혼자서는 약 이름이 못 되는 말들.
 *
 * `Eye drops` 에서 `drops` 를 떼면 `Eye` 가 남는데, 그것은 짧아진 약 이름이 아니라
 * **사라진 약**이다. `Amoxicillin capsules` 도 똑같이 두 낱말이고 뒤가 제형인데
 * 이쪽은 떼는 것이 맞다. 둘을 가르는 것은 앞 낱말이 약 이름이냐 부위·증상이냐뿐이라,
 * 그 목록을 여기 적어 둔다.
 *
 * 목록이 짧은 것은 의도다. 이것은 "약 이름 사전" 이 아니라 **떼면 안 되는 자리를
 * 알아보는 장치**이고, 모르는 것은 안 떼는 쪽으로 틀려야 한다.
 */
const NOT_A_NAME = new Set([
  'eye', 'eyes', 'ear', 'ears', 'nasal', 'nose', 'oral', 'skin', 'throat',
  'chest', 'cough', 'cold', 'pain', 'fever', 'allergy', 'sleep', 'stomach',
]);

/**
 * 짧은 이름. 못 줄이면 원문을 그대로 돌려준다.
 *
 * `max` 를 넘으면 마지막 수단으로 자른다. 자를 때는 **낱말 경계에서** 자른다 —
 * 글자 수로 자르면 `Amoxicilli…` 같은 것이 나오고, 그건 약 이름으로도 아니고
 * 아무것도 아닌 글자가 된다.
 */
export function shortName(name: string, max = 22): string {
  const full = String(name ?? '').replace(/\s+/g, ' ').trim();
  if (!full) return '';

  // 함량과 주기는 조건 없이 뗀다. 숫자와 단위, 그리고 `nocte` 는 어떤 약의 이름도
  // 아니다.
  const base = full.replace(STRENGTH, '').replace(FREQUENCY, '');

  /*
    제형과 포장은 **뗀 뒤에 이름이 남을 때만** 뗀다.

    `Amoxicillin capsules` 는 떼는 것이 맞고 `Eye drops` 는 아니다. 둘 다 두 낱말에
    뒤가 제형이라 모양으로는 못 가르고, 가르는 것은 앞 낱말이 약 이름이냐 부위냐뿐이다.
  */
  const trimmed = base.replace(COUNT, '').replace(TRAILING, '').trim();
  const head = trimmed.split(/\s+/).filter(Boolean);
  const eaten = head.length === 0
    || (head.length === 1 && NOT_A_NAME.has(head[0].toLowerCase().replace(/[.,]/g, '')));

  let out = (eaten ? base : trimmed)
    // 잘라 낸 자리에 남는 쉼표·괄호·말줄임표.
    .replace(/[\s,;·\-–—]+$/, '')
    .replace(/\s*\(\s*\)\s*$/, '')
    .replace(/…$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  // 다 지워 버렸으면 지우기 전이 맞다. 규칙이 이름 자체를 먹은 경우가 있다 —
  // `Vitamin D` 의 `D` 가 아니라, 이름이 통째로 제형인 `Eye drops` 같은 것.
  if (out.length < 2) out = full;

  /*
    전부 대문자면 첫 글자만 남긴다.

    처방전은 대개 대문자로 인쇄되고, 대문자는 같은 글자 수에서 눈에 띄게 넓다 —
    `AMOXICILLIN` 이 `Amoxicillin` 보다 15% 쯤 길다. 그리고 대문자 덩어리는 읽는
    속도 자체가 느리다(글자 윗선이 평평해서 낱말의 윤곽이 사라진다).

    두 글자 이하는 건드리지 않는다. `BP`·`XL` 은 약어이고, 약어를 소문자로 만들면
    다른 말이 된다.
  */
  if (out === out.toUpperCase() && /[A-Z]{3}/.test(out)) {
    out = out.replace(/[A-Z][A-Z']*/g, (w) =>
      w.length <= 2 ? w : w[0] + w.slice(1).toLowerCase());
  }

  if (out.length <= max) return out;

  // 낱말 경계에서. 첫 낱말부터 이미 길면 그 낱말은 그대로 둔다 — 잘린 약 이름보다
  // 넘치는 약 이름이 낫다.
  const cut = out.slice(0, max + 1).lastIndexOf(' ');
  return cut > 3 ? `${out.slice(0, cut)}…` : out;
}
