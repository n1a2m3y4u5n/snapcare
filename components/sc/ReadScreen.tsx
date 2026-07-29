'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { speak, stopSpeaking, setSpeechRate } from '@/lib/voice';
import { usePreferences } from '@/stores/preferences';

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

export function ReadScreen() {
  const [playing, setPlaying] = useState(false);
  const cancelled = useRef(false);
  const pathname = usePathname();
  const speechRate = usePreferences((s) => s.speechRate);
  const autoTts = usePreferences((s) => s.autoTts);

  // 저장된 속도를 음성 계층에 밀어 넣는다. 이 컴포넌트가 모든 화면에 있으므로
  // 어디로 들어와도 적용된다 — 설정에서 고른 값이 새로고침에 사라지면 안 된다.
  useEffect(() => { setSpeechRate(speechRate); }, [speechRate]);

  /** 읽기를 멈추고 표시를 지운다. 상태 갱신은 재생 루프가 스스로 정리한다. */
  const stop = useCallback(() => {
    cancelled.current = true;
    stopSpeaking();
    document.querySelectorAll('[data-reading]').forEach((el) => el.removeAttribute('data-reading'));
  }, []);

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
    }
  }

  return (
    <button
      onClick={play}
      aria-label={playing ? 'Stop reading' : 'Read this screen aloud'}
      /*
       * 왼쪽 아래로 옮겼다. 줄마다 듣기 버튼이 생기면서 화면 오른쪽이 컨트롤 열이
       * 됐는데, 이 버튼이 그 위에 떠서 실제로 누를 것을 가렸다 — 하루 누적 막대와
       * 최근 목록의 듣기 버튼이 이 검은 원 밑에 깔렸다.
       *
       * 자리가 고정이라는 성질은 그대로다. 읽지 못하는 사람이 버튼을 찾는 방법은
       * '늘 거기 있다' 뿐이고, 어느 구석인지는 그다음 문제다.
       */
      className="fixed bottom-28 left-4 z-40 flex h-14 w-14 items-center justify-center rounded-full text-2xl text-white shadow-lg active:scale-95 transition-transform"
      style={{ background: playing ? 'var(--color-caution)' : 'var(--color-sc-ink)' }}
    >
      {playing ? '⏹' : '🔊'}
    </button>
  );
}
