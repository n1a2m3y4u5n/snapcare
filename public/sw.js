/**
 * SnapCare service worker.
 *
 * 이 앱은 "인터넷이 불안정한 곳에서 동작한다"를 전제로 서 있는데, 서비스워커가 없으면
 * 비행기 모드에서 새로고침하는 순간 앱 자체가 뜨지 않는다. 캐시해둔 픽토그램과 제품
 * 데이터가 있어도 셸이 없으면 소용이 없다.
 *
 * 자원 성격에 따라 전략을 나눈다:
 *  - 화면 이동   : 네트워크 우선, 실패하면 캐시 (배포 직후 새 버전을 받되, 끊기면 계속 동작)
 *  - 정적 자산   : 캐시 우선 (해시가 붙어 있어 내용이 바뀌면 URL도 바뀐다)
 *  - 생성물 캐시 : 캐시 우선 (픽토그램 PNG, 제품 영양 JSON — 한 번 받으면 안 변한다)
 *  - API        : 통과 (판정은 신선해야 하고, 오프라인 폴백은 앱 코드가 직접 처리한다)
 */

const VERSION = 'snapcare-5e5a514a51ff4d92';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;

/** 오프라인에서도 반드시 열려야 하는 화면들 */
const SHELL_URLS = [
  '/',
  '/home',
  '/camera',
  '/scan',
  '/nutrition',
  '/settings',
  '/login',
  '/onboarding',
  // 종이 폼시트 판독이 브라우저로 들어오면서 이 화면이 오프라인 목록에 들어왔다.
  // 의사가 채워 준 종이를 읽는 것은 망이 없는 진료소에서 가장 쓰고 싶은 기능인데,
  // 정작 그 화면이 안 열리면 판독기를 기기 안에 넣어 둔 의미가 없다.
  '/device',
  // 한 대를 여럿이 쓰는 것을 전제한 앱이다. 오프라인에서 사람을 못 바꾸면 그 폰은
  // 한 사람 것이 된다.
  '/profile',
  '/people',
  // 알림을 누르거나 홈의 약 카드를 누르면 오는 화면. 약을 먹었다고 기록하는 자리라
  // 망이 없다고 못 쓰면 기록이 통째로 빈다.
  '/dose',
  '/provider',
  '/history',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
];

/**
 * 최상위에 놓인 그림들 — 접두사로 묶이지 않아 규칙에서 통째로 빠져 있었다.
 *
 * 오프라인에서 홈을 열면 "TRY IT" 칸 세 개가 전부 깨진 그림으로 떴다. 앱을 처음 켠
 * 사람이 카메라를 들이대기 전에 눌러 보는 자리이자, 심사자가 제일 먼저 누르는 자리다.
 */
const STATIC_FILES = new Set([
  '/label-eu-biscuit.png',
  '/label-peanut-bar.png',
  '/label-us-cereal.png',
  '/prescription-antibiotic.png',
  '/prescription-eyedrop.png',
  '/prescription-painkiller.png',
  '/prescription-syrup.png',
  '/demo-form-sheet.png',
  '/device-code-demo.png',
]);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) =>
      // 하나가 실패해도 나머지는 담는다 — 설치가 통째로 실패하면 오프라인이 아예 안 된다.
      Promise.allSettled(SHELL_URLS.map((url) => cache.add(url))),
    ).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

/**
 * 알림을 누르면 앱으로 데려온다.
 *
 * 이것이 없으면 알림은 눌러도 아무 일이 없거나 새 탭이 하나 더 열린다. 알림이 하는
 * 말은 "약이 나왔으니 버튼을 누르세요" 인데, 눌렀더니 그 버튼이 없는 화면이 뜨면
 * 부른 의미가 없다.
 *
 * 이미 열려 있는 창이 있으면 그 창을 앞으로 가져온다 — 새로 열면 긴 폴링이 하나 더
 * 돌고, 사용자는 같은 앱 두 개를 갖게 된다.
 */
/**
 * 앱이 완전히 닫혀 있을 때 서버가 깨우는 자리.
 *
 * 여기까지 오는 신호에는 **내용이 없다.** 약 이름도 시각도 안 실려 있다 — 실으려면
 * 구글·애플·모질라의 푸시 서비스를 지나가야 하고, 그 길로 약 이름을 내보내지 않기로
 * 했다. 오는 것은 "이 약통에 무언가 생겼다" 하나뿐이다.
 *
 * 그래서 문구가 일부러 뭉뚱그려져 있다. 이건 아쉬운 타협이 아니라 이 앱의 약속이
 * 지켜지는 모습이다. 무엇인지는 눌러서 앱을 열면 보인다 — 봉투를 열 수 있는 곳은
 * 폰뿐이고, 앱은 그때 릴레이에서 직접 받아 온다.
 *
 * showNotification 을 부르지 않으면 브라우저가 대신 "이 사이트가 백그라운드에서
 * 갱신되었습니다" 같은 문구를 띄운다. 그건 우리 문구가 아니고 번역도 안 된다.
 */
self.addEventListener('push', (event) => {
  event.waitUntil(
    self.registration.showNotification('Your medicine is ready', {
      body: 'Open SnapCare to see what to take.',
      icon: '/icons/icon-192.png',
      // 고정 태그라 새 신호가 앞의 것을 갈아치운다. 서랍에 옛 알림이 쌓이면
      // 그중 어느 것이 지금 것인지 알 수 없고, 지난 알림을 눌러 봐야 그 약은
      // 이미 유예가 지났다.
      tag: 'snapcare-dose-ready',
      renotify: true,
      // 저절로 사라지지 않는다. 약 알림은 놓치면 그걸로 끝이다.
      requireInteraction: true,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.focus();
        // 홈이 배출 카드를 맨 위에 그린다. 어디에 있었든 그 화면으로 보낸다.
        if ('navigate' in client) await client.navigate('/home');
        return;
      }
    }
    await self.clients.openWindow('/home');
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 판정 API 는 가로채지 않는다. 오래된 답을 주는 것보다 실패하는 편이 낫고,
  // 오프라인 대비는 앱 코드(캐시된 프로필·픽토그램)가 이미 하고 있다.
  if (url.pathname.startsWith('/api/')) return;

  /*
    화면 이동, 그리고 **화면 주소를 그냥 fetch 하는 경우**도 같이 받는다.

    뒤엣것이 없어서 예열(lib/offline/warm.ts)이 반쪽이었다. 예열은 화면 HTML 을
    `fetch('/nutrition')` 로 받는데 그 요청의 mode 는 'navigate' 가 아니라 'cors' 라,
    여기서 안 걸리고 그냥 망으로 나갔다 — 받아 놓고 아무 데도 안 담았다는 뜻이다.
    설치 때 담은 HTML 이 있어서 겉으로는 동작했지만, 목록에 새 화면을 넣는 순간
    그 화면만 조용히 오프라인에서 빠졌을 것이다.

    manifest.webmanifest 도 이 줄이 고친다. 셸에 담겨 있는데 규칙 어디에도 안 걸려서,
    오프라인에서 캐시에 있는 파일을 두고 망으로 나갔다가 실패하고 있었다.
  */
  if (request.mode === 'navigate' || SHELL_URLS.includes(url.pathname)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/pictograms/') ||
    // 영양 추정 모델(16MB)과 그 설정. 앱의 요점이 "인터넷 없이 기기에서 판정한다"
    // 인데 이것이 빠져 있어서, 계산은 기기에서 하면서 정작 모델을 못 받아왔다.
    //
    // 미리 받아두지 않고 처음 쓸 때 받는다(cacheFirst 가 그렇게 동작한다). 첫 화면에서
    // 16MB 를 요구하면 망이 느린 곳에서는 앱이 안 뜬 것처럼 보이는데, 우리 사용자가
    // 있는 곳이 정확히 그런 곳이다. 앱이 안 열리는 것보다 기능 하나가 늦는 편이 낫다.
    url.pathname.startsWith('/models/') ||
    // OCR 의 워커·코어·언어 데이터. 성분표 판독은 이 앱의 핵심 경로다 — 대상 지역의
    // 현지 식품은 어느 제품 데이터베이스에도 없어서, 직접 읽는 것 말고는 길이 없다.
    url.pathname.startsWith('/ocr/') ||
    url.pathname.startsWith('/nutrition/') ||
    // SIGIL 형태소 그림 78장. 홈·프로필·되말하기·추세·온보딩이 전부 이걸 그린다.
    // 규칙에 없어서 오프라인에서는 이 앱의 그림이 한 장도 안 떴다 — 글을 안 읽어도
    // 되게 하는 것이 요점인 앱이 오프라인에서 글자만 남았다.
    url.pathname.startsWith('/glyphs/') ||
    url.pathname.startsWith('/icons/') ||
    STATIC_FILES.has(url.pathname)
  ) {
    event.respondWith(cacheFirst(request));
  }
});

/**
 * Next 응답에는 Vary: RSC, Next-Router-State-Tree, Accept-Encoding 이 붙는다.
 * caches.match 는 기본적으로 Vary 에 적힌 요청 헤더까지 비교하므로, 압축 협상이
 * 조금만 달라도 캐시를 놓친다 — 저장은 돼 있는데 오프라인에서 못 찾는 상태가 된다.
 * 우리는 URL 만으로 찾으면 충분하므로 Vary 를 무시한다.
 */
const MATCH = { ignoreVary: true };

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request, MATCH);
    if (cached) return cached;
    // 방문한 적 없는 경로면 홈으로 — 빈 오류 화면보다 낫다.
    const home = await caches.match('/home', MATCH);
    return home ?? new Response(
      '<!doctype html><meta charset=utf-8><title>SnapCare</title>'
      + '<body style="font:16px system-ui;padding:2rem;text-align:center">Offline — open SnapCare once while connected.</body>',
      { headers: { 'content-type': 'text/html; charset=utf-8' } },
    );
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request, MATCH);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    // 성공한 응답만 담는다. 상태를 안 보고 담았더니 404 가 캐시에 들어앉아, 파일을
    // 나중에 추가해도 계속 404 를 내줬다 — OCR 코어 하나가 없어서 시작한 실패가
    // 파일을 채운 뒤에도 그대로 재현되어, 원인을 엉뚱한 데서 찾게 만들었다.
    if (response.ok) {
      const cache = await caches.open(ASSETS);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return Response.error();
  }
}
