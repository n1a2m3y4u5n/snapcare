'use client';

import { useState } from 'react';
import { listen, speak } from '@/lib/voice';

/**
 * 음성 입력 FAB — 모든 화면 하단 중앙에 고정
 * Voice as Peer 원칙
 */
export function VoiceButton() {
  const [listening, setListening] = useState(false);

  async function handlePress() {
    if (listening) return;
    setListening(true);
    try {
      const text = await listen('ko-KR');
      if (text) {
        // 인식된 텍스트를 그대로 TTS로 확인
        await speak(`${text}`, 'ko-KR');
      } else {
        await speak('다시 말해줄래요?', 'ko-KR');
      }
    } catch {
      await speak('음성 인식을 사용할 수 없어요', 'ko-KR');
    } finally {
      setListening(false);
    }
  }

  return (
    <button
      aria-label={listening ? '듣고 있어요' : '음성 명령'}
      onClick={handlePress}
      style={{ minWidth: 64, minHeight: 64 }}
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center justify-center w-16 h-16 rounded-full shadow-lg text-white text-2xl transition-all active:scale-95 ${
        listening ? 'bg-green-600 animate-pulse' : 'bg-green-600'
      }`}
    >
      🎤
    </button>
  );
}
