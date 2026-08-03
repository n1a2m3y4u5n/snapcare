'use client';

import { useEffect } from 'react';
import { warmOffline, WARM_PROBE } from '@/lib/offline/warm';

/** 예열을 마친 캐시 이름을 적어 둔다. 배포가 바뀌면 이름이 바뀌므로 다시 돈다. */
const MARK = 'snapcare-warmed';

/**
 * 현재 서비스워커가 쓰는 캐시 판. 없으면 아직 워커가 없는 것이다.
 *
 * 캐시는 `snapcare-<지문>-shell` 과 `-assets` 둘로 나뉘는데, `caches.keys()` 의
 * 순서는 보장되지 않는다. 이름을 그대로 표시로 쓰면 순서가 뒤집힌 방문마다 표시가
 * 안 맞아 예열이 다시 돈다 — 배포마다 한 번이어야 할 1 MB 가 방문마다 한 번이 된다.
 * 접미사를 떼서 판만 남긴다.
 */
async function cacheVersion(): Promise<string | null> {
  const keys = (await caches.keys())
    .filter((k) => k.startsWith('snapcare-'))
    .map((k) => k.replace(/-(shell|assets)$/, ''))
    .sort();
  return keys[0] ?? null;
}

/**
 * 서비스워커가 이 페이지를 잡을 때까지 기다린다.
 *
 * 앱을 처음 켠 순간에는 워커가 방금 등록됐을 뿐이라 `controller` 가 아직 비어 있다.
 * 그 자리에서 포기하면 **첫 방문에는 아무것도 예열되지 않는다** — 앱을 한 번 켜고
 * 망 없는 데로 들고 간 사람에게는 예열이 없는 것과 같다. 실제로 그랬다: 첫 방문 뒤
 * 캐시에 화면 열다섯 개만 있고 청크는 하나도 없었다.
 *
 * 워커는 activate 에서 clients.claim() 을 부르므로 곧 잡는다. 그 신호를 기다린다.
 */
function whenControlled(timeout = 10000): Promise<boolean> {
  if (navigator.serviceWorker.controller) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = (v: boolean) => {
      navigator.serviceWorker.removeEventListener('controllerchange', onChange);
      clearTimeout(timer);
      resolve(v);
    };
    const onChange = () => done(true);
    const timer = setTimeout(() => done(!!navigator.serviceWorker.controller), timeout);
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
  });
}

/** 화면이 다 뜨고 한가해질 때까지 기다린다. requestIdleCallback 이 없는 곳(사파리)도 있다. */
function whenIdle(fn: () => void): void {
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void })
    .requestIdleCallback;
  if (ric) ric(fn, { timeout: 8000 });
  else setTimeout(fn, 3000);
}

/**
 * 오프라인 예열을 뒤에서 한 번 돌린다.
 *
 * 왜 필요한지는 lib/offline/warm.ts 맨 위에 적어 두었다 — 요약하면, 미리 담아 둔
 * 화면이라도 그 화면의 청크가 없으면 오프라인에서 안 열리고, 청크 주소는 HTML 을
 * 받아 봐야 알 수 있다.
 *
 * 언제 안 도는가:
 *  - 개발 모드 (서비스워커 자체를 안 붙인다)
 *  - 서비스워커가 아직 안 붙었을 때 — 다음 방문에 돈다
 *  - 데이터 절약 모드 — 사용자가 아끼겠다고 켠 것을 1 MB 로 뒤집지 않는다
 *  - 이미 이 배포로 예열했을 때
 */
export function WarmOffline() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator) || !('caches' in window)) return;

    const conn = (navigator as unknown as { connection?: { saveData?: boolean } }).connection;
    if (conn?.saveData) return;

    let cancelled = false;

    whenIdle(() => {
      void (async () => {
        try {
          await navigator.serviceWorker.ready;
          if (cancelled || !(await whenControlled())) return;
          if (cancelled) return;

          const version = await cacheVersion();
          if (cancelled || !version) return;
          if (localStorage.getItem(MARK) === version) return;

          const report = await warmOffline();
          if (cancelled) return;

          /*
            "다 받았다" 로는 부족하다. 받은 것이 **캐시에 남았는지**까지 본다.

            배포 직후에는 새 워커가 설치돼도 이 페이지는 잠깐 옛 워커가 잡고 있고,
            그 밑에서 예열이 돌면 요청은 전부 성공하면서 새 규칙이 담을 것만 조용히
            빠진다. 실제로 배포본에서 그랬다: 화면 13개는 다 채워졌고 형태소 78장과
            표본 그림 7장만 없는 채로 "실패 0" 이 나왔다. 표시를 남겼으면 그 상태로
            굳는다 — 표시는 캐시 지문으로 매기는데 그 지문은 sw.js 규칙만 바뀐
            배포에서는 움직이지 않으므로, 다음에도 그 다음에도 안 돈다.

            표시를 안 남기면 다음 방문에 다시 돈다. 그때는 새 워커가 잡고 있다.
          */
          const landed = await caches.match(WARM_PROBE);
          if (cancelled) return;
          if (report.ok > 0 && report.failed.length === 0 && landed) {
            localStorage.setItem(MARK, version);
          }
        } catch {
          // 예열은 있으면 좋은 것이다. 실패해도 앱은 그대로 돈다.
        }
      })();
    });

    return () => { cancelled = true; };
  }, []);

  return null;
}
