// 오프라인 동기화 — localStorage 큐 + navigator.onLine 감지

interface QueuedAction {
  id: string;
  type: string;
  payload: unknown;
  timestamp: number;
}

const QUEUE_KEY = 'illihealth_offline_queue';

/** 오프라인 큐에 액션을 추가한다 */
export function enqueue(type: string, payload: unknown): void {
  const queue = getQueue();
  queue.push({
    id: crypto.randomUUID(),
    type,
    payload,
    timestamp: Date.now(),
  });
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/** 현재 오프라인 큐를 반환한다 */
export function getQueue(): QueuedAction[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as QueuedAction[];
  } catch {
    return [];
  }
}

/** 큐를 비운다 */
export function clearQueue(): void {
  localStorage.removeItem(QUEUE_KEY);
}

/** 온라인 여부를 반환한다 */
export function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}
