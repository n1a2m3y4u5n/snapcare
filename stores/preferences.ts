import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * 화면 문구는 전부 영어다 (대회 공식 언어). 언어 설정과 locales/ 사전이 있었지만
 * 어느 화면도 부르지 않는 죽은 코드였고, 기본값이 'ko' 라서 이 파일만 읽으면 앱이
 * 한국어로 도는 줄 알게 됐다. 지운다 — 필요해지면 git 히스토리에 있다.
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
  setAutoTts: (value: boolean) => void;
  setSpeechRate: (rate: number) => void;
}

export const SPEECH_RATES = [0.7, 0.85, 0.95, 1.1] as const;

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      autoTts: true,
      speechRate: 0.95,
      setAutoTts: (autoTts) => set({ autoTts }),
      setSpeechRate: (speechRate) => set({ speechRate }),
    }),
    { name: 'snapcare-preferences' },
  ),
);
