import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { accountStorage } from '@/lib/snapcare/accounts';

interface SessionState {
  /**
   * 글자 크기를 골랐는가.
   *
   * 안내(onboarding)보다 **먼저** 묻는다. 안내 자체가 글자와 그림으로 되어 있어서,
   * 글자가 안 보이는 사람에게는 그 안내부터 읽히지 않는다. 크기를 먼저 맞춰 놓고
   * 나머지를 보여주는 순서가 맞다.
   */
  sizePicked: boolean;
  onboarded: boolean;
  authed: boolean;
  /** bcrypt 해시된 픽처키 (없으면 최초 설정 필요) */
  pinHash: string | null;
  setSizePicked: (v: boolean) => void;
  setOnboarded: (v: boolean) => void;
  setAuthed: (v: boolean) => void;
  setPinHash: (h: string) => void;
  reset: () => void;
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      sizePicked: false,
      onboarded: false,
      authed: false,
      // 데모 기본 픽처키 = ☀️🌙💧🔥 (인덱스 0,1,2,3). 로그인 화면에 힌트로 표시됨.
      // 기본값은 null 이어야 한다. 여기에 해시가 박혀 있으면 처음 여는 사람도
      // '확인' 모드로 들어가서, 자기가 정한 적 없는 그림 4개를 맞히라는 화면을 만난다.
      // 시연용 키는 app/login/page.tsx 가 시연 모드일 때만 넣는다.
      pinHash: null,
      setSizePicked: (sizePicked: boolean) => set({ sizePicked }),
      setOnboarded: (onboarded) => set({ onboarded }),
      setAuthed: (authed) => set({ authed }),
      setPinHash: (pinHash) => set({ pinHash }),
      reset: () => set({ sizePicked: false, onboarded: false, authed: false, pinHash: null }),
    }),
    {
      name: 'snapcare-session',
      // 픽처키는 사람마다 다르다. 한 폰을 여럿이 쓰면 잠금이 한 개일 이유가 없고,
      // 자기 자리에 들어가는 방법이 곧 자기 그림 네 개다.
      storage: accountStorage,
      // authed는 저장 안 함 → 매 로드마다 로그인 화면을 거친다 (데모용). onboarded·pinHash만 유지.
      partialize: (s) => ({ sizePicked: s.sizePicked, onboarded: s.onboarded, pinHash: s.pinHash }),
    },
  ),
);
