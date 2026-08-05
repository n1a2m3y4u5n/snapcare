'use client';

import { useMemo, useState } from 'react';
import { CloseIcon } from '@/components/icons';
import { MobileScreen } from '@/components/sc/MobileScreen';
import { DispenserPanel } from '@/components/sc/DispenserPanel';
import { useIsClient } from '@/lib/hooks';
import { DoseRelease } from '@/components/sc/DoseRelease';
import { useDispenser } from '@/lib/dispenser/useDispenser';
import { toCloudSlots } from '@/lib/dispenser/fromApp';
import { useDoseLog } from '@/lib/dispenser/useDoseLog';
import { useDoseAlert } from '@/lib/dispenser/useDoseAlert';
import { Hint } from '@/components/sc/Hint';
import { ask, Hear, Speakable } from '@/components/sc/Say';
import { useReminders } from '@/stores/reminders';
import { type WeeklySlot } from '@/lib/hardware/protocol';
import { BoxIcon } from '@/components/icons';
import { forgetPaired } from '@/lib/dispenser/paired';
import { FITTED_TRAYS, planTrays, weeklyFrom } from '@/lib/hardware/dispenser';
import { speak } from '@/lib/voice';
import { PushToggle } from './push-toggle';

/**
 * 디스펜서와 주고받는 화면.
 *
 * 우리는 기기를 0.96" OLED 에 카메라가 붙은 것으로 가정하고 광학 프로토콜을 짰는데,
 * 실제 하드웨어(Shaztech/Pilldispenser)에는 카메라가 없다. 대신 WiFi 와 HTTP GET
 * API 를 이미 갖고 있다. 그래서 기본 경로를 바꿨다:
 *
 *   보내기 — 기기의 /save 로 가는 링크를 만든다. 한 번 누르면 기기 페이지로 이동해
 *            저장된다. HTTPS 페이지에서 HTTP 를 fetch 하면 막히지만 최상위 이동은
 *            막히지 않는다는 점을 이용한다. 브로커도 클라우드도 필요 없다.
 *   읽기   — 기기가 화면에 코드를 띄우면 그것을 찍는다. 이 방향은 카메라가 폰 쪽에
 *            있으므로 그대로 성립한다.
 *
 * 광학 내보내기(QR을 띄워 기기가 읽게 하는 것)는 남겨 두되 WiFi 가 없을 때의 대체로
 * 내린다 — 지금 하드웨어로는 읽을 수 없고, 읽으려면 펌웨어를 고쳐야 한다.
 */
function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function DevicePage() {
  const reminders = useReminders((s) => s.reminders);

  // 클라우드 경로 — 같은 WiFi 가 아니어도 닿는다. 아래 LAN 경로는 인터넷이 없을
  // 때의 대체로 남는다.
  const box = useDispenser();
  const [result, setResult] = useState<string | null>(null);
  const [sending, setSending] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');

  /*
    상자가 스스로 말한 칸 수를 쓴다. 없으면 이 판이 실제로 배선한 수.

    화면에서 고르게 하던 자리가 있었는데 걷었다 — 상자가 켜져 있으면 자기 칸 수를
    보고하고, 안 켜져 있으면 사람이 골라 봐야 보낼 곳이 없다.
  */
  const trays = box.report?.status.trayCount ?? FITTED_TRAYS;
  const trayPlan = useMemo(() => planTrays(reminders, trays), [reminders, trays]);
  const trayNames = useMemo(
    () => Object.fromEntries(trayPlan.plan.map((t) => [t.tray, t.name])),
    [trayPlan],
  );
  /* 그 칸의 1회 복용량. 이름과 같은 자리에서 온다 — 상자는 둘 다 모른다. */
  const trayDoses = useMemo(
    () => Object.fromEntries(
      trayPlan.plan.flatMap((t) => (t.source?.item?.rx?.doseText ? [[t.tray, t.source.item.rx.doseText]] : [])),
    ),
    [trayPlan],
  );
  useDoseLog(box.report, trayNames, trayDoses);
  // 앱을 보고 있지 않을 때는 알림이 부른다 — 배출 버튼은 화면을 봐야 보인다.
  useDoseAlert(box.report);

  /*
    기기로 보낼 것.

    종이 폼시트에서 온 일정이 여기 우선했었다. 이제 종이는 카메라가 읽고, 읽은 것은
    알람이 된다 — 그래서 이 화면이 종이를 따로 알 필요가 없어졌다. 알람 하나가 진실의
    자리다.
  */
  const sendSlots: WeeklySlot[] = trayPlan.plan.length > 0
    ? weeklyFrom(reminders, trays).slots
    : [];

  /**
   * 짝지은 상자로 일정을 보낸다 — 사서함을 거쳐서.
   *
   * 아래 LAN 링크와 하는 일은 같고 닿는 범위가 다르다. 링크는 폰과 상자가 같은 공유기
   * 뒤에 있어야 하고, 이쪽은 상자가 켜져 있기만 하면 된다. 딸이 다른 도시에서 어머니의
   * 상자에 일정을 넣는 것이 이 경로에서만 된다.
   *
   * 끝났다는 것은 **사서함에 놓였다**는 뜻이지 상자가 받았다는 뜻이 아니다. 확인은
   * 다음 보고에 실려 오는 `status.payload` 이고, 위 상태판이 그것을 보여준다.
   */
  /** 상자가 가진 일정을 이 폰의 것으로 갈아 끼운다. */
  async function resync() {
    await sendToBox();
    box.refresh();
  }

  /** 짝을 놓는다. 기록은 그대로 — 기록은 이 폰의 것이지 상자의 것이 아니다. */
  async function forget() {
    await forgetPaired();
    box.refresh();
  }

  async function sendToBox() {
    if (!box.paired || sendSlots.length === 0) return;
    setSending('sending');
    try {
      await box.setSchedule(toCloudSlots(sendSlots));
      setSending('sent');
      const what = trayPlan.plan.length === 1
        ? 'One dose time was sent to the dispenser.'
        : `${trayPlan.plan.length} dose times were sent to the dispenser.`;
      setResult(what);
      speak(what);
    } catch (err) {
      console.error('[dispenser] 일정 전송 실패:', err);
      setSending('failed');
      // 조용히 실패하면 안 되는 자리다. 보냈다고 믿은 사람은 상자가 약을 내보낼
      // 것이라고 믿고, 그 믿음은 아무 일도 일어나지 않는 아침에 깨진다.
      const what = 'The schedule did not reach the dispenser. Try again.';
      setResult(what);
      speak(what);
    }
  }

  /*
    종이 폼시트를 읽던 자리와, 상자 화면의 QR 을 읽던 자리가 여기 있었다. 둘 다
    카메라로 갔다(`app/camera/page.tsx`).

    옮긴 이유는 자리를 줄이려는 것이 아니라 **찍는 자리가 하나여야** 하기 때문이다.
    이 앱에서 사진을 찍는 곳은 홈 한가운데의 큰 버튼이고, 사람이 종이나 상자를 앞에
    두고 "이걸 찍어야 하나" 를 물을 때 답이 두 곳이면 그 중 하나는 안 찾아진다.
  */


  return (
    <MobileScreen bar="inner">
      <div className="px-5 pt-14 pb-10">
        {/* 뒤로가기를 걷어냈다. 이 화면은 홈의 위성이라 **들어온 길이 홈**인데
            나가는 길만 설정으로 갔다. 아래 줄의 Home 버튼이 들어온 길로 돌려보낸다. */}
        <h1 className=" text-2xl font-extrabold" style={{ color: 'var(--color-sc-ink)' }}
            {...ask('Dispenser. Send your dose times to the dispenser, or read what it shows.')}>Dispenser</h1>
        {/*
          짝이 없을 때만 낸다.

          짝을 짓기 전에는 "같은 와이파이" 가 **해야 할 일**이다 — 그걸 모르면 보내기가
          안 되고, 왜 안 되는지도 화면 어디에도 없다.

          짝을 지은 뒤의 "어디서나 됩니다" 는 그렇지 않다. 사실이긴 한데(사서함을
          거치므로 같은 공유기 뒤에 있을 필요가 없다) 사람이 그걸 알아서 할 일이
          달라지지 않는다. 화면 맨 위의 한 줄은 이 화면에서 가장 비싼 자리이고, 거기에
          아무것도 안 시키는 문장이 앉아 있었다.
        */}
        {!box.paired && (
          <Speakable text="The phone and the dispenser are on the same Wi-Fi. Nothing else is needed."
                     className="mt-1 text-sm flex w-full items-center gap-2">
            <span className="flex-1">Same Wi-Fi — nothing else needed.</span>
          </Speakable>
        )}

        {/*
          지금 꺼내야 하는 약이 있으면 무엇보다 먼저다. 기기는 시간이 됐다고 약을
          내보내지 않으므로, 이 버튼이 없으면 트레이는 닫힌 채로 유예가 지난다.
        */}
        <div className="mt-6 space-y-4">
          <DoseRelease report={box.report} onRelease={box.release} />
          <DispenserPanel paired={box.paired} report={box.report} stale={box.stale}
                          loading={box.loading} error={box.error} onChanged={box.refresh} />
          {/*
            짝이 지어져 있을 때만 낸다. 짝이 없으면 알릴 상자도 없고, 스위치만
            먼저 보이면 켜 놓고 아무 일도 안 일어나는 상태가 된다.
          */}
          {box.paired && <PushToggle deviceId={box.paired.deviceId} />}

          {/*
            상자와 짝지은 사람이 이 화면에서 실제로 할 수 있는 일은 둘뿐이다.

            나머지는 전부 저절로 된다 — 알람을 만들면 일정이 사서함으로 가고
            (`useAutoSend`), 복용은 보고에 실려 기록으로 들어온다(`useDoseLog`).
            그래서 이 아래에 있던 것들은 "안 될 때의 다른 길" 이었고, 안 될 때가
            아닌데 늘 펼쳐 두면 이 화면이 무엇을 하는 곳인지가 흐려진다.

            둘 다 큰 버튼이다. 이 화면에 몇 번 오지 않는 사람이 찾아야 하는 것이고,
            작은 밑줄 글씨로 두면 글을 못 읽는 사람에게는 없는 것과 같다.
          */}
          {box.paired && (
            <div className="space-y-2">
              {/*
                듣기 단추를 줄 단추 **밖으로** 뺀다.

                `<button>` 안의 `<button>` 은 HTML 이 금지하고 하이드레이션 오류가
                난다. 더 실질적인 문제는 안쪽을 누르면 바깥도 같이 눌린다는 것이다 —
                읽어 달라고 눌렀는데 일정이 다시 전송되거나 짝이 끊긴다. 설정 화면에서
                같은 결함을 고쳤고, 여기 둘이 남아 있었다.
              */}
              <div className="flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-4 shadow-sm">
              <button
                onClick={() => void resync()}
                disabled={sending === 'sending'}
                className="flex min-w-0 flex-1 items-center gap-3 text-left
                           active:scale-[0.99] transition-transform disabled:opacity-50"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl"
                      style={{ background: 'var(--color-sc-bg)', color: 'var(--color-sc-primary)' }}>
                  <BoxIcon />
                </span>
                <span className="flex-1 text-left">
                  <span className="block text-base font-bold" style={{ color: 'var(--color-sc-ink)' }}>
                    {sending === 'sending' ? 'Sending…' : 'Send everything again'}
                  </span>
                  <span className="block text-xs" style={{ color: 'var(--color-sc-muted)' }}>
                    Replaces what the dispenser has with what this phone has
                  </span>
                </span>
              </button>
                <Hear text="Send everything again. This replaces the times in the dispenser with the times on this phone. Use it if the dispenser seems to have the wrong schedule." />
              </div>

              {/*
                짝을 끊는 것은 되돌릴 수 있다(짝짓기 코드를 다시 읽으면 된다). 그래서
                두 번 누르게 하지 않는다 — 지우는 것이 아니라 놓는 것이다.
              */}
              <div className="flex w-full items-center gap-3 rounded-2xl px-4 py-4"
                   style={{ background: 'var(--color-avoid-bg)' }}>
              <button
                onClick={() => void forget()}
                className="flex min-w-0 flex-1 items-center gap-3 text-left
                           active:scale-[0.99] transition-transform"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl text-white"
                      style={{ background: 'var(--color-avoid)' }}>
                  <CloseIcon />
                </span>
                <span className="flex-1 text-left">
                  <span className="block text-base font-bold" style={{ color: 'var(--color-avoid)' }}>
                    Forget this dispenser
                  </span>
                  <span className="block text-xs" style={{ color: 'var(--color-sc-muted)' }}>
                    Your history stays. Pair again any time with its code.
                  </span>
                </span>
              </button>
                <Hear text="Forget this dispenser. This phone stops talking to it. Your history stays, and you can pair again any time with the code on the dispenser." />
              </div>
            </div>
          )}
          {/*
            기계를 직접 흔드는 자리가 여기 있었다 — 트레이를 열고 부저를 울리는
            버튼들. 시연에서만 보이게 막아 두었었는데, 이제 통째로 없앴다.

            같은 것이 `/present` 에 이미 있다. 트레이마다 알람, 트레이마다 배출,
            부저 — 하나도 빠짐없이 같고, 거기가 그것들이 있어야 할 곳이다. 두 곳에
            같은 버튼을 두면 시연 중에 어느 쪽을 눌러야 하는지가 한 번 더 생각할
            일이 되고, 고쳐야 할 때 한쪽만 고쳐진다.

            그리고 이 화면은 **약을 먹는 사람의 화면**이다. 그 사람에게 "아무 칸이나
            여는 버튼" 은 있어서는 안 되는 것이고, 눌러서 나온 알약은 다음 복용에서
            비게 된다.
          */}
        </div>

        {/*
          여기 셋이 있었다. 전부 걷었다.

          SEND THE SCHEDULE — 위의 "Send everything again" 이 같은 일을 한다.
          같은 일을 하는 버튼이 한 화면에 둘이면, 둘 중 어느 것이 진짜인지 사람이
          알 방법이 없다. 그리고 그 아래 딸린 것들 — 칸 수 고르기, 같은 Wi-Fi 링크,
          광학 QR — 은 전부 "안 될 때의 다른 길" 인데, 안 될 때가 아닌데 늘 펼쳐
          두면 이 화면이 무엇을 하는 곳인지가 흐려진다.

          READ THE DEVICE — 상자 화면의 복용 결과를 찍는 것. 카메라로 옮겼다
          (`app/camera/page.tsx` 의 `actOnQr`). 사람이 상자 앞에 서서 "이걸 찍어야
          하나" 를 물을 때 답이 두 곳이면 그 중 하나는 안 찾아진다.

          OR READ THE DOCTOR'S SHEET — 종이 폼시트. 같은 이유로 카메라로 옮겼다
          (`handledAsSheet`). 이 종이는 처방전이고, 처방전을 찍는 자리는 카메라다.
          기기 탭에 있을 때는 "약통을 다루는 화면" 안에 종이 읽기가 들어 있어서,
          처방전을 받아 온 사람이 그 화면을 열 이유가 없었다.

          남은 것은 상태와, 사람이 실제로 누를 수 있는 두 버튼뿐이다.
        */}

        {result && (
          <div className="mt-3 rounded-2xl px-4 py-3" style={{ background: 'var(--color-safe-bg)' }}>
            <Hint text={result} tone="info" />
          </div>
        )}
      </div>
    </MobileScreen>
  );
}


