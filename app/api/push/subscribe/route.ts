import { join } from 'node:path';

import { NextRequest, NextResponse } from 'next/server';

import { verifySigned, isDeviceId } from '@/lib/store/auth';
import { readSubscribers, writeSubscribers, withSubscription, isSubscription } from '@/lib/push/store';

/**
 * 폰이 "약통 X 의 알림을 이 주소로 보내 주세요" 라고 등록하는 자리.
 *
 * 인증은 저장소와 같은 문을 쓴다 — 기기가 꺼낼 수 없는 개인키로 서명한 요청만 받는다.
 * 이게 없으면 약통 id 를 아는 사람이 남의 약통에 자기 주소를 끼워 넣어, 그 집이
 * 약을 먹을 때마다 알림을 받을 수 있다. 약통 id 는 청구 코드에서 나오고 청구 코드는
 * 상자에 인쇄돼 있으므로, 그 상자를 한 번 본 사람이면 된다.
 *
 * 서명을 확인해도 **누가 어느 약통에 붙을지** 까지는 못 막는다. 그건 짝짓기가
 * 정하는 것이고, 짝짓기는 상자를 손에 쥐어야 한다. 여기서 막는 것은 "상자를 본 적
 * 있는 사람" 과 "상자를 쥔 사람" 의 차이다.
 */
const DATA_DIR = process.env.SNAPCARE_DATA_DIR || join(process.cwd(), '.data');

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.text();
  const household = await verifySigned(
    { device: req.headers.get('x-device'), sig: req.headers.get('x-sig'), ts: req.headers.get('x-ts') },
    'POST', body,
  );
  if (!household) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let parsed: { deviceId?: unknown; subscription?: unknown };
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }

  if (!isDeviceId(parsed.deviceId)) {
    return NextResponse.json({ error: 'bad device id' }, { status: 400 });
  }
  if (!isSubscription(parsed.subscription)) {
    return NextResponse.json({ error: 'bad subscription' }, { status: 400 });
  }

  const current = await readSubscribers(DATA_DIR, parsed.deviceId);
  await writeSubscribers(
    DATA_DIR,
    parsed.deviceId,
    withSubscription(current.subscriptions, parsed.subscription),
    new Date().toISOString(),
  );

  return NextResponse.json({ ok: true });
}

/** 알림을 끈다. 브라우저에서 구독을 지우는 것과 짝이다. */
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const body = await req.text();
  const household = await verifySigned(
    { device: req.headers.get('x-device'), sig: req.headers.get('x-sig'), ts: req.headers.get('x-ts') },
    'DELETE', body,
  );
  if (!household) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let parsed: { deviceId?: unknown; endpoint?: unknown };
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  if (!isDeviceId(parsed.deviceId) || typeof parsed.endpoint !== 'string') {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  const current = await readSubscribers(DATA_DIR, parsed.deviceId);
  await writeSubscribers(
    DATA_DIR,
    parsed.deviceId,
    current.subscriptions.filter((s) => s.endpoint !== parsed.endpoint),
    new Date().toISOString(),
  );
  return NextResponse.json({ ok: true });
}
