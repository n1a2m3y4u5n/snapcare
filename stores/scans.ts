import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Reaction, ScanRecord, Symptom } from '@/lib/snapcare/types';

/**
 * 시드 최근 스캔 (와이어프레임 홈 RECENT 피드 기준).
 * dayKey='today' 는 "언제 열어도 오늘로 취급"하는 데모용 센티널 —
 * 모듈 로드 시점에 new Date()를 읽으면 SSR과 클라이언트 렌더가 어긋난다.
 * barcode·grams 가 있는 기록은 하루 누적 분석에 실제 영양소로 합산된다.
 */
const SEED_SCANS: ScanRecord[] = [
  { id: 's1', itemId: 'energy_drink', name: 'Red Bull', kind: 'drink', emoji: '🥤', memberId: 'you', level: 'safe', timeLabel: 'Today · 2:14 PM', dayKey: 'today', barcode: '9002490100070', grams: 250 },
  { id: 's2', itemId: 'granola_bar', name: 'Snickers', kind: 'food', emoji: '🍫', memberId: 'mia', level: 'avoid', timeLabel: 'Today · 11:02 AM', dayKey: 'today', barcode: '5000159461122', grams: 50 },
  { id: 's3', itemId: 'amoxicillin', name: 'Amoxicillin 500mg', kind: 'prescription', emoji: '💊', memberId: 'you', level: 'safe', timeLabel: 'Today · 8:00 AM', dayKey: 'today' },
  { id: 's4', itemId: 'ibuprofen', name: 'Ibuprofen 200mg', kind: 'medicine', emoji: '💊', memberId: 'grandpa', level: 'avoid', timeLabel: 'Yesterday · 6:40 PM', dayKey: 'yesterday' },
];

interface ScansState {
  scans: ScanRecord[];
  addScan: (rec: ScanRecord) => void;
  /** 먹고 난 뒤의 몸 상태를 나중에 기록한다 (식이 일지). */
  setReaction: (id: string, reaction: Reaction, symptoms?: Symptom[]) => void;
  clear: () => void;
}

export const useScans = create<ScansState>()(
  persist(
    (set) => ({
      scans: SEED_SCANS,
      // 30개는 열흘 남짓이라 식이 일지로는 짧다 — 한 성분이 네 번 이상 나오고
      // 그것이 없는 끼니도 있어야 비교가 성립한다. 늘려도 localStorage 여유 안이다.
      addScan: (rec) => set((s) => ({ scans: [rec, ...s.scans].slice(0, 200) })),
      setReaction: (id, reaction, symptoms) => set((s) => ({
        scans: s.scans.map((r) => (r.id === id ? { ...r, reaction, symptoms } : r)),
      })),
      clear: () => set({ scans: [] }),
    }),
    {
      name: 'snapcare-scans',
      /**
       * v2: 하루 누적 분석을 위해 dayKey/barcode/grams 가 추가됐다.
       * 이전에 저장된 기록엔 그 필드가 없어서, 그대로 두면 저장분이 새 시드를 가리고
       * 누적 화면이 영원히 비어 보인다 (앱을 한 번이라도 열었던 브라우저 전부).
       * 저장분은 데모 기록이므로 새 시드로 되돌리는 것이 맞다.
       */
      version: 3,
      migrate: () => ({ scans: SEED_SCANS }),
    },
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

/** 오늘의 dayKey (YYYY-MM-DD). 이벤트 핸들러·이펙트에서만 호출할 것. */
export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 이 기록이 '오늘'인가.
 * 'today' 는 데모 시드 센티널. dayKey 자체가 없는 구버전 기록은
 * 표시 라벨('Today · 2:14 PM')로 판단한다 — 그것 말고는 단서가 없다.
 */
export function isToday(rec: ScanRecord, today: string): boolean {
  if (rec.dayKey === undefined) return rec.timeLabel.startsWith('Today');
  return rec.dayKey === 'today' || rec.dayKey === today;
}
