import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Member } from '@/lib/snapcare/types';

/** 시드 가족 (와이어프레임 Family Safety 화면 기준) */
const SEED_MEMBERS: Member[] = [
  { id: 'you', name: 'You', role: 'Adult', emoji: '🧑', color: '#2F6BF6', conditionIds: [] },
  { id: 'mia', name: 'Mia', role: 'Child · age 7', emoji: '🧒', color: '#E0669B', conditionIds: ['peanut_allergy'] },
  { id: 'grandpa', name: 'Grandpa Lee', role: 'Adult', emoji: '🧓', color: '#15A34A', conditionIds: ['blood_thinner_conflict', 'diabetic'] },
  { id: 'sam', name: 'Sam', role: 'Teen · age 15', emoji: '🧑‍🦱', color: '#DE8500', conditionIds: ['gluten_sensitivity'] },
];

const AVATAR_COLORS = ['#7C5CE0', '#0EA5A5', '#E0669B', '#DE8500', '#2F6BF6', '#15A34A'];

interface FamilyState {
  members: Member[];
  activeMemberId: string;
  setActiveMember: (id: string) => void;
  toggleCondition: (memberId: string, conditionId: string) => void;
  setMemberName: (id: string, name: string) => void;
  addMember: (name: string) => string;
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
      setMemberName: (id, name) =>
        set((s) => ({ members: s.members.map((m) => (m.id === id ? { ...m, name } : m)) })),
      addMember: (name) => {
        const id = `m_${get().members.length}_${name.toLowerCase().replace(/\s+/g, '')}`;
        const color = AVATAR_COLORS[get().members.length % AVATAR_COLORS.length];
        set((s) => ({
          members: [...s.members, { id, name: name || 'New member', role: 'Adult', emoji: '🧑', color, conditionIds: [] }],
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
