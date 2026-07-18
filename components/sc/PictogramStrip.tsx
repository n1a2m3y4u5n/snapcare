'use client';

import { useEffect, useState } from 'react';

/**
 * SIGIL 픽토그램 시퀀스 — DSL을 /api/pictogram(자체 엔진)에 보내 PNG로 렌더.
 * 엔진 실패 시 조용히 숨긴다 (음성·텍스트 채널이 폴백).
 */
export function PictogramStrip({ source }: { source: string }) {
  const [images, setImages] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
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
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [source]);

  if (failed) return null;

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
