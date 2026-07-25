'use client';

import { useEffect, useRef } from 'react';
import { useFamily } from '@/stores/family';
import { useScans } from '@/stores/scans';
import { useReminders } from '@/stores/reminders';
import { pullBlob, pushBlob, isUsable, SYNC_VERSION, type SyncBlob } from '@/lib/snapcare/sync';

/** household 키 — 지금은 데모 공용. 이후 픽처키/auth에 묶으면 가구별 분리 가능. */
const HOUSEHOLD = 'household-demo';

function snapshot(): SyncBlob {
  return {
    version: SYNC_VERSION,
    members: useFamily.getState().members,
    activeMemberId: useFamily.getState().activeMemberId,
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

  useEffect(() => {
    let alive = true;
    (async () => {
      const blob = await pullBlob(HOUSEHOLD);
      if (!alive) return;
      // 버전이 안 맞거나 모양이 깨진 서버 데이터는 무시하고 로컬을 다시 시드한다.
      const hasServer = isUsable(blob) && ((blob.members?.length ?? 0) > 0 || (blob.scans?.length ?? 0) > 0);
      if (hasServer && blob) {
        if (blob.members) useFamily.setState({ members: blob.members });
        if (blob.activeMemberId) useFamily.setState({ activeMemberId: blob.activeMemberId });
        if (blob.scans) useScans.setState({ scans: blob.scans });
        if (blob.reminders) useReminders.setState({ reminders: blob.reminders });
      } else {
        void pushBlob(HOUSEHOLD, snapshot());
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
      timer.current = setTimeout(() => void pushBlob(HOUSEHOLD, snapshot()), 600);
    };
    const unsubs = [useFamily.subscribe(schedule), useScans.subscribe(schedule), useReminders.subscribe(schedule)];
    return () => unsubs.forEach((u) => u());
  }, []);

  return null;
}
