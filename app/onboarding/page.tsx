'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/stores/session';
import { sayable } from '@/components/sc/Say';
import { ReadScreen } from '@/components/sc/ReadScreen';
import { speak } from '@/lib/voice';
import { SlideArt, type ArtKind } from './art';

/**
 * 첫 화면 다섯 장.
 *
 * 전에는 장마다 이모지 하나에 문단 하나였다. "읽기를 요구하지 않는다" 를 내세운
 * 앱이 문단 다섯 개로 시작한 셈이었다. 그다음에는 멈춘 그림으로 바꿨는데, 그것도
 * 절반이었다 — 손가락 이모지와 스피커 이모지를 나란히 놓는 것은 **동작을 그린 것이
 * 아니라 동작에 쓰이는 물건 둘을 늘어놓은 것**이다. 누르는 것도, 기다리는 것도,
 * 그래서 소리가 난다는 것도 그 그림에는 없다.
 *
 * 그래서 다섯 장 모두 **한 바퀴 도는 그림**으로 바꾼다 (app/onboarding/art.tsx).
 * 글을 못 읽는 사람에게 손짓을 가르치는 방법은 그 손짓이 일어나는 것을 보여주는
 * 것 하나뿐이다. 알아보는 것은 그림이 아니라 변화다.
 *
 * 글은 제목만 남는다 — 소리로도 나가므로 문단이 필요 없다.
 */
const SLIDES: { art: ArtKind; title: string }[] = [
  { art: 'scan', title: 'Point & scan' },
  { art: 'verdicts', title: 'Green, amber or red' },
  // 가족 명단을 없앤 뒤에도 "Built for family" 가 남아 있었다. 첫 화면이 앱에 없는
  // 기능을 약속하는 자리라, 그대로 두면 처음 여는 사람이 가장 먼저 만나는 것이 거짓이다.
  { art: 'ages', title: 'Judged for your age' },
  /*
    이 장이 앱 전체의 사용법을 가르친다. 글자를 꾹 누르면 읽어주는데, 그것을 알려주는
    자리가 없으면 아무도 모른다 — 기능이 있는 것과 닿는 것은 다르다.

    그리고 이 제목 자체를 꾹 눌러보면 그림이 방금 보여준 것이 그대로 일어난다.
    가르친 손짓을 같은 화면에서 시험해 볼 수 있다는 것이 이 장의 자리를 정했다.
  */
  { art: 'hold', title: 'Hold, then slide, to hear' },
  { art: 'remind', title: 'Camera and reminders' },
];


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
  useEffect(() => { void speak(s.title); }, [s.title]);

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
          {/* key 를 붙여 장이 바뀔 때 그림을 새로 만든다 — 안 그러면 앞 장의
              애니메이션이 중간부터 이어져, 처음부터 보아야 뜻이 서는 순서가 깨진다. */}
          <SlideArt key={s.art} kind={s.art} />
          {/*
            슬라이드는 이 앱을 처음 만나는 자리다. 여기서 글을 읽어야 한다면
            그 뒤의 모든 접근성 작업이 무의미해진다 — 시작하기 전에 걸러진다.
          */}
          <h1 className="mt-8 text-2xl font-bold" style={{ color: 'var(--color-sc-ink)' }}
              {...sayable(s.title)}>{s.title}</h1>
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
