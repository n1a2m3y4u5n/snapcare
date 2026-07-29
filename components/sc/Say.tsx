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

/**
 * 아무 요소나 화면 낭독에 포함시킨다.
 *
 *     <h1 {...sayable('SnapCare')}>SnapCare</h1>
 *
 * 왜 필요한가: data-say 를 Speakable 에만 붙여뒀더니 홈과 설정 화면의 낭독 대상이
 * 0개였다. 그 화면의 글은 대부분 버튼 안에 있어서 — 버튼 안에 버튼을 넣을 수 없으니 —
 * 누를 수 있게 만들 수가 없었기 때문이다.
 *
 * 낭독은 속성만 읽으면 되고 상호작용이 필요 없다. 누를 수 있는 것은 Speakable 로,
 * 그렇지 않은 것은 이걸로 표시하면 화면 전체가 소리로 도착한다.
 */
export function sayable(text: string) {
  return { 'data-say': text };
}

/**
 * 이 화면이 무엇을 묻는지 — 도착하면 스스로 읽는 한 줄.
 *
 * 누르는 것은 **무엇이 있는지 이미 아는 사람**의 도구다. 처음 오는 사람은 소리가
 * 있다는 것조차 모르므로, 스피커를 아무리 크게 그려도 그것을 누를 이유를 모른다.
 * 화면이 먼저 말하면 찾을 것이 없어진다 (components/sc/ReadScreen 이 읽는다).
 *
 * 화면당 하나다. 여러 개면 도착할 때마다 문단이 흘러나오고, 그러면 사람들은
 * 소리를 꺼 버린다 — 정작 필요할 때 아무것도 안 들리게 된다.
 */
export function ask(text: string) {
  return { 'data-say': text, 'data-ask': '' };
}

/**
 * 눌러서 듣는 자리라는 표시. **평소에는 숨어 있다.**
 *
 * 전에는 0.75em 에 투명도 40% 짜리 🔊 였다. 시력이 떨어지는 사람에게 그것은 없는
 * 것과 같아서, 화면에 78곳이 소리를 갖고 있는데 눈에 보이는 표시는 아홉 곳뿐이었다.
 * 그래서 크고 진하게 바꿨더니 이번에는 반대쪽으로 넘어갔다 — 화면 하나에 회색 원이
 * 여덟, 열 개씩 격자로 깔렸다. 보기 불편하다는 말을 들었고, 그 말이 맞다.
 *
 * 문제는 크기가 아니라 **표시가 늘 켜져 있어야 한다는 전제**였다. 어디에 소리가
 * 있는지 미리 알려 줘야 한다고 봤기 때문인데, 훑어 듣기(components/sc/SweepToHear)가
 * 들어오면서 그 전제가 사라졌다. 손가락을 얹고 미끄러뜨리면 지나가는 것이 차례로
 * 말하므로, 소리가 어디 있는지는 찾는 것이 아니라 지나가면서 알게 된다.
 *
 * 그래서 지금은 **읽고 있는 동안에만** 나타난다(`html[data-hearing]`). 훑는 중이거나
 * 화면 낭독이 도는 중에는 소리를 가진 자리가 전부 드러나고, 그 밖에는 화면이 조용하다.
 * 눌러서 듣는 것은 표시가 있든 없든 그대로 된다 — 없어진 것은 광고뿐이다.
 *
 * 누르는 것은 이 표시가 아니라 **줄 전체**다. 표시만 누르게 하면 떨리는 손으로
 * 작은 원을 정조준해야 한다.
 */
function SpeakerMark({ speaking }: { speaking: boolean }) {
  return (
    <span
      aria-hidden
      className="sc-mark pointer-events-none flex h-8 w-8 shrink-0 select-none items-center justify-center
                 rounded-full text-base"
      style={{
        background: speaking ? 'var(--color-sc-primary)' : 'var(--color-sc-line)',
        color: speaking ? '#fff' : 'var(--color-sc-ink)',
      }}
    >
      {speaking ? '⏸' : '🔊'}
    </span>
  );
}

/** 누르면 `text` 를 읽는 영역. 감싸는 내용은 무엇이든 될 수 있다. */
export function Speakable({ text, children, className = '', style, label, bare = false }: {
  text: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  label?: string;
  /** 표시를 숨긴다 — 이미 옆에 듣기 버튼이 있는 자리에서만. */
  bare?: boolean;
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
      /**
       * data-say 는 화면 전체 낭독이 읽을 목록이다 (components/sc/ReadScreen).
       * 화면마다 낭독 스크립트를 따로 쓰지 않는 이유: 그러면 화면이 바뀔 때 스크립트가
       * 따라오지 않아 조용히 어긋난다. 눌러서 들을 수 있는 문장들이 곧 그 화면의 내용이다.
       */
      data-say={text}
      /** 읽는 중인 자리를 눈으로도 보여준다 — 어디를 듣고 있는지 모르면 되짚을 수 없다. */
      data-speaking={speaking ? '' : undefined}
      className={`cursor-pointer rounded transition-opacity ${speaking ? 'opacity-60' : ''} ${className}`}
      style={style}
    >
      {children}
      {!bare && <SpeakerMark speaking={speaking} />}
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
      className={`inline-flex items-center gap-2 ${className}`}
      style={style}
      bare={bare}
    >
      <span>{children}</span>
    </Speakable>
  );
}

/**
 * 묶음 머리글 — `TODAY` · `RECENT` 처럼 아래 내용을 소개하는 한 줄.
 *
 * 처음에는 표시를 안 달았다. 아래 카드가 이미 자기 소리를 갖고 있으니 두 번 되는
 * 자리라고 봤는데, 그것은 화면을 **위에서 아래로 읽는 사람**의 셈법이다. 소리로
 * 화면을 아는 사람은 지금 듣고 있는 것이 어느 묶음에 속하는지를 알아야 하고, 그
 * 정보는 머리글에만 있다. 어떤 줄은 되고 어떤 줄은 안 되면 "눌러도 되는 곳" 이라는
 * 규칙 자체가 무너진다 — 규칙이 있어야 시험 삼아 눌러 볼 수 있다.
 */
export function SectionLabel({ children, say, className = '' }: {
  children: React.ReactNode;
  /** 화면 글자보다 길게 읽어야 할 때 (머리글은 대개 두 단어라 그것만으로는 부족하다). */
  say: string;
  className?: string;
}) {
  return (
    <Speakable
      text={say}
      className={`flex w-full items-center gap-2 text-[11px] font-bold tracking-wide ${className}`}
      style={{ color: 'var(--color-sc-muted)' }}
    >
      <span className="flex-1">{children}</span>
    </Speakable>
  );
}

/**
 * 행 옆에 붙는 듣기 버튼.
 *
 * 행 자체가 버튼인 자리에서 쓴다 — 버튼 안에 버튼을 넣으면 키보드 탐색이 깨지므로
 * Speakable 로 감싸지 않고 형제로 놓는다.
 *
 * 크기가 44 인 것은 임의의 값이 아니다. 손끝이 화면에 닿는 면적이 대략 그만큼이고,
 * 그보다 작으면 조준을 요구하게 된다. 이 앱을 쓰는 사람의 손은 떨린다.
 */
export function Hear({ text, className = '' }: { text: string; className?: string }) {
  const [speaking, setSpeaking] = useState(false);
  async function play(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (speaking) { stopSpeaking(); setSpeaking(false); return; }
    setSpeaking(true);
    await speak(text);
    setSpeaking(false);
  }
  return (
    <button
      onClick={play}
      aria-label={speaking ? 'Stop' : `Read aloud: ${text}`}
      {...sayable(text)}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg
                  active:scale-95 transition-transform ${className}`}
      style={{
        background: speaking ? 'var(--color-sc-primary)' : 'var(--color-sc-line)',
        color: speaking ? '#fff' : 'var(--color-sc-ink)',
      }}
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
