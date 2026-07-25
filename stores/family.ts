import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AgeBand, Member } from '@/lib/snapcare/types';

/** 시드 가족 (와이어프레임 Family Safety 화면 기준) */
const SEED_MEMBERS: Member[] = [
  { id: 'you', name: 'You', role: 'Adult', ageBand: 'adult', emoji: '🧑', color: '#2F6BF6', conditionIds: [] },
  { id: 'mia', name: 'Mia', role: 'Child · age 7', ageBand: 'child', emoji: '🧒', color: '#E0669B', conditionIds: ['peanut_allergy'] },
  { id: 'grandpa', name: 'Grandpa Lee', role: 'Older adult', ageBand: 'senior', emoji: '🧓', color: '#15A34A', conditionIds: ['blood_thinner_conflict', 'diabetic'] },
  { id: 'sam', name: 'Sam', role: 'Teen · age 15', ageBand: 'teen', emoji: '🧑‍🦱', color: '#DE8500', conditionIds: ['gluten_sensitivity'] },
];

const AVATAR_COLORS = ['#7C5CE0', '#0EA5A5', '#E0669B', '#DE8500', '#2F6BF6', '#15A34A'];

interface FamilyState {
  members: Member[];
  activeMemberId: string;
  setActiveMember: (id: string) => void;
  toggleCondition: (memberId: string, conditionId: string) => void;
  /** 신원은 그림으로 정한다 (타이핑 없음) */
  setMemberFace: (id: string, emoji: string) => void;
  /** 나이대는 기준치 산출의 입력이다 */
  setMemberAgeBand: (id: string, ageBand: AgeBand, role: string) => void;
  addMember: () => string;
  removeMember: (id: string) => void;
  getMember: (id: string) => Member | undefined;
}

export const useFamily = create<FamilyState>()(
  persist(
    (set, get) => ({
      members: SEED_MEMBERS,
      activeMemberId: 'you',
      setActiveMember: (activeMemberId) => set({ activeMemberId }),
      toggleCondition: (memberId, conditionId) =>
        set((s) => ({
          members: s.members.map((m) => {
            if (m.id !== memberId) return m;
            const has = m.conditionIds.includes(conditionId);
            return {
              ...m,
              conditionIds: has
                ? m.conditionIds.filter((c) => c !== conditionId)
                : [...m.conditionIds, conditionId],
            };
          }),
        })),
      setMemberFace: (id, emoji) =>
        set((s) => ({ members: s.members.map((m) => (m.id === id ? { ...m, emoji } : m)) })),
      setMemberAgeBand: (id, ageBand, role) =>
        set((s) => ({ members: s.members.map((m) => (m.id === id ? { ...m, ageBand, role } : m)) })),
      addMember: () => {
        // 이름을 묻지 않는다 — 신원은 그림이고, 표시용 이름만 자동으로 붙인다.
        const n = get().members.length;
        const id = `m_${n}_${AVATAR_COLORS[n % AVATAR_COLORS.length].slice(1)}`;
        set((s) => ({
          members: [...s.members, {
            id,
            name: `Person ${n + 1}`,
            role: 'Adult',
            ageBand: 'adult' as AgeBand,
            emoji: '🧑',
            color: AVATAR_COLORS[n % AVATAR_COLORS.length],
            conditionIds: [],
          }],
        }));
        return id;
      },
      removeMember: (id) =>
        set((s) => {
          const members = s.members.filter((m) => m.id !== id);
          return {
            members,
            activeMemberId: s.activeMemberId === id ? members[0]?.id ?? '' : s.activeMemberId,
          };
        }),
      getMember: (id) => get().members.find((m) => m.id === id),
    }),
    { name: 'snapcare-family' },
  ),
);
