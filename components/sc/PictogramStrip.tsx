'use client';

import { useEffect, useMemo, useState } from 'react';
import { splitDslLines, dslKey, cachedPictogramPath, type PictogramManifest } from '@/lib/snapcare/dsl';
import { dslSentence } from '@/lib/snapcare/dslSpeech';
import { usePreferences } from '@/stores/preferences';
import { Speakable } from './Say';
import { SpeakerIcon, ZoomIcon } from '@/components/icons';

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
  /*
   * 그림과 **그 그림이 나온 줄**을 짝으로 들고 있는다.
   *
   * 그림 주소만 들고 있을 때는, 일부만 캐시에 있는 폴백 경로에서 짝이 어긋났다 —
   * 빠진 것을 걸러내면서 순서만 남으니까 두 번째 그림이 세 번째 줄의 뜻을 말하게
   * 된다. 그림은 멀쩡히 뜨고 소리만 틀리는 실패라 눈으로는 안 보인다.
   */
  const [tiles, setTiles] = useState<{ src: string; line: string }[] | null>(null);
  const [failed, setFailed] = useState(false);
  const big = usePreferences((s) => s.bigPictures);

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
        if (alive) setTiles(fromCache.map((src, i) => ({ src, line: lines[i] })));
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
        // 엔진은 우리가 보낸 소스를 같은 규칙으로 쪼개므로 순서가 줄과 같다.
        if (alive) setTiles(images.map((src, i) => ({ src, line: lines[i] })));
      } catch (err) {
        // 픽토그램은 이 앱의 핵심 기여다. 조용히 사라지면 "원래 없는 기능" 처럼 보인다.
        console.error('[pictogram] 합성 실패:', err);
        // 3) 부분 폴백 — 캐시에 있는 줄만. 짝을 지어 걸러야 소리가 안 밀린다.
        const partial = fromCache
          .map((src, i) => (src === null ? null : { src, line: lines[i] }))
          .filter((t): t is { src: string; line: string } => t !== null);
        if (!alive) return;
        if (partial.length > 0) setTiles(partial);
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
      <div className="flex w-full items-center gap-2">
        <Speakable text="Pictogram guide. Tap a picture to hear what it means."
                   className="flex flex-1 items-center gap-2 text-[11px] font-bold tracking-wide"
                   style={{ color: 'var(--color-sc-muted)' }}>
          <span className="flex-1">PICTOGRAM GUIDE</span>
        </Speakable>
        <BiggerPictures />
      </div>
      {/*
        **줄바꿈이다. 옆으로 밀지 않는다.**

        가로 스크롤이었다. 화면 밖으로 나간 그림은 밀어야 보이는데, **밀어야 한다는
        것을 알려주는 것이 아무것도 없었다** — 잘린 그림 한 장의 가장자리뿐이고, 그건
        글을 읽는 사람에게도 약한 신호다. 이 앱은 그림이 지시의 전부인 사람을 전제로
        하는데, 그 사람이 뒤쪽 그림을 못 보면 "식후에" 나 "운전 금지" 가 통째로 없는
        것과 같다. 그리고 뒤로 갈수록 주의사항이 온다 — 순서가 그렇게 정해져 있다
        (`sigil.ts` — 먹는 법을 먼저, 조심할 것을 나중에).

        줄바꿈은 세로로 길어지지만 이 화면은 어차피 스크롤되고, 세로 스크롤은 사람이
        이미 하고 있는 동작이다. 배운 적 없는 동작을 요구하지 않는 쪽이 맞다.
      */}
      <div className={big
        ? 'mt-2 flex flex-col gap-3'
        : 'mt-2 flex flex-wrap gap-3 pb-1'}>
        {missing.map((c) => (
          <MadeGlyph key={c} concept={c} />
        ))}
        {tiles
          ? tiles.map((t, i) => <Tile key={i} src={t.src} line={t.line} big={big} />)
          : [0, 1, 2].map((i) => (
              <div key={i} className="h-24 w-24 shrink-0 animate-pulse rounded-2xl bg-white shadow-sm" />
            ))}
      </div>
    </div>
  );
}

/**
 * 그림을 크게 보는 스위치.
 *
 * 2026년 8월 조사에서 AAC·특수교육 응답자가 적었다 — "아침·정오·저녁 아이콘의 크기가
 * 문제가 될 수 있으니 가능하면 확대를 제공하라." 96px 짜리 칸에서 해가 뜨는 그림과
 * 지는 그림을 가르려면 이미 그 둘을 아는 사람이어야 한다.
 *
 * 타일마다 돋보기를 달지 않은 이유는 같은 응답자가 함께 적은 것 때문이다. 스위치
 * 스캐닝 사용자는 표적을 하나씩 차례로 훑으므로, 버튼이 그림 수만큼 늘면 마지막
 * 그림에 닿는 데 그만큼이 더 걸린다. 줄 전체에 스위치 하나가 그 반대다.
 *
 * 고른 값은 기기에 남는다. 크게 봐야 하는 사람은 늘 크게 봐야 한다.
 */
function BiggerPictures() {
  const big = usePreferences((s) => s.bigPictures);
  const setBig = usePreferences((s) => s.setBigPictures);
  return (
    <button
      type="button"
      onClick={() => setBig(!big)}
      aria-pressed={big}
      /*
        이름을 못박는다. 접근성 트리에서 이 버튼이 이름 없는 "button" 으로만 잡혔다 —
        스크린리더가 "버튼" 하고 만다. 화면 글자가 'BIGGER'/'BIG' 이라 이름이 붙을
        법하지만, 붙더라도 그 두 낱말은 **무엇이** 커지는지를 말하지 않는다.
        스위치 스캐닝으로 훑는 사람은 그림을 못 보고 이름만 듣는다.
      */
      aria-label={big ? 'Show smaller pictures' : 'Show bigger pictures'}
      // 44px. 이 버튼이 필요한 사람은 정확히 작은 표적을 못 누르는 사람이다.
      className="flex h-11 min-w-11 items-center gap-1 rounded-full px-3 text-[11px] font-bold"
      style={{
        background: big ? 'var(--color-sc-ink)' : 'var(--color-sc-bg)',
        color: big ? '#fff' : 'var(--color-sc-muted)',
      }}
    >
      <span aria-hidden className="flex items-center text-base leading-none"><ZoomIcon /></span>
      <span>{big ? 'BIG' : 'BIGGER'}</span>
    </button>
  );
}

/**
 * 그림 한 장 — 누르면 무엇을 뜻하는지 말한다.
 *
 * 왜 그림에 소리를 붙이는가
 * -------------------------
 * 이 화면에서 그림만 조용했다. 판정도 제품명도 영양 수치도 누르면 읽히는데, 정작
 * 이 앱의 핵심 기여가 말을 하지 않았다.
 *
 * 저문해 환자 대상 약품 픽토그램 연구(Merks 외, 2017)에서 열 개 중 셋에 **거짓
 * 확신** — 못 알아봤는데 알아봤다고 믿는 것 — 이 나타났다. 그림이 없는 것보다 나쁜
 * 실패다. 못 알아본 사람은 물어보기라도 하지만 잘못 알아본 사람은 그대로 행동한다.
 * 같은 연구가 내놓은 처방은 **약사가 뜻을 함께 짚어 주는 것**이었다. 우리 사용자
 * 곁에는 약사가 없으니 앱이 그 자리를 대신한다.
 *
 * 뜻을 모르는 줄은 누를 수 없게 둔다. 아무 말도 안 하는 편이 틀린 말보다 낫다 —
 * 틀린 설명은 바로 그 거짓 확신을 굳혀 준다.
 */
function Tile({ src, line, big = false }: { src: string; line?: string; big?: boolean }) {
  // 고른 언어로 말한다. 그림은 그대로다 — 그림에는 번역이 필요 없고, 그것이 그림을
  // 쓰는 이유이기도 하다.
  const sayLang = usePreferences((s) => s.sayLang);
  const say = line ? dslSentence(line, sayLang) : null;
  /*
    크게 볼 때는 화면 폭을 채우고 한 줄에 하나씩 내려간다.

    옆으로 미는 줄에 큰 그림을 얹지 않는다. 가로 스크롤은 다음 그림이 있다는 것을
    화면 밖에서 알려야 하는데, 큰 그림 하나가 폭을 다 먹으면 그 단서가 사라진다.
    세로로 쌓으면 스크롤이 화면 전체의 것이 되어 따로 배울 것이 없다.
  */
  const size = big ? 'aspect-square w-full max-w-[280px] p-4' : 'h-24 w-24 p-2';
  // eslint-disable-next-line @next/next/no-img-element
  const img = <img src={src} alt={say ?? ''} className={`${size} rounded-2xl bg-white shadow-sm`} />;
  if (!say) return <div className={big ? 'mx-auto' : 'shrink-0'}>{img}</div>;
  return (
    <Speakable text={say} bare
               className={big ? 'relative mx-auto block' : 'relative block shrink-0'}
               label={`Read aloud: ${say}`}>
      {img}
      {/*
        표시를 그림 위 모서리에 얹는다. 옆에 두면 그림 사이가 벌어져서, 한 줄로
        늘어놓았을 때 어느 표시가 어느 그림 것인지가 흐려진다.
      */}
      <span aria-hidden
            className="pointer-events-none absolute bottom-1 right-1 flex h-7 w-7 items-center
                       justify-center rounded-full text-sm"
            style={{ background: 'var(--color-sc-line)' }}>
        <SpeakerIcon />
      </span>
    </Speakable>
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
