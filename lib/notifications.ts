/**
 * 폰이 사람을 부르는 유일한 통로.
 *
 * 왜 이것이 기기 기능의 절반인가
 * ------------------------------
 * 상자는 시간이 됐다고 약을 내보내지 않는다. 정해진 분에 불이 켜지고 소리가 나지만
 * 트레이는 닫힌 채 기다리고, 앱의 배출 버튼이 그것을 여는 유일한 원격 경로다. 그런데
 * 그 버튼은 **앱을 열어 두고 있어야만 보인다.** 주머니 속 폰은 아무 말도 하지 않고,
 * 한 시간 뒤에 트레이는 닫힌 채로 '놓침' 이 기록된다.
 *
 * 그래서 알림이 버튼만큼 중요하다. dh 의 타입 문서도 `awaitingRelease` 가 비지 않으면
 * "화면의 배출 버튼 **그리고 푸시 알림**" 이라고 적어 두었다.
 *
 * 무엇을 할 수 있고 무엇을 못 하는가
 * ----------------------------------
 * 여기 있는 것은 **앱이 살아 있는 동안의 알림**이다. 탭이 배경에 있어도 긴 폴링이
 * 도는 한 알림은 뜬다. 앱을 완전히 닫은 폰에는 닿지 않는다 — 그러려면 Web Push
 * (VAPID 열쇠 + 밀어 주는 서버)가 필요하고, 그것은 릴레이가 올라간 뒤의 일이다.
 *
 * 이 한계를 코드에 적어 두는 이유: 알림이 "된다" 고만 적어 놓으면 다음 사람이 그 위에
 * 기대를 쌓는다. 지금 되는 것은 여기까지다.
 */

/** 알림 권한을 묻는다. 이미 거절했으면 다시 묻지 않는다 — 브라우저가 막는다. */
export async function requestPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function canNotify(): boolean {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted';
}

interface NotifyOptions {
  /**
   * 같은 알림을 겹쳐 쌓지 않게 하는 이름표.
   *
   * 긴 폴링은 같은 약을 몇 번이고 다시 실어 온다. 태그가 없으면 알림 서랍에 같은 줄이
   * 수십 개 쌓이고, 그중 무엇이 지금 것인지 아무도 모른다.
   */
  tag: string;
  /**
   * 손대기 전에는 사라지지 않는다. 약이 걸린 알림은 사람이 자리에 없을 때 뜨는 것이
   * 정상이라, 몇 초 뒤에 스스로 사라지면 아무 일도 없던 것이 된다.
   */
  sticky?: boolean;
}

/**
 * 알림을 띄운다. 서비스워커가 있으면 그쪽으로 — 그래야 눌렀을 때 앱으로 돌아온다.
 *
 * `new Notification()` 은 페이지가 살아 있는 동안만 유효하고 클릭 처리도 페이지가
 * 해야 한다. 등록된 서비스워커가 있으면 `showNotification` 을 쓴다(sw.js 의
 * notificationclick 이 앱을 앞으로 가져온다).
 */
export async function notify(title: string, body: string, options: NotifyOptions): Promise<void> {
  if (!canNotify()) return;
  const payload: NotificationOptions = {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: options.tag,
    requireInteraction: options.sticky ?? false,
  };
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, payload);
        return;
      }
    }
    new Notification(title, payload);
  } catch (err) {
    // 알림이 실패해도 앱이 멈추면 안 된다. 화면의 배출 카드는 그대로 있다.
    console.error('[notify] 알림을 띄우지 못했다:', err);
  }
}

/** 즉시 알림을 표시한다. 오래된 부름 자리를 위해 남겨 둔다. */
export function showNotification(title: string, body: string, tag = 'snapcare'): void {
  void notify(title, body, { tag });
}

/**
 * 앞으로 있을 한 번의 알림을 예약한다. **탭이 살아 있는 동안만** 유효하다.
 *
 * 예전에는 이 함수가 8초 뒤에 알림을 하나 띄우는 데 쓰였다 — 처방을 찍으면 곧바로
 * "아침 8시" 라고 적힌 알림이 8초 만에 떴다. 시연으로는 그럴듯하지만 사람에게는
 * 거짓말이고, 그 거짓말이 향하는 곳이 하필 복약 시각이다.
 *
 * 지금은 **진짜 시각까지** 기다린다. 그 사이에 탭이 닫히면 알림은 오지 않는다 —
 * 그것이 지금의 한계이고, 오지 않는 편이 엉뚱한 때 오는 것보다 낫다.
 */
export function scheduleNotification(
  title: string,
  body: string,
  delayMs: number,
  tag = 'snapcare-dose',
): ReturnType<typeof setTimeout> | null {
  // setTimeout 은 2^31-1 ms(약 24.8일)를 넘으면 **즉시** 실행된다. 넘으면 예약하지 않는다.
  if (delayMs <= 0 || delayMs > 2_147_483_647) return null;
  return setTimeout(() => { void notify(title, body, { tag, sticky: true }); }, delayMs);
}
