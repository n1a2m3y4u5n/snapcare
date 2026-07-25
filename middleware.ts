import { NextResponse } from 'next/server';

/**
 * 인증 게이트는 클라이언트(진입 게이트 + 픽처키 로그인)가 담당한다.
 * 미들웨어는 통과만 시킨다 — 심사 시연 중 서버단에서 막히는 경로를 만들지 않기 위해서다.
 */
export function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
