import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Reaction, ScanRecord, Symptom } from '@/lib/snapcare/types';
import { PROFILE_ID, seedDemoProfile } from './profile';
import { prune } from '@/lib/snapcare/retention';
import { demoHistory, demoReminders } from '@/lib/snapcare/demoHistory';
import { useReminders } from './reminders';
import { isDemo } from '@/lib/snapcare/demo';
import { accountStorage, activeAccountId, DEMO_KID, DEMO_PRIMARY } from '@/lib/snapcare/accounts';

/**
 * 시드 최근 스캔 (와이어프레임 홈 RECENT 피드 기준).
 * dayKey='today' 는 "언제 열어도 오늘로 취급"하는 데모용 센티널 —
 * 모듈 로드 시점에 new Date()를 읽으면 SSR과 클라이언트 렌더가 어긋난다.
 * barcode·grams 가 있는 기록은 하루 누적 분석에 실제 영양소로 합산된다.
 */
/**
 * 시연용 기록.
 *
 * 예전에는 Red Bull·Snickers 를 '안전' 으로 두었다. 두 가지가 나빴다 — 상표명을
 * 그대로 쓴 것과, **앱이 아무것도 잡지 못하는 화면**이었다는 것. 기본 프로필에는
 * 조건이 없어서 무엇을 스캔해도 초록이 뜨고, 그러면 심사위원이 보는 것은 "사진을
 * 찍으면 초록불이 켜지는 앱" 이다.
 *
 * 그래서 잡아내는 장면을 만든다. 프로필은 당뇨 + 혈액희석제를 쓰는 어르신
 * (실제로 흔히 겹치는 조합이고 우리 대상층이다), 기록은 그 조건에 걸리는 것들이다:
 *
 *   메트포르민   당뇨약을 제때 먹었다            → 안전
 *   에너지음료   당뇨에 설탕 27 g                → 회피
 *   이부프로펜   혈액희석제와 함께 쓰면 출혈 위험 → 회피  ← 우리가 만든 핵심 검사
 *   초콜릿 바    설탕이 하루치를 밀어올린다      → 주의
 *
 * 세 번째가 이 앱의 요점이다. 포장에 '이부프로펜' 이라고 적혀 있어도, 자기가 먹는
 * 약과 겹치는지는 글을 읽어도 알기 어렵다.
 */
const SEED_SCANS: ScanRecord[] = [
  { id: 's1', itemId: 'metformin', name: 'Metformin 500mg', kind: 'prescription', emoji: '💊', memberId: PROFILE_ID, level: 'safe', timeLabel: 'Today · 8:00 AM', dayKey: 'today' },
  { id: 's2', itemId: 'energy_drink', name: 'Energy drink 250 mL', kind: 'drink', emoji: '🥤', memberId: PROFILE_ID, level: 'avoid', timeLabel: 'Today · 11:20 AM', dayKey: 'today', barcode: '9002490100070', grams: 250 },
  { id: 's3', itemId: 'ibuprofen', name: 'Ibuprofen 200mg', kind: 'medicine', emoji: '💊', memberId: PROFILE_ID, level: 'avoid', timeLabel: 'Today · 2:14 PM', dayKey: 'today' },
  { id: 's4', itemId: 'granola_bar', name: 'Peanut chocolate bar', kind: 'food', emoji: '🍫', memberId: PROFILE_ID, level: 'caution', timeLabel: 'Yesterday · 6:40 PM', dayKey: 'yesterday', barcode: '5000159461122', grams: 50 },
];

/**
 * 같은 폰의 두 번째 사람 — 땅콩 알레르기가 있는 일곱 살.
 *
 * 일부러 **같은 두 가지**를 넣었다. 어르신 쪽에서 초콜릿 바는 주의(설탕)였는데
 * 여기서는 회피(땅콩)고, 에너지음료는 어르신에게 설탕 때문에 걸리지만 아이에게는
 * 카페인 때문에 걸린다. 얼굴을 바꿔 같은 화면을 두 번 보이면, 이 앱이 라벨을 읽어
 * 주는 것이 아니라 **누가 먹는지를 보고 판정한다**는 것이 설명 없이 드러난다.
 */
const KID_SCANS: ScanRecord[] = [
  { id: 'k1', itemId: 'granola_bar', name: 'Peanut chocolate bar', kind: 'food', emoji: '🍫', memberId: PROFILE_ID, level: 'avoid', timeLabel: 'Today · 4:10 PM', dayKey: 'today', barcode: '5000159461122', grams: 50 },
  { id: 'k2', itemId: 'energy_drink', name: 'Energy drink 250 mL', kind: 'drink', emoji: '🥤', memberId: PROFILE_ID, level: 'avoid', timeLabel: 'Today · 4:25 PM', dayKey: 'today', barcode: '9002490100070', grams: 250 },
];

/** 시연 기록은 사람마다 다르다. 명단에 없는 사람이면 비어 있는 것이 맞다. */
const DEMO_SCANS: Record<string, ScanRecord[]> = { [DEMO_PRIMARY]: SEED_SCANS, [DEMO_KID]: KID_SCANS };


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
      // 기록은 사람 것이다. 한 폰을 여럿이 쓸 때 이것이 섞이면 하루 누적과 식이 일지가
      // 남의 끼니를 세게 된다 — 화면이 비는 것이 아니라 조용히 틀린 숫자가 나온다.
      storage: accountStorage,
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
  const seed = DEMO_SCANS[activeAccountId()];
  if (!seed) return;
  /*
    오늘 것 뒤에 지난 다섯 주를 붙인다.

    위의 네 줄은 **오늘 무엇을 하는 앱인지**를 보인다 — 이부프로펜이 혈액희석제와
    걸리는 것, 초콜릿이 설탕을 밀어올리는 것. 그것만으로는 이 앱이 **시간을 두고**
    하는 일이 화면에 하나도 안 나온다. 열나흘 추세는 막대 두 개, 주별 추세는 아예
    안 뜨고(기록이 두 주는 있어야 방향을 말할 수 있다), 순응도는 셀 것이 없고,
    식이 일지는 반응 하나로 아무것도 추론하지 못한다.

    이 앱의 논지는 "한 장을 읽어 준다" 가 아니라 "쌓이면 보인다" 인데, 그 논지가
    화면에서 증명되지 않고 있었다.

    여기서 만드는 이유는 위의 시드가 문자열 센티널을 쓰는 이유와 같다 — 모듈을
    읽는 시점에 new Date() 를 부르면 서버가 그린 화면과 어긋난다. 이 함수는
    브라우저에서 화면이 붙은 뒤에 불린다.
  */
  useScans.setState({ scans: [...seed, ...demoHistory(todayKey(), PROFILE_ID)] });
  /*
    알람도 같이 심는다.

    기록만 심으면 복약 화면의 "지금 정해져 있는 것" 이 빈다 — 지난 넉 주는 보여주면서
    무엇으로 정해져 있는지는 말하지 못하는 화면이 된다. 둘은 같은 표에서 나오므로
    서로 어긋날 일도 없다.

    이미 알람이 있으면 손대지 않는다. 시연 도중에 사람이 만든 것을 지우면 안 된다.
  */
  if (useReminders.getState().reminders.length === 0) {
    useReminders.setState({ reminders: demoReminders(PROFILE_ID) });
  }
  // 기록만 넣으면 소용이 없다 — 판정은 프로필에서 나온다. 조건이 비어 있으면 위의
  // 회피 두 건이 왜 회피인지 화면 어디에도 설명이 없다.
  seedDemoProfile();
}

/**
 * 시연용 자료를 **처음 상태로 되돌린다.**
 *
 * 왜 필요한가
 * -----------
 * 시연 자료는 한 번 넣고 마는 것이 아니라 **쌓인다.** 짝지은 상자가 배출할 때마다
 * 복용 기록이 하나씩 들어오고(`useDoseLog`), 그것은 진짜 기록이라 지워지지 않는다.
 * 리허설로 알람을 열 번 울리면 열 칸이 남고, 하루 시험하면 백 칸이 남는다.
 *
 * 벤치에서 실제로 그렇게 됐다 — 이번 주 복약 카드가 칸 128개를 그렸다. 자료가
 * 깨진 것이 아니라 전부 진짜 배출이었고, 그래서 더 나쁘다. 고칠 버그가 없다.
 *
 * 심사위원 앞에 놓일 화면이 그것이면 이 앱이 무엇을 하는지가 안 보인다. 그래서
 * 되돌리는 길이 있어야 하고, 그 길은 **시연 자료가 있는 모드에서만** 있어야 한다 —
 * 실제로 쓰는 사람의 복약 기록을 지우는 버튼은 이 앱에 있어서는 안 되는 것이다.
 *
 * `seedDemoIfEmpty` 가 아니라 이것을 부르는 이유는 저쪽이 비어 있을 때만 넣기
 * 때문이다. 쌓인 것을 비우고 다시 넣는 일은 별개의 결정이라 별개의 함수로 둔다.
 */
export function resetDemo(): boolean {
  if (!isDemo()) return false;
  useScans.setState({ scans: [] });
  // 알람도 비운다. 안 비우면 `seedDemoIfEmpty` 가 "이미 있다" 며 넘어가고, 리허설
  // 중에 손댄 알람이 그대로 남는다 — 되돌린다고 해 놓고 절반만 되돌리는 셈이다.
  useReminders.setState({ reminders: [] });
  seedDemoIfEmpty();
  return true;
}
