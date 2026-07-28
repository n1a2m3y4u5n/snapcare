'use client';

import { useEffect, useRef } from 'react';
import { useProfile } from '@/stores/profile';
import { seedDemoIfEmpty, useScans } from '@/stores/scans';
import { useReminders } from '@/stores/reminders';
import { pullBlob, pushBlob, isUsable, SYNC_VERSION, type SyncBlob } from '@/lib/snapcare/sync';

/*
 * 예전에는 이 자리에서 무작위 문자열을 만들어 localStorage 에 두고, 그것을 주소창에
 * 실어 보냈다. 이제 신원은 기기의 **꺼낼 수 없는 열쇠**가 지고(lib/snapcare/deviceKey.ts),
 * 어느 자료를 줄지는 서버가 그 공개키에서 유도한다. 여기서 고를 것이 없어졌다.
 */

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

  useEffect(() => {
    let alive = true;
    (async () => {
      const blob = await pullBlob();
      if (!alive) return;
      // 버전이 안 맞거나 모양이 깨진 서버 데이터는 무시하고 로컬을 다시 시드한다.
      const hasServer = isUsable(blob) && (Boolean(blob.profile) || (blob.scans?.length ?? 0) > 0);
      if (hasServer && blob) {
        if (blob.profile) useProfile.setState({ profile: blob.profile });
        if (blob.scans) useScans.setState({ scans: blob.scans });
        if (blob.reminders) useReminders.setState({ reminders: blob.reminders });
      } else {
        // 서버에도 없다 = 이 사람의 첫 실행이다. 시연 모드면 여기서 채운다.
        //
        // 마운트 직후에 넣어 봤더니 이 pull 이 끝나면서 빈 자료로 덮어썼다. 서버가
        // 무엇을 갖고 있는지 안 뒤에 넣어야 한다.
        seedDemoIfEmpty();
        void pushBlob(snapshot());
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
      timer.current = setTimeout(() => void pushBlob(snapshot()), 600);
    };
    const unsubs = [useProfile.subscribe(schedule), useScans.subscribe(schedule), useReminders.subscribe(schedule)];
    return () => unsubs.forEach((u) => u());
  }, []);

  return null;
}
