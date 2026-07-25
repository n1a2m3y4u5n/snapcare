'use client';

import { useEffect, useMemo, useState } from 'react';
import { splitDslLines, dslKey, cachedPictogramPath, type PictogramManifest } from '@/lib/snapcare/dsl';

/**
 * SIGIL 픽토그램 시퀀스.
 *
 * 해석 순서:
 *  1) public/pictograms/manifest.json 에 모든 줄이 있으면 → 정적 PNG로 즉시 렌더.
 *     python·API·네트워크 왕복이 전혀 없다. 정적 변환 전시본에서도 그대로 동작한다.
 *  2) 하나라도 빠지면 → /api/pictogram 에 합성을 요청한다 (결과는 서버가 캐시에 write-through).
 *  3) 그마저 실패하면 → 매니페스트로 채운 줄만이라도 보여준다.
 *     엔진 장애로 최대 차별점이 통째로 사라지지 않게 하는 것이 이 컴포넌트의 요점이다.
 */
export function PictogramStrip({ source }: { source: string }) {
  const lines = useMemo(() => splitDslLines(source), [source]);
  const [images, setImages] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (lines.length === 0) return;
    let alive = true;

    (async () => {
      // 1) 정적 캐시로 전부 해결되는지 확인
      const manifest = await loadManifest();
      const fromCache = lines.map((l) =>
        manifest && manifest[dslKey(l)] !== undefined ? cachedPictogramPath(l) : null,
      );
      if (fromCache.every((c): c is string => c !== null)) {
        if (alive) setImages(fromCache);
        return;
      }

      // 2) 캐시 미스가 있으면 엔진에 합성 요청
      try {
        const res = await fetch('/api/pictogram', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ source }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const { images } = (await res.json()) as { images: string[] };
        if (alive) setImages(images);
      } catch {
        // 3) 부분 폴백 — 캐시에 있는 줄만
        const partial = fromCache.filter((c): c is string => c !== null);
        if (!alive) return;
        if (partial.length > 0) setImages(partial);
        else setFailed(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, [lines, source]);

  if (failed || lines.length === 0) return null;

  return (
    <div className="mt-1">
      <p className="text-[11px] font-bold tracking-wide" style={{ color: 'var(--color-sc-muted)' }}>
        PICTOGRAM GUIDE
      </p>
      <div className="mt-2 flex gap-3 overflow-x-auto pb-1">
        {images
          ? images.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={src}
                alt={`pictogram ${i + 1}`}
                className="h-24 w-24 shrink-0 rounded-2xl bg-white p-2 shadow-sm"
              />
            ))
          : [0, 1, 2].map((i) => (
              <div key={i} className="h-24 w-24 shrink-0 animate-pulse rounded-2xl bg-white shadow-sm" />
            ))}
      </div>
    </div>
  );
}

/** 매니페스트는 세션당 한 번만 받는다 (없으면 null — 캐시 없음으로 취급). */
let manifestPromise: Promise<PictogramManifest | null> | null = null;
function loadManifest(): Promise<PictogramManifest | null> {
  manifestPromise ??= fetch('/pictograms/manifest.json')
    .then((r) => (r.ok ? (r.json() as Promise<PictogramManifest>) : null))
    .catch(() => null);
  return manifestPromise;
}
