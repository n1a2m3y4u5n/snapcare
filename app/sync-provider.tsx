'use client';

import { useEffect, useRef } from 'react';
import { useProfile } from '@/stores/profile';
import { useScans } from '@/stores/scans';
import { useReminders } from '@/stores/reminders';
import { pullBlob, pushBlob, isUsable, SYNC_VERSION, type SyncBlob } from '@/lib/snapcare/sync';

const HOUSEHOLD_STORAGE_KEY = 'snapcare-household';

/**
 * 이 브라우저가 속한 household 키.
 *
 * 이전에는 'household-demo' 하나를 모두가 공유했다. 배포본에 두 사람이 들어오면
 * 서로의 가족·기록을 보게 되고, 더 나쁘게는 한쪽이 뭘 하면 다른 쪽 화면이 바뀐다.
 * 심사 중에 심사위원이 직접 만져보면 발표용 데모 상태가 그대로 흔들린다는 뜻이다.
 *
 * 그래서 브라우저마다 하나씩 만들어 격리한다. 같은 가구가 여러 기기에서 한 상태를
 * 공유하는 것(대상 지역에서 휴대폰은 가구 단위로 공유된다)은 픽처키에서 키를 유도하면
 * 되지만, 지금은 데모 픽처키가 화면에 힌트로 떠 있어서 그 방식으로는 격리가 되지 않는다.
 */
function householdKey(): string {
  if (typeof localStorage === 'undefined') return 'household-demo';
  const existing = localStorage.getItem(HOUSEHOLD_STORAGE_KEY);
  if (existing) return existing;
  const created = `h_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  localStorage.setItem(HOUSEHOLD_STORAGE_KEY, created);
  return created;
}

function snapshot(): SyncBlob {
  return {
    version: SYNC_VERSION,
    profile: useProfile.getState().profile,
    scans: useScans.getState().scans,
    reminders: useReminders.getState().reminders,
  };
}

/**
 * 서버 영속 동기화 (fly.io 파일 저장소).
 * 마운트 시 서버에서 pull → 있으면 하이드레이트, 없으면 로컬을 서버에 시드.
 * 이후 스토어 변경을 디바운스 push. 오프라인이면 localStorage 폴백.
 */
export function SyncProvider() {
  const ready = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 렌더가 아니라 이펙트에서 읽는다 (localStorage·randomUUID 는 서버에 없다).
  const household = useRef<string>('');

  useEffect(() => {
    let alive = true;
    (async () => {
      household.current = householdKey();
      const blob = await pullBlob(household.current);
      if (!alive) return;
      // 버전이 안 맞거나 모양이 깨진 서버 데이터는 무시하고 로컬을 다시 시드한다.
      const hasServer = isUsable(blob) && (Boolean(blob.profile) || (blob.scans?.length ?? 0) > 0);
      if (hasServer && blob) {
        if (blob.profile) useProfile.setState({ profile: blob.profile });
        if (blob.scans) useScans.setState({ scans: blob.scans });
        if (blob.reminders) useReminders.setState({ reminders: blob.reminders });
      } else {
        void pushBlob(household.current, snapshot());
      }
      ready.current = true;
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const schedule = () => {
      if (!ready.current) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void pushBlob(household.current, snapshot()), 600);
    };
    const unsubs = [useProfile.subscribe(schedule), useScans.subscribe(schedule), useReminders.subscribe(schedule)];
    return () => unsubs.forEach((u) => u());
  }, []);

  return null;
}
