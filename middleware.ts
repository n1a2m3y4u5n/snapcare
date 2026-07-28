import { NextResponse } from 'next/server';

/**
 * 보안 헤더를 붙인다. 인증 게이트는 여기서 하지 않는다 — 심사 시연 중 서버단에서
 * 막히는 경로를 만들지 않기 위해서다.
 *
 * 왜 CSP 가 필요한가
 * ------------------
 * 기기의 서명 열쇠를 `extractable: false` 로 만들어 두었다(lib/snapcare/deviceKey.ts).
 * 그것이 막는 것은 **저장소를 훔쳐보는 경우**다. 그런데 우리 페이지에 남의 스크립트가
 * 한 줄 끼면, 그 스크립트는 우리 코드와 같은 자격으로 `sign()` 을 부를 수 있다 —
 * 열쇠 값을 가져가지 못해도 **쓸 수는 있다.** 그러면 앞의 설계가 통째로 무의미해진다.
 *
 * 가장 값이 나가는 한 줄은 `connect-src 'self'` 다. 스크립트가 끼어들더라도 자료를
 * **바깥으로 보낼 수 없다.** 확인해보니 이 앱의 클라이언트는 자기 자신하고만 통신한다 —
 * OpenFoodFacts 와 Anthropic 은 서버에서만 부른다.
 */
function csp(dev: boolean): string {
  return [
    "default-src 'self'",
    // 원래는 nonce + 'strict-dynamic' 으로 잠그려 했다. 배포본으로 빌드해 실제 브라우저에서
    // 눌러 보니 **하이드레이션이 죽었다** — Next 가 자기 부트스트랩 인라인 스크립트에
    // nonce 를 붙이지 않아 전부 차단됐고, 화면은 뜨는데 아무것도 눌리지 않는 껍데기가 됐다.
    // 콘솔에 오류도 안 남아서 눈으로는 멀쩡해 보인다.
    //
    // 그래서 'unsafe-inline' 을 받아들인다. 포기하는 것은 "끼어든 인라인 스크립트를
    // 실행 자체에서 막는 것" 이고, 남는 것은 그 스크립트가 **자료를 밖으로 못 보내는
    // 것**(connect-src)이다. 후자가 우리 위협에서 더 중요하다 — 서명 열쇠를 훔쳐 가도
    // 보낼 곳이 없으면 쓸 데가 없다.
    //
    // 'wasm-unsafe-eval': 영양 추정 모델이 onnxruntime-web(WASM)으로 돈다.
    // 개발 모드는 HMR 이 eval 을 쓰므로 더 풀어 준다 — 배포본에는 붙지 않는다.
    `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ''}`,
    // 화면 전체가 style={{...}} 로 색을 넣는다. 속성 스타일은 이것 없이는 전부 막힌다.
    "style-src 'self' 'unsafe-inline'",
    // 카메라로 찍은 사진이 blob:/data: 로 들어온다.
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // 이 한 줄이 요점 — 스크립트가 끼어도 자료를 밖으로 못 보낸다.
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

export function middleware() {
  const dev = process.env.NODE_ENV !== 'production';

  const res = NextResponse.next();
  res.headers.set('Content-Security-Policy', csp(dev));
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'no-referrer');
  // 카메라만 쓴다. 마이크·위치는 쓰지 않으므로 아예 막아 둔다 — 쓰지 않는 권한을
  // 닫아 두는 것은 공짜이고, 나중에 쓰게 되면 그때 열면 된다.
  res.headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  if (!dev) {
    res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
