/**
 * 사진을 찍지 않고도 앱을 통과시켜 볼 수 있는 표본들.
 *
 * 왜 목록을 따로 두는가: 홈의 "TRY IT" 이 카메라 화면으로 슬러그를 넘기고,
 * 카메라가 그 슬러그로 파일을 찾는다. 경로를 그대로 넘기면 쿼리 문자열이
 * 무엇이든 fetch 하는 통로가 되므로, 넘기는 것은 이름뿐이고 경로는 여기서만 나온다.
 *
 * 이 그림들은 진짜 OCR 을 탄다. 미리 만들어둔 결과를 보여주는 것이 아니라
 * 촬영본과 같은 경로로 들어가므로, 여기서 통하면 사진에서도 통한다.
 */

export interface Sample {
  /** URL 로 오갈 이름. 파일 경로를 노출하지 않기 위한 것 */
  slug: string;
  src: string;
  label: string;
  /** 홈에서 무엇인지 한눈에 알리는 그림 */
  emoji: string;
}

export const SAMPLE_LABELS: Sample[] = [
  { slug: 'biscuit', src: '/label-eu-biscuit.png', label: 'Biscuit label', emoji: '🍪' },
  // 라벨만 읽고 알레르기 회피 판정까지 가는 유일한 표본
  { slug: 'peanut', src: '/label-peanut-bar.png', label: 'Peanut bar label', emoji: '🥜' },
  { slug: 'cereal', src: '/label-us-cereal.png', label: 'Cereal label', emoji: '🥣' },
];

export const SAMPLE_RX: Sample[] = [
  { slug: 'antibiotic', src: '/prescription-antibiotic.png', label: 'Antibiotic Rx', emoji: '💊' },
  { slug: 'eyedrop', src: '/prescription-eyedrop.png', label: 'Eye drops Rx', emoji: '👁️' },
  // 상호작용 엔진을 건드리는 유일한 표본 — 혈액희석제를 쓰는 구성원에게 회피가 뜬다
  { slug: 'painkiller', src: '/prescription-painkiller.png', label: 'Painkiller Rx', emoji: '💊' },
  { slug: 'syrup', src: '/prescription-syrup.png', label: 'Syrup Rx', emoji: '🧴' },
];

export const ALL_SAMPLES: Sample[] = [...SAMPLE_LABELS, ...SAMPLE_RX];

export function sampleBySlug(slug: string | null | undefined): Sample | undefined {
  if (!slug) return undefined;
  return ALL_SAMPLES.find((s) => s.slug === slug);
}

/**
 * 처음 열었을 때 홈에 내놓을 셋.
 *
 * 세 갈래가 각각 다른 경로를 탄다 — 처방(약 일정), 알레르기가 걸리는 라벨(회피 판정),
 * 평범한 라벨(하루 누적). 하나만 눌러도 앱이 무엇을 하는지 한 번은 보게 된다.
 */
export const FIRST_RUN_SAMPLES: Sample[] = [
  SAMPLE_RX[0],
  SAMPLE_LABELS[1],
  SAMPLE_LABELS[0],
];
