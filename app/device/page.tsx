'use client';

import { useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { MobileScreen } from '@/components/sc/MobileScreen';
import { DispenserPanel } from '@/components/sc/DispenserPanel';
import { isDemo } from '@/lib/snapcare/demo';
import { useIsClient } from '@/lib/hooks';
import { DoseRelease } from '@/components/sc/DoseRelease';
import { useDispenser } from '@/lib/dispenser/useDispenser';
import { toCloudSlots } from '@/lib/dispenser/fromApp';
import { useDoseLog } from '@/lib/dispenser/useDoseLog';
import { useDoseAlert } from '@/lib/dispenser/useDoseAlert';
import { Hint } from '@/components/sc/Hint';
import { sayable, ask, Hear, Speakable } from '@/components/sc/Say';
import { useReminders } from '@/stores/reminders';
import { useScans, nowLabel, todayKey } from '@/stores/scans';
import { useProfile } from '@/stores/profile';
import { encodeSchedule, encodeWeekly, decodeEvent, messageKind, type SlotSchedule, type WeeklySlot } from '@/lib/hardware/protocol';
import { type FormSheetValues } from '@/lib/hardware/formSheet';
import { decodeQrFromImage } from '@/lib/hardware/qr';
import { decodeToGray, RETRY_WORK_DIM } from '@/lib/formsheet/decode';
import { parseFormSheet } from '@/lib/formsheet/sheet';
import { readHandwriting } from '@/lib/formsheet/readName';
import { scaleTransform } from '@/lib/formsheet/field';
import { PictogramStrip } from '@/components/sc/PictogramStrip';
import { itemToDsl } from '@/lib/snapcare/sigil';
import { PillIcon } from '@/components/icons';
import { forPictograms, readPrescription, scheduleSentence, toScanItem, type SheetPrescription } from '@/lib/formsheet/prescription';
import { DEFAULT_HOST, FITTED_TRAYS, MAX_TRAYS, planTrays, saveUrl, scheduleUrl, releaseUrl, weeklyFrom, looksLikeHost } from '@/lib/hardware/dispenser';
import { speak } from '@/lib/voice';
import { PushToggle } from './push-toggle';
import { shortName } from '@/lib/snapcare/shortName';

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
  const addScan = useScans((s) => s.addScan);
  const member = useProfile((s) => s.profile);

  // 클라우드 경로 — 같은 WiFi 가 아니어도 닿는다. 아래 LAN 경로는 인터넷이 없을
  // 때의 대체로 남는다.
  const box = useDispenser();
  /*
    시연인가. 주소와 브라우저 저장소를 읽으므로 화면이 붙은 뒤에 판단한다 —
    그리기 중에 부르면 서버가 그린 화면과 어긋난다.
  */
  const ready = useIsClient();
  const demo = ready && isDemo();

  const [host, setHost] = useState(DEFAULT_HOST);
  const [reading, setReading] = useState(false);
  /** 읽는 동안 어느 단계인지. 이름 OCR 은 몇 초가 걸려서 말이 없으면 멈춘 것으로 보인다. */
  const [stage, setStage] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [sending, setSending] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  // 폼시트에서 읽어낸 일정 — 있으면 알람 대신 이것을 기기로 내보낸다.
  // 시트에서 온 일정은 요일·기간을 갖는다 (WeeklySlot). 앱 안에서 만든 알람은 안 갖는다.
  const [sheet, setSheet] = useState<{ schedule: WeeklySlot[]; summary: string } | null>(null);
  /** 종이에서 읽은 처방 — 이름과 그림까지. 버블만 읽힌 경우에도 값이 있다. */
  const [rx, setRx] = useState<SheetPrescription | null>(null);

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
  const [traysPicked, setTrays] = useState(FITTED_TRAYS);

  /*
    짝지은 상자는 **자기 칸 수를 스스로 말한다** (`status.trayCount`). 위 주석은 물어볼
    길이 없다고 적혀 있는데, 그것은 LAN 경로에서만 참이다 — 사서함으로 오는 보고에는
    그 숫자가 들어 있다.
    사람에게 고르게 하는 것보다 낫다. 기본값 8 을 그대로 둔 채 트레이 셋짜리 기기로
    보내면 없는 칸을 지정한 복용이 조용히 사라지고, "안 들어간 복용" 경고도 뜨지 않는다.
  */
  const trays = box.report?.status.trayCount ?? traysPicked;
  const trayPlan = useMemo(() => planTrays(reminders, trays), [reminders, trays]);

  // 어느 칸에 무슨 약이 들었는지. 상자가 남긴 기록에 이름을 붙이는 데 쓴다 —
  // 모르면 "Compartment 3" 이 되고, 그것이 지어낸 이름보다 낫다.
  const trayNames = useMemo(
    () => Object.fromEntries(trayPlan.plan.map((t) => [t.tray, t.name])),
    [trayPlan],
  );
  // 그 칸의 1회 복용량. 이름과 같은 자리에서 온다 — 상자는 둘 다 모른다.
  const trayDoses = useMemo(
    () => Object.fromEntries(
      trayPlan.plan.flatMap((t) => (t.source?.item?.rx?.doseText ? [[t.tray, t.source.item.rx.doseText]] : [])),
    ),
    [trayPlan],
  );
  useDoseLog(box.report, trayNames, trayDoses);
  // 앱을 보고 있지 않을 때는 알림이 부른다 — 배출 버튼은 화면을 봐야 보인다.
  useDoseAlert(box.report);

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
  /*
    손으로 보내는 자리를 펼칠 것인가.

    종이를 읽었으면 펼친다. 요일과 기간은 알람에 없고 종이에만 있어서, 자동 전송이
    그 둘을 실을 수 없다 — 그때는 사람이 눌러야 도착한다.
  */
  const advanced = demo || !!sheet?.schedule.length;

  const payload = sheet?.schedule.length
    ? encodeWeekly(sheet.schedule)
    : slots.length > 0 ? encodeSchedule(slots) : null;

  // 기기로 보낼 것. 시트를 읽었으면 그쪽이 우선이다 — 종이에는 요일과 기간이 적혀
  // 있고 `/save` 는 그 둘을 버리기 때문이다. 시트가 없으면 앱 안의 알람을 주간
  // 슬롯으로 바꿔 같은 무손실 경로로 보낸다.
  const sendSlots: WeeklySlot[] = sheet?.schedule.length
    ? sheet.schedule
    : trayPlan.plan.length > 0
      ? weeklyFrom(reminders, trays).slots
      : [];
  const sendPayload = sendSlots.length > 0 ? encodeWeekly(sendSlots) : null;

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
  async function sendToBox() {
    if (!box.paired || sendSlots.length === 0) return;
    setSending('sending');
    try {
      await box.setSchedule(toCloudSlots(sendSlots));
      setSending('sent');
      const what = trayPlan.plan.length === 1
        ? 'One dose time was sent to the box.'
        : `${trayPlan.plan.length} dose times were sent to the box.`;
      setResult(what);
      speak(what, 'en-US');
    } catch (err) {
      console.error('[dispenser] 일정 전송 실패:', err);
      setSending('failed');
      // 조용히 실패하면 안 되는 자리다. 보냈다고 믿은 사람은 상자가 약을 내보낼
      // 것이라고 믿고, 그 믿음은 아무 일도 일어나지 않는 아침에 깨진다.
      const what = 'The schedule did not reach the box. Try again.';
      setResult(what);
      speak(what, 'en-US');
    }
  }

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
      /*
        손으로 쓴 칸은 **버블을 다 읽은 뒤에** 읽는다.

        순서가 뜻을 가진다. 버블은 확실하고 이름은 아니라서, 이름을 못 읽어도
        층·요일·기간·시각은 그대로 상자로 갈 수 있다. 먼저 읽으면 실패가 앞을
        막고, 그러면 확실한 넷까지 같이 잃는다.
      */
      let hand = { name: '', count: '', notes: '' };
      try {
        let work = await decodeToGray(file);
        let sheetRead = parseFormSheet(work);
        if (!sheetRead.foundPage) {
          work = await decodeToGray(file, RETRY_WORK_DIM);
          sheetRead = parseFormSheet(work);
        }
        values = sheetRead.values;
        problems = sheetRead.problems;

        if (sheetRead.transform) {
          /*
            이름칸은 **더 큰 그림에서** 읽는다.

            버블은 2000px 로 줄인 그림에서 읽는다 — 마커 무늬가 60px 로 잡히고
            그것으로 충분하며, 윤곽선 추적이 화소 수에 비례한다. 그런데 이름칸은
            종이의 4.7mm 라 그 배율에서는 글자가 남지 않는다.

            마커를 다시 찾지는 않는다. 같은 사진, 같은 종이라 변환은 배율만 다르고,
            그 배율은 두 그림의 폭 비율이다.
          */
          setStage('Reading the name…');
          const full = work.w >= RETRY_WORK_DIM ? work : await decodeToGray(file, RETRY_WORK_DIM);
          const M = full === work
            ? sheetRead.transform
            : scaleTransform(sheetRead.transform, full.w / work.w);
          hand = await readHandwriting(full, M,
            (p) => setStage(`Reading the name… ${Math.round(p * 100)}%`));
        }
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

      setStage(null);
      const parsed = readPrescription(values, hand.name, hand.count, hand.notes);
      setRx(parsed);
      const reading = parsed.schedule;
      if (reading.schedule.length === 0) {
        // 종이를 아예 못 찾은 것과 칸을 안 채운 것은 사용자가 할 일이 다르다.
        const lost = problems.some((p) => p.startsWith('could not locate'));
        setResult(lost
          ? 'Could not find the sheet — lay it flat so all four corner marks are in frame.'
          : `Could not read: ${reading.missing.join(', ')} not marked.`);
        return;
      }
      setSheet({ schedule: reading.schedule, summary: reading.summary });
      const named = parsed.drug ? `${parsed.drug.name} — ` : '';
      setResult(`Read from the sheet — ${named}${reading.summary}`);
      speak(`Schedule read. ${named}${reading.summary}`, 'en-US');
    } finally {
      setReading(false);
      setStage(null);
    }
  }

  /** 종이 없이 시트 경로를 보여주기 위한 표본 — 실제로 채워 찍은 것과 같은 그림이다. */
  async function readSampleSheet() {
    const blob = await (await fetch('/form-sheet-demo.jpg')).blob();
    await readFormSheet(new File([blob], 'sheet.jpg', { type: 'image/jpeg' }));
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
    <MobileScreen bar="inner">
      <div className="px-5 pt-14 pb-10">
        {/* 뒤로가기를 걷어냈다. 이 화면은 홈의 위성이라 **들어온 길이 홈**인데
            나가는 길만 설정으로 갔다. 아래 줄의 Home 버튼이 들어온 길로 돌려보낸다. */}
        <h1 className=" text-2xl font-extrabold" style={{ color: 'var(--color-sc-ink)' }}
            {...ask('Pill device. Send your dose times to the box, or read what it shows.')}>Pill device</h1>
        {/*
          짝을 지으면 이 말이 더 이상 참이 아니다 — 사서함을 거치므로 같은 공유기 뒤에
          있을 필요가 없다. 화면이 사실과 다른 말을 하고 있으면, 그 말을 믿고 상자 옆으로
          걸어가는 사람이 생긴다.
        */}
        <Speakable text={box.paired
          ? 'The box has its own mailbox. You can send from anywhere.'
          : 'The phone and the box are on the same Wi-Fi. Nothing else is needed.'}
                   className="mt-1 text-sm flex w-full items-center gap-2">
          <span className="flex-1">
            {box.paired ? 'Anywhere — the box has its own mailbox.' : 'Same Wi-Fi — nothing else needed.'}
          </span>
        </Speakable>

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
          일정을 손으로 보내는 자리 — 이제 **평소에는 안 보인다.**

          알람이 바뀌면 저절로 사서함으로 가므로(`useAutoSend`), 이 화면에 있던
          "보내기" 는 사람이 눌러야 하는 것이 아니라 눌러도 되는 것이 됐다. 칸 수를
          고르는 자리, 같은 Wi-Fi 로 보내는 링크, 광학 QR 도 마찬가지다 — 전부
          "안 될 때의 다른 길" 이고, 안 될 때가 아닌데 늘 펼쳐 두면 이 화면이 무엇을
          하는 곳인지가 흐려진다.

          두 경우에는 남는다. 시연에서는 그 경로들 자체가 보여줄 것이고, **종이
          폼시트를 읽었을 때**는 자동 전송이 못 하는 일이 있다 — 요일과 기간은
          알람에 없고 종이에만 적혀 있다.
        */}
        {advanced && (<>
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
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                        style={{ background: 'var(--color-sc-primary)' }}>
                    {t.tray}
                  </span>
                  {/*
                    짧은 이름. 원문은 이 줄의 소리(위 `Speakable`)와 `title` 에 그대로
                    남아 있다 — 줄이는 것과 지우는 것은 다르다.

                    한 줄로 묶어 두는 것도 같이 필요하다. 규칙이 못 줄이는 이름이
                    반드시 있고(약 이름 한 낱말이 스물다섯 자인 것들이 있다), 그때
                    두 줄로 넘치면 트레이 번호와 시각이 서로 다른 줄에 앉는다. 어느
                    약이 몇 번 칸인지가 이 화면의 유일한 요점인데.
                  */}
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold"
                        title={t.name}
                        style={{ color: 'var(--color-sc-ink)' }}>
                    {shortName(t.name)}
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
                  {' '}{trayPlan.dropped.map((r) => shortName(r.item.name)).join(', ')} must still be taken by hand.
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
              {/* 상자가 스스로 말해 준 숫자가 있으면 고르게 하지 않는다 — 고르면 틀릴 수 있다. */}
              {box.report ? (
                <Speakable text={`The box says it has ${trays} trays.`}
                           className="mt-2 flex w-full items-center gap-2 text-sm font-semibold">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold text-white"
                        style={{ background: 'var(--color-sc-primary)' }}>{trays}</span>
                  <span className="flex-1" style={{ color: 'var(--color-sc-muted)' }}>
                    The box told us this
                  </span>
                </Speakable>
              ) : (
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
              )}
            </div>

            {/*
              짝지은 상자가 있으면 사서함으로 보낸다.

              LAN 링크와 무엇이 다른가: 링크는 폰과 상자가 **같은 공유기 뒤에** 있어야
              하고 누르면 화면이 기기 페이지로 넘어간다. 이쪽은 상자가 켜져 있기만
              하면 되고 이 화면에 머문다. 딸이 다른 도시에서 어머니의 상자에 일정을
              넣는 것은 이 경로에서만 된다.

              그래서 짝이 있으면 이쪽이 기본이고, 같은 Wi-Fi 경로는 아래로 접어 둔다 —
              지우지는 않는다. 인터넷이 아예 없는 진료소에서는 그쪽만 남는다.
            */}
            {box.paired ? (
              <>
                <button
                  onClick={sendToBox}
                  disabled={sending === 'sending' || sendSlots.length === 0}
                  className="mt-3 block w-full rounded-2xl py-3 text-center text-sm font-bold text-white disabled:opacity-60"
                  style={{ background: 'var(--color-sc-primary)' }}
                  {...sayable('Send the dose times to the box. It does not need to be on the same Wi-Fi.')}
                >
                  {sending === 'sending' ? 'Sending…' : sending === 'sent' ? 'Sent ✓' : 'Send to the box'}
                </button>
                <p className="mt-1 text-center text-[11px]" style={{ color: 'var(--color-sc-muted)' }}>
                  {sending === 'sent'
                    ? 'The box will show it at the top of this screen when it picks it up.'
                    : 'Anywhere — the box does not have to be on this Wi-Fi.'}
                  {sheet?.schedule.length ? ' Days of the week and course length are included.' : ''}
                </p>
                {sending === 'failed' && (
                  <Speakable text="The schedule did not reach the box. Try again."
                             className="mt-2 flex w-full items-center gap-2 text-xs font-semibold"
                             style={{ color: 'var(--color-avoid)' }}>
                    <span className="flex-1">It did not reach the box — try again.</span>
                  </Speakable>
                )}
              </>
            ) : null}

            {/*
              같은 Wi-Fi 경로. 짝이 있으면 접어 둔다 — 위쪽 하나로 끝나는데 주소 입력과
              버튼 둘을 나란히 두면, 읽지 못하는 사람에게는 "보내기" 가 셋인 화면이 된다.
            */}
            <LanPath folded={!!box.paired}>
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
            </LanPath>
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

        </>)}

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
              {stage ?? (sheet ? sheet.summary : 'The clinic fills it in — you only take the photo')}
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

        {/*
          종이가 없는 자리에서 이 경로를 보여주기 위한 표본. 시연에서만 낸다.

          진짜 폼시트를 인쇄해 채운 것을 찍은 것과 **같은 그림**이다 — 버블도
          손글씨도 실제로 들어 있고, 판독기는 이것이 표본이라는 것을 모른다.
          우회로를 만들면 보여준 것이 돌아가는 것이 아니게 된다.
        */}
        {demo && !reading && (
          <button
            onClick={() => void readSampleSheet()}
            className="mt-2 flex w-full items-center justify-center gap-1 text-center text-xs
                       underline underline-offset-4"
            style={{ color: 'var(--color-sc-muted)' }}
          >
            No sheet here — try a filled one
          </button>
        )}

        {rx && <SheetCard rx={rx} />}

        {/*
          기기 → 폰. **시연에서만 낸다.**

          상자가 보고한 복용은 사서함을 거쳐 저절로 기록에 들어온다(`useDoseLog`).
          이 화면의 사진 찍기는 그 길이 막혔을 때의 다른 길이고 — 상자가 인터넷을
          못 볼 때 — 그 경우를 실제로 만나는 사람은 화면을 스스로 열어 보지 않는다.
          늘 펼쳐 두면 "복용을 남기려면 매번 상자를 찍어야 하나" 로 읽힌다.

          "표본 코드로 해 보기" 는 더 분명하다. 그건 상자가 없는 자리에서 이 경로를
          보여주기 위한 물건이고, 상자를 가진 사람에게는 뜻이 없다.
        */}
        {demo && (<>
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
            className="mt-2 flex w-full items-center justify-center gap-1 text-center text-xs
                       underline underline-offset-4"
            style={{ color: 'var(--color-sc-muted)' }}
          >
            <span aria-hidden className="not-italic no-underline">🧪</span>
            No device here — try a sample code
          </button>
        )}

        </>)}

        {result && (
          <div className="mt-3 rounded-2xl px-4 py-3" style={{ background: 'var(--color-safe-bg)' }}>
            <Hint text={result} tone="info" />
          </div>
        )}
      </div>
    </MobileScreen>
  );
}

/**
 * 같은 Wi-Fi 로 보내는 옛 경로를 감싼다.
 *
 * 짝지은 상자가 있으면 접어 두고, 없으면 그대로 편다. 지우지 않는 이유는 이쪽이
 * **인터넷이 없을 때 남는 유일한 길**이기 때문이다 — 릴레이도 클라우드도 못 쓰는
 * 진료소에서, 폰과 상자가 같은 공유기 뒤에 있기만 하면 일정이 건너간다.
 */
function LanPath({ folded, children }: { folded: boolean; children: React.ReactNode }) {
  if (!folded) return <>{children}</>;
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-[11px] font-bold tracking-wide"
               style={{ color: 'var(--color-sc-muted)' }}>
        NO INTERNET? USE THE SAME WI-FI
      </summary>
      {children}
    </details>
  );
}

/**
 * 종이에서 읽은 처방, 한 장으로.
 *
 * 여섯 가지를 다 낸다 — 이름, 그림, 몇 번째 층, 무슨 요일, 며칠치, 몇 시. 그 여섯이
 * 이 기능이 존재하는 이유이고, 하나라도 빠지면 사람이 종이를 다시 봐야 한다.
 *
 * 못 읽은 것을 못 읽었다고 말한다
 * -------------------------------
 * 이름이 안 잡히는 경우가 둘이고, 사람이 할 일이 다르다. 글자가 아예 안 나왔으면
 * 다시 찍는 것이고, 글자는 나왔는데 목록에 없으면 다시 찍어 봐야 소용이 없다.
 * 한 가지 말로 뭉치면 반은 헛걸음을 한다.
 *
 * 어느 쪽이든 **버블에서 읽은 넷은 그대로 보인다.** 이름을 못 읽은 것이 일정을 못
 * 읽은 것은 아니고, 이름 없는 일정도 상자로 보낼 수 있다.
 */
function SheetCard({ rx }: { rx: SheetPrescription }) {
  const item = toScanItem(rx);
  const sentence = scheduleSentence(rx);

  return (
    <div className="mt-3 rounded-3xl bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl"
              style={{ background: 'var(--color-med-bg)', color: 'var(--color-sc-primary)' }}>
          <PillIcon />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-bold" style={{ color: 'var(--color-sc-ink)' }}>
            {rx.drug ? rx.drug.name : 'Name not read'}
          </span>
          <span className="block text-xs" style={{ color: 'var(--color-sc-muted)' }}>
            {rx.drug
              ? `${rx.drug.form} · from the WHO essential medicines list`
              : rx.unread
                ? 'Photograph the sheet again, flat and in good light'
                : `Read as “${rx.read}” — not in the list this app carries`}
          </span>
        </span>
        <Hear text={rx.drug
          ? `${rx.drug.name}. ${rx.schedule.summary}.`
          : rx.unread
            ? 'The medicine name could not be read. Photograph the sheet again.'
            : `The name was read as ${rx.read}, which is not in the list this app carries.`} />
      </div>

      {/*
        일정은 **문장**이다. 그림으로 안 그린다.

        이 앱의 규칙은 "글을 못 읽어도 지시가 도착한다" 이지 "모든 것을 그림으로"
        가 아니다. 요일은 형태소가 아예 없고, `\time_morning` 한 장은 7시인지
        9시인지를 못 말하고, 30일치는 `\finish_course` 한 장으로 뭉개진다 — 그림으로
        옮기면 정확도를 잃으면서 자리는 더 먹는다.

        글을 못 읽는 사람에게는 이미 답이 있다. 이 줄에도 소리가 붙어 있다.
      */}
      {sentence && (
        <div className="mt-3 flex items-start gap-2 rounded-2xl px-3 py-3"
             style={{ background: 'var(--color-sc-bg)' }}>
          <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
            {sentence}
          </span>
          <Hear text={sentence} />
        </div>
      )}

      {/*
        그림은 **약과 주의**를 진다. 말로 옮기면 길어지는 것들 — 안약을 눈에,
        흔들고 쓴다, 운전하지 않는다 — 이고, 한 장이면 끝나며 언어가 필요 없다.
        일정과 겹치지 않는다.

        `avoid` 는 거짓이다. 이 화면은 종이를 읽은 결과이지 **판정이 아니다** —
        누가 먹을 것인지가 아직 안 정해져서 임신 금기가 걸리는지 알 수 없다.
        판정은 이 처방이 사람에게 붙은 뒤에 나오고, 그때 사선이 그어진다.
        여기서 미리 그으면 아무에게도 걸리지 않은 경고를 모두에게 보이게 된다.
      */}
      {item && (
        <div className="mt-3">
          <PictogramStrip source={itemToDsl(forPictograms(item), false)} />
        </div>
      )}

      {/*
        약사가 적었는데 **우리가 못 그리는** 주의.

        버리지 않는다. 조용히 버리면 종이에는 있고 화면에는 없는 지시가 생기고,
        그것은 주의가 아예 없는 것보다 나쁘다 — 사람은 화면을 봤으니 다 봤다고
        여긴다. 그림이 없다는 것까지 말한다.
      */}
      {rx.notes.unknown.length > 0 && (
        <div className="mt-3 rounded-2xl px-3 py-3" style={{ background: 'var(--color-caution-bg)' }}>
          <div className="flex items-start gap-2">
            <span className="flex-1 text-xs font-bold tracking-wide" style={{ color: 'var(--color-caution)' }}>
              ALSO WRITTEN ON THE SHEET — NO PICTURE FOR THIS
            </span>
            <Hear text={`Also written on the sheet, with no picture for it. ${rx.notes.unknown.join('. ')}.`} />
          </div>
          {rx.notes.unknown.map((line) => (
            <p key={line} className="mt-1 text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
