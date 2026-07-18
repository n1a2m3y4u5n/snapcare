import { create } from 'zustand';
import type { ScanItem } from '@/lib/snapcare/types';

/** 카메라/데모/피드 → 결과 화면으로 넘기는 현재 스캔 아이템 (전이 상태, 비영속) */
interface AnalysisState {
  current: ScanItem | null;
  setCurrent: (item: ScanItem | null) => void;
}

export const useAnalysis = create<AnalysisState>((set) => ({
  current: null,
  setCurrent: (current) => set({ current }),
}));
