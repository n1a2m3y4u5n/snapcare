'use client';

import { useEffect, useRef, useState } from 'react';
import { speak, stopSpeaking } from '@/lib/voice';

/**
 * 눌러서 듣는 텍스트.
 *
 * 글을 못 읽는 사용자가 전제인 앱인데 화면에 글이 남아 있다면, 그 글은 아직 전달되지
 * 않은 것이다. 그림으로 바꿀 수 있는 것은 바꾸되, 끝내 문장으로 남는 것들은 —
 * 경고 사유, 복약 지시, 성분 이름 — 최소한 **누르면 들려야** 한다.
 *
 * 화면 전체를 한 번에 읽어주는 버튼도 있지만 그것만으로는 부족하다. 듣는 사람은
 * 되감을 수 없어서, 놓친 한 문장 때문에 처음부터 다시 들어야 한다. 문장 단위로
 * 누를 수 있으면 필요한 곳만 다시 듣는다.
 *
 * 누르는 곳임을 눈으로도 알 수 있어야 하므로 작은 스피커 표시를 함께 둔다.
 */

/** 누르면 `text` 를 읽는 영역. 감싸는 내용은 무엇이든 될 수 있다. */
export function Speakable({ text, children, className = '', style, label }: {
  text: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  label?: string;
}) {
  const [speaking, setSpeaking] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  async function play(e: React.SyntheticEvent) {
    // 목록 항목 안에 들어가는 경우가 있어, 바깥 버튼까지 눌리지 않게 막는다
    e.stopPropagation();
    e.preventDefault();
    if (speaking) { stopSpeaking(); setSpeaking(false); return; }
    setSpeaking(true);
    await speak(text);
    if (alive.current) setSpeaking(false);
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={play}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') play(e); }}
      aria-label={label ?? `Read aloud: ${text}`}
      className={`cursor-pointer rounded transition-opacity ${speaking ? 'opacity-60' : ''} ${className}`}
      style={style}
    >
      {children}
    </span>
  );
}

type SayProps = {
  children: string;
  /** 화면에 보이는 것과 다르게 읽어야 할 때 (예: 'sat. fat' → 'saturated fat') */
  as?: string;
  className?: string;
  style?: React.CSSProperties;
  /** 스피커 표시를 숨긴다 — 이미 다른 표시가 있는 자리에서만 */
  bare?: boolean;
};

export function Say({ children, as, className = '', style, bare = false }: SayProps) {
  return (
    <Speakable
      text={as ?? children}
      label={`Read aloud: ${children}`}
      className={`inline-flex items-start gap-1 ${className}`}
      style={style}
    >
      <span>{children}</span>
      {!bare && (
        <span aria-hidden className="shrink-0 select-none text-[0.75em] leading-relaxed opacity-40">
          🔊
        </span>
      )}
    </Speakable>
  );
}

/**
 * 목록 행 옆에 붙는 작은 듣기 버튼.
 * 행 자체가 버튼인 자리에서 쓴다 — 버튼 안에 버튼을 넣으면 키보드 탐색이 깨지므로
 * Speakable 로 감싸지 않고 형제로 놓는다.
 */
export function SpeakIcon({ text, className = '' }: { text: string; className?: string }) {
  const [speaking, setSpeaking] = useState(false);
  async function play(e: React.MouseEvent) {
    e.stopPropagation();
    if (speaking) { stopSpeaking(); setSpeaking(false); return; }
    setSpeaking(true);
    await speak(text);
    setSpeaking(false);
  }
  return (
    <button
      onClick={play}
      aria-label={`Read aloud: ${text}`}
      className={`shrink-0 px-2 py-2 text-base opacity-40 ${className}`}
    >
      {speaking ? '⏸' : '🔊'}
    </button>
  );
}

/**
 * 화면 한 덩어리를 통째로 읽는 버튼.
 * 문장 단위로 누르는 것과 역할이 다르다 — 처음 도착했을 때 "여기 뭐가 있는지"를 듣는 용도다.
 */
export function SayButton({ text, label = 'Read aloud', className = '' }: {
  text: string; label?: string; className?: string;
}) {
  const [speaking, setSpeaking] = useState(false);

  async function play() {
    if (speaking) { stopSpeaking(); setSpeaking(false); return; }
    setSpeaking(true);
    await speak(text);
    setSpeaking(false);
  }

  return (
    <button
      onClick={play}
      aria-label={label}
      className={`flex h-11 w-11 items-center justify-center rounded-full bg-white text-xl shadow-sm ${className}`}
    >
      {speaking ? '⏸' : '🔊'}
    </button>
  );
}
