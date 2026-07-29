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
  const all = useMemo(() => splitDslLines(source), [source]);
  // \?개념 은 "이 개념의 그림이 우리에게 없다" 는 표시다. 엔진은 이 줄을 파싱할 수
  // 없으므로 갈라서 따로 다룬다.
  const lines = useMemo(() => all.filter((l) => !l.startsWith('\\?')), [all]);
  const missing = useMemo(
    () => all.filter((l) => l.startsWith('\\?')).map((l) => l.slice(2)),
    [all],
  );
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
      } catch (err) {
        // 픽토그램은 이 앱의 핵심 기여다. 조용히 사라지면 "원래 없는 기능" 처럼 보인다.
        console.error('[pictogram] 합성 실패:', err);
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

  if (failed && missing.length === 0) return null;
  if (lines.length === 0 && missing.length === 0) return null;

  return (
    <div className="mt-1">
      <p className="text-[11px] font-bold tracking-wide" style={{ color: 'var(--color-sc-muted)' }}>
        PICTOGRAM GUIDE
      </p>
      <div className="mt-2 flex gap-3 overflow-x-auto pb-1">
        {missing.map((c) => (
          <MadeGlyph key={c} concept={c} />
        ))}
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

/**
 * DSL 한 줄을 그림 한 장으로. 스트립 밖(대체 기준 등)에서 쓴다.
 *
 * 전에는 여기서 `<img src="/api/pictogram?label=…">` 를 썼는데, 그 라우트의 GET 은
 * 캐시 현황 JSON 을 돌려주지 PNG 를 주지 않는다. 이미지가 한 번도 뜬 적이 없고
 * 요청은 200 이라 콘솔에도 아무 것도 안 남았다. 스트립과 같은 경로(캐시 → POST)를
 * 쓰면 이런 두 번째 경로 자체가 없어진다.
 */
export function OneGlyph({ line, className }: { line: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const manifest = await loadManifest();
      if (manifest && manifest[dslKey(line)] !== undefined) {
        if (alive) setSrc(cachedPictogramPath(line));
        return;
      }
      try {
        const res = await fetch('/api/pictogram', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ source: line }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const { images } = (await res.json()) as { images: string[] };
        if (alive && images[0]) setSrc(images[0]);
      } catch (err) {
        console.error('[pictogram] 한 장 합성 실패:', err);
      }
    })();
    return () => { alive = false; };
  }, [line]);

  // 못 그리면 자리도 만들지 않는다 — 옆의 문장이 이미 같은 말을 하고 있다.
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" aria-hidden className={className} />;
}

/**
 * 우리 세트에 없는 개념 한 칸.
 *
 * 온라인 판은 서버에 만들어 달라고 하고, 만드는 동안 이 칸만 비어 있다 — 판정과
 * 음성은 이미 화면에 있다. 기다림이 그림 한 장으로 갇히므로 1분이 걸려도 사용자는
 * 판정을 기다리지 않는다.
 *
 * 만들지 못하면 "맞는 그림이 없다" 를 그대로 보여준다. 온디바이스 판이 늘 보게 될
 * 화면이기도 하다. 비슷한 그림을 대신 보여주지 않는 것이 요점이다 — 읽지 못하는
 * 사람에게 틀린 그림은 그림이 없는 것보다 나쁘다. 없으면 음성으로 넘어가지만, 틀린
 * 그림은 자신 있게 틀리고 사용자는 그것이 틀렸다는 것을 알 방법이 없다.
 */
function MadeGlyph({ concept }: { concept: string }) {
  const [state, setState] = useState<{ url?: string; done: boolean }>({ done: false });

  useEffect(() => {
    let alive = true;
    fetch('/api/glyph', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ concept }),
    })
      .then((r) => r.json())
      .then((r: { ok: boolean; url?: string }) => {
        if (alive) setState({ url: r.ok ? r.url : undefined, done: true });
      })
      .catch(() => alive && setState({ done: true }));
    return () => { alive = false; };
  }, [concept]);

  if (state.url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={state.url} alt={concept}
      className="h-24 w-24 shrink-0 rounded-2xl bg-white p-2 shadow-sm" />;
  }
  if (!state.done) {
    return <div className="h-24 w-24 shrink-0 animate-pulse rounded-2xl bg-white shadow-sm" />;
  }
  return (
    <div className="flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-1
                    rounded-2xl border-2 border-dashed bg-white p-2 text-center"
         style={{ borderColor: 'var(--color-sc-line)' }}>
      <span className="text-2xl" aria-hidden>—</span>
      <span className="text-[10px] leading-tight" style={{ color: 'var(--color-sc-muted)' }}>
        No picture for this
      </span>
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
