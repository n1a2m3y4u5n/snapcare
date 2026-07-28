import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AgeBand, Member } from '@/lib/snapcare/types';

/**
 * 쓰는 사람 한 명.
 *
 * 왜 가족 명단을 없앴는가: 구성원을 한 명씩 등록하고, 스캔할 때마다 누구 것인지 고르고,
 * 먹을 때마다 누가 먹는지 고르고, 섭취와 복약을 사람마다 따로 누적하는 흐름이
 * 이 앱의 전제와 어긋난다. 글을 못 읽는 사람에게 "먼저 가족을 등록하세요" 는
 * 시작하기 전에 넘어야 할 벽이고, 매 스캔마다 얼굴을 고르는 것은 반복 비용이다.
 * 정작 그 복잡함이 사는 값은 크지 않았다 — 대부분의 사용자는 자기 것을 찍는다.
 *
 * 없앤 것은 명단이지 개인화가 아니다. 기준치를 그 사람의 에너지 필요량에서
 * 유도하는 것이 이 앱과 라벨 판독기를 가르는 지점이므로 그대로 남는다.
 * 다만 대상이 한 명이라 "누구를 위한 것인가" 를 묻지 않는다.
 *
 * Member 형태를 그대로 쓰는 이유: 기준 유도·판정·추론이 전부 이 형태를 받는다.
 * 한 명으로 줄이면서 형태까지 바꾸면 바뀌지 않아도 될 코드가 전부 흔들린다.
 */

export const PROFILE_ID = 'me';

const SEED: Member = {
  id: PROFILE_ID,
  name: 'You',
  role: 'Adult',
  ageBand: 'adult',
  emoji: '🧑',
  color: '#2F6BF6',
  conditionIds: [],
};

interface ProfileState {
  profile: Member;
  /**
   * 사용자가 이 프로필을 한 번이라도 확인했는가.
   *
   * 없을 때 문제가 되는 이유: 기본값이 '어른, 조건 없음' 이고 아무 표시 없이
   * 조용히 정해진다. 그런데 온보딩은 "the limits come from your age" 라고 약속한다 —
   * 나이에서 기준이 나온다고 말해 놓고 나이를 묻지 않았다. 아이가 써도 어른 기준으로
   * 판정하고, 땅콩 알레르기가 있어도 등록할 자리가 없어 경고가 뜨지 않는다.
   *
   * 확인했는지를 알아야 처음 한 번 물어볼 수 있고, 건너뛴 사람에게는 지금 누구
   * 기준으로 보고 있는지를 계속 보여줄 수 있다.
   */
  confirmed: boolean;
  /** 프로필을 확인했다고 표시한다 (건너뛰기로는 서지 않는다). */
  confirm: () => void;
  toggleCondition: (conditionId: string) => void;
  /** 신원은 그림으로 정한다 (타이핑 없음) */
  setFace: (emoji: string) => void;
  /** 나이대는 기준치 산출의 입력이다 */
  setAgeBand: (ageBand: AgeBand, role: string) => void;
}

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      profile: SEED,
      toggleCondition: (conditionId) =>
        set((s) => {
          const has = s.profile.conditionIds.includes(conditionId);
          return {
            profile: {
              ...s.profile,
              conditionIds: has
                ? s.profile.conditionIds.filter((c) => c !== conditionId)
                : [...s.profile.conditionIds, conditionId],
            },
          };
        }),
      setFace: (emoji) => set((s) => ({ profile: { ...s.profile, emoji } })),
      setAgeBand: (ageBand, role) => set((s) => ({ profile: { ...s.profile, ageBand, role } })),
      confirmed: false,
      confirm: () => set({ confirmed: true }),
    }),
    {
      name: 'snapcare-profile',
      version: 2,
      /**
       * 두 가지 옛 저장분을 받는다.
       *
       * v0 — 가족 명단(snapcare-family). 구성원이 여럿이고 그중 하나가 활성이었다.
       *      활성 구성원의 조건과 나이대만 가져오고 나머지는 버린다. 이 앱은 이제
       *      한 명만 다루므로 남겨두면 어디서도 쓰이지 않는 자료가 쌓인다.
       *
       * v1 — 이미 지금 형태. profile 은 그대로 두고 confirmed 만 채운다.
       *      가족 명단 형태만 가정하고 짜면 v1 사용자의 members 가 없으므로 프로필이
       *      통째로 SEED 로 초기화된다 — 고치려던 화면에서 자료를 지우는 셈이다.
       *
       * 어느 쪽이든 **쓰던 사람은 확인한 것으로 본다.** 쓰던 앱이 갑자기 설정을
       * 요구하면 고친 것이 아니라 방해가 된다. 처음 여는 사람만 묻는다.
       */
      migrate: (persisted) => {
        const old = persisted as
          { profile?: Member; members?: Member[]; activeMemberId?: string } | undefined;

        if (old?.profile) return { ...old, confirmed: true } as ProfileState;

        const active = old?.members?.find((m) => m.id === old.activeMemberId) ?? old?.members?.[0];
        if (!active) return { profile: SEED, confirmed: false } as ProfileState;
        return {
          confirmed: true,
          profile: {
            ...SEED,
            emoji: active.emoji ?? SEED.emoji,
            role: active.role ?? SEED.role,
            ageBand: active.ageBand ?? SEED.ageBand,
            conditionIds: active.conditionIds ?? [],
          },
        } as ProfileState;
      },
    },
  ),
);
