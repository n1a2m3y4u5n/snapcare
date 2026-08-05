import type { ScanRecord } from './types.ts';

/**
 * 시연 계정의 지난 몇 주.
 *
 * 왜 필요한가
 * -----------
 * 시연 자료가 오늘과 어제, 네 줄뿐이었다. 그래서 이 앱이 **시간을 두고 하는 일**이
 * 화면에 아무것도 안 나왔다 — 열나흘 추세는 막대 두 개, 주별 추세는 아예 안 뜨고
 * (기록이 두 주는 있어야 방향을 말할 수 있다), 복약 순응도는 셀 것이 없고, 식이
 * 일지는 반응 하나로 아무것도 추론하지 못한다.
 *
 * 이 앱의 논지는 "한 장을 읽어 준다" 가 아니라 "쌓이면 보인다" 인데, 그 논지가
 * 화면에서 증명되지 않고 있었다.
 *
 * 무엇을 담는가
 * -------------
 * 다섯 주. 이야기가 하나 들어 있다 — **설탕이 줄어드는 중이다.** 처음 두 주는
 * 거의 매일 에너지음료와 초콜릿을 먹었고, 최근으로 올수록 뜸해진다. 주별 막대가
 * 내려가는 것이 보이고, 그것이 이 화면이 존재하는 이유다.
 *
 * 복약은 하루 세 번. 걸린 것을 몇 번 섞는데, **저녁에 몰아서** 넣는다. 순응도
 * 화면이 "주로 저녁을 거른다" 를 짚어내는 것을 보이기 위해서다. 그 짚음이 이 기능의
 * 값이고, 무작위로 흩뿌리면 그 값이 화면에 안 나온다.
 *
 * 규칙 둘
 * -------
 *  · **무작위를 쓰지 않는다.** 열 때마다 다른 자료가 나오면 화면 캡처가 흔들리고,
 *    "어제는 이랬는데" 라는 말을 할 수가 없다. 날짜에서 결정적으로 만든다.
 *  · **바코드는 캐시에 있는 것만 쓴다.** public/nutrition/ 에 담긴 여섯 제품
 *    말고는 오프라인에서 영양 수치가 안 나오고, 수치가 없으면 이 자료가 채우려던
 *    화면이 그대로 빈다.
 */

/**
 * public/nutrition/ 에 실제로 담겨 있는 제품들.
 *
 * 단것뿐이었다 — 에너지음료, 초콜릿, 콜라, 스프레드. 그러면 화면이 **설탕 말고는
 * 전부 0** 이 된다. 단백질 0g, 섬유 0g, 지방 0g 짜리 막대 다섯이 줄지어 서 있고,
 * 그것은 이 사람이 아무것도 안 먹었다는 뜻이 아니라 **우리가 밥을 안 넣었다**는
 * 뜻이다. 영양 화면이 무엇을 하는지가 그 화면에서 안 보였다.
 *
 * 그래서 끼니를 넣었다. 빵·죽·요거트·참치·닭가슴살·렌틸·콩·수프·치즈·땅콩버터·
 * 사과주스. 값은 전부 OpenFoodFacts 에서 받아 온 실제 제품이다 — 지어내면 화면의
 * 숫자가 그럴듯한 거짓말이 되고, 이 앱은 그 숫자로 "더 먹어라" 를 말한다.
 */
const PRODUCTS = {
  redbull: { barcode: '9002490100070', name: 'Energy drink 250 mL', emoji: '🥤', grams: 250, kind: 'drink' as const },
  snickers: { barcode: '5000159461122', name: 'Peanut chocolate bar', emoji: '🍫', grams: 50, kind: 'food' as const },
  mars: { barcode: '5000159407236', name: 'Chocolate bar', emoji: '🍫', grams: 51, kind: 'food' as const },
  cola: { barcode: '5449000000996', name: 'Cola 330 mL', emoji: '🥤', grams: 330, kind: 'drink' as const },
  nutella: { barcode: '3017620422003', name: 'Hazelnut spread', emoji: '🍞', grams: 30, kind: 'food' as const },

  // 끼니. 이쪽이 단백질·섬유·지방을 채운다.
  bread: { barcode: '3760049790214', name: 'Bread', emoji: '🍞', grams: 60, kind: 'food' as const },
  oats: { barcode: '5000108022152', name: 'Porridge oats', emoji: '🥣', grams: 40, kind: 'food' as const },
  yoghurt: { barcode: '20047559', name: 'Yoghurt', emoji: '🥛', grams: 150, kind: 'food' as const },
  tuna: { barcode: '00192125', name: 'Tuna', emoji: '🐟', grams: 80, kind: 'food' as const },
  chicken: { barcode: '3302740059186', name: 'Chicken', emoji: '🍗', grams: 100, kind: 'food' as const },
  lentils: { barcode: '5018095011271', name: 'Lentils', emoji: '🫘', grams: 120, kind: 'food' as const },
  beans: { barcode: '5000157024671', name: 'Beans', emoji: '🫘', grams: 200, kind: 'food' as const },
  soup: { barcode: '8714100766576', name: 'Vegetable soup', emoji: '🍲', grams: 250, kind: 'food' as const },
  cheese: { barcode: '5202390015885', name: 'Cheese', emoji: '🧀', grams: 30, kind: 'food' as const },
  peanutButter: { barcode: '3327272107259', name: 'Peanut butter', emoji: '🥜', grams: 20, kind: 'food' as const },
  juice: { barcode: '3254691592086', name: 'Apple juice', emoji: '🧃', grams: 200, kind: 'drink' as const },

  /*
    넷을 더 붙였다. 이유는 갯수가 아니라 **되풀이**다 — 이레짜리 식단을 열두 주 돌리면
    같은 날에 늘 같은 것이 앉고, 지난 달로 넘겨 봐도 이번 주와 똑같이 생겼다. 석 달을
    보여주는 화면에서 그것은 자료가 많다는 인상을 주지 못한다.

    이것들도 전부 OpenFoodFacts 의 실제 제품이고 수치는 받아 온 그대로다.
  */
  pasta: { barcode: '8076800195057', name: 'Spaghetti', emoji: '🍝', grams: 90, kind: 'food' as const },
  milk: { barcode: '5000436589457', name: 'Milk 250 mL', emoji: '🥛', grams: 250, kind: 'drink' as const },
  sardines: { barcode: '3263670162219', name: 'Sardines', emoji: '🐟', grams: 90, kind: 'food' as const },
  veg: { barcode: '3083680482042', name: 'Peas and carrots', emoji: '🥕', grams: 150, kind: 'food' as const },
};

/**
 * 시연 계정의 처방. 상자가 내미는 것과 앱이 들고 있는 알람이 **같은 표에서** 나온다.
 *
 * 한 약을 하루 세 번 내밀던 것을 둘로 갈랐다. 화면이 영양과 복약으로 갈리면서 복약
 * 쪽에 "지금 정해져 있는 것" 목록이 생겼는데, 약이 하나뿐이면 그 목록이 한 줄이고
 * 그 한 줄은 아무것도 보여주지 못한다 — 주기가 다른 약이 나란히 서야 그 화면이
 * 무엇을 하는지가 보인다.
 *
 * 그래서 하루 두 번짜리 하나와 하루 한 번짜리 하나다. 칸도 다르다: 달력의 조각이
 * 어느 약인지를 아래 날짜별 목록에서 짚을 수 있어야 한다.
 */
export interface DosePlan {
  due: string;
  tray: number;
  name: string;
  emoji: string;
  label: string;
}

/** 할머니 것 — 당뇨·혈압. 하루 세 번, 두 칸. */
export const ADULT_DOSES: DosePlan[] = [
  { due: '0800', tray: 1, name: 'Metformin 500mg', emoji: '💊', label: '8:00 AM' },
  { due: '1300', tray: 2, name: 'Amlodipine 5mg', emoji: '💊', label: '1:00 PM' },
  { due: '1900', tray: 1, name: 'Metformin 500mg', emoji: '💊', label: '7:00 PM' },
];

/**
 * 일곱 살 것.
 *
 * 아이 쪽 복약 화면이 통째로 비어 있었다. 아이에게 메트포르민과 암로디핀이 하루 세 번
 * 쌓이는 것이 틀린 화면이라 막아 두었는데, 막기만 하고 **아이 것을 안 준** 상태였다.
 * 그래서 사람을 바꾸면 이 앱의 절반이 사라졌다.
 *
 * 프로필에 있는 것에서 고른다. 이 아이는 땅콩 알레르기가 있으므로 항히스타민이 일상
 * 약으로 붙는 것이 자연스럽고, 그러면 얼굴을 바꿨을 때 **약도 그 사람의 것**이라는
 * 말이 화면만으로 선다. 둘 다 우리 약품표에 있는 약이다(`who.ts`).
 *
 * 하루 **두 번**인 것도 일부러다. 할머니가 세 번이라 달력 칸이 세 조각인데, 여기서
 * 두 조각이 되면 "이 달력은 그 사람의 처방을 그린다" 가 설명 없이 보인다.
 */
export const KID_DOSES: DosePlan[] = [
  { due: '0800', tray: 1, name: 'Loratadine 5mg', emoji: '💊', label: '8:00 AM' },
  { due: '1900', tray: 2, name: 'Vitamin D 400 IU', emoji: '💊', label: '7:00 PM' },
];

/** `'0820'` → 500. 오늘 무엇이 이미 지나갔는지를 재는 데만 쓴다. */
function hhmmToMinutes(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(2));
}

/**
 * 지금 몇 분인가. 기본값일 뿐이고, 부르는 쪽이 넘기면 그것을 쓴다.
 *
 * 시험이 넘길 수 있어야 한다. 안에서 시계를 읽으면 이 자료가 몇 시에 만들어졌느냐에
 * 따라 달라지고, 그러면 같은 것을 두 번 확인할 수 없다 — 무작위를 안 쓴다는 이 파일의
 * 규칙이 시계 때문에 깨진다.
 */
function nowInMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function isoDay(today: string, back: number): string {
  const t = new Date(`${today}T00:00:00Z`).getTime();
  return new Date(t - back * 86400000).toISOString().slice(0, 10);
}

function clock(due: string): string {
  const h = Number(due.slice(0, 2));
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${((h + 11) % 12) + 1}:${due.slice(2)} ${ampm}`;
}

/**
 * 이 날 이 시각의 복용을 걸렀는가.
 *
 * 날짜에서 결정적으로 정한다. 저녁(1900)에 몰리게 해서 순응도 화면이 시각을 짚는
 * 것을 보인다 — 아침을 거르는 사람과 저녁을 거르는 사람은 고칠 곳이 다르고, 그
 * 구별이 이 기능의 값이다.
 */
function missed(back: number, due: string): boolean {
  if (back === 0) return false;                    // 오늘은 아직 안 지났다
  if (due === '1900') return back % 4 === 1;       // 나흘에 한 번쯤 저녁을 거른다
  if (due === '0800') return back % 11 === 3;      // 아침은 아주 가끔
  return false;
}

/**
 * **한 주짜리 식단.** 요일이 곧 그 날의 내용이다.
 *
 * 예전에는 "몇 주 전인가" 로 그날의 음식을 정했다. 그래서 자료가 하루하루 앞으로
 * 밀릴 때마다 내용이 바뀌었고, 시연 중에 "어제는 이랬는데" 라는 말을 할 수가 없었다.
 * 요일로 정하면 그 말이 성립한다 — 화요일은 늘 같은 화요일이고, 날이 지나면 새 날이
 * **자기 요일의 내용으로** 저절로 채워진다.
 *
 * 그리고 하루에 한둘이다. 실제로 사람이 앱에 찍어 남기는 수가 그쯤이고, 하루 네댓
 * 줄이 석 달 쌓이면 화면이 "이 사람은 하루 종일 앱만 쓴다" 로 읽힌다.
 *
 * 설탕이 줄어드는 이야기는 요일이 아니라 **주**가 진다(`sweeter`). 요일 메뉴는
 * 뼈대이고, 옛날 주에는 거기에 단것이 하나 더 붙는다.
 */
/*
  두 주가 한 바퀴다.

  이레였다. 그러면 열두 주 내내 월요일마다 같은 것을 먹고, 달력을 한 창 뒤로 넘겨도
  이번 주와 똑같이 생긴 격자가 나온다 — 석 달치를 보여주는 화면인데 자료는 이레치로
  보인다. 두 주로 돌리면 같은 요일이 두 가지 얼굴을 갖는다.

  하루 서넛에서 넷다섯으로 늘렸다. 아침·점심·간식·저녁이 실제 하루의 모양이고, 하루
  두 줄짜리 목록으로는 "먹은 것을 되짚는 화면" 이 무엇을 하는지가 안 보인다.

  땅콩은 두 주에 네 번 남긴다. 식이 일지가 결론을 내려면 먹은 날이 넷은 있어야 하고
  (`infer.ts` 의 `MIN_EATEN`), 그것이 이 자료가 증명하려는 기능이다.
*/
/** 하루치를 밀어올리는 것들. 달력에서 주의로 칠해진다. */
const SWEETS = new Set<keyof typeof PRODUCTS>(
  ['redbull', 'snickers', 'mars', 'cola', 'nutella', 'juice'],
);

const WEEK: (keyof typeof PRODUCTS)[][] = [
  // ── 첫째 주 ──
  ['oats', 'soup', 'juice', 'cola'],                    // 일
  ['bread', 'peanutButter', 'chicken', 'veg'],          // 월 — 땅콩
  ['yoghurt', 'lentils', 'milk'],                       // 화
  ['bread', 'tuna', 'veg', 'nutella'],                  // 수
  ['oats', 'peanutButter', 'beans', 'milk'],            // 목 — 땅콩
  ['yoghurt', 'cheese', 'pasta', 'redbull'],            // 금
  ['bread', 'chicken', 'cola', 'mars'],                 // 토 — 주말이 가장 무겁다
  // ── 둘째 주 ──
  ['yoghurt', 'pasta', 'veg', 'juice'],                 // 일
  ['oats', 'sardines', 'beans', 'milk'],                // 월
  ['bread', 'peanutButter', 'soup'],                    // 화 — 땅콩
  ['oats', 'chicken', 'veg', 'cheese'],                 // 수
  ['yoghurt', 'tuna', 'pasta', 'juice'],                // 목
  ['bread', 'peanutButter', 'lentils', 'milk'],         // 금 — 땅콩
  ['oats', 'sardines', 'soup', 'cola', 'nutella'],      // 토
];

/**
 * 그날 먹은 것.
 *
 * 요일이 뼈대를 정하고, 옛날 주일수록 단것이 하나 더 붙는다 — 설탕이 줄어드는
 * 이야기가 주별 막대에서 보여야 하고, 그것이 이 화면이 존재하는 이유다.
 */
function ateOn(day: string, back: number): (keyof typeof PRODUCTS)[] {
  /*
    요일과 **어느 주인지**로 고른다. 요일만 보면 두 주짜리 표의 앞쪽 이레만 계속
    쓰인다 — 표를 늘려 놓고 절반을 안 쓰는 셈이 된다.

    주 번호는 날짜 자체에서 뽑는다(에포크 기준 주차). `back` 으로 세면 오늘이
    무슨 요일이냐에 따라 같은 날짜가 다른 주로 잡히고, 그러면 자료가 만들어진 날에
    따라 달라져서 이 파일의 규칙(무작위도 시계도 안 쓴다)이 깨진다.
  */
  const at = new Date(`${day}T00:00:00Z`);
  const weekday = at.getUTCDay();
  const week = Math.floor(at.getTime() / 86400000 / 7) % 2;
  const menu = [...WEEK[week * 7 + weekday]];

  /*
    시대가 셋이다. 요일이 뼈대를 정하고 주가 무게를 정한다.

      4주보다 전   여기에 에너지음료가 하나 더 — 거의 매일 단것
      2~4주 전     적어 둔 그대로
      최근 2주     토요일의 두 번째 단것이 빠진다

    주별 막대가 내려가는 것이 보여야 그 화면이 존재하는 이유가 증명된다. 한 단계로는
    모자랐다 — 옛날 주와 이번 주가 두 배도 안 벌어져서, 사람 눈에는 그냥 들쭉날쭉한
    것으로 보였다.
  */
  if (back >= 28 && !menu.includes('redbull')) menu.push('redbull');
  // 최근 두 주는 단것 하나를 끊었다. 끼니는 안 건드린다 — 줄어든 것은 설탕이다.
  if (back < 14) {
    const sweets: (keyof typeof PRODUCTS)[] = ['cola', 'mars', 'redbull', 'nutella', 'snickers'];
    const last = [...menu].reverse().find((k) => sweets.includes(k));
    if (last && menu.filter((k) => sweets.includes(k)).length > 1) {
      menu.splice(menu.lastIndexOf(last), 1);
    }
  }
  return menu;
}

/** 그 음식을 몇 시에 먹었나. 요일과 자리에서 결정적으로 — 무작위를 안 쓴다. */
function ateAt(day: string, index: number): { hhmm: string; label: string } {
  /*
    끼니 시각이다. 자리 순서대로 아침·점심·저녁이고 넷째는 밤 간식이다.

    예전에는 요일로 자리를 돌렸다 — 같은 날의 셋이 아침·저녁·점심 순으로 앉을 수
    있었고, 목록이 시각 순이 아니게 됐다. 자리 번호를 그대로 쓰면 그 일이 안 생긴다.
  */
  const slots = [
    { hhmm: '0820', label: '8:20 AM' },
    { hhmm: '1245', label: '12:45 PM' },
    { hhmm: '1910', label: '7:10 PM' },
    { hhmm: '2130', label: '9:30 PM' },
  ];
  return slots[Math.min(index, slots.length - 1)];
}

/**
 * **오늘**의 끼니 시각. 지나간 시간 안에 밀어 넣는다.
 *
 * 무엇이 문제였나
 * ---------------
 * 오늘은 지나간 끼니만 넣는다. 그 규칙 자체는 옳다 — 아침 아홉 시에 저녁이 이미
 * 먹은 것으로 앉아 있으면 화면이 "이 앱은 미래를 안다" 로 읽힌다.
 *
 * 그런데 그 규칙이 **오늘 화면을 비운다.** 첫 끼니가 8시 20분이라 그 전에 열면
 * `EATEN TODAY` 에 아무것도 없고, 열 시에 열어도 하나뿐이다. 하루 누적·부족한
 * 영양소·되짚기가 전부 그 목록 위에 서 있는데, 시연을 여는 시각에 따라 그 화면들이
 * 통째로 빈다.
 *
 * 어떻게 고치나
 * -------------
 * 시각을 못박는 대신 **지나간 시간을 나눠 쓴다.** 하루의 식단을 06시부터 지금까지
 * 사이에 고르게 앉힌다. 그러면 목록은 늘 차 있고, 그러면서 **미래 시각은 하나도
 * 안 나온다** — 지키려던 것이 그것이었다.
 *
 * 어제까지는 손대지 않는다. 지난 날들은 이미 다 지나갔으므로 제자리에 앉으면 된다.
 */
function ateNowish(index: number, count: number, nowMinutes: number): { hhmm: string; label: string } {
  const START = 6 * 60;
  // 아직 여섯 시도 안 됐으면 자정부터 지금까지를 쓴다. 새벽에 여는 경우다.
  const from = Math.min(START, Math.max(0, nowMinutes - 60));
  const span = Math.max(0, nowMinutes - from);
  // 끼니 사이를 고르게. 마지막 것이 '지금' 에 딱 붙지 않게 한 칸 더 나눈다.
  const at = Math.round(from + (span * (index + 1)) / (count + 1));
  const h = Math.floor(at / 60);
  const m = at % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = ((h + 11) % 12) + 1;
  return {
    hhmm: `${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}`,
    label: `${h12}:${String(m).padStart(2, '0')} ${ampm}`,
  };
}

/**
 * 시연 계정의 지난 열두 주. 오늘(back=0)까지 포함한다.
 *
 * 길이가 두 번 바뀌었다. 다섯 주였다가 — 넉 주짜리 달력이 생기면서 한 번만 뒤로
 * 가면 빈 격자가 나왔다 — 보관 한도인 90일까지 채웠고, 지금은 84일이다.
 *
 * 84 인 이유는 **달력의 창에 딱 맞는 수**여서다. 창이 28일이고 뒤로 갈 수 있는
 * 끝이 2번 창이므로(`MonthNav.MAX_BACK`), 세 창이 정확히 84일이다. 90 이면 마지막
 * 창의 엿새가 자료 밖으로 나가서 반쯤 빈 달력이 되고, 반만 채워진 달력은 "이때
 * 안 먹었다" 로 읽힌다 — 시연에서 그 오해는 특히 비싸다.
 */
/** 시연 자료의 길이. 달력 세 창에 정확히 맞는다. */
export const DEMO_DAYS = 84;

/**
 * @param plan 이 사람의 복약 일정. 사람마다 다르다 — `ADULT_DOSES` / `KID_DOSES`.
 *
 * 전에는 참·거짓이었다. 아이에게 할머니 약을 주지 않으려고 거짓을 넘겼는데, 그러면
 * 아이 쪽 복약 화면이 **통째로 빈다.** 막을 것은 남의 약이지 약 자체가 아니었다.
 * 일정을 받으면 두 가지를 한 번에 한다: 남의 약이 안 가고, 자기 약이 간다.
 */
export function demoHistory(today: string, memberId: string, days = DEMO_DAYS,
                            nowMinutes = nowInMinutes(), plan: DosePlan[] = ADULT_DOSES): ScanRecord[] {
  const out: ScanRecord[] = [];

  for (let back = 0; back < days; back++) {
    const day = isoDay(today, back);
    const when = back === 0 ? 'Today' : back === 1 ? 'Yesterday' : day.slice(5);

    // 상자가 내민 복용
    for (const d of plan) {
      /*
        오늘은 **지금까지 지나간 것만** 넣는다.

        예전에는 저녁 한 건만 빼고 나머지를 다 넣었는데, 그러면 아침 아홉 시에 앱을
        열어도 점심 약이 이미 먹은 것으로 앉아 있었다. 시연에서 그 화면은 "이 앱은
        미래를 안다" 로 읽힌다.

        시각을 넘겨받는 이유는 시험 때문이다 — 시계를 읽는 함수를 안에서 부르면 이
        자료가 몇 시에 만들어졌느냐에 따라 달라져서, 같은 것을 두 번 확인할 수 없다.
      */
      if (back === 0 && hhmmToMinutes(d.due) > nowMinutes) continue;
      const taken = !missed(back, d.due);
      out.push({
        id: `demo_dose_${day}_${d.due}`,
        itemId: `device_tray_${d.tray}`,
        name: d.name,
        kind: 'medicine',
        emoji: d.emoji,
        memberId,
        level: taken ? 'safe' : 'caution',
        timeLabel: `${when} · ${clock(d.due)}`,
        dayKey: day,
        dose: { taken, due: d.due, tray: d.tray, reason: taken ? 'released' : 'not-released' },
      });
    }

    // 먹은 것
    const menu = ateOn(day, back);
    for (let index = 0; index < menu.length; index++) {
      const key = menu[index];
      /*
        오늘은 지나간 시간 안에 밀어 넣는다(`ateNowish`). 제자리 시각을 쓰면 아침에
        연 사람에게 목록이 비고, 그 목록 위에 선 화면 넷이 같이 빈다. 미래 시각은
        여전히 하나도 안 나온다 — 지키려던 것이 그것이다.
      */
      const at = back === 0 ? ateNowish(index, menu.length, nowMinutes) : ateAt(day, index);
      const p = PRODUCTS[key];
      out.push({
        id: `demo_food_${day}_${key}`,
        itemId: key,
        name: p.name,
        kind: p.kind,
        emoji: p.emoji,
        memberId,
        /*
          판정은 **먹은 것마다** 다르다.

          전부 `caution` 이었다. 자료에 단것밖에 없던 시절의 값인데, 끼니가 들어온
          뒤로도 그대로라 달력이 통째로 주황이 됐다 — 렌틸도 요거트도 주의로 칠해진
          달력은 색이 아무 말도 안 한다. 넉 주를 보여주면서 "언제가 나빴나" 를 못
          짚으면 그 화면이 있을 이유가 없다.

          단것과 청량음료만 주의로 둔다. 회피는 여기서 안 정한다 — 사람마다 다르고,
          판정 엔진이 프로필을 보고 다시 매긴다(땅콩 알레르기가 있으면 땅콩버터가
          그때 빨강이 된다).
        */
        level: SWEETS.has(key) ? 'caution' : 'safe',
        timeLabel: `${when} · ${at.label}`,
        dayKey: day,
        barcode: p.barcode,
        grams: p.grams,
      });
    }
  }

  /*
    몸이 반응한 것 몇 번.

    식이 일지는 반응이 몇 번 쌓여야 무엇이든 말할 수 있다(피셔 정확검정). 하나뿐이면
    화면이 "아직 모른다" 만 말하고, 그러면 그 기능이 있다는 것조차 안 보인다.

    땅콩이 든 초콜릿을 먹은 날에 몰아서 붙인다 — 일지가 실제로 그것을 짚어내는지가
    이 자료로 확인된다.
  */
  /*
    답한 끼니는 **최근 세 주만**이다.

    전에는 석 달치를 전부 답했고 화면에 "197 answered" 가 떴다. 한 사람이 석 달 동안
    끼니마다 몸이 어땠는지를 200번 답했다는 뜻인데, 그것은 이 앱을 쓰는 사람의 모습이
    아니다. 숫자가 커질수록 믿음직해 보이는 것이 아니라 **지어낸 티가 난다.**

    세 주로 자른 것은 그냥 줄인 것이 아니다. 추론이 피셔 정확검정이라 네 칸이 다
    차야 하고(먹고 아팠다·먹고 괜찮았다·안 먹고 아팠다·안 먹고 괜찮았다), 주간
    식단에 땅콩이 이틀 들어 있으므로 세 주면 땅콩 여섯 날과 나머지 열대여섯 날이
    된다. 그 정도면 검정이 결론을 내고, 수는 사람이 실제로 답할 만한 크기다.
  */
  const answered = new Set(
    Array.from({ length: Math.min(21, days) }, (_, back) => isoDay(today, back)),
  );

  /*
    땅콩이 든 것들. **제품 이름이 아니라 성분으로** 고른다.

    `itemId === 'snickers'` 였다. 식단에 땅콩버터가 들어오자 그 줄이 조용히 아무것도
    안 잡게 됐고 — 일지가 결론을 못 내는데 시험은 통과했다 — 데모의 간판 기능이
    비어 버렸다. 성분으로 물으면 새 제품이 들어와도 따라온다.
  */
  const PEANUT: (keyof typeof PRODUCTS)[] = ['snickers', 'peanutButter'];
  const peanutIds = new Set<string>(PEANUT);

  for (const rec of out) {
    if (!answered.has(rec.dayKey)) continue;
    if (peanutIds.has(rec.itemId)) {
      rec.reaction = 'unwell';
      rec.symptoms = ['gut'];
      rec.tags = ['en:peanuts'];
    } else if (rec.barcode) {
      rec.tags = [];
      /*
        **괜찮았던 끼니도 답한다.** 이것이 없으면 일지가 아무것도 결론짓지 못한다.

        추론은 피셔 정확검정이고, 그 검정에는 네 칸이 필요하다 — 먹고 아팠다,
        먹고 괜찮았다, 안 먹고 아팠다, 안 먹고 괜찮았다. 땅콩 날에만 답을 달면
        아랫줄 두 칸이 통째로 0 이라 비교할 것이 없고, 화면은 "0 of 0" 을 띄운 채
        영원히 "지켜보는 중" 에 머문다.
        만들어 놓고 결론을 못 내는 시연 자료는 그 기능이 없는 것과 같다.
      */
      rec.reaction = 'fine';
    }
  }

  return out;
}


/**
 * 시연 계정의 **알람**. 위의 복용 기록과 같은 표에서 나온다.
 *
 * 기록만 심고 알람을 안 심으면 복약 화면의 "지금 정해져 있는 것" 이 빈다 — 지난
 * 넉 주는 보여주면서 무엇으로 정해져 있는지는 말하지 못하는 화면이 된다. 그리고
 * 그 둘이 어긋나면(기록은 하루 세 번인데 알람은 둘) 화면이 스스로와 모순된다.
 *
 * 끝나는 날을 두지 않는다. 만성 질환의 약이고, 끝이 있는 처방은 "다 먹었다" 카드를
 * 띄우는데 시연 중에 그 카드가 뜨면 무엇을 보여주려던 화면인지가 흐려진다.
 */
export function demoReminders(memberId: string, plan: DosePlan[] = ADULT_DOSES) {
  return plan.map((d) => ({
    id: `demo_rx_${d.tray}_${d.due}`,
    memberId,
    time: d.label,
    item: {
      id: `demo_med_${d.name.split(' ')[0].toLowerCase()}`,
      name: d.name,
      kind: 'medicine' as const,
      emoji: d.emoji,
      detectedVia: 'Demo data',
      flags: [],
    },
  }));
}
