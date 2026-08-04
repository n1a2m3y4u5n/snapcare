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

export function byMedicine(rows: DoseRow[], today: string,
                           days = 28): MedicineAdherence[] {
  const window = new Set(windowDays(today, days));
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
