import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Reaction, ScanRecord, Symptom } from '@/lib/snapcare/types';
import { PROFILE_ID } from './profile';
import { prune } from '@/lib/snapcare/retention';
import { isDemo } from '@/lib/snapcare/demo';

/**
 * 시드 최근 스캔 (와이어프레임 홈 RECENT 피드 기준).
 * dayKey='today' 는 "언제 열어도 오늘로 취급"하는 데모용 센티널 —
 * 모듈 로드 시점에 new Date()를 읽으면 SSR과 클라이언트 렌더가 어긋난다.
 * barcode·grams 가 있는 기록은 하루 누적 분석에 실제 영양소로 합산된다.
 */
const SEED_SCANS: ScanRecord[] = [
  { id: 's1', itemId: 'energy_drink', name: 'Red Bull', kind: 'drink', emoji: '🥤', memberId: PROFILE_ID, level: 'safe', timeLabel: 'Today · 2:14 PM', dayKey: 'today', barcode: '9002490100070', grams: 250 },
  { id: 's2', itemId: 'granola_bar', name: 'Snickers', kind: 'food', emoji: '🍫', memberId: PROFILE_ID, level: 'avoid', timeLabel: 'Today · 11:02 AM', dayKey: 'today', barcode: '5000159461122', grams: 50 },
  { id: 's3', itemId: 'amoxicillin', name: 'Amoxicillin 500mg', kind: 'prescription', emoji: '💊', memberId: PROFILE_ID, level: 'safe', timeLabel: 'Today · 8:00 AM', dayKey: 'today' },
  { id: 's4', itemId: 'ibuprofen', name: 'Ibuprofen 200mg', kind: 'medicine', emoji: '💊', memberId: PROFILE_ID, level: 'avoid', timeLabel: 'Yesterday · 6:40 PM', dayKey: 'yesterday' },
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
      // 처음 상태는 비어 있다. 시연용 자료는 브라우저에서 하이드레이션이 끝난 뒤에만
      // 넣는다 — 여기서 넣으면 서버가 그린 화면과 브라우저가 그린 화면이 어긋난다.
      scans: [],
      // 30개는 열흘 남짓이라 식이 일지로는 짧다 — 한 성분이 네 번 이상 나오고
      // 그것이 없는 끼니도 있어야 비교가 성립한다. 늘려도 localStorage 여유 안이다.
      addScan: (rec) => set((s) => ({ scans: prune([rec, ...s.scans], todayKey()) })),
      setReaction: (id, reaction, symptoms) => set((s) => ({
        scans: s.scans.map((r) => (r.id === id ? { ...r, reaction, symptoms } : r)),
      })),
      clear: () => set({ scans: [] }),
    }),
    {
      /**
       * 불러올 때도 한 번 떨어낸다.
       *
       * addScan 에서만 떨어내면, 앱을 한동안 쓰지 않은 사람의 오래된 기록은 다음에
       * 무언가를 스캔할 때까지 그대로 남는다. 정작 오래 안 쓴 사람일수록 오래된
       * 기록을 들고 있게 되는 셈이다.
       */
      /**
       * 불러온 것을 어떻게 합칠지. 두 가지를 여기서 한다.
       *
       * onRehydrateStorage 안에서 state 를 직접 고쳐 봤는데 **반영되지 않았다** —
       * 시연 자료도 안 들어가고 90일 정리도 조용히 안 돌았다. merge 는 돌려준 값이
       * 실제로 상태가 되므로 확실하다.
       *
       * 여기서 하는 것은 **오래된 기록 정리**뿐이다. 시연용 자료는 아래 seedDemoIfEmpty
       * 가 넣는다 — merge 는 저장된 것이 있을 때만 불려서, 처음 여는 사람에게는 돌지
       * 않기 때문이다.
       */
      merge: (persisted, current) => {   // 저장된 것이 있을 때만 불린다
        const p = (persisted ?? {}) as Partial<ScansState>;
        return { ...current, ...p, scans: prune(p.scans ?? [], todayKey()) };
      },
      name: 'snapcare-scans',
      /**
       * v2: 하루 누적 분석을 위해 dayKey/barcode/grams 가 추가됐다.
       * 이전에 저장된 기록엔 그 필드가 없어서, 그대로 두면 저장분이 새 시드를 가리고
       * 누적 화면이 영원히 비어 보인다 (앱을 한 번이라도 열었던 브라우저 전부).
       * 저장분은 데모 기록이므로 새 시드로 되돌리는 것이 맞다.
       */
      /**
       * v4: 가족 명단을 없애면서 memberId 가 한 사람으로 모였다. 옛 기록은
       * 이제 존재하지 않는 구성원을 가리키므로 하루 누적·식이 일지에서 통째로
       * 빠진다 — 화면이 비는 것이 아니라 조용히 일부만 세는 쪽이라 더 나쁘다.
       */
      version: 4,
      // 옛 저장분은 버린다. 시연용 자료가 필요하면 아래 onRehydrateStorage 가 넣는다.
      migrate: () => ({ scans: [] }),
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


/**
 * 시연용 기록을 채운다. 처음 열렸고, 비어 있고, 시연 모드일 때만.
 *
 * 스토어를 만들 때 넣지 않는 이유: 그 코드는 서버에서도 돌고 서버는 주소를 모른다.
 * 서버는 빈 화면을, 브라우저는 채워진 화면을 그리게 되어 둘이 어긋난다.
 *
 * persist 의 merge 에서도 안 된다 — 저장된 것이 있을 때만 불린다.
 *
 * 그래서 브라우저에서 화면이 붙은 뒤에 한 번 부른다 (app/sync-provider.tsx).
 */
export function seedDemoIfEmpty(): void {
  if (!isDemo()) return;
  if (useScans.getState().scans.length > 0) return;
  useScans.setState({ scans: SEED_SCANS });
}
