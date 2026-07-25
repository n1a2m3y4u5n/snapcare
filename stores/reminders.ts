import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ScanItem } from '@/lib/snapcare/types';

export interface Reminder {
  id: string;
  memberId: string;
  /** 표시용 (예: '8:00 AM') */
  time: string;
  /**
   * 알람이 가리키는 대상 전체를 들고 있는다.
   * 카탈로그 id만 저장하면 OCR로 읽어낸 처방(카탈로그에 없는 것)은 다시 열 수 없다.
   */
  item: ScanItem;
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
    {
      name: 'snapcare-reminders',
      // v2: Reminder 모양이 바뀌었다 (name/emoji → item 스냅샷).
      // 이전 저장분은 새 화면에서 읽을 수 없으므로 비우고 시작한다.
      version: 2,
      migrate: () => ({ reminders: [] }),
    },
  ),
);
