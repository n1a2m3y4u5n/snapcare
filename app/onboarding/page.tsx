'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/stores/session';
import { sayable } from '@/components/sc/Say';
import { ReadScreen } from '@/components/sc/ReadScreen';
import { speak } from '@/lib/voice';

/**
 * 첫 화면 다섯 장.
 *
 * 전에는 장마다 이모지 하나에 문단 하나였다. "읽기를 요구하지 않는다" 를 내세운
 * 앱이 문단 다섯 개로 시작한 셈이고, 정작 우리가 만든 78개 그림은 한 장도 쓰지
 * 않았다.
 *
 * 그래서 말로 설명하던 것을 **보여주는 것**으로 바꾼다. 판정은 실제 색 세 개로,
 * 나이에 따라 달라진다는 것은 아이와 어른 그림에 같은 음식을 놓고 다른 판정을
 * 붙여서. 글은 제목만 남긴다 — 소리로도 나가므로 문단이 필요 없다.
 *
 * show 가 있으면 그림을, 없으면 이모지를 그린다.
 */
const SLIDES: {
  emoji: string; title: string; body?: string; tint: string;
  show?: 'verdicts' | 'ages' | 'hold';
}[] = [
  { emoji: '📷', title: 'Point & scan', tint: 'var(--color-sc-primary)' },
  { emoji: '🚦', title: 'Green, amber or red', tint: 'var(--color-safe)', show: 'verdicts' },
  // 가족 명단을 없앤 뒤에도 "Built for family" 가 남아 있었다. 첫 화면이 앱에 없는
  // 기능을 약속하는 자리라, 그대로 두면 처음 여는 사람이 가장 먼저 만나는 것이 거짓이다.
  { emoji: '⚖️', title: 'Judged for your age', tint: 'var(--color-caution)', show: 'ages' },
  /*
    이 슬라이드가 앱 전체의 사용법을 가르친다. 글자를 꾹 누르면 읽어주는데, 그것을
    알려주는 자리가 없으면 아무도 모른다 — 기능이 있는 것과 닿는 것은 다르다.
    그리고 이 제목 자체를 꾹 눌러보면 바로 확인된다.
  */
  { emoji: '👆', title: 'Hold any words to hear them', tint: 'var(--color-sc-primary)', show: 'hold' },
  { emoji: '🔔', title: 'Camera and reminders', tint: 'var(--color-avoid)' },
];

/** 실제 판정 색 세 개. 글로 "초록·주황·빨강" 이라고 적는 것보다 이쪽이 곧바르다. */
function Verdicts() {
  return (
    <div className="flex items-center gap-4">
      {[['var(--color-safe)', '✓'], ['var(--color-caution)', '!'], ['var(--color-avoid)', '✕']]
        .map(([c, mark]) => (
          <span key={c} className="flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold text-white"
                style={{ background: c }} aria-hidden>{mark}</span>
        ))}
    </div>
  );
}

/**
 * 같은 음식, 다른 사람, 다른 판정.
 *
 * 이 앱의 주장이 한 장에 들어간다 — 문단으로 설명하던 것이다. 사람 그림은 우리
 * 형태소를 그대로 쓴다(프로필 나이 선택 화면과 같은 그림이라, 나중에 그 화면에서
 * 다시 만난다).
 */
function Ages() {
  return (
    <div className="flex items-end gap-5">
      {[['state_child', 'var(--color-avoid)', '✕'], ['state_adult', 'var(--color-safe)', '✓']]
        .map(([g, c, mark]) => (
          <span key={g} className="relative flex flex-col items-center gap-2">
            <span className="text-3xl" aria-hidden>🍬</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/glyphs/${g}.png`} alt="" aria-hidden className="h-16 w-16" />
            <span className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ background: c }} aria-hidden>{mark}</span>
          </span>
        ))}
    </div>
  );
}

/** 손가락과 소리. 이 화면에서 실제로 해볼 수 있으므로 그림은 신호만 준다. */
function Hold() {
  return (
    <div className="flex items-center gap-3 text-5xl" aria-hidden>
      <span>👆</span>
      <span className="animate-pulse">🔊</span>
    </div>
  );
}


export default function OnboardingPage() {
  const router = useRouter();
  const setOnboarded = useSession((s) => s.setOnboarded);
  const [i, setI] = useState(0);
  const last = i === SLIDES.length - 1;
  const s = SLIDES[i];

  /*
    슬라이드가 바뀌면 스스로 읽는다.
    
    다른 화면은 눌러야 읽어주는데, 그 규칙을 알려주는 곳이 여기다 — 여기가 침묵하면
    "글자를 누르면 읽어준다" 를 배울 자리가 없다. 글을 못 읽는 사람이 처음 만나는
    화면이 조용하면, 그 사람에게 이 앱은 그냥 읽을 수 없는 화면 넷이다.
    
    첫 슬라이드는 브라우저가 막는다 — 사용자가 아무것도 누르기 전에는 소리를 못 낸다.
    그래서 Next 를 누른 뒤부터 들린다. 그 전에도 글자를 누르면 읽힌다.
  */
  useEffect(() => { void speak(s.body ? `${s.title}. ${s.body}` : s.title); }, [s.title, s.body]);

  function finish() {
    setOnboarded(true);
    router.replace('/login');
  }

  return (
    <div className="min-h-screen w-full flex justify-center" style={{ background: 'var(--color-sc-bg)' }}>
      <div className="relative w-full max-w-[440px] min-h-screen flex flex-col px-6 pb-8 pt-14">
        <div className="flex items-center justify-between text-sm font-semibold" style={{ color: 'var(--color-sc-muted)' }}>
          <button onClick={() => (i > 0 ? setI(i - 1) : null)} className={i > 0 ? '' : 'invisible'}>Back</button>
          <button onClick={finish}>Skip</button>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center text-center">
          {s.show ? (
            <div className="flex min-h-32 items-center justify-center">
              {s.show === 'verdicts' ? <Verdicts /> : s.show === 'ages' ? <Ages /> : <Hold />}
            </div>
          ) : (
            <div className="flex h-32 w-32 items-center justify-center rounded-full text-6xl"
                 style={{ background: 'color-mix(in srgb, ' + s.tint + ' 12%, white)' }}>
              {s.emoji}
            </div>
          )}
          {/*
            슬라이드는 이 앱을 처음 만나는 자리다. 여기서 글을 읽어야 한다면
            그 뒤의 모든 접근성 작업이 무의미해진다 — 시작하기 전에 걸러진다.
          */}
          <h1 className="mt-8 text-2xl font-bold" style={{ color: 'var(--color-sc-ink)' }}
              {...sayable(s.body ? `${s.title}. ${s.body}` : s.title)}>{s.title}</h1>
          {s.body && (
            <p className="mt-3 max-w-xs text-sm leading-relaxed" style={{ color: 'var(--color-sc-muted)' }}>{s.body}</p>
          )}
        </div>

        {/* 인디케이터 */}
        <div className="mb-6 flex justify-center gap-2">
          {SLIDES.map((_, k) => (
            <span key={k} className="h-2 rounded-full transition-all" style={{ width: k === i ? 20 : 8, background: k === i ? 'var(--color-sc-primary)' : 'var(--color-sc-line)' }} />
          ))}
        </div>

        <ReadScreen />

        <button
          onClick={() => (last ? finish() : setI(i + 1))}
          className="w-full rounded-2xl py-4 text-base font-bold text-white active:scale-[0.98] transition-transform"
          style={{ background: 'var(--color-sc-primary)' }}
        >
          {last ? 'Get Started' : 'Next'}
        </button>
      </div>
    </div>
  );
}
