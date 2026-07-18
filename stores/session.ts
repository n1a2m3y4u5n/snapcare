import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SessionState {
  onboarded: boolean;
  authed: boolean;
  setOnboarded: (v: boolean) => void;
  setAuthed: (v: boolean) => void;
  reset: () => void;
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      onboarded: false,
      authed: false,
      setOnboarded: (onboarded) => set({ onboarded }),
      setAuthed: (authed) => set({ authed }),
      reset: () => set({ onboarded: false, authed: false }),
    }),
    { name: 'snapcare-session' },
  ),
);
