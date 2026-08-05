import { windowDays } from './adherence.ts';
import type { DoseRow } from './adherence.ts';

/**
 * 복약률을 **약마다** 따로.
 *
 * 왜 합치면 안 되는가
 * -------------------
 * 하나로 합친 수는 고칠 곳을 안 가리킨다. "83번 중 10번 걸렀다" 는 사실이지만, 그
 * 열 번이 한 약에 몰려 있는지 두 약에 흩어져 있는지에 따라 할 일이 다르다 — 앞이면
 * 그 약 하나가 문제이고, 뒤면 사람의 습관이 문제다. 진료실에서 오가는 물음도 약
 * 단위다: "혈압약은 잘 드시나요."
 *
 * 그리고 이 기계에는 이미 그 단위가 있다. 트레이가 층으로 쌓여 있고 한 층이 한
 * 약이라, 화면이 층별로 말하면 **약통을 열어 그 층을 보면 되는 것**이 된다. 숫자와
 * 손이 같은 것을 가리킨다.
 *
 * 왜 이름이 아니라 층으로 묶는가
 * ------------------------------
 * 둘 다 쓴다. 묶는 열쇠는 **층**이다 — 상자가 보고하는 것이 그것이고, 이름은 앱이
 * 처방에서 붙여 준 것이라 없을 수도 있다. 이름은 사람이 읽을 이름표로만 쓴다.
 */

export interface MedicineAdherence {
  tray: number;
  /** 사람이 읽을 이름. 없으면 층 번호로 지어 준다. */
  name: string;
  offered: number;
  taken: number;
  missed: number;
  /** 0–1. `offered` 가 0이면 null — 0% 가 아니다. */
  rate: number | null;
}

export function byMedicine(rows: DoseRow[], anchor: string,
                           days = 28): MedicineAdherence[] {
  const window = new Set(windowDays(anchor, days));
  const byTray = new Map<number, MedicineAdherence>();

  for (const row of rows) {
    if (!window.has(row.dayKey)) continue;
    const found = byTray.get(row.tray) ?? {
      tray: row.tray,
      name: row.name || `Compartment ${row.tray}`,
      offered: 0, taken: 0, missed: 0, rate: null,
    };
    found.offered += 1;
    if (row.taken) found.taken += 1;
    else found.missed += 1;
    // 이름이 뒤늦게 붙은 기록이 있을 수 있다. 있는 것을 쓴다.
    if (row.name && found.name.startsWith('Compartment')) found.name = row.name;
    byTray.set(row.tray, found);
  }

  return [...byTray.values()]
    .map((m) => ({ ...m, rate: m.offered ? m.taken / m.offered : null }))
    /*
      **이름도 모르고 나온 적도 없는 칸은 뺀다.**

      화면에 이런 줄들이 있었다:

          3  Compartment 3   3/8
          4  Compartment 4   0/2
          5  Compartment 5   0/1

      상자를 직접 눌러 돌린 자국이다 — 발표 콘솔의 배출 단추, 작업대에서의 시험,
      앱에 알람 없이 종이로 바로 보낸 일정. 이름은 알람에서 오므로 그 칸들은 이름을
      못 받고 `Compartment N` 으로 남는다.

      이 게이지가 있는 이유는 **고칠 곳을 가리키는 것**이다(위 주석). "Compartment 5:
      0/1" 은 아무 데도 안 가리킨다 — 무슨 약인지 모르니 약통을 열어도 할 일이 없고,
      한 번도 안 나왔으니 어긋난 습관도 없다. 정보가 0인 줄이 목록의 절반을 차지하면
      정보가 있는 줄까지 안 읽힌다.

      둘 다일 때만 뺀다. 이름이 없어도 실제로 나온 적이 있으면(`Compartment 3` 의
      3/8) 남긴다 — 무슨 약인지는 몰라도 **그 칸에서 뭔가 일어나고 있다**는 사실은
      진짜이고, 그것을 지우면 사람이 모르는 채로 지나간다.
    */
    .filter((m) => m.taken > 0 || !m.name.startsWith('Compartment '))
    // 층 순서대로. 상자를 열었을 때 위에서 아래로 보이는 순서다.
    .sort((a, b) => a.tray - b.tray);
}

/** 한 줄을 소리로. */
export function medicineSentence(m: MedicineAdherence): string {
  if (m.rate === null) return `${m.name}: nothing from the box yet.`;
  if (!m.missed) {
    return m.offered === 1
      ? `${m.name}: the one dose was taken.`
      : `${m.name}: all ${m.offered} doses were taken.`;
  }
  const times = m.missed === 1 ? 'once' : `${m.missed} times`;
  return `${m.name}: out of ${m.offered} doses, missed ${times}.`;
}
