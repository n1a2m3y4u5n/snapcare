'use client';

import { ReactNode } from 'react';
import { SOSButton } from './SOSButton';
import { VoiceButton } from './VoiceButton';

interface ScreenProps {
  children: ReactNode;
  /** SOS 버튼을 숨길지 여부 (응급 화면에서 사용) */
  hideSos?: boolean;
  /** 음성 버튼을 숨길지 여부 */
  hideVoice?: boolean;
  className?: string;
}

/**
 * 공통 화면 컨테이너 — max-w-md, SOS/Voice FAB 포함
 */
export function Screen({ children, hideSos = false, hideVoice = false, className = '' }: ScreenProps) {
  return (
    <div className="min-h-screen bg-white relative">
      {!hideSos && <SOSButton />}
      {!hideVoice && <VoiceButton />}
      <main
        className={`max-w-md mx-auto min-h-screen flex flex-col px-4 py-4 pb-28 ${className}`}
      >
        {children}
      </main>
    </div>
  );
}
