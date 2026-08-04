'use client';

import { useEffect, useState } from 'react';
import { BellIcon, BellOffIcon } from '@/components/icons';

import { isSubscribed, pushSupported, subscribeToDevice, unsubscribeFromDevice } from '@/lib/push/client';
import { Speakable } from '@/components/sc/Say';

/**
 * "앱을 닫아도 알려 주세요" 스위치.
 *
 * 왜 이 스위치가 필요한가: 지금까지의 알림은 앱이 열려 있을 때만 왔다. 화면을
 * 보고 있는 사람에게 알림을 띄우는 것은 별 의미가 없고, 정작 필요한 사람 —
 * 폰을 주머니에 넣어 둔 사람 — 에게는 아무것도 가지 않았다.
 *
 * 왜 자동으로 켜지 않는가: 브라우저는 사용자가 무언가를 누른 직후가 아니면 권한
 * 창을 무시하거나 **영구 거절**로 처리한다. 앱을 켜자마자 물으면 그 한 번으로
 * 영영 못 켜게 될 수 있고, 그 상태는 화면에서 되돌릴 방법이 없다.
 */
export function PushToggle({ deviceId }: { deviceId: string }) {
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void isSubscribed().then((v) => { if (alive) setOn(v); });
    return () => { alive = false; };
  }, []);

  if (!pushSupported()) {
    /*
      iOS 사파리가 여기 온다. 홈 화면에 설치하기 전에는 푸시 자체가 없다.

      조용히 숨기지 않는 이유: 안 보이면 "이 앱에는 그런 기능이 없다" 로 읽힌다.
      할 수 있는 일을 알려 주는 편이 낫다.
    */
    return (
      <p className="mt-2 text-xs" style={{ color: 'var(--color-sc-muted)' }}>
        To be told when the app is closed, add SnapCare to your home screen first.
      </p>
    );
  }

  const toggle = async () => {
    setBusy(true);
    setNote(null);
    if (on) {
      await unsubscribeFromDevice(deviceId);
      setOn(false);
    } else {
      const result = await subscribeToDevice(deviceId);
      if (result.state === 'subscribed') setOn(true);
      else if (result.state === 'denied') {
        setNote('Your browser is blocking notifications for this site. Turn them back on in its settings.');
      } else if (result.state === 'unconfigured') {
        setNote('This copy of SnapCare has no notification key set up.');
      } else {
        setNote('Could not turn it on. Try again in a moment.');
      }
    }
    setBusy(false);
  };

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={toggle}
        disabled={busy || on === null}
        // 44px. 이 화면의 다른 누를 곳들과 같은 크기다 (WCAG 2.5.8 은 24 를 요구하지만
        // 이 앱의 사용자는 손이 떨리는 사람을 포함한다).
        className="sc-row flex min-h-[44px] w-full items-center rounded-2xl bg-white py-3 text-left shadow-sm disabled:opacity-60"
      >
        <span aria-hidden className="sc-icon flex items-center">{on ? <BellIcon /> : <BellOffIcon />}</span>
        <span className="flex-1">
          <Speakable
            text={on
              ? 'Notifications are on. Your phone will ring when the dispenser has your medicine ready, even if SnapCare is closed.'
              : 'Notifications are off. Turn them on to be told when the dispenser has your medicine ready, even if SnapCare is closed.'}
            className="block text-sm font-semibold"
            style={{ color: 'var(--color-sc-ink)' }}
          >
            Tell me when the app is closed
          </Speakable>
          <span className="mt-0.5 block text-xs" style={{ color: 'var(--color-sc-muted)' }}>
            {on === null ? 'Checking…' : on ? 'On' : 'Off'}
          </span>
        </span>
        {/*
          스위치는 틀이라 px 로 못박는다. 설정 화면의 같은 스위치와 같은 결함이
          여기에도 있었다 — 트랙과 손잡이는 rem 인데 움직이는 거리만 20px 이라,
          글자를 키우면 손잡이가 한가운데서 멈춘다.
        */}
        <span
          aria-hidden
          className="shrink-0 rounded-full transition-colors"
          style={{ width: 44, height: 24, padding: 2,
                   background: on ? 'var(--color-safe)' : 'var(--color-sc-bg)' }}
        >
          <span
            className="block shrink-0 rounded-full bg-white shadow transition-transform"
            style={{ width: 20, height: 20, transform: on ? 'translateX(20px)' : 'none' }}
          />
        </span>
      </button>

      {note && (
        <p className="mt-2 text-xs" style={{ color: 'var(--color-caution)' }}>{note}</p>
      )}

      {on && (
        <p className="mt-2 text-[11px] leading-snug" style={{ color: 'var(--color-sc-muted)' }}>
          {/* 사용자가 알아야 할 사실이다. 잠금 화면에 약 이름이 뜰 것이라고 기대하면
              뭉뚱그린 문구가 고장으로 보인다. 왜 그런지까지 적는다. */}
          The alert never says which medicine — that stays on your phone. Open SnapCare to see it.
        </p>
      )}
    </div>
  );
}
