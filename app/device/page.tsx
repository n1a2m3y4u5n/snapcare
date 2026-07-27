'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { MobileScreen } from '@/components/sc/MobileScreen';
import { Hint } from '@/components/sc/Hint';
import { useReminders } from '@/stores/reminders';
import { useScans, nowLabel, todayKey } from '@/stores/scans';
import { useProfile } from '@/stores/profile';
import { encodeSchedule, encodeWeekly, decodeEvent, messageKind, type SlotSchedule, type WeeklySlot } from '@/lib/hardware/protocol';
import { toSchedule, type FormSheetValues } from '@/lib/hardware/formSheet';
import { decodeQrFromImage } from '@/lib/hardware/qr';
import { DEFAULT_HOST, planTrays, saveUrl, looksLikeHost } from '@/lib/hardware/dispenser';
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
  const trayPlan = useMemo(() => planTrays(reminders), [reminders]);

  // 폼시트를 읽었으면 그것이 우선한다 — 의사가 직접 채워준 일정이기 때문이다.
  //
  // 시트에는 요일과 기간이 표시돼 있고 SC1*W* 가 그것을 실을 수 있다. SC1*S* 로 보내면
  // 월/수/금 30일이 '매일 무기한' 으로 도착한다 — 화면은 맞아 보이는데 기기가 나흘을
  // 더 연다. 앱 안에서 만든 알람에는 요일 개념이 없으므로 그쪽은 지금처럼 S 로 간다.
  const payload = sheet?.schedule.length
    ? encodeWeekly(sheet.schedule)
    : slots.length > 0 ? encodeSchedule(slots) : null;

  /** 의사가 준 종이 폼시트를 찍어 일정을 받는다 (인터넷도 DB도 필요 없는 경로). */
  async function readFormSheet(file: File) {
    setReading(true);
    setResult(null);
    try {
      const dataUrl = await toDataUrl(file);
      const res = await fetch('/api/form-sheet', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image: dataUrl }),
      });
      if (res.status === 501) {
        setResult('Form sheet reading is not available on this server.');
        return;
      }
      if (!res.ok) {
        setResult('Could not read the sheet — lay it flat so all four corner marks are in frame.');
        return;
      }
      const { values } = (await res.json()) as { values: FormSheetValues };
      const reading = toSchedule(values);
      if (reading.schedule.length === 0) {
        setResult(`Could not read: ${reading.missing.join(', ')} not marked.`);
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
        <h1 className="mt-2 text-2xl font-extrabold" style={{ color: 'var(--color-sc-ink)' }}>Pill device</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-sc-muted)' }}>
          No wiring, no network — the two screens talk by camera.
        </p>

        {/* 폰 → 기기 (WiFi) */}
        <p className="mt-6 text-[11px] font-bold tracking-wide" style={{ color: 'var(--color-sc-muted)' }}>
          SEND THE SCHEDULE
        </p>
        {trayPlan.plan.length > 0 ? (
          <div className="mt-2 rounded-3xl bg-white px-4 py-4 shadow-sm">
            <div className="flex flex-col gap-1">
              {trayPlan.plan.map((t) => (
                <div key={t.tray} className="flex items-center gap-2 py-1">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white"
                        style={{ background: 'var(--color-sc-primary)' }}>
                    {t.tray}
                  </span>
                  <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
                    {t.name}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--color-sc-muted)' }}>{t.time}</span>
                </div>
              ))}
            </div>

            {/*
              트레이가 모자라 못 실은 복용이 있으면 반드시 말한다. 조용히 자르면
              기기에 없는 복용을 있다고 믿게 되는데, 그건 알람이 아예 없는 것보다 나쁘다.
            */}
            {trayPlan.dropped.length > 0 && (
              <p className="mt-2 rounded-2xl px-3 py-2 text-xs font-semibold"
                 style={{ background: 'var(--color-caution-bg)', color: 'var(--color-caution)' }}>
                ⚠️ {trayPlan.dropped.length} more dose{trayPlan.dropped.length > 1 ? 's' : ''} did not fit — the device holds {10} trays.
              </p>
            )}

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
            <a
              href={looksLikeHost(host) ? saveUrl(host, trayPlan.plan) : undefined}
              className="mt-2 block rounded-2xl py-3 text-center text-sm font-bold text-white"
              style={{ background: looksLikeHost(host) ? 'var(--color-sc-primary)' : 'var(--color-sc-muted)' }}
              aria-disabled={!looksLikeHost(host)}
            >
              Send to the device
            </a>
            <p className="mt-1 text-center text-[11px]" style={{ color: 'var(--color-sc-muted)' }}>
              Both on the same Wi-Fi. The device shows what it saved.
            </p>
          </div>
        ) : (
          <p className="mt-2 rounded-2xl bg-white px-4 py-6 text-center text-sm shadow-sm" style={{ color: 'var(--color-sc-muted)' }}>
            Scan a prescription first — the schedule it creates is what the device needs.
          </p>
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
                Needs a device that can read a code. The current build has no camera —
                this path is kept for the offline case and is not wired up yet.
              </p>
            </div>
          </details>
        )}

        {/* 종이 → 폰 : 의사가 채운 폼시트 */}
        <p className="mt-8 text-[11px] font-bold tracking-wide" style={{ color: 'var(--color-sc-muted)' }}>
          OR READ THE DOCTOR&apos;S SHEET
        </p>
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
        <p className="mt-8 text-[11px] font-bold tracking-wide" style={{ color: 'var(--color-sc-muted)' }}>
          READ THE DEVICE
        </p>
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
