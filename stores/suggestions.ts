import { create } from 'zustand';
import { persist } from 'zustand/middleware';
// 상대 경로 + 확장자 — 이 스토어는 시험(lib/pattern/reask.test.ts)에서도 불려서
// `@/` 별칭이 통하지 않는다.
import { accountStorage } from '../lib/snapcare/accounts.ts';

/**
 * 추론 제안을 사용자가 물린 기록.
 *
 * 거절을 영원히 기억하면 새 근거가 쌓여도 다시 묻지 않게 되고, 기억하지 않으면 홈에
 * 들어올 때마다 같은 것을 다시 묻는다. 둘 다 나쁘다 — 앞은 놓치고 뒤는 성가셔서
 * 아무거나 눌러 치우게 만든다.
 *
 * 그래서 "그때 근거가 몇 건이었는지" 를 기억한다. 그보다 눈에 띄게 늘었을 때만
 * 다시 묻는다. 사용자가 아니라고 한 판단을 존중하면서, 그 판단이 내려진 근거가
 * 달라졌을 때는 다시 꺼낼 수 있다.
 */

/** 다시 묻기까지 필요한 추가 근거(불편했던 횟수). */
export const REASK_AFTER = 3;

interface SuggestionState {
  /** `${memberId}:${conditionId}` → 물렸을 때의 불편 횟수 */
  dismissed: Record<string, number>;
  dismiss: (memberId: string, conditionId: string, unwellCount: number) => void;
  /** 지금 근거로 다시 물어도 되는가 */
  shouldAsk: (memberId: string, conditionId: string, unwellCount: number) => boolean;
  clear: () => void;
}

const key = (m: string, c: string) => `${m}:${c}`;

export const useSuggestions = create<SuggestionState>()(
  persist(
    (set, get) => ({
      dismissed: {},
      dismiss: (memberId, conditionId, unwellCount) =>
        set((s) => ({ dismissed: { ...s.dismissed, [key(memberId, conditionId)]: unwellCount } })),
      shouldAsk: (memberId, conditionId, unwellCount) => {
        const at = get().dismissed[key(memberId, conditionId)];
        return at === undefined || unwellCount >= at + REASK_AFTER;
      },
      clear: () => set({ dismissed: {} }),
    }),
    // 물린 제안은 그 사람의 판단이다. 남이 아니라고 한 것을 나에게 묻지 않으면 안 된다.
    { name: 'snapcare-suggestions', storage: accountStorage },
  ),
);
