'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { speak, stopSpeaking, setSayLang, setSpeechRate } from '@/lib/voice';
import { usePreferences } from '@/stores/preferences';
import { languageByCode } from '@/lib/i18n/languages';
import { SpeakerIcon, StopIcon } from '@/components/icons';

/**
 * 화면에 있는 것을 처음부터 끝까지 읽어준다.
 *
 * 문장 단위로 누르는 것(Say)과 역할이 다르다. 눌러서 듣는 것은 **무엇이 있는지 이미 아는
 * 사람**의 도구다 — 화면에 막 도착한 사람은 무엇을 눌러야 할지조차 모른다. 여기 무엇이
 * 있는지 먼저 들어야 그다음에 고를 수 있다.
 *
 * 읽을 목록은 화면마다 따로 쓰지 않고 data-say 를 DOM 순서로 걷어 온다. 스크립트를
 * 손으로 관리하면 화면이 바뀔 때 따라오지 않아 조용히 어긋나고, 그 어긋남은 글을 읽는
 * 사람만 알아챌 수 있다 — 즉 이 앱의 사용자는 영영 모른다.
 *
 * 자리는 고정이다. 읽지 못하는 사람이 버튼을 찾는 방법은 '늘 거기 있다' 뿐이다.
 */

/**
 * 어디에 그릴 것인가.
 *
 *  tab   — 하단 탭바의 네 번째 칸. 탭바가 있는 화면은 여기다.
 *  float — 탭바가 없는 화면(로그인·안내·카메라)의 떠 있는 버튼.
 *  none  — 버튼 없이 이 컴포넌트의 일(도착 안내·말하기 속도 적용)만 한다.
 *
 * 왜 떠 있는 버튼을 걷어냈나: 줄마다 듣기 버튼이 생기면서 화면 양옆이 컨트롤 열이
 * 됐는데, 떠 있는 원이 그 위에 앉아 실제로 누를 것을 가렸다. 오른쪽에서 왼쪽으로
 * 옮겨도 같은 일이 반복됐다 — 어느 구석이든 내용이 있기 때문이다. 탭바는 이미
 * 아무 내용도 지나가지 않는 자리이고, "늘 거기 있다" 는 성질도 그대로다.
 */
export type ReadScreenVariant = 'float' | 'tab' | 'none';

export function ReadScreen({ variant = 'float', wide = false }: {
  variant?: ReadScreenVariant;
  /**
   * 가로로 눕힌다. 홈에서만 켠다.
   *
   * 홈에는 짝이 되는 집 버튼이 없어서 아래 줄의 왼쪽 절반이 통째로 빈다. 세로로
   * 쌓인 버튼 하나가 그 옆에 서 있으면 줄이 두꺼운 만큼 비어 보이고, 실제로
   * 벤치에서 그렇게 읽혔다 — "하단 바가 필요없이 두꺼워 보인다".
   *
   * 눕히면 폭을 다 쓰고 높이가 준다. 버튼은 여전히 손가락보다 훨씬 크고, 자리는
   * 그대로 아래 줄이다 — 읽지 못하는 사람이 이 버튼을 찾는 방법이 '늘 거기 있다'
   * 뿐이라 그 규칙은 못 건드린다.
   */
  wide?: boolean;
} = {}) {
  const [playing, setPlaying] = useState(false);
  const cancelled = useRef(false);
  const pathname = usePathname();
  const speechRate = usePreferences((s) => s.speechRate);
  const autoTts = usePreferences((s) => s.autoTts);

  // 저장된 속도를 음성 계층에 밀어 넣는다. 이 컴포넌트가 모든 화면에 있으므로
  // 어디로 들어와도 적용된다 — 설정에서 고른 값이 새로고침에 사라지면 안 된다.
  useEffect(() => { setSpeechRate(speechRate); }, [speechRate]);
  // 말하는 언어도 같은 자리에서 밀어 넣는다.
  const sayLang = usePreferences((s) => s.sayLang);
  useEffect(() => { setSayLang(languageByCode(sayLang).tag); }, [sayLang]);

  /** 읽기를 멈추고 표시를 지운다. 상태 갱신은 재생 루프가 스스로 정리한다. */
  const stop = useCallback(() => {
    cancelled.current = true;
    stopSpeaking();
    document.querySelectorAll('[data-reading]').forEach((el) => el.removeAttribute('data-reading'));
    document.documentElement.removeAttribute('data-hearing');
  }, []);

  // 손가락으로 훑기 시작하면 낭독은 비켜 준다 (components/sc/SweepToHear).
  // 둘이 동시에 말하면 아무것도 안 들리고, 어느 쪽을 끄는지도 알 수 없다.
  useEffect(() => {
    const onSweep = () => { stop(); setPlaying(false); };
    window.addEventListener('sc:sweep', onSweep);
    return () => window.removeEventListener('sc:sweep', onSweep);
  }, [stop]);

  // 화면을 옮기면 읽던 것을 멈춘다.
  // 판정을 읽는 도중에 이동하면 새 화면 위로 이전 화면이 계속 들렸다 — 소리로만
  // 화면을 아는 사람에게는 자기가 어디 있는지 알 수 없게 되는 것과 같다.
  useEffect(() => {
    stop();
    return stop;
  }, [pathname, stop]);

  /*
   * 도착하면 이 화면이 무엇을 묻는지 한 줄 말한다.
   *
   * 스피커를 크게 그리는 것으로는 부족하다. 누르는 것은 **소리가 있다는 것을 이미
   * 아는 사람**의 도구고, 처음 오는 사람에게 스피커는 그냥 그림 하나다. 화면이 먼저
   * 말하면 찾을 것이 없어진다 — 그다음부터 스피커는 "다시 듣기" 로 쓰인다.
   *
   * 한 줄만 읽는다. 전부 읽으면 화면을 옮길 때마다 문단이 흘러나오고, 그러면 사람들은
   * 소리를 꺼 버린다. 그것이 이 앱에서 제일 나쁜 결과다 — 끄고 나면 아무것도 안 들린다.
   *
   * 그려진 뒤에 찾아야 하므로 한 틀 미룬다. 이 컴포넌트는 화면 안에 있어서 대개는
   * 형제가 이미 붙어 있지만, 자료를 기다렸다 그리는 화면(판정·하루 누적)은 늦게 온다.
   */
  useEffect(() => {
    if (!autoTts) return;
    let alive = true;
    const timer = setTimeout(() => {
      const el = document.querySelector<HTMLElement>('[data-ask]');
      const text = el?.getAttribute('data-say');
      if (!alive || !text) return;
      el!.setAttribute('data-reading', '');
      void speak(text).finally(() => el!.removeAttribute('data-reading'));
    }, 350);
    return () => { alive = false; clearTimeout(timer); };
  }, [pathname, autoTts]);

  async function play() {
    if (playing) { stop(); setPlaying(false); return; }

    const targets = [...document.querySelectorAll<HTMLElement>('[data-say]')];
    if (targets.length === 0) return;

    cancelled.current = false;
    setPlaying(true);
    // 읽는 동안에는 소리를 가진 자리를 전부 드러낸다. 지금 어디를 읽는지(data-reading)
    // 만으로는 "다음에 어디를 짚으면 되는지" 를 알 수 없다.
    document.documentElement.setAttribute('data-hearing', '');

    try {
      for (const el of targets) {
        if (cancelled.current) break;
        const text = el.getAttribute('data-say');
        if (!text) continue;

        // 지금 읽는 자리를 눈으로도 표시하고 화면 안으로 끌어온다. 그림과 소리가
        // 이어져야 "아까 그거" 를 다시 누를 수 있다.
        el.setAttribute('data-reading', '');
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        await speak(text);
        el.removeAttribute('data-reading');
      }
    } finally {
      setPlaying(false);
      document.documentElement.removeAttribute('data-hearing');
    }
  }

  if (variant === 'none') return null;

  if (variant === 'tab') {
    return (
      <button
        onClick={play}
        aria-label={playing ? 'Stop reading' : 'Read this screen aloud'}
        /*
          아래 줄의 짝(Home 버튼)과 같은 모양으로 맞춘다. 전에는 이쪽만 테두리도
          바탕도 없어서, 나란히 놓인 둘이 크기도 모양도 어긋나 보였다.
          채움은 안 준다 — 파란 채움은 이 앱에서 "지금 눌러야 하는 것" 이고,
          듣기는 늘 있는 도구다.
        */
        className={`flex flex-1 items-center justify-center rounded-2xl border-2
                    active:scale-95 transition-transform
                    ${wide ? 'flex-row gap-2 py-3' : 'flex-col gap-1 py-2'}`}
        style={{
          color: playing ? 'var(--color-caution)' : 'var(--color-sc-muted)',
          borderColor: playing ? 'var(--color-caution)' : 'var(--color-sc-line)',
        }}
      >
        <span className="flex items-center justify-center text-xl leading-none" aria-hidden>{playing ? <StopIcon /> : <SpeakerIcon />}</span>
        <span className="text-[11px] font-semibold">{playing ? 'Stop' : 'Listen'}</span>
      </button>
    );
  }

  return (
    <button
      onClick={play}
      aria-label={playing ? 'Stop reading' : 'Read this screen aloud'}
      /*
        떠 있는 버튼은 크기와 자리를 px 로 박는다.

        rem 이면 글자를 가장 크게 뒀을 때 지름 112px 짜리 원이 화면 아래에서 224px
        위까지 올라와 **아래 내용을 덮는다.** 잠금 화면에서 실제로 그랬다 — 그림
        열쇠의 첫 칸을 가려서, 그 칸을 눌러야 하는 사람이 누를 수가 없었다.

        떠 있는 것은 내용이 아니라 도구다. 글자를 키운 이유는 글을 읽기 위해서지
        도구를 키우기 위해서가 아니다. 56px 은 손끝보다 넉넉하다(WCAG 2.5.8 은 24).
      */
      className="fixed z-40 flex shrink-0 items-center justify-center rounded-full text-white shadow-lg active:scale-95 transition-transform"
      style={{
        background: playing ? 'var(--color-caution)' : 'var(--color-sc-ink)',
        bottom: 96, left: 16, width: 56, height: 56, fontSize: 24,
      }}
    >
      {playing ? <StopIcon /> : <SpeakerIcon />}
    </button>
  );
}
