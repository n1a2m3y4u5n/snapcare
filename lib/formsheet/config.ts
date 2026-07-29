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

export interface SheetConfig {
  half_width: number;
  half_height: number;
  normalize: boolean;
  abs_min: number;
  margin: number;
  groups: Record<string, BubbleGroup>;
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
};
