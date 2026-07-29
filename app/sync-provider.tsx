'use client';

import { useEffect, useRef } from 'react';
import { useProfile } from '@/stores/profile';
import { seedDemoIfEmpty, useScans } from '@/stores/scans';
import { isDemo } from '@/lib/snapcare/demo';
import { useReminders } from '@/stores/reminders';
import { pull, push, type PersonBlob } from '@/lib/snapcare/sync';

/*
 * 예전에는 이 자리에서 무작위 문자열을 만들어 localStorage 에 두고, 그것을 주소창에
 * 실어 보냈다. 이제 신원은 기기의 **꺼낼 수 없는 열쇠**가 지고(lib/snapcare/deviceKey.ts),
 * 어느 자료를 줄지는 서버가 그 공개키에서 유도한다. 여기서 고를 것이 없어졌다.
 *
 * 한 폰을 여럿이 써도 서버 파일은 여전히 기기당 하나다. 그 안에서 사람이 갈리고,
 * 이 화면은 늘 **지금 사람** 몫만 다룬다 (lib/snapcare/sync.ts 가 나머지를 지킨다).
 */

function snapshot(): PersonBlob {
  return {
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
  /** 서버 응답을 기다리는 사이에 사용자가 무언가 고쳤는가. */
  const touched = useRef(false);
  // 렌더가 아니라 이펙트에서 읽는다 (localStorage·randomUUID 는 서버에 없다).

  // 주소의 ?demo 를 **가장 먼저** 읽어 둔다. isDemo() 는 읽을 때 그 값을 브라우저에
  // 남기는데, 그 첫 읽기가 늦으면 문제가 된다 — 주소에 ?demo=1 이 붙는 것은 첫 화면
  // 뿐이고, 로그인 화면으로 넘어가면 주소에서 사라진다. 실제로 동기화가 끝난 뒤에야
  // 읽고 있어서, 시연 모드인데 로그인 화면이 그것을 모른 채 그려졌다.
  useEffect(() => { isDemo(); }, []);

  useEffect(() => {
    let alive = true;
    // 사용자가 무언가 고치면 즉시 표시한다. 이 구독을 아래 pull 보다 **먼저** 건다 —
    // 다른 useEffect 에 두었더니 서버 응답이 클릭보다 늦게 도착하는 경우를 놓쳤고,
    // 첫 실행에서 조건을 누른 것이 서버 사본에 덮여 사라졌다.
    const mark = () => { touched.current = true; };
    const watch = [useProfile.subscribe(mark), useScans.subscribe(mark), useReminders.subscribe(mark)];
    (async () => {
      const blob = await pull();
      if (!alive) return;
      // 버전이 안 맞거나 모양이 깨진 서버 데이터는 무시하고 로컬을 다시 시드한다.
      const hasServer = Boolean(blob) && (Boolean(blob!.profile) || (blob!.scans?.length ?? 0) > 0);
      if (hasServer && blob) {
        // 사용자가 기다리는 동안 무언가 고쳤다면 서버 사본으로 덮지 않는다.
        //
        // 이걸 안 하면 앱을 열자마자 프로필을 고친 사람의 편집이 조용히 사라진다.
        // 실제로 첫 실행에서 조건 두 개를 눌렀는데 하나만 남았다 — 먼저 누른 것이
        // 이 pull 에 덮인 것이었고, 화면에는 아무 표시도 나지 않았다.
        //
        // 어느 쪽이 옳은지는 정할 수 없지만, **지금 손으로 누른 것**과 **몇 초 전
        // 다른 기기에서 온 것** 중에는 앞의 것이 사용자의 뜻에 가깝다.
        if (touched.current) {
          void push(snapshot());
        } else {
          if (blob.profile) useProfile.setState({ profile: blob.profile });
          if (blob.scans) useScans.setState({ scans: blob.scans });
          if (blob.reminders) useReminders.setState({ reminders: blob.reminders });
        }
      } else {
        // 서버에도 없다 = 이 사람의 첫 실행이다. 시연 모드면 여기서 채운다.
        //
        // 마운트 직후에 넣어 봤더니 이 pull 이 끝나면서 빈 자료로 덮어썼다. 서버가
        // 무엇을 갖고 있는지 안 뒤에 넣어야 한다.
        seedDemoIfEmpty();
        void push(snapshot());
      }
      ready.current = true;
    })();
    return () => {
      alive = false;
      watch.forEach((u) => u());
    };
  }, []);

  useEffect(() => {
    const schedule = () => {
      if (!ready.current) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void push(snapshot()), 600);
    };
    const unsubs = [useProfile.subscribe(schedule), useScans.subscribe(schedule), useReminders.subscribe(schedule)];
    return () => unsubs.forEach((u) => u());
  }, []);

  return null;
}
