import { create } from 'zustand';
import type { ScanItem } from '@/lib/snapcare/types';

/** 카메라/데모/피드 → 결과 화면으로 넘기는 현재 스캔 아이템 (전이 상태, 비영속) */
interface AnalysisState {
  current: ScanItem | null;
  /**
   * 방금 찍은 사진의 섬네일 (JPEG data URL).
   *
   * 여기 잠깐 두는 이유: 사진은 카메라 화면에서 손에 들어오는데, 그것을 붙일 기록의
   * id 는 결과 화면에서 "다 됐다" 를 눌러야 생긴다. 그 사이를 건너는 자리다.
   *
   * 이 스토어는 저장되지 않는다(비영속). 사진 자체는 기록이 만들어지는 순간
   * IndexedDB 로 옮겨 가고, 서버로는 가지 않는다 — 이유는 lib/photos/policy.ts 에.
   */
  photo: string | null;
  setCurrent: (item: ScanItem | null) => void;
  setPhoto: (thumb: string | null) => void;
}

export const useAnalysis = create<AnalysisState>((set) => ({
  current: null,
  photo: null,
  // 판정이 바뀌면 사진도 함께 비운다. 안 그러면 표본을 눌러 본 뒤에 찍은 사진이
  // 앞의 사진을 달고 저장된다 — 목록에서 남의 끼니 그림이 붙어 있는 셈이다.
  setCurrent: (current) => set({ current, ...(current === null ? { photo: null } : {}) }),
  setPhoto: (photo) => set({ photo }),
}));
