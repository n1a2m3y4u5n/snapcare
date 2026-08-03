import { NextResponse } from 'next/server';

import { keysFrom } from '@/lib/push/vapid';

/**
 * 구독할 때 브라우저가 요구하는 공개키.
 *
 * 왜 번들에 박지 않고 받아 가는가: 공개키 자체는 숨길 것이 아니지만(이름 그대로다),
 * 개인키와 **짝이 맞아야** 한다. 둘을 따로 두면 어긋날 수 있고, 어긋난 상태는
 * 아주 고약하다 — 구독은 성공하고 알림만 조용히 401 로 실패한다. 사용자는 알림을
 * 켰다고 믿고, 우리는 로그를 보기 전까지 모른다.
 *
 * 개인키 하나에서 뽑아 내려보내면 어긋날 자리가 없어진다. 그리고 키를 갈아도
 * 앱을 다시 빌드할 필요가 없다.
 */
export async function GET(): Promise<NextResponse> {
  const pem = process.env.SNAPCARE_VAPID_PRIVATE_KEY;
  if (!pem) {
    // 키가 없는 배포도 있다(로컬 개발, 포크). 알림만 없고 나머지는 그대로 돈다.
    return NextResponse.json({ error: 'push not configured' }, { status: 503 });
  }
  try {
    return NextResponse.json({ publicKey: keysFrom(pem).publicKey });
  } catch {
    return NextResponse.json({ error: 'bad key' }, { status: 500 });
  }
}
