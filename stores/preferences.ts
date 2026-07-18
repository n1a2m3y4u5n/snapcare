import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PreferencesState {
  language: 'ko' | 'en';
  autoTts: boolean;
  setLanguage: (lang: 'ko' | 'en') => void;
  setAutoTts: (value: boolean) => void;
}

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      language: 'ko',
      autoTts: true,
      setLanguage: (language) => set({ language }),
      setAutoTts: (autoTts) => set({ autoTts }),
    }),
    { name: 'illihealth-preferences' }
  )
);

/** 현재 언어에 맞는 i18n 키를 반환하는 헬퍼 훅 */
export function useT() {
  const { language } = usePreferences();
  // 동적 import를 피하기 위해 JSON을 직접 import
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const translations = require(`../locales/${language}.json`) as Record<string, Record<string, string>>;

  return function t(key: string): string {
    const [section, field] = key.split('.');
    return (section && field && translations[section]?.[field]) ?? key;
  };
}
