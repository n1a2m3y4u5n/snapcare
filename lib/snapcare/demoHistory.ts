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

/** public/nutrition/ 에 실제로 담겨 있는 제품들. */
const PRODUCTS = {
  redbull: { barcode: '9002490100070', name: 'Energy drink 250 mL', emoji: '🥤', grams: 250, kind: 'drink' as const },
  snickers: { barcode: '5000159461122', name: 'Peanut chocolate bar', emoji: '🍫', grams: 50, kind: 'food' as const },
  mars: { barcode: '5000159407236', name: 'Chocolate bar', emoji: '🍫', grams: 51, kind: 'food' as const },
  cola: { barcode: '5449000000996', name: 'Cola 330 mL', emoji: '🥤', grams: 330, kind: 'drink' as const },
  nutella: { barcode: '3017620422003', name: 'Hazelnut spread', emoji: '🍞', grams: 30, kind: 'food' as const },
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
const DOSES = [
  { due: '0800', tray: 1, name: 'Metformin 500mg', emoji: '💊', label: '8:00 AM' },
  { due: '1300', tray: 2, name: 'Amlodipine 5mg', emoji: '💊', label: '1:00 PM' },
  { due: '1900', tray: 1, name: 'Metformin 500mg', emoji: '💊', label: '7:00 PM' },
] as const;

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

/** 그날 단것을 몇 개 먹었나. 최근으로 올수록 준다 — 이 자료가 담은 이야기다. */
function sweetsOn(back: number): (keyof typeof PRODUCTS)[] {
  const week = Math.floor(back / 7);
  const pattern: (keyof typeof PRODUCTS)[][] = [
    // 이번 주 — 거의 안 먹는다
    back % 4 === 0 ? ['snickers'] : [],
    // 지난주
    back % 3 === 0 ? ['redbull'] : [],
    // 2주 전
    back % 2 === 0 ? ['redbull', 'mars'] : ['cola'],
    // 3주 전
    back % 2 === 0 ? ['redbull', 'snickers'] : ['cola', 'nutella'],
    // 4주 전 — 가장 나빴다
    ['redbull', 'snickers', 'cola'],
  ];
  return pattern[Math.min(week, pattern.length - 1)];
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

export function demoHistory(today: string, memberId: string, days = DEMO_DAYS): ScanRecord[] {
  const out: ScanRecord[] = [];

  for (let back = 0; back < days; back++) {
    const day = isoDay(today, back);
    const when = back === 0 ? 'Today' : back === 1 ? 'Yesterday' : day.slice(5);

    // 상자가 내민 복용
    for (const d of DOSES) {
      // 오늘은 아직 저녁이 안 왔다. 안 온 것을 "걸렀다" 로 세면 순응도가 매일 아침
      // 나빠 보인다.
      if (back === 0 && d.due === '1900') continue;
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
    for (const key of sweetsOn(back)) {
      const p = PRODUCTS[key];
      out.push({
        id: `demo_food_${day}_${key}`,
        itemId: key,
        name: p.name,
        kind: p.kind,
        emoji: p.emoji,
        memberId,
        // 설탕이 하루치를 밀어올리는 것들이라 주의로 둔다. 회피는 사람마다 다르므로
        // 판정 엔진이 프로필을 보고 다시 매긴다 — 여기 값은 목록에 보이는 표시다.
        level: 'caution',
        timeLabel: `${when} · ${back % 2 === 0 ? '3:20 PM' : '11:05 AM'}`,
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
  for (const rec of out) {
    if (rec.itemId === 'snickers') {
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
export function demoReminders(memberId: string) {
  return DOSES.map((d) => ({
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
