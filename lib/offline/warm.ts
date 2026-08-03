/**
 * 오프라인 예열.
 *
 * 무엇이 문제였나
 * ---------------
 * 서비스워커는 설치할 때 화면 열한 개를 `cache.add` 로 미리 담는다. 담기는 담긴다 —
 * 캐시를 열어 보면 `/nutrition` 이 200, text/html, 11 KB 로 멀쩡히 들어 있다.
 * 그런데 서버를 죽이고 그 화면으로 가면 안 열린다. 홈만 열린다.
 *
 * 차이는 **한 번 열어 봤는가** 뿐이었다. 미리 담은 것은 HTML 뿐이고, 그 HTML 이
 * 부팅에 쓰는 `/_next/static/` 청크는 담기지 않는다. 청크 주소는 빌드가 정하는
 * 해시라 sw.js 가 손으로 적어 둘 수가 없다. 그래서 한 번도 안 가 본 화면은
 * 캐시에 있으면서도 안 열렸다.
 *
 * 실제로 재서 확인한 것 (2026-08-03, 프로덕션 빌드, 서버를 죽이고):
 *   예열 전 — /home 열림, /nutrition·/settings 안 열림 ("This page couldn't load")
 *   한 번 방문한 뒤 — /nutrition 열림, transferSize 0 (전부 캐시에서)
 *
 * 어떻게 고치나
 * -------------
 * 화면 HTML 을 받아서 **거기 적힌 스크립트 주소를 뽑아** 같이 받아둔다. 청크 이름을
 * 미리 알 필요가 없어진다 — HTML 이 알려준다. Turbopack 은 라우트별 청크 목록을
 * 빌드 산출물로 내주지 않으므로(app-build-manifest.json 이 없다), 이 길 말고는
 * 청크 목록을 얻을 방법이 없다.
 *
 * 왜 서비스워커가 아니라 앱에서 하는가: 설치 시점에 하면 앱을 처음 켜는 순간
 * 1 MB 가 첫 화면과 대역폭을 다툰다. 대상 지역이 정확히 그 대역폭이 없는 곳이다.
 * 화면이 다 뜨고 한가해진 뒤에 뒤에서 받는다.
 */

/** 오프라인에서 열려야 하는 화면. public/sw.js 의 SHELL_URLS 와 짝이다. */
export const WARM_ROUTES = [
  '/',
  '/home',
  '/camera',
  '/scan',
  '/nutrition',
  '/settings',
  '/device',
  // 계정 고르기. 한 대를 여럿이 쓰는 것을 전제한 앱이라, 오프라인에서 사람을 못
  // 바꾸면 그 폰은 한 사람 것이 된다.
  '/login',
  '/profile',
  '/people',
  '/dose',
  '/provider',
  // 지난 날들. 망이 없는 자리에서 되짚는 것이 이 화면의 요점이라
  // 오프라인에서 안 열리면 특히 아프다 — 기록은 이미 폰 안에 있다.
  '/history',
  // 앱을 처음 켰을 때 **가장 먼저** 나오는 화면이다. 여기가 안 열리면
  // 망이 없는 곳에서 앱을 처음 켠 사람은 아무 데도 못 간다.
  '/text-size',
] as const;

/**
 * 화면 말고 따로 받아둘 것.
 *
 * 여기 없는 것: 영양 추정 모델(16 MB)과 OCR 코어(52 MB). 둘 다 cacheFirst 로
 * **쓸 때** 받는다. 예열에 넣으면 앱을 처음 켠 사람이 68 MB 를 물게 된다 —
 * 안 켜지는 것과 구별이 안 된다. 이 둘은 "쓴 적 있으면 오프라인에서도 된다" 로 남는다.
 */
/**
 * 예열이 **실제로 캐시에 닿았는지** 확인할 때 볼 주소.
 *
 * 왜 확인이 필요한가: 배포 직후에는 새 서비스워커가 설치되어도 페이지는 잠깐
 * **옛 워커**가 잡고 있다. 그동안 예열이 돌면 요청은 전부 성공하는데, 옛 워커에는
 * 이 그림을 담는 규칙이 없어서 아무것도 안 남는다. 실제로 배포본에서 그랬다 —
 * 화면 13개는 다 채워졌고(청크 규칙은 옛 워커에도 있었다) 형태소 78장과 표본
 * 그림 7장만 통째로 빠졌는데, 예열은 "실패 0" 으로 끝나고 표시를 남겼다.
 *
 * 표시가 남으면 다시 안 돈다. 표시는 캐시 지문으로 매기고 그 지문은 픽토그램
 * 자산이 바뀔 때만 움직이므로, sw.js 규칙만 고친 배포에서는 **영영** 안 돈다.
 *
 * 그래서 다 받은 뒤 이 주소가 캐시에 남았는지 본다. 이 그림은 새 규칙에서만
 * 담기므로, 남아 있지 않다면 옛 워커 밑에서 돈 것이고 표시를 남기면 안 된다.
 */
export const WARM_PROBE = '/prescription-antibiotic.png';

export const WARM_ASSETS = [
  // 픽토그램 목록. 이게 없으면 오프라인에서 PictogramStrip 이 매번 엔진 합성을
  // 시도하고, 그 요청이 실패하면서 그림이 통째로 사라진다.
  '/pictograms/manifest.json',
  /*
    설치 때 담기로 한 것 중 화면이 아닌 것들. 예열이 다시 한 번 받는 이유는
    **설치가 조용히 실패하기 때문**이다.

    sw.js 의 install 은 `Promise.allSettled` 로 담는다. 하나가 실패해도 설치를
    통째로 접지 않기 위해서인데, 대신 실패한 것은 아무 데도 안 남고 다시 받지도
    않는다. activate 는 다시 담지 않고, 이 주소들은 앱이 평소에 요청하지도 않는다.

    배포 직후 실제로 그랬다. 열다섯 개 중 이 둘만 실패했고(막 뜬 기계라 두 요청이
    밀린 것으로 보인다), 같은 주소를 페이지에서 `cache.add` 하면 멀쩡히 담긴다.
    한 번 놓치면 영구히 없는 것이 문제다. 망이 나쁜 곳에서는 화면도 이렇게
    사라질 수 있고, 그런 곳이 우리 대상 지역이다.

    화면 쪽은 예열이 어차피 다시 받으므로 저절로 메워진다. 나머지를 여기 적는다.
  */
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  // 홈의 "TRY IT" — 사진을 못 찍는 자리에서 앱을 통과시켜 보는 유일한 길
  WARM_PROBE,
  '/label-eu-biscuit.png',
  '/label-peanut-bar.png',
  '/label-us-cereal.png',
  '/prescription-eyedrop.png',
  '/prescription-painkiller.png',
  '/prescription-syrup.png',
];

/**
 * HTML 에서 이 문서가 부팅에 쓰는 정적 자산 주소를 뽑는다.
 *
 * `src="..."` 와 `href="..."` 둘 다 본다 — 스크립트는 src, 스타일시트와
 * modulepreload 는 href 로 온다. 둘 중 하나만 보면 CSS 가 빠져서, 오프라인에서
 * 화면이 뜨긴 뜨는데 스타일이 하나도 없는 상태가 된다.
 */
export function staticAssetsFrom(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/(?:src|href)=["'](\/_next\/static\/[^"']+)["']/g)) {
    out.add(m[1].replace(/&amp;/g, '&'));
  }
  return [...out];
}

export interface WarmReport {
  /** 받아낸 주소 수 */
  ok: number;
  /** 실패한 주소 — 예열은 실패해도 앱이 계속 돌아야 하므로 던지지 않고 센다 */
  failed: string[];
}

export interface WarmOptions {
  /** 주입 가능하게 둔다 — 테스트에서 진짜 망을 타지 않기 위해 */
  fetcher?: (url: string) => Promise<{ ok: boolean; text(): Promise<string> }>;
  /** 동시에 몇 개까지. 느린 망에서 앱 자체 요청을 밀어내지 않을 만큼만 */
  concurrency?: number;
  /** 형태소 이름 목록. 없으면 /glyphs/manifest.json 에서 읽는다 */
  glyphs?: string[];
}

/** 목록을 정해진 수만큼 겹쳐서 훑는다. 실패는 세기만 하고 넘어간다. */
async function pull(
  urls: string[],
  fetcher: NonNullable<WarmOptions['fetcher']>,
  concurrency: number,
  report: WarmReport,
): Promise<void> {
  let i = 0;
  const worker = async () => {
    while (i < urls.length) {
      const url = urls[i++];
      try {
        const res = await fetcher(url);
        if (res.ok) report.ok++;
        else report.failed.push(url);
      } catch {
        report.failed.push(url);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
}

/**
 * 오프라인에서 필요한 것을 한 번에 받아둔다.
 *
 * 서비스워커가 이미 붙어 있다는 전제다 — 여기서 부르는 fetch 는 전부 워커를 지나가고,
 * 워커가 화면은 SHELL 캐시에, 정적 자산은 ASSETS 캐시에 담는다. 이 함수 자체는
 * 캐시를 만지지 않는다.
 */
export async function warmOffline(opts: WarmOptions = {}): Promise<WarmReport> {
  const fetcher = opts.fetcher ?? ((url: string) => fetch(url, { credentials: 'same-origin' }));
  const concurrency = opts.concurrency ?? 4;
  const report: WarmReport = { ok: 0, failed: [] };

  // 1) 화면 HTML — 받으면서 각 화면이 무엇을 쓰는지 알아낸다
  const assets = new Set<string>();
  await pull(
    [...WARM_ROUTES],
    async (url) => {
      const res = await fetcher(url);
      if (res.ok) for (const a of staticAssetsFrom(await res.text())) assets.add(a);
      return res;
    },
    concurrency,
    report,
  );

  // 2) 그 화면들이 부팅에 쓰는 청크와 스타일시트
  await pull([...assets], fetcher, concurrency, report);

  // 3) 형태소 그림. 목록을 못 읽으면 그림만 건너뛴다 — 화면은 이미 받아뒀다.
  let glyphs = opts.glyphs;
  if (!glyphs) {
    try {
      const res = await fetcher('/glyphs/manifest.json');
      glyphs = res.ok ? (JSON.parse(await res.text()) as string[]) : [];
    } catch {
      glyphs = [];
    }
  }
  await pull(glyphs.map((g) => `/glyphs/${g}.png`), fetcher, concurrency, report);

  // 4) 나머지 고정 자산
  await pull(WARM_ASSETS, fetcher, concurrency, report);

  return report;
}
