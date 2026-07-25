'use client';

import { useEffect } from 'react';

/**
 * 서비스워커 등록.
 *
 * dev 에서는 등록하지 않는다 — HMR 과 캐시가 싸워서 옛 번들이 잡히는 일이 생긴다.
 * 오프라인 동작을 확인하려면 프로덕션 빌드(npm run build && npm start)로 봐야 한다.
 */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // 등록 실패는 치명적이지 않다 — 온라인에서는 그대로 동작한다.
    });
  }, []);

  return null;
}
