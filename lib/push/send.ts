import { authorizationFor, type VapidKeys } from './vapid.ts';

/**
 * 푸시 한 통 보내기, 그리고 **죽은 구독을 알아보기**.
 *
 * 뒤엣것이 앞엣것만큼 중요하다. 구독은 사용자가 앱을 지우거나 알림을 끄면 죽는데,
 * 죽었다는 통보는 오지 않는다. 다음에 보낼 때 404 나 410 이 올 뿐이다. 그것을
 * 지우지 않으면 저장소에 죽은 구독이 쌓이고, 폰 한 대에 알림 하나를 보내려고
 * 매번 여러 번 실패하는 발송을 하게 된다.
 */

export interface PushSubscriptionJSON {
  endpoint: string;
  keys?: { p256dh?: string; auth?: string };
}

export type PushOutcome =
  /** 푸시 서비스가 받았다 */
  | { state: 'sent' }
  /** 이 구독은 죽었다. 지워야 한다 */
  | { state: 'gone'; status: number }
  /** 지금은 안 된다. 구독은 살아 있다 */
  | { state: 'failed'; status: number };

export interface SendOptions {
  /** 시험에서 갈아끼운다 */
  fetcher?: typeof fetch;
  now?: number;
  /** 푸시 서비스가 폰이 꺼져 있을 때 들고 있어 줄 시간(초) */
  ttl?: number;
}

/**
 * 본문 없는 푸시.
 *
 * 무엇을 먹는 약인지는 싣지 않는다. 실으려면 RFC 8291 로 암호화해야 하고 그러면
 * 구현이 몇 배가 되는데, **그보다 중요한 것은 실을 이유가 없다는 것이다.** 폰은
 * 깨어나면 릴레이에서 봉투를 직접 받아 열 수 있고, 그 봉투를 열 수 있는 곳은
 * 폰뿐이다. 푸시 서비스(구글·애플·모질라)를 지나가는 것은 "무언가 있다" 하나뿐이다.
 *
 * TTL 을 짧게 둔다. 약 알림은 늦게 도착하면 틀린 알림이 된다 — 09시에 받았어야 할
 * 것을 14시에 받으면, 사람은 지금 먹을 약이라고 읽는다. 폰이 꺼져 있던 동안 지나간
 * 알림은 오지 않는 편이 낫고, 앱을 열면 어차피 실제 상태가 보인다.
 */
export async function sendPush(
  subscription: PushSubscriptionJSON,
  keys: VapidKeys,
  options: SendOptions = {},
): Promise<PushOutcome> {
  const doFetch = options.fetcher ?? fetch;
  const ttl = options.ttl ?? 900;

  let response: Response;
  try {
    response = await doFetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: authorizationFor(subscription.endpoint, keys, options.now),
        TTL: String(ttl),
        // 본문이 없다는 것을 명시한다. 이 줄이 없으면 일부 서비스가 400 을 낸다.
        'Content-Length': '0',
        Urgency: 'high',
      },
    });
  } catch {
    return { state: 'failed', status: 0 };
  }

  if (response.status === 404 || response.status === 410) {
    return { state: 'gone', status: response.status };
  }
  if (response.ok) return { state: 'sent' };
  return { state: 'failed', status: response.status };
}

/**
 * 한 사람의 구독 여럿에 보내고, 살아남은 것만 돌려준다.
 *
 * 한 사람이 폰과 태블릿을 함께 쓸 수 있고, 같은 폰에서 브라우저를 갈아도 구독이
 * 하나 더 생긴다. 전부에 보내는 것이 맞다 — 어느 것이 지금 손에 있는지 우리는 모른다.
 */
export async function sendToAll(
  subscriptions: PushSubscriptionJSON[],
  keys: VapidKeys,
  options: SendOptions = {},
): Promise<{ sent: number; kept: PushSubscriptionJSON[]; dropped: string[] }> {
  const results = await Promise.all(
    subscriptions.map(async (s) => ({ s, out: await sendPush(s, keys, options) })),
  );

  const kept: PushSubscriptionJSON[] = [];
  const dropped: string[] = [];
  let sent = 0;

  for (const { s, out } of results) {
    if (out.state === 'sent') sent++;
    // 실패는 남긴다. 지금 망이 나쁜 것과 구독이 죽은 것은 다르고, 전자로 지우면
    // 사용자는 아무것도 안 했는데 알림이 영영 끊긴다.
    if (out.state === 'gone') dropped.push(s.endpoint);
    else kept.push(s);
  }

  return { sent, kept, dropped };
}
