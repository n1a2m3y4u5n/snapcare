import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isDemo } from '@/lib/snapcare/demo';
import { accountStorage, activeAccountId, PRIMARY_ID, setActiveFace } from '@/lib/snapcare/accounts';
import type { AgeBand, Member } from '@/lib/snapcare/types';

/**
 * 지금 쓰고 있는 사람.
 *
 * 왜 가족 명단을 없앴는가: 구성원을 한 명씩 등록하고, 스캔할 때마다 누구 것인지 고르고,
 * 먹을 때마다 누가 먹는지 고르고, 섭취와 복약을 사람마다 따로 누적하는 흐름이
 * 이 앱의 전제와 어긋난다. 글을 못 읽는 사람에게 "먼저 가족을 등록하세요" 는
 * 시작하기 전에 넘어야 할 벽이고, 매 스캔마다 얼굴을 고르는 것은 반복 비용이다.
 *
 * 한 폰을 여럿이 쓰는 경우는 그것과 다른 문제다. 명단은 **매 스캔마다** 누구인지를
 * 물었지만, 이쪽은 **들어올 때 한 번** 묻는다 (lib/snapcare/accounts.ts). 그다음부터
 * 앱은 여전히 한 사람만 알고 있으면 된다 — 이 파일이 그대로인 이유다. 사람이 갈리는
 * 것은 이 스토어가 아니라 그 아래 저장 자리에서다.
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
      // 얼굴은 두 곳에 필요하다. 판정 화면이 보여주는 것은 이 프로필이고, 잠금화면과
      // 사람 목록이 보여주는 것은 명단이다. 여기서 같이 고쳐야 얼굴을 바꾼 사람이
      // 다음에 앱을 열었을 때 자기 자리를 못 찾는 일이 안 생긴다.
      setFace: (emoji) => {
        setActiveFace(emoji);
        set((s) => ({ profile: { ...s.profile, emoji } }));
      },
      setAgeBand: (ageBand, role) => set((s) => ({ profile: { ...s.profile, ageBand, role } })),
      confirmed: false,
      confirm: () => set({ confirmed: true }),
    }),
    {
      name: 'snapcare-profile',
      // 판정은 전부 이 프로필에서 나온다. 사람이 갈리는 지점이 여기다.
      storage: accountStorage,
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


/**
 * 시연용 프로필. 기록만 넣으면 판정이 성립하지 않는다.
 *
 * 두 사람을 둔다 (lib/snapcare/accounts.ts 의 DEMO_ROSTER 와 같은 표를 쓴다).
 *
 *   🧓  당뇨 + 혈액희석제를 쓰는 어르신. 실제로 흔히 겹치는 조합이고 우리 대상층이다.
 *       이 둘이 있어야 시연 기록의 회피 두 건이 뜻을 갖는다 — 설탕 때문에, 그리고
 *       이부프로펜이 혈액희석제와 겹치기 때문에.
 *   👧  땅콩 알레르기가 있는 일곱 살.
 *
 * 둘을 나이로 갈라 둔 것이 요점이다. **같은 것을 찍어도 판정이 다르다** — 어르신에게
 * 주의인 초콜릿 바가 아이에게는 회피다. 라벨을 읽어주는 앱과 갈리는 지점이 거기고,
 * 그것을 말로 설명하는 대신 얼굴 두 개로 보일 수 있다.
 *
 * 확인한 것으로 표시한다. 시연 중에 프로필 설정 화면부터 거치게 하면 정작 보여줄
 * 것에 도달하기 전에 시간을 쓴다.
 */
const DEMO_PROFILES: Record<string, Pick<Member, 'ageBand' | 'role' | 'emoji' | 'conditionIds'>> = {
  [PRIMARY_ID]: {
    ageBand: 'senior', role: 'Older', emoji: '🧓',
    conditionIds: ['diabetic', 'blood_thinner_conflict'],
  },
  kid: {
    ageBand: 'child', role: 'Child · age 7', emoji: '👧',
    conditionIds: ['peanut_allergy'],
  },
};

export function seedDemoProfile(): void {
  if (!isDemo()) return;
  const seed = DEMO_PROFILES[activeAccountId()];
  if (!seed) return;
  const { profile, confirmed } = useProfile.getState();
  if (confirmed || profile.conditionIds.length > 0) return;
  useProfile.setState({ confirmed: true, profile: { ...profile, ...seed } });
}
