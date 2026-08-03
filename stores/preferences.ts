import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_LANGUAGE } from '@/lib/i18n/languages';

/**
 * 화면 문구는 전부 영어다 (대회 공식 언어). 예전에 있던 언어 설정과 locales/ 사전은
 * 어느 화면도 부르지 않는 죽은 코드여서 지웠었다.
 *
 * `sayLang` 은 그것과 다른 것이다. 화면이 아니라 **말하는 언어**를 고른다.
 *
 * 뒤집힌 것처럼 보이지만 이 앱에서는 이쪽이 맞다 — 대상 사용자는 글을 읽지 못하고,
 * 그 사람에게 도착하는 통로는 그림과 소리뿐이다. 화면 글자는 곁에 있는 보호자와
 * 심사자를 위한 것이고 그들은 영어를 읽는다. 어느 언어를 왜 골랐는지는
 * lib/i18n/languages.ts 에 적었다.
 */
interface PreferencesState {
  /** 판정 화면에 도착하면 스스로 읽어줄 것인가. */
  autoTts: boolean;
  /**
   * 말하기 속도.
   *
   * 기본값 0.95 는 내가 들어보고 고른 값이지 측정한 값이 아니다. 처음 듣는 말을
   * 따라가는 속도는 사람마다 다르고, 이 앱에서 음성은 장식이 아니라 유일한 통로다 —
   * 빠르면 못 알아듣고 느리면 늘어져서 역시 못 알아듣는다. 고를 수 있게 둔다.
   */
  speechRate: number;
  /** 소리로 말할 언어. 화면 글자와는 무관하다. */
  sayLang: string;
  /**
   * 픽토그램을 크게 본다.
   *
   * 2026년 8월 조사에서 AAC·특수교육 응답자가 짚었다 — "아침·정오·저녁 아이콘의
   * 크기가 문제가 될 수 있으니 가능하면 확대를 제공하라." 같은 응답자가 스위치
   * 스캐닝으로 조작하는 사용자를 함께 언급했다.
   *
   * 그래서 타일마다 돋보기 버튼을 달지 않았다. 스캐닝은 표적 하나하나를 차례로
   * 훑으므로 버튼이 늘면 그만큼 도달이 멀어진다. 줄 전체에 스위치 하나를 둔다.
   *
   * 누름으로 크기를 바꾸는 것이라 확대·축소 손짓(핀치)과도 겹치지 않는다. 손이
   * 떨리거나 한 손만 쓰는 사람에게 두 손가락 손짓은 없는 기능과 같다.
   */
  bigPictures: boolean;
  setAutoTts: (value: boolean) => void;
  setSpeechRate: (rate: number) => void;
  setSayLang: (code: string) => void;
  setBigPictures: (value: boolean) => void;
}

export const SPEECH_RATES = [0.7, 0.85, 0.95, 1.1] as const;

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      autoTts: true,
      speechRate: 0.95,
      sayLang: DEFAULT_LANGUAGE,
      bigPictures: false,
      setAutoTts: (autoTts) => set({ autoTts }),
      setSpeechRate: (speechRate) => set({ speechRate }),
      setSayLang: (sayLang) => set({ sayLang }),
      setBigPictures: (bigPictures) => set({ bigPictures }),
    }),
    { name: 'snapcare-preferences' },
  ),
);
