import { readFile, rename, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { PushSubscriptionJSON } from './send.ts';

/**
 * 약통 하나에 딸린 푸시 구독들.
 *
 * 왜 가구가 아니라 **기기 id** 로 묶는가: 알림을 쏘라고 알려 주는 쪽은 릴레이이고,
 * 릴레이가 아는 이름은 기기 id 하나뿐이다. 가구 이름은 폰의 공개키에서 나오는데
 * 릴레이는 그 공개키를 본 적이 없다.
 *
 * 무엇이 들어 있나: 푸시 서비스 주소와 그 서비스가 준 열쇠 두 개. 약 이름도,
 * 일정도, 사람 이름도 없다. 이 파일이 통째로 새어도 새는 것은 "이 약통에 폰 두
 * 대가 붙어 있다" 까지다.
 */

export interface Subscribers {
  subscriptions: PushSubscriptionJSON[];
  /** 마지막으로 손댄 때. 오래 죽어 있는 파일을 나중에 알아보기 위한 것 */
  updatedAt: string;
}

const EMPTY: Subscribers = { subscriptions: [], updatedAt: '' };

function dirFor(dataDir: string): string {
  return join(dataDir, 'push');
}

export function fileFor(dataDir: string, deviceId: string): string {
  return join(dirFor(dataDir), `${deviceId}.json`);
}

export async function readSubscribers(dataDir: string, deviceId: string): Promise<Subscribers> {
  try {
    const raw = await readFile(fileFor(dataDir, deviceId), 'utf-8');
    const parsed = JSON.parse(raw) as Subscribers;
    return Array.isArray(parsed.subscriptions) ? parsed : EMPTY;
  } catch {
    return EMPTY;   // 아직 없거나 깨졌다. 둘 다 "구독 없음" 으로 읽는 편이 맞다
  }
}

export async function writeSubscribers(
  dataDir: string,
  deviceId: string,
  subscriptions: PushSubscriptionJSON[],
  at: string,
): Promise<void> {
  await mkdir(dirFor(dataDir), { recursive: true });
  const file = fileFor(dataDir, deviceId);
  // 저장소 라우트와 같은 이유로 임시 파일에 쓰고 옮긴다. writeFile 은 원자적이지
  // 않아서 쓰는 도중에 끊기면 잘린 JSON 이 남고, 그러면 이 약통의 알림이 통째로
  // 사라진다 — 위의 readSubscribers 가 깨진 파일을 "구독 없음" 으로 읽기 때문이다.
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify({ subscriptions, updatedAt: at }), 'utf-8');
  await rename(tmp, file);
}

/**
 * 같은 주소를 두 번 담지 않는다.
 *
 * 브라우저는 같은 구독을 몇 번이고 다시 준다 — 앱을 열 때마다 `subscribe()` 를
 * 부르는데, 이미 있으면 **같은 것을 그대로** 돌려주기 때문이다. 그것을 그냥 밀어
 * 넣으면 목록이 방문 횟수만큼 늘고, 알림도 그만큼 겹쳐 뜬다.
 */
export function withSubscription(
  existing: PushSubscriptionJSON[],
  next: PushSubscriptionJSON,
): PushSubscriptionJSON[] {
  const rest = existing.filter((s) => s.endpoint !== next.endpoint);
  return [...rest, next];
}

/**
 * 우리 서버가 POST 하러 가면 안 되는 곳.
 *
 * 구독 주소는 요청 본문에서 오고, 우리는 나중에 그 주소로 요청을 보낸다. 즉
 * **서명을 가진 사람이 우리 서버에게 아무 주소나 두드리게 시킬 수 있다**(SSRF).
 * 몸통이 없는 POST 라 할 수 있는 일이 적지만, fly.io 에서는 사정권이 좁지 않다 —
 * `<앱이름>.internal` 이 곧 사설망 주소이고 릴레이가 거기 있다.
 *
 * 이름으로 거른다. DNS 를 풀어 IP 를 보는 편이 더 촘촘하지만, 그러면 확인한 뒤
 * 실제로 보내기까지의 사이에 응답이 바뀔 수 있다(TOCTOU). 이름 검사만으로도
 * 실재하는 푸시 서비스는 전부 통과한다.
 */
function isReachableTarget(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  if (host.endsWith('.internal') || host.endsWith('.local')) return false;
  // IP 를 직접 적은 주소. 진짜 푸시 서비스는 이름으로 온다.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  if (host.includes(':')) return false;            // IPv6 리터럴
  return host.includes('.');                        // 점 없는 이름은 사내 호스트다
}

/** 구독처럼 생겼는지 본다. 요청 본문에서 오는 값이라 믿을 수 없다. */
export function isSubscription(value: unknown): value is PushSubscriptionJSON {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as PushSubscriptionJSON;
  if (typeof v.endpoint !== 'string' || v.endpoint.length > 2048) return false;
  try {
    const url = new URL(v.endpoint);
    if (url.protocol !== 'https:') return false;
    return isReachableTarget(url.hostname);
  } catch {
    return false;
  }
}
