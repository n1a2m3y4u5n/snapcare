import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Reminder {
  id: string;
  name: string;
  emoji: string;
  memberId: string;
  time: string; // 표시용 (예: '8:00 AM')
}

interface RemindersState {
  reminders: Reminder[];
  addReminders: (rs: Reminder[]) => void;
  remove: (id: string) => void;
}

export const useReminders = create<RemindersState>()(
  persist(
    (set) => ({
      reminders: [],
      addReminders: (rs) => set((s) => ({ reminders: [...rs, ...s.reminders].slice(0, 50) })),
      remove: (id) => set((s) => ({ reminders: s.reminders.filter((r) => r.id !== id) })),
    }),
    { name: 'snapcare-reminders' },
  ),
);
