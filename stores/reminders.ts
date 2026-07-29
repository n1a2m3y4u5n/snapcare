import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { accountStorage } from '@/lib/snapcare/accounts';
import { medicineKey, replaceCourse } from '@/lib/snapcare/course';
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
  /**
   * 언제 시작했고 며칠짜리인가 ('YYYY-MM-DD' · 0 이면 무기한).
   *
   * 없으면 무기한으로 본다 — 이 필드가 생기기 전에 만들어진 알람이 어느 날 갑자기
   * 끝난 것으로 취급되면 안 된다. 없는 것은 '끝을 모른다' 이지 '끝났다' 가 아니다.
   *
   * 끝을 다루는 규칙은 lib/snapcare/course.ts 에 모여 있다.
   */
  startedOn?: string;
  days?: number;
}

interface RemindersState {
  reminders: Reminder[];
  addReminders: (rs: Reminder[]) => void;
  remove: (id: string) => void;
  /** 이 약의 알람을 통째로 걷는다 (복약 기간이 끝났을 때). */
  dropMedicine: (name: string) => void;
}

export const useReminders = create<RemindersState>()(
  persist(
    (set) => ({
      reminders: [],
      // 같은 약이면 갈아 끼운다 (더하지 않는다). 이유는 lib/snapcare/course.ts 참고 —
      // 전에는 처방을 다시 찍을 때마다 옛 알람이 남아 함께 울렸다.
      addReminders: (rs) => set((s) => ({ reminders: replaceCourse(s.reminders, rs).slice(0, 50) })),
      remove: (id) => set((s) => ({ reminders: s.reminders.filter((r) => r.id !== id) })),
      /** 이 약의 알람을 통째로 걷는다 (복약 기간이 끝났을 때). */
      dropMedicine: (name) => set((s) => ({
        reminders: s.reminders.filter((r) => medicineKey(r.item.name) !== medicineKey(name)),
      })),
    }),
    {
      name: 'snapcare-reminders',
      // 약은 사람 것이다. 한 폰에 둘이 있으면 알람도 둘로 갈라져야 한다.
      storage: accountStorage,
      // v2: Reminder 모양이 바뀌었다 (name/emoji → item 스냅샷).
      // 이전 저장분은 새 화면에서 읽을 수 없으므로 비우고 시작한다.
      version: 2,
      migrate: () => ({ reminders: [] }),
    },
  ),
);
