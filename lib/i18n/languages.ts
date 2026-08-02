/**
 * 이 앱이 말하는 언어들.
 *
 * 고른 기준은 하나다 — **조사에 답해 준 전문가들이 일하는 곳**. 1,103명에게 보내
 * 34명이 답했고, 그 사람들이 환자를 만나는 나라가 여기 있다. 우리가 다룰 수 있는
 * 언어를 고른 것이 아니라, 이 앱이 쓰일 곳의 언어를 고른 것이다.
 *
 *   우르두어    파키스탄     Atif Usman 교수 (Universiti Malaya / 파키스탄)
 *   하우사어    나이지리아   Samirah Abdu-Aguye 교수 (Ahmadu Bello University)
 *   인도네시아어 인도네시아  Niken Nur Widyakusuma 약사 (Universitas Gadjah Mada)
 *   벵골어      방글라데시   Aliya Naheed 수석연구원 (icddr,b)
 *   루마니아어  몰도바       팀의 나머지 절반이다
 *   한국어      한국         우리 절반
 *
 * 영어를 지우지 않는다. 나이지리아·파키스탄·방글라데시에서 처방전 자체가 영어로
 * 쓰이는 일이 흔하고, 심사 언어이기도 하다.
 *
 * 무엇을 번역했는가
 * -----------------
 * **말하는 것만** 번역했다. 화면 글자는 영어로 남는다.
 *
 * 뒤집힌 것처럼 보이지만 이 앱에서는 이쪽이 맞다. 대상 사용자는 글을 읽지 못하고,
 * 그 사람에게 도착하는 통로는 그림과 **소리**뿐이다. 화면 글자는 곁에 있는 보호자와
 * 심사자를 위한 것이고 그들은 영어를 읽는다. 절반만 번역된 화면을 만드는 것보다,
 * 실제로 전달되는 통로를 온전히 번역하는 편이 낫다. (우르두어·벵골어를 화면까지
 * 옮기려면 오른쪽에서 왼쪽으로 쓰는 배치가 따로 필요한데, 그것은 이 다음 일이다.)
 */

export interface Language {
  /** 저장·선택에 쓰는 값. BCP-47 의 앞자리와 같다. */
  code: string;
  /** 음성 합성에 넘길 태그. 지역까지 준다 — 같은 언어라도 목소리가 갈린다. */
  tag: string;
  /** 그 언어를 쓰는 사람이 읽는 이름. 영어 이름을 함께 두지 않는다. */
  native: string;
  /** 영어 이름 — 설정 화면의 보조 줄과 개발자를 위한 것. */
  english: string;
  /** 어느 나라에서 쓰이는지. 화면에 국기를 띄우는 데 쓴다. */
  flag: string;
  /** 오른쪽에서 왼쪽으로 쓰는가. 지금은 음성만 번역하므로 화면에는 쓰이지 않는다. */
  rtl?: boolean;
}

export const LANGUAGES: Language[] = [
  { code: 'en', tag: 'en-US', native: 'English', english: 'English', flag: '🌐' },
  { code: 'ko', tag: 'ko-KR', native: '한국어', english: 'Korean', flag: '🇰🇷' },
  { code: 'id', tag: 'id-ID', native: 'Bahasa Indonesia', english: 'Indonesian', flag: '🇮🇩' },
  { code: 'ur', tag: 'ur-PK', native: 'اردو', english: 'Urdu', flag: '🇵🇰', rtl: true },
  { code: 'bn', tag: 'bn-BD', native: 'বাংলা', english: 'Bengali', flag: '🇧🇩' },
  { code: 'ha', tag: 'ha-NG', native: 'Hausa', english: 'Hausa', flag: '🇳🇬' },
  { code: 'ro', tag: 'ro-RO', native: 'Română', english: 'Romanian', flag: '🇲🇩' },
];

export const DEFAULT_LANGUAGE = 'en';

export function languageByCode(code: string): Language {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

/**
 * 이 기기가 그 언어를 **소리 내어 읽을 수 있는가**.
 *
 * 물어야 하는 이유: 브라우저의 음성 목록은 기기마다 다르다. 우르두어나 하우사어
 * 목소리가 깔려 있지 않은 폰에서 그 언어를 고르면, 소리가 아예 안 나거나 영어 목소리가
 * 그 글자를 영어로 읽어 알아들을 수 없는 소리가 난다. 둘 다 사용자에게는 "앱이
 * 고장났다" 로 보인다.
 *
 * 그래서 고르는 자리에서 미리 말해 준다. 없는 것을 고르게 두고 실패를 겪게 하는 것보다
 * 낫다 — 이 앱에서 소리는 부가 기능이 아니라 통로 전체다.
 */
export function voiceAvailable(tag: string, voices: { lang: string }[]): boolean {
  const want = tag.toLowerCase();
  const base = want.split('-')[0];
  return voices.some((v) => {
    const have = v.lang.toLowerCase().replace('_', '-');
    return have === want || have.split('-')[0] === base;
  });
}
