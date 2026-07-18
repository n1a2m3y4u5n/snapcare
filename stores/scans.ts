import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ScanRecord } from '@/lib/snapcare/types';

/** 시드 최근 스캔 (와이어프레임 홈 RECENT 피드 기준) */
const SEED_SCANS: ScanRecord[] = [
  { id: 's1', itemId: 'energy_drink', name: 'Energy Drink', kind: 'drink', emoji: '🥤', memberId: 'you', level: 'safe', timeLabel: 'Today · 2:14 PM' },
  { id: 's2', itemId: 'granola_bar', name: 'Granola Bar', kind: 'food', emoji: '🍫', memberId: 'mia', level: 'avoid', timeLabel: 'Today · 11:02 AM' },
  { id: 's3', itemId: 'amoxicillin', name: 'Amoxicillin 500mg', kind: 'prescription', emoji: '💊', memberId: 'you', level: 'safe', timeLabel: 'Today · 8:00 AM' },
  { id: 's4', itemId: 'ibuprofen', name: 'Ibuprofen 200mg', kind: 'medicine', emoji: '💊', memberId: 'grandpa', level: 'avoid', timeLabel: 'Yesterday · 6:40 PM' },
];

interface ScansState {
  scans: ScanRecord[];
  addScan: (rec: ScanRecord) => void;
  clear: () => void;
}

export const useScans = create<ScansState>()(
  persist(
    (set) => ({
      scans: SEED_SCANS,
      addScan: (rec) => set((s) => ({ scans: [rec, ...s.scans].slice(0, 30) })),
      clear: () => set({ scans: [] }),
    }),
    { name: 'snapcare-scans' },
  ),
);

/** 렌더 중 Date 포맷팅을 피하기 위한 시각 라벨 생성 (이벤트 핸들러에서 호출) */
export function nowLabel(): string {
  const d = new Date();
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = ((h + 11) % 12) + 1;
  return `Today · ${h12}:${m} ${ampm}`;
}
