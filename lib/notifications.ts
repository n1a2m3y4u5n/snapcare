// Web Notifications API 래퍼 — 데모용 setTimeout 스케줄링

/** 알림 권한을 요청한다 */
export async function requestPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

/** 즉시 알림을 표시한다 */
export function showNotification(title: string, body: string, icon = '/favicon.ico'): void {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  new Notification(title, { body, icon });
}

/** 지정한 시간(ms) 뒤에 알림을 표시한다 (데모용) */
export function scheduleNotification(
  title: string,
  body: string,
  delayMs: number,
  icon = '/favicon.ico'
): ReturnType<typeof setTimeout> {
  return setTimeout(() => {
    showNotification(title, body, icon);
  }, delayMs);
}
