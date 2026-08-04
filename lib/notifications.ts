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
 * 이 파일은 알림을 **띄우는** 일만 한다
 * -------------------------------------
 * 언제 띄울지는 여기 없다. 그것이 세 군데에 있고, 세 군데인 데에 이유가 있다.
 *
 *   lib/reminders/useDoseReminders.ts  복약 시각마다. 앱이 열려 있는 동안.
 *   lib/dispenser/useDoseAlert.ts      상자가 약을 내밀었을 때. 긴 폴링이 본다.
 *   app/api/push/notify/route.ts       상자 → 릴레이 → Web Push. **앱이 닫혀 있어도.**
 *
 * 예약을 여기 두었던 적이 있고 그때 문제가 생겼다. `scheduleNotification` 이라는
 * 함수가 있었는데, 그것을 부르는 자리가 처방전을 스캔한 화면 하나뿐이었고 거기서
 * **첫 복용 하나**만 걸었다. 하루 세 번 먹는 약을 등록하면 아침만 울렸다. 예약을
 * 스토어를 보는 훅으로 옮기면서 그 함수는 지웠다 — 남겨 두면 다음 사람이 다시
 * 화면 안에서 부른다.
 *
 * 여전히 못 하는 것: 상자 없이 앱만 쓰는 사람은 앱을 완전히 닫으면 알림을 못 받는다.
 * 서버가 그 사람의 복약 시각을 알아야 하는 별개의 일이다. 알림이 "된다" 고만 적어
 * 놓으면 다음 사람이 그 위에 기대를 쌓으므로, 한계는 여기 적어 둔다.
 */

/**
 * 권한을 막 얻었다는 신호.
 *
 * 복약 알람은 `canNotify()` 가 참일 때만 걸린다. 그런데 권한을 묻는 순간과 알람을
 * 걸어야 하는 순간이 서로 다른 곳에 있어서 — 묻는 것은 처방전을 스캔한 화면,
 * 거는 것은 뿌리에 상주하는 훅 — 허락한 직후에는 걸 것이 없었고, 훅이 다음에
 * 깨어날 때(화면을 껐다 켜거나 약을 하나 더 등록할 때)까지 그날 알람이 통째로
 * 비었다. 허락한 바로 그 순간이 알람을 걸 순간이다.
 */
export const PERMISSION_EVENT = 'snapcare:notify-permission';

/** 알림 권한을 묻는다. 이미 거절했으면 다시 묻지 않는다 — 브라우저가 막는다. */
export async function requestPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  if (result === 'granted' && typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PERMISSION_EVENT));
  }
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
