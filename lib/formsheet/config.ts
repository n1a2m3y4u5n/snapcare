/**
 * 버블 좌표표 — 파이썬 파서가 쓰는 `form_sheet_config.json` 과 같은 값.
 *
 * 원본은 저 JSON 이다. 이 파일은 그것을 번들에 실을 수 있는 모양으로 옮겨 적은
 * 사본이고, `config.test.ts` 가 매번 둘을 대조한다 — 좌표를 다시 보정했는데 이쪽만
 * 옛 값으로 남으면 판독기는 실패하지 않고 **옆 칸을 읽는다.** 조용히 갈라지는
 * 사본은 갈라진 것을 알려 주는 장치와 함께 두어야 한다.
 *
 * 좌표는 1000×1000 정규 좌표계의 버블 중심이다.
 */

export interface BubbleGroup {
  mode: 'one' | 'many';
  bubbles: Record<string, [number, number]>;
}

/**
 * 손으로 쓰는 칸. `[x0, y0, x1, y1]` — 1000×1000 정규 좌표계.
 *
 * 버블은 채웠는지만 보면 되지만 이 칸들은 **읽어야** 하고, 그래서 정규 격자에서
 * 자르면 안 된다. 이름칸은 정규 좌표로 28행뿐이라 그 안에서는 어떤 OCR 도 손글씨를
 * 못 읽는다. 자르는 것은 **원본 사진**에서다(`cropField`) — 폰으로 A5 를 찍으면
 * 1mm 가 25px 쯤이고, 그 4.7mm 띠는 120px 이 넘는다.
 *
 * 라벨을 뺀 자리다. 종이에 인쇄된 "Medication name" 이 위 10행에 있어서, 그것까지
 * 끌고 오면 OCR 이 약 이름의 일부로 읽는다. 아래 경계는 밑줄을 조금 넘는데,
 * 사람은 줄 **위에** 쓰지만 g·y 의 꼬리가 줄을 넘어가기 때문이다.
 */
export type FieldRect = [number, number, number, number];

export interface SheetConfig {
  half_width: number;
  half_height: number;
  normalize: boolean;
  abs_min: number;
  margin: number;
  groups: Record<string, BubbleGroup>;
  fields: Record<string, FieldRect>;
}

export const SHEET_CONFIG: SheetConfig = {
  half_width: 6,
  half_height: 9,
  normalize: true,
  abs_min: 0.3,
  margin: 0.08,
  groups: {
    layer: {
      mode: 'one',
      bubbles: {
        '1': [169, 628], '2': [169, 593], '3': [169, 562], '4': [169, 530],
        '5': [169, 499], '6': [169, 464], '7': [169, 432], '8': [169, 401],
      },
    },
    days: {
      mode: 'many',
      bubbles: {
        MON: [421, 401], TUE: [474, 401], WED: [530, 404], THU: [584, 401],
        FRI: [635, 404], SAT: [684, 404], SUN: [736, 404],
      },
    },
    duration: {
      mode: 'one',
      bubbles: {
        '7d': [418, 548], '14d': [467, 548], '30d': [516, 548],
        '90d': [565, 548], ongoing: [613, 548],
      },
    },
    hour: {
      mode: 'one',
      bubbles: {
        '0': [50, 730], '1': [99, 730], '2': [148, 730], '3': [201, 730],
        '4': [249, 730], '5': [298, 730], '6': [348, 730], '7': [397, 730],
        '8': [446, 730], '9': [495, 730], '10': [547, 730], '11': [596, 730],
        '12': [53, 789], '13': [98, 789], '14': [151, 789], '15': [200, 789],
        '16': [249, 789], '17': [297, 789], '18': [346, 789], '19': [399, 789],
        '20': [445, 789], '21': [497, 789], '22': [546, 789], '23': [595, 789],
      },
    },
  },
  /*
    손으로 쓰는 세 칸. 아래 값들은 `form_sheet_config.json` 과 같아야 하고,
    `config.test.ts` 가 매번 대조한다.
  */
  fields: {
    name: [36, 130, 964, 158],
    count: [36, 193, 964, 220],
    notes: [36, 256, 964, 283],
  },
};
