import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Session, User } from '@supabase/supabase-js';

interface AuthState {
  session: Session | null;
  user: User | null;
  pinConfigured: boolean;
  pinHash: string | null;
  phone: string | null;
  setSession: (session: Session | null) => void;
  setUser: (user: User | null) => void;
  setPinConfigured: (value: boolean) => void;
  setPinHash: (hash: string) => void;
  setPhone: (phone: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      session: null,
      user: null,
      pinConfigured: false,
      pinHash: null,
      phone: null,
      setSession: (session) => set({ session }),
      setUser: (user) => set({ user }),
      setPinConfigured: (value) => set({ pinConfigured: value }),
      setPinHash: (hash) => set({ pinHash: hash }),
      setPhone: (phone) => set({ phone }),
      logout: () =>
        set({ session: null, user: null, pinConfigured: false, pinHash: null, phone: null }),
    }),
    { name: 'illihealth-auth' }
  )
);
