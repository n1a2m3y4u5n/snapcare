import { timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';

import { NextRequest, NextResponse } from 'next/server';

import { isDeviceId } from '@/lib/store/auth';
import { keysFrom } from '@/lib/push/vapid';
import { sendToAll } from '@/lib/push/send';
import { readSubscribers, writeSubscribers } from '@/lib/push/store';

/**
 * 릴레이가 "약통 X 에 무언가 생겼다" 고 알려 오는 자리.
 *
 * 릴레이는 무엇이 생겼는지 **모른다.** 봉투를 못 읽으니까. 여기로 오는 것은 기기
 * id 와 어느 칸이 바뀌었는지뿐이고, 우리도 그 이상을 알아낼 방법이 없다. 그래서
 * 여기서 보내는 알림에는 약 이름이 없다 — 없앤 것이 아니라 애초에 없다.
 *
 * 폰은 알림을 누르고 앱이 열린 뒤에 릴레이에서 봉투를 직접 받아 연다. 그 봉투를
 * 열 수 있는 곳은 폰뿐이다.
 *
 * 인증
 * ----
 * 공유 비밀 한 줄(`SNAPCARE_PUSH_HOOK_TOKEN`). 이 자리는 서명을 쓸 수 없다 —
 * 릴레이에는 폰의 개인키가 없고, 있어서도 안 된다. 비교는 시간 일정하게 한다.
 * 문자열 `===` 로 비교하면 앞에서 몇 글자가 맞는지가 응답 시간에 새어 나온다.
 */
const DATA_DIR = process.env.SNAPCARE_DATA_DIR || join(process.cwd(), '.data');

function tokenMatches(given: string | null): boolean {
  const want = process.env.SNAPCARE_PUSH_HOOK_TOKEN;
  if (!want || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  // 길이가 다르면 timingSafeEqual 이 던진다. 길이 자체는 어차피 숨겨지지 않는다.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get('authorization');
  const given = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!tokenMatches(given)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const pem = process.env.SNAPCARE_VAPID_PRIVATE_KEY;
  if (!pem) return NextResponse.json({ error: 'push not configured' }, { status: 503 });

  let parsed: { deviceId?: unknown; slot?: unknown };
  try {
    parsed = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  if (!isDeviceId(parsed.deviceId)) {
    return NextResponse.json({ error: 'bad device id' }, { status: 400 });
  }

  /*
    보고 칸만 부른다.

    바뀌는 칸은 셋인데, `desired` 는 **폰이 방금 쓴 것**이고 `command` 도 폰이 쓴다.
    그것까지 부르면 사용자가 일정을 저장할 때마다 자기 폰이 자기에게 알림을 보낸다.
    기기가 쓰는 칸은 `reported` 하나뿐이고, 우리가 알리고 싶은 것도 그것뿐이다.
  */
  if (parsed.slot !== 'reported') return NextResponse.json({ ok: true, skipped: true });

  const { subscriptions } = await readSubscribers(DATA_DIR, parsed.deviceId);
  if (subscriptions.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  const { sent, kept, dropped } = await sendToAll(subscriptions, keysFrom(pem));

  // 죽은 구독을 지운다. 안 지우면 폰 하나에 알림 하나를 보내려고 매번 여러 번
  // 실패하는 발송을 하게 되고, 그 실패는 아무 데도 안 보인다.
  if (dropped.length > 0) {
    await writeSubscribers(DATA_DIR, parsed.deviceId, kept, new Date().toISOString());
  }

  return NextResponse.json({ ok: true, sent, dropped: dropped.length });
}
