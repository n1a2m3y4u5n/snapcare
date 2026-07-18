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
      pinHash: null,
      setOnboarded: (onboarded) => set({ onboarded }),
      setAuthed: (authed) => set({ authed }),
      setPinHash: (pinHash) => set({ pinHash }),
      reset: () => set({ onboarded: false, authed: false, pinHash: null }),
    }),
    { name: 'snapcare-session' },
  ),
);
