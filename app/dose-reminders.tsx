'use client';

import { useDoseReminders } from '@/lib/reminders/useDoseReminders';

/**
 * 복약 알림을 앱 전체에 한 번 건다.
 *
 * 화면마다 붙일 것이 아니다. 예전에는 알람을 거는 자리가 처방전 스캔 화면 **안**에
 * 있었고, 그래서 그 화면을 지나간 사람에게만, 그 처방의 첫 복용에만 걸렸다. 알람은
 * 어느 화면에 있느냐와 무관한 것이라 뿌리에 있어야 한다.
 */
export function DoseReminders() {
  useDoseReminders();
  return null;
}
