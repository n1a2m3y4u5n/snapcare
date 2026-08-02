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
/**
 * 릴레이 한 곳. 여기 적힌 출처로만 나갈 수 있다.
 *
 * `connect-src 'self'` 는 이 파일에서 가장 값이 나가는 한 줄인데, 클라우드 경로가
 * 들어오면서 처음으로 예외가 필요해졌다 — 디스펜서는 남의 집 공유기 뒤에 있어서
 * 사서함을 거치지 않으면 닿을 방법이 없다.
 *
 * 그래도 성질은 거의 그대로 남는다. 여는 것은 **주소 하나**이고, 그 한 곳은 암호문만
 * 보관하며 열지 못한다(상자 열쇠를 주지 않는다). 끼어든 스크립트가 자료를 보낼 수 있는
 * 곳이 '아무 데나' 에서 '읽지 못하는 사서함 하나' 로 늘어난 것이다.
 *
 * 주소 전체가 아니라 **출처만** 넣는다. 경로까지 적으면 CSP 가 무시한다.
 */
function relayOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SNAPCARE_RELAY;
  if (!configured) return '';
  try {
    return new URL(configured).origin;
  } catch {
    // 설정이 잘못됐다고 앱이 못 뜨면 안 된다 — 그 경우 클라우드 경로만 막힌다.
    return '';
  }
}

function csp(dev: boolean): string {
  // 개발에서는 데모 릴레이(`make -C pill_dispenser/cloud_relay demo`)도 함께 연다.
  const relays = [relayOrigin(), dev ? 'http://localhost:8088' : '']
    .filter(Boolean)
    .join(' ');

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
    // 예외는 릴레이 하나뿐이고, 그 이유는 relayOrigin() 에 적었다.
    `connect-src 'self'${relays ? ` ${relays}` : ''}`,
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // 개발에서는 붙이지 않는다. 로컬 릴레이가 http 라 이 지시자가 https 로 올려
    // 버리면 붙을 수 없는 주소가 되고, 증상은 원인을 짐작하기 어려운 "Failed to
    // fetch" 하나뿐이다. 배포는 전부 https 라 잃는 것이 없다.
    ...(dev ? [] : ['upgrade-insecure-requests']),
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
