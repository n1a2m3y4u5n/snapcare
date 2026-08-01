'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { MobileScreen } from '@/components/sc/MobileScreen';
import { Hint } from '@/components/sc/Hint';
import { sayable, ask, Speakable } from '@/components/sc/Say';
import { useReminders } from '@/stores/reminders';
import { useScans, nowLabel, todayKey } from '@/stores/scans';
import { useProfile } from '@/stores/profile';
import { encodeSchedule, encodeWeekly, decodeEvent, messageKind, type SlotSchedule, type WeeklySlot } from '@/lib/hardware/protocol';
import { toSchedule, type FormSheetValues } from '@/lib/hardware/formSheet';
import { decodeQrFromImage } from '@/lib/hardware/qr';
import { decodeToGray, RETRY_WORK_DIM } from '@/lib/formsheet/decode';
import { parseFormSheet } from '@/lib/formsheet/sheet';
import { DEFAULT_HOST, FITTED_TRAYS, MAX_TRAYS, planTrays, saveUrl, scheduleUrl, releaseUrl, weeklyFrom, looksLikeHost } from '@/lib/hardware/dispenser';
import { speak } from '@/lib/voice';

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
  const router = useRouter();
  const reminders = useReminders((s) => s.reminders);
  const addScan = useScans((s) => s.addScan);
  const member = useProfile((s) => s.profile);

  const [host, setHost] = useState(DEFAULT_HOST);
  const [reading, setReading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  // 폼시트에서 읽어낸 일정 — 있으면 알람 대신 이것을 기기로 내보낸다.
  // 시트에서 온 일정은 요일·기간을 갖는다 (WeeklySlot). 앱 안에서 만든 알람은 안 갖는다.
  const [sheet, setSheet] = useState<{ schedule: WeeklySlot[]; summary: string } | null>(null);

  // 알람을 기기 칸으로 묶는다 — 약 하나가 칸 하나다.
  const slots: SlotSchedule[] = useMemo(() => {
    const byName = new Map<string, string[]>();
    for (const r of reminders) {
      const times = byName.get(r.item.name) ?? [];
      times.push(r.time);
      byName.set(r.item.name, times);
    }
    return [...byName.values()].map((times, i) => ({ slot: i + 1, times }));
  }, [reminders]);

  const names = useMemo(() => [...new Set(reminders.map((r) => r.item.name))], [reminders]);

  /**
   * 기기 트레이 배치.
   *
   * 트레이 하나에 알람 시각은 하나뿐이라(하드웨어 사양) "하루 세 번" 은 트레이 세 개가
   * 된다. 그래서 배치 단위가 약이 아니라 복용 한 번이다 — 위의 slots 와 다른 이유다.
   */
  // 달려 있는 트레이 수는 기기마다 다르다. 펌웨어는 8까지 다루지만 대회 출품 기기에는
  // 3개만 달려 있고, 없는 칸을 지정하면 펌웨어가 요청을 거절한다. HTTPS 페이지에서
  // 기기의 /api/status 를 물어볼 수는 없으므로(혼합 콘텐츠) 사람이 고른다.
  const [trays, setTrays] = useState(FITTED_TRAYS);
  const trayPlan = useMemo(() => planTrays(reminders, trays), [reminders, trays]);

  // 폼시트를 읽었으면 그것이 우선한다 — 의사가 직접 채워준 일정이기 때문이다.
  //
  // 시트에는 요일과 기간이 표시돼 있고 SC1*W* 가 그것을 실을 수 있다. SC1*S* 로 보내면
  // 월/수/금 30일이 '매일 무기한' 으로 도착한다 — 화면은 맞아 보이는데 기기가 나흘을
  // 더 연다. 앱 안에서 만든 알람에는 요일 개념이 없으므로 그쪽은 지금처럼 S 로 간다.
  //
  // 알람에서 온 일정을 여기서 W 로 바꿔 QR 에 실으려다 되돌렸다. 라즈베리파이 판에
  // **카메라가 없다** — qr.py 는 QR 을 그리기만 하고(폰이 찍으라고, WiFi 설정용),
  // 읽는 쪽은 아예 없다. 아두이노+ESP32-CAM 시절의 전제를 새 하드웨어에 잘못 옮겨
  // 붙였던 것이다.
  //
  // 이제 길이 있다. 펌웨어가 `GET /schedule?payload=…` 를 링크로 받는다
  // (server.py 의 `_link_schedule`) — POST 가 아니므로 HTTPS 페이지에서 최상위
  // 이동으로 부를 수 있고, SC1*W* 페이로드가 통째로 실리므로 요일도 기간도 살아서
  // 도착한다.
  const payload = sheet?.schedule.length
    ? encodeWeekly(sheet.schedule)
    : slots.length > 0 ? encodeSchedule(slots) : null;

  // 기기로 보낼 것. 시트를 읽었으면 그쪽이 우선이다 — 종이에는 요일과 기간이 적혀
  // 있고 `/save` 는 그 둘을 버리기 때문이다. 시트가 없으면 앱 안의 알람을 주간
  // 슬롯으로 바꿔 같은 무손실 경로로 보낸다.
  const sendPayload = sheet?.schedule.length
    ? encodeWeekly(sheet.schedule)
    : trayPlan.plan.length > 0
      ? encodeWeekly(weeklyFrom(reminders, trays).slots)
      : null;

  /**
   * 의사가 준 종이 폼시트를 찍어 일정을 받는다.
   *
   * 판독은 **브라우저 안에서** 한다 (`lib/formsheet`). 예전에는 이 한 경로만 서버의
   * 파이썬+OpenCV 를 필요로 했다 — OCR 도 식사 모델도 판정 엔진도 픽토그램도 전부
   * 기기 안에 있는데, 정작 인터넷이 없는 진료소에서 가장 쓰고 싶은 기능이 인터넷을
   * 요구하고 있었다.
   *
   * 못 찾으면 원본 해상도로 한 번 더 본다. 평소에는 긴 변 2000px 로 줄여서 읽는데
   * (윤곽선 추적이 화소 수에 비례한다), 멀리서 찍어 마커가 작게 잡힌 장은 줄이는
   * 순간 무늬가 뭉개진다. 그럴 때 서버를 부르는 것보다 **화소를 더 주는 쪽**이 낫다 —
   * 같은 알고리즘이고, 망이 없어도 된다.
   *
   * 판독기는 일부러 정적 import 다. 동적으로 불러오면 그 조각은 *시트를 실제로 읽는
   * 순간*에야 내려오고, 서비스워커는 내려온 것만 캐시한다 — 연결된 상태에서 한 번
   * 읽어 본 적이 없으면 오프라인에서 못 쓴다. 오프라인이 이 기능의 요점인데.
   */
  async function readFormSheet(file: File) {
    setReading(true);
    setResult(null);
    try {
      let values: FormSheetValues;
      let problems: string[];
      try {
        let sheetRead = parseFormSheet(await decodeToGray(file));
        if (!sheetRead.foundPage) sheetRead = parseFormSheet(await decodeToGray(file, RETRY_WORK_DIM));
        values = sheetRead.values;
        problems = sheetRead.problems;
      } catch (err) {
        // 캔버스나 createImageBitmap 이 없는 아주 오래된 브라우저 — 서버가 대신 읽는다.
        //
        // 이 대체 경로도 실패할 수 있다는 것을 잊고 있었다. 망이 끊기면 fetch 는 값을
        // 돌려주는 게 아니라 던지고, 그 예외는 아래 finally 를 지나 밖으로 새어 나갔다 —
        // 물레방아가 멈추고 **화면에는 아무 말도 뜨지 않는다.** 사용자는 앱이 멎은
        // 것인지 자기가 잘못 찍은 것인지 알 방법이 없다. 실패해도 말은 해야 한다.
        console.error('[form-sheet] 기기에서 읽지 못했다:', err);
        try {
          const res = await fetch('/api/form-sheet', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ image: await toDataUrl(file) }),
          });
          if (!res.ok) throw new Error(String(res.status));
          ({ values, problems = [] } = (await res.json()) as { values: FormSheetValues; problems?: string[] });
        } catch (err2) {
          console.error('[form-sheet] 서버도 읽지 못했다:', err2);
          setResult('Could not read the sheet — lay it flat so all four corner marks are in frame.');
          return;
        }
      }

      const reading = toSchedule(values);
      if (reading.schedule.length === 0) {
        // 종이를 아예 못 찾은 것과 칸을 안 채운 것은 사용자가 할 일이 다르다.
        const lost = problems.some((p) => p.startsWith('could not locate'));
        setResult(lost
          ? 'Could not find the sheet — lay it flat so all four corner marks are in frame.'
          : `Could not read: ${reading.missing.join(', ')} not marked.`);
        return;
      }
      setSheet({ schedule: reading.schedule, summary: reading.summary });
      setResult(`Read from the sheet — ${reading.summary}`);
      speak(`Schedule read. ${reading.summary}`, 'en-US');
    } finally {
      setReading(false);
    }
  }

  /** 하드웨어 없이 읽기 경로를 보여주기 위한 샘플 (기기가 표시할 크기 그대로 만든 QR) */
  async function readSample() {
    const blob = await (await fetch('/device-code-demo.png')).blob();
    await readDeviceCode(new File([blob], 'device.png', { type: 'image/png' }));
  }

  async function readDeviceCode(file: File) {
    setReading(true);
    setResult(null);
    try {
      const text = await decodeQrFromImage(file);
      if (!text) {
        setResult('No code found — hold the device screen steady in frame.');
        return;
      }
      if (messageKind(text) !== 'event') {
        setResult('That code is not from a SnapCare device.');
        return;
      }
      const event = decodeEvent(text);
      if (!event) {
        setResult('The code was damaged. Try again.');
        return;
      }

      const name = names[event.slot - 1] ?? `Compartment ${event.slot}`;
      addScan({
        id: `dev_${event.seq}_${event.slot}_${event.time}`,
        itemId: `device_slot_${event.slot}`,
        name,
        kind: 'medicine',
        emoji: '💊',
        memberId: member?.id ?? 'you',
        level: event.taken ? 'safe' : 'caution',
        timeLabel: nowLabel(),
        dayKey: todayKey(),
      });

      const spoken = event.taken
        ? `${name} taken at ${event.time}.`
        : `${name} was missed at ${event.time}.`;
      setResult(spoken);
      speak(spoken, 'en-US');
    } finally {
      setReading(false);
    }
  }

  return (
    <MobileScreen>
      <div className="px-5 pt-14 pb-10">
        <button onClick={() => router.push('/settings')} className="text-sm font-semibold" style={{ color: 'var(--color-sc-primary)' }}>
          ‹ Settings
        </button>
        <h1 className="mt-2 text-2xl font-extrabold" style={{ color: 'var(--color-sc-ink)' }}
            {...ask('Pill device. Send your dose times to the box, or read what it shows.')}>Pill device</h1>
        <Speakable text="The phone and the box are on the same Wi-Fi. Nothing else is needed."
                   className="mt-1 text-sm flex w-full items-center gap-2">
          <span className="flex-1">Same Wi-Fi — nothing else needed.</span>
        </Speakable>

        {/* 폰 → 기기 (WiFi) */}
        <Speakable text="Send the schedule to the box."
                   className="mt-6 text-[11px] font-bold tracking-wide flex w-full items-center gap-2">
          <span className="flex-1">SEND THE SCHEDULE</span>
        </Speakable>
        {trayPlan.plan.length > 0 || sheet?.schedule.length ? (
          <div className="mt-2 rounded-3xl bg-white px-4 py-4 shadow-sm">
            <div className="flex flex-col gap-1">
              {trayPlan.plan.map((t) => (
                <Speakable key={t.tray} text={`Tray ${t.tray}. ${t.name}, at ${t.time}.`}
                           className="flex items-center gap-2 py-1">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white"
                        style={{ background: 'var(--color-sc-primary)' }}>
                    {t.tray}
                  </span>
                  <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
                    {t.name}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--color-sc-muted)' }}>{t.time}</span>
                </Speakable>
              ))}
            </div>

            {/*
              트레이가 모자라 못 실은 복용이 있으면 반드시 말한다. 조용히 자르면
              기기에 없는 복용을 있다고 믿게 되는데, 그건 알람이 아예 없는 것보다 나쁘다.

              그런데 "반드시 말한다" 고 적어 놓고 **글자로만** 냈다. 화면의 나머지가
              전부 눌러서 들리는데 이 줄만 조용했고, 하필 이 줄이 "기기가 주지 않을
              약" 을 알리는 자리다. 출품 기기는 트레이가 셋이라 이 경고는 드물게가
              아니라 자주 뜬다.
            */}
            {trayPlan.dropped.length > 0 && (
              <Speakable
                text={`Warning. ${trayPlan.dropped.length} dose${trayPlan.dropped.length > 1 ? 's' : ''} did not fit, because this device has only ${trays} tray${trays > 1 ? 's' : ''}. ${trayPlan.dropped.map((r) => r.item.name).join(', ')} must still be taken by hand. The device will not remind you of ${trayPlan.dropped.length > 1 ? 'those' : 'that'}.`}
                className="mt-2 flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold"
                style={{ background: 'var(--color-caution-bg)', color: 'var(--color-caution)' }}>
                <span className="flex-1">
                  ⚠️ {trayPlan.dropped.length} dose{trayPlan.dropped.length > 1 ? 's' : ''} did not fit — this device has {trays} tray{trays > 1 ? 's' : ''}.
                  {' '}{trayPlan.dropped.map((r) => r.item.name).join(', ')} must still be taken by hand.
                </span>
              </Speakable>
            )}

            {/*
              달려 있는 트레이 수. 기기마다 다르고(출품 기기는 3개) 없는 칸을 지정하면
              펌웨어가 요청을 거절한다. 숫자를 읽지 못해도 고를 수 있도록 칸을 그림처럼
              늘어놓는다.
            */}
            <div className="mt-3">
              <Speakable text={'How many trays does this device have?'} className="text-[11px] font-bold tracking-wide flex w-full items-center gap-2" style={{ color: 'var(--color-sc-muted)' }}>
          <span className="flex-1">TRAYS ON THIS DEVICE</span>
        </Speakable>
              <div className="mt-2 flex gap-2">
                {Array.from({ length: MAX_TRAYS }, (_, i) => i + 1).map((n) => (
                  <button key={n} onClick={() => setTrays(n)}
                    className="h-9 w-9 rounded-xl text-sm font-bold"
                    style={{
                      background: n <= trays ? 'var(--color-sc-primary)' : 'var(--color-sc-line)',
                      color: n <= trays ? '#fff' : 'var(--color-sc-muted)',
                    }}
                    {...sayable(`${n} tray${n > 1 ? 's' : ''}`)}>
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* 주소는 이 앱에 남은 유일한 문자 입력이다. 기본값을 채워 두고 바꿀 수만 있게 한다. */}
            <label className="mt-3 flex items-center gap-2 rounded-2xl px-3 py-2"
                   style={{ background: 'var(--color-sc-bg)' }}>
              <span className="text-base" aria-hidden>📡</span>
              <input
                value={host}
                onChange={(e) => setHost(e.target.value)}
                spellCheck={false}
                aria-label="Device address"
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: 'var(--color-sc-ink)' }}
              />
            </label>

            {/*
              fetch 가 아니라 링크다. HTTPS 페이지에서 HTTP 로 요청을 보내면 브라우저가
              막지만, 최상위 이동은 막지 않는다. 누르면 기기 자신의 확인 화면이 뜬다.
            */}
            {/*
              fetch 가 아니라 링크다. HTTPS 페이지에서 HTTP 로 요청을 보내면 브라우저가
              막지만, 최상위 이동은 막지 않는다.

              `/schedule` 로 보낸다 — `/save` 가 아니다. `/save` 에는 요일 칸도 기간
              칸도 없어서 월·수·금 처방이 매일 나오고 30일 코스가 끝나지 않는다.
              페이로드를 만들 수 없을 때만(있을 수 없는 경우다) 옛 경로로 떨어진다.
            */}
            <a
              href={looksLikeHost(host)
                ? (sendPayload ? scheduleUrl(host, sendPayload) : saveUrl(host, trayPlan.plan))
                : undefined}
              className="mt-2 block rounded-2xl py-3 text-center text-sm font-bold text-white"
              style={{ background: looksLikeHost(host) ? 'var(--color-sc-primary)' : 'var(--color-sc-muted)' }}
              aria-disabled={!looksLikeHost(host)}
            >
              <span {...sayable('Send to the device. Press once and the box will show what it saved.')}>Send to the device</span>
            </a>
            <p className="mt-1 text-center text-[11px]" style={{ color: 'var(--color-sc-muted)' }}>
              Both on the same Wi-Fi. The device shows what it saved.
              {sheet?.schedule.length ? ' Days of the week and course length are included.' : ''}
            </p>

            {/*
              배출 버튼.

              기기는 예정된 시각에 떨어뜨리지 않는다 — 링이 초록으로 켜지고 부저가
              울리며 기다리고, 이것이 트레이를 여는 유일한 원격 경로다. 이 버튼이
              없는 동안 제대로 조립된 기기는 한 시간 울리다 미복용으로 기록했다.

              항상 보인다. 지금 나와 있는 복용이 있는지는 이 페이지가 알 수 없고
              (HTTPS 에서 기기의 /api/status 를 읽을 수 없다), 기다리는 것이 없을 때
              눌러도 기기가 "기다리던 것이 없다" 는 화면을 보여 줄 뿐 아무것도 열지
              않는다. 누르지 못하는 것보다 헛누르는 편이 훨씬 낫다.
            */}
            <a
              href={looksLikeHost(host) ? releaseUrl(host) : undefined}
              className="mt-2 block rounded-2xl border-2 py-3 text-center text-sm font-bold"
              style={{
                borderColor: looksLikeHost(host) ? 'var(--color-sc-primary)' : 'var(--color-sc-line)',
                color: looksLikeHost(host) ? 'var(--color-sc-primary)' : 'var(--color-sc-muted)',
              }}
              aria-disabled={!looksLikeHost(host)}
            >
              <span {...sayable('Give me my pills now. Press this when the box is lit up and beeping.')}>Give me my pills now</span>
            </a>
            <p className="mt-1 text-center text-[11px]" style={{ color: 'var(--color-sc-muted)' }}>
              Press when the box is lit and beeping — or press the button on the box itself.
            </p>
          </div>
        ) : (
          <Speakable text="Photograph a prescription first. The dose times it finds are what the box needs."
                   className="mt-2 rounded-2xl bg-white px-4 py-6 text-center text-sm shadow-sm flex w-full items-center gap-2">
          <span className="flex-1">Scan a prescription first — the schedule it creates is what the device needs.</span>
        </Speakable>
        )}

        {/*
          WiFi 가 없을 때의 대체 — 광학 내보내기.

          지금 하드웨어에는 카메라가 없어 이 QR 을 읽을 수 없다. 그럼에도 지우지 않는
          이유는 이 경로가 저인프라 환경의 유일한 대안이고(브로커도 인터넷도 필요 없다),
          펌웨어에 판독기를 붙이는 것이 뒤에 남은 작업이기 때문이다. 지금 지우면
          그 선택지가 있었다는 사실까지 사라진다. 그래서 접어 두고 상태를 밝힌다.
        */}
        {payload && (
          <details className="mt-6">
            <summary className="cursor-pointer text-[11px] font-bold tracking-wide"
                     style={{ color: 'var(--color-sc-muted)' }}>
              NO WI-FI? SHOW A CODE INSTEAD
            </summary>
            <div className="mt-2 flex flex-col items-center rounded-3xl bg-white px-5 py-6 shadow-sm">
              <QRCodeSVG value={payload} size={180} level="M" />
              <p className="mt-3 text-center text-[11px]" style={{ color: 'var(--color-sc-muted)' }}>
                Not how the schedule reaches this device — “Send to the device” above
                does that. This is the same schedule as a code, for a build with a
                camera or for reading out over the phone. The current hardware has
                no camera.
              </p>
            </div>
          </details>
        )}

        {/* 종이 → 폰 : 의사가 채운 폼시트 */}
        <Speakable text="Or read the paper sheet the clinic filled in."
                   className="mt-8 text-[11px] font-bold tracking-wide flex w-full items-center gap-2">
          <span className="flex-1">OR READ THE DOCTOR&apos;S SHEET</span>
        </Speakable>
        <label className="mt-2 flex w-full cursor-pointer items-center gap-3 rounded-2xl bg-white px-4 py-4 shadow-sm" style={{ opacity: reading ? 0.5 : 1 }}>
          <span className="text-2xl">📄</span>
          <span className="flex-1">
            <span className="block text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
              Photograph the paper form sheet
            </span>
            <span className="block text-xs" style={{ color: 'var(--color-sc-muted)' }}>
              {sheet ? sheet.summary : 'The clinic fills it in — you only take the photo'}
            </span>
          </span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={reading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void readFormSheet(f);
            }}
          />
        </label>

        {/* 기기 → 폰 */}
        <Speakable text="Read the box. Photograph the code on its screen to record whether the dose was taken."
                   className="mt-8 text-[11px] font-bold tracking-wide flex w-full items-center gap-2">
          <span className="flex-1">READ THE DEVICE</span>
        </Speakable>
        <label
          className="mt-2 flex w-full cursor-pointer items-center gap-3 rounded-2xl bg-white px-4 py-4 shadow-sm"
          style={{ opacity: reading ? 0.5 : 1 }}
        >
          <span className="text-2xl">📷</span>
          <span className="flex-1">
            <span className="block text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
              {reading ? 'Reading…' : 'Photograph the code on the device'}
            </span>
            <span className="block text-xs" style={{ color: 'var(--color-sc-muted)' }}>
              Logs whether the dose was taken
            </span>
          </span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={reading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void readDeviceCode(f);
            }}
          />
        </label>

        {!reading && (
          <button
            onClick={() => void readSample()}
            className="mt-2 w-full text-center text-xs underline underline-offset-4"
            style={{ color: 'var(--color-sc-muted)' }}
          >
            No device here — try a sample code
          </button>
        )}

        {result && (
          <div className="mt-3 rounded-2xl px-4 py-3" style={{ background: 'var(--color-safe-bg)' }}>
            <Hint text={result} tone="info" />
          </div>
        )}
      </div>
    </MobileScreen>
  );
}
