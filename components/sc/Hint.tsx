'use client';

import { useEffect } from 'react';
import { speak } from '@/lib/voice';
import { Speakable } from './Say';

/**
 * 무엇이 잘못됐고 어떻게 하면 되는지 알리는 자리.
 *
 * 이 앱에서 가장 오래 방치돼 있던 구멍이다. 판정은 색과 픽토그램과 음성으로 전달하면서,
 * **실패는 글자로만** 알렸다 — "Hold steady and fill the frame with the label". 글을 못 읽는
 * 사용자에게 그건 안내가 아니라 막다른 길이다. 잘 됐을 때만 쓸 수 있는 앱이 되어버린다.
 *
 * 그래서 안내가 뜨는 순간 소리 내어 읽는다. 사용자가 요청해야 들리는 것이면 안 된다 —
 * 무슨 일이 일어났는지 모르는 사람은 재생 버튼을 찾을 이유도 모른다.
 * 그리고 대처법은 그림으로 함께 보여준다. 문장은 다시 누르면 또 들린다.
 */

/** 안내 문구 → 무엇을 하라는 것인지의 그림. 못 찾으면 그림 없이 문장만 남는다. */
const ADVICE: { match: RegExp; emoji: string; hint: string }[] = [
  // 프레임을 채우라는 것
  { match: /fill the frame|hold steady/i, emoji: '🔍', hint: 'Move closer' },
  // 종이를 평평하게, 네 귀퉁이가 다 들어오게
  { match: /lay it flat|corner marks/i, emoji: '📄', hint: 'Lay it flat' },
  // 기기 화면을 흔들리지 않게
  { match: /device screen steady|no code found/i, emoji: '📱', hint: 'Hold steady' },
  // 인터넷이 필요하다
  { match: /needs a connection|not available on this server/i, emoji: '📡', hint: 'No connection' },
  // 다시 찍어라
  { match: /try again|could not/i, emoji: '🔄', hint: 'Try again' },
];

export function Hint({ text, tone = 'warn' }: { text: string; tone?: 'warn' | 'info' }) {
  // 뜨는 순간 읽는다. 실패한 사용자가 재생 버튼을 찾아 누를 것이라 기대할 수 없다.
  useEffect(() => {
    void speak(text);
  }, [text]);

  const advice = ADVICE.find((a) => a.match.test(text));
  const color = tone === 'warn' ? '#FBBF24' : 'rgba(255,255,255,0.75)';

  return (
    <Speakable text={text} className="flex items-center gap-2" style={{ color }}>
      {advice && (
        <span className="flex items-center gap-1">
          <span aria-hidden className="text-xl leading-none">{advice.emoji}</span>
          <span className="text-[11px] font-semibold">{advice.hint}</span>
        </span>
      )}
      <span className="text-xs opacity-80">{text}</span>
      <span aria-hidden className="text-xs opacity-50">🔊</span>
    </Speakable>
  );
}
