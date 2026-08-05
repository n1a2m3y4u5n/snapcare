/**
 * 조회 결과의 모양 — 서버와 화면이 같이 본다.
 *
 * 타입만 두는 파일이다. 라우트(`app/api/drug/route.ts`)에 두면 화면 쪽이 그것을
 * 수입하면서 서버용 수입(next/server, SDK)까지 끌고 들어오고, 그 번들은 브라우저에서
 * 안 돈다. 값이 아니라 모양만 오가는 자리라 파일 하나로 끊는 것이 싸다.
 */

/** 판정 엔진이 아는 것 중 **약에서 나올 수 있는** 것만. 왜 넷뿐인지는 라우트에 적혀 있다. */
export const MED_FLAGS = ['unsafe_pregnancy', 'unsafe_breastfeeding', 'nsaid_bleed', 'alcohol'] as const;
export type MedFlag = (typeof MED_FLAGS)[number];

export const LOOKUP_FORMS = ['tablet', 'capsule', 'syrup', 'eyedrop', 'cream', 'inhaler',
  'injection', 'suppository', 'sachet', 'unknown'] as const;
export type LookupForm = (typeof LOOKUP_FORMS)[number];

export interface DrugLookup {
  /** 이 이름을 알아봤는가. `false` 면 나머지는 다 비어 있다. */
  known: boolean;
  /** 정식 이름 (읽은 글자의 오타를 고친 것일 수 있다). */
  name: string;
  /** 성분명. */
  inn: string;
  form: LookupForm;
  flags: MedFlag[];
  handwash: boolean;
  shake: boolean;
  storage: 'refrigerator' | 'room' | 'unknown';
  /** 무엇에 쓰는 약인가 — 한 문장, 쉬운 말로. 화면이 읽어 준다. */
  purpose: string;
  /** 확신하는가. 아니면 부르는 쪽이 이름을 안 바꾼다. */
  confident: boolean;
}

export const EMPTY_LOOKUP: DrugLookup = {
  known: false, name: '', inn: '', form: 'unknown', flags: [],
  handwash: false, shake: false, storage: 'unknown', purpose: '', confident: false,
};
