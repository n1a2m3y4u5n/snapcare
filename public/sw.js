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

const VERSION = 'snapcare-7802af68e75cce2d';
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
  '/manifest.webmanifest',
  '/icons/icon-192.png',
];

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

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 판정 API 는 가로채지 않는다. 오래된 답을 주는 것보다 실패하는 편이 낫고,
  // 오프라인 대비는 앱 코드(캐시된 프로필·픽토그램)가 이미 하고 있다.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
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
    url.pathname.startsWith('/icons/')
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
