'use client';

import { publicKey, sign } from '@/lib/snapcare/deviceKey';

/**
 * 폰 쪽 알림 등록.
 *
 * 무엇을 고치는가: 지금 알림은 `useDoseAlert` 가 긴 폴링 결과를 보고 띄운다. 즉
 * **탭이 살아 있을 때만** 온다. 앱을 닫으면 폴링이 없고, 약통이 약을 내밀어도
 * 폰은 조용하다. 유예가 지나면 트레이는 닫힌 채 '놓침' 이 기록된다.
 *
 * 배출 알림은 앱을 열어 둔 사람에게만 닿는 기능이 아니어야 한다. 그게 이 파일이
 * 있는 이유다.
 *
 * 왜 여기서 권한을 먼저 묻지 않는가: 브라우저는 **사용자가 무언가를 누른 직후**가
 * 아니면 권한 창을 무시하거나 아예 영구 거절로 처리한다. 그래서 이 함수는 반드시
 * 버튼 누름에서 불러야 하고, 스스로 앱 시작에 끼어들지 않는다.
 */

export type SubscribeResult =
  | { state: 'subscribed' }
  /** 사용자가 거절했다. 다시 물어도 창이 안 뜬다 */
  | { state: 'denied' }
  /** 이 브라우저가 못 한다 (iOS 사파리는 홈 화면에 설치해야 된다) */
  | { state: 'unsupported' }
  /** 이 배포에 키가 없다. 알림만 없고 나머지는 그대로 돈다 */
  | { state: 'unconfigured' }
  | { state: 'failed'; why: string };

export function pushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

/**
 * base64url 공개키 → 브라우저가 요구하는 바이트 배열.
 *
 * `Uint8Array<ArrayBuffer>` 로 못박는다. 기본 `Uint8Array` 는 SharedArrayBuffer 위에도
 * 앉을 수 있는데 `applicationServerKey` 는 그걸 안 받는다.
 */
export function decodeKey(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/')
    + '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function signedHeaders(method: string, body: string): Promise<HeadersInit> {
  const ts = Date.now();
  return {
    'content-type': 'application/json',
    'x-device': await publicKey(),
    'x-ts': String(ts),
    'x-sig': await sign(method, body, ts),
  };
}

/**
 * 이 약통의 알림을 켠다. **사용자가 버튼을 누른 자리에서** 불러야 한다.
 */
export async function subscribeToDevice(deviceId: string): Promise<SubscribeResult> {
  if (!pushSupported()) return { state: 'unsupported' };

  let publicVapidKey: string;
  try {
    const res = await fetch('/api/push/key');
    if (res.status === 503) return { state: 'unconfigured' };
    if (!res.ok) return { state: 'failed', why: `key ${res.status}` };
    publicVapidKey = (await res.json()).publicKey;
  } catch {
    return { state: 'failed', why: 'key fetch' };
  }

  if (Notification.permission === 'denied') return { state: 'denied' };
  if (Notification.permission !== 'granted') {
    if ((await Notification.requestPermission()) !== 'granted') return { state: 'denied' };
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    /*
      이미 구독이 있으면 그대로 쓴다.

      unsubscribe 후 다시 subscribe 하면 주소가 바뀌고, 서버에는 옛 주소가 남는다.
      그 옛 주소는 죽은 것으로 걸러지기 전까지 실패하는 발송을 하나씩 더 만든다.
      브라우저가 같은 것을 돌려주게 두는 편이 낫다.
    */
    const subscription = await reg.pushManager.getSubscription()
      ?? await reg.pushManager.subscribe({
        // 조용한 푸시는 못 쓴다. 브라우저가 요구하는 값이고, 우리도 받을 때마다
        // 반드시 알림을 띄우므로 사실대로다.
        userVisibleOnly: true,
        applicationServerKey: decodeKey(publicVapidKey),
      });

    const body = JSON.stringify({ deviceId, subscription: subscription.toJSON() });
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: await signedHeaders('POST', body),
      body,
    });
    if (!res.ok) return { state: 'failed', why: `subscribe ${res.status}` };
    return { state: 'subscribed' };
  } catch (err) {
    return { state: 'failed', why: String(err).slice(0, 80) };
  }
}

/** 알림을 끈다. 브라우저 구독과 서버 기록을 함께 지운다. */
export async function unsubscribeFromDevice(deviceId: string): Promise<void> {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();
    if (!subscription) return;

    // 서버를 먼저 지운다. 브라우저 구독을 먼저 지우면 주소를 잃어서 서버 기록을
    // 가리킬 수가 없고, 그 기록은 영영 안 지워진 채 실패하는 발송을 만든다.
    const body = JSON.stringify({ deviceId, endpoint: subscription.endpoint });
    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: await signedHeaders('DELETE', body),
      body,
    }).catch(() => { /* 서버가 안 되면 다음에 다시 */ });

    await subscription.unsubscribe();
  } catch {
    // 알림 끄기가 실패해도 앱은 그대로 돈다
  }
}

/** 이 브라우저가 지금 구독 중인지. 화면의 스위치가 이걸 본다. */
export async function isSubscribed(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    return (await reg.pushManager.getSubscription()) !== null;
  } catch {
    return false;
  }
}
