import { NextRequest, NextResponse } from 'next/server';

/**
 * 예선 단계 — 인증 없이 전체 경로 개방.
 * API 경로·정적 자산만 그대로 통과시키고 나머지는 모두 허용한다.
 */
export function middleware(_req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
