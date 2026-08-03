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

/** 하루 세 번. 상자가 내미는 시각이다. */
const DOSE_TIMES = ['0800', '1300', '1900'] as const;

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

/** 시연 계정의 지난 다섯 주. 오늘(back=0)까지 포함한다. */
export function demoHistory(today: string, memberId: string, days = 35): ScanRecord[] {
  const out: ScanRecord[] = [];

  for (let back = 0; back < days; back++) {
    const day = isoDay(today, back);
    const when = back === 0 ? 'Today' : back === 1 ? 'Yesterday' : day.slice(5);

    // 상자가 내민 복용
    for (const due of DOSE_TIMES) {
      // 오늘은 아직 저녁이 안 왔다. 안 온 것을 "걸렀다" 로 세면 순응도가 매일 아침
      // 나빠 보인다.
      if (back === 0 && due === '1900') continue;
      const taken = !missed(back, due);
      out.push({
        id: `demo_dose_${day}_${due}`,
        itemId: 'device_tray_1',
        name: 'Metformin 500mg',
        kind: 'medicine',
        emoji: '💊',
        memberId,
        level: taken ? 'safe' : 'caution',
        timeLabel: `${when} · ${clock(due)}`,
        dayKey: day,
        dose: { taken, due, tray: 1, reason: taken ? 'released' : 'not-released' },
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
