import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SessionState {
  onboarded: boolean;
  authed: boolean;
  /** bcrypt 해시된 픽처키 (없으면 최초 설정 필요) */
  pinHash: string | null;
  setOnboarded: (v: boolean) => void;
  setAuthed: (v: boolean) => void;
  setPinHash: (h: string) => void;
  reset: () => void;
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      onboarded: false,
      authed: false,
      // 데모 기본 픽처키 = ☀️🌙💧🔥 (인덱스 0,1,2,3). 로그인 화면에 힌트로 표시됨.
      pinHash: '$2b$10$0Xrx5jWlNoZS/sYknOwOn.BF1ASI3ZzR..RmGPCWMHFvpO08ATBJm',
      setOnboarded: (onboarded) => set({ onboarded }),
      setAuthed: (authed) => set({ authed }),
      setPinHash: (pinHash) => set({ pinHash }),
      reset: () => set({ onboarded: false, authed: false, pinHash: null }),
    }),
    {
      name: 'snapcare-session',
      // authed는 저장 안 함 → 매 로드마다 로그인 화면을 거친다 (데모용). onboarded·pinHash만 유지.
      partialize: (s) => ({ onboarded: s.onboarded, pinHash: s.pinHash }),
    },
  ),
);
