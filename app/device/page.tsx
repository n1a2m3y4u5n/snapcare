'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { MobileScreen } from '@/components/sc/MobileScreen';
import { Hint } from '@/components/sc/Hint';
import { useReminders } from '@/stores/reminders';
import { useScans, nowLabel, todayKey } from '@/stores/scans';
import { useFamily } from '@/stores/family';
import { encodeSchedule, decodeEvent, messageKind, type SlotSchedule } from '@/lib/hardware/protocol';
import { toSchedule, type FormSheetValues } from '@/lib/hardware/formSheet';
import { decodeQrFromImage } from '@/lib/hardware/qr';
import { speak } from '@/lib/voice';

/**
 * 디스펜서와 주고받는 화면 — 네트워크 없이 카메라와 화면만 쓴다.
 *
 * 내보내기: 복약 일정을 QR로 띄운다. 기기가 그것을 읽어 트레이를 채운다.
 * 읽기   : 기기가 표시한 QR을 찍어 복용/놓침을 기록에 반영한다.
 *
 * 두 방향 모두 인터넷도, 페어링도, 같은 네트워크도 필요 없다.
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
  const { members, activeMemberId } = useFamily();
  const member = members.find((m) => m.id === activeMemberId) ?? members[0];

  const [reading, setReading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  // 폼시트에서 읽어낸 일정 — 있으면 알람 대신 이것을 기기로 내보낸다.
  const [sheet, setSheet] = useState<{ schedule: SlotSchedule[]; summary: string } | null>(null);

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

  // 폼시트를 읽었으면 그것이 우선한다 — 의사가 직접 채워준 일정이기 때문이다.
  const effective = sheet?.schedule.length ? sheet.schedule : slots;
  const payload = effective.length > 0 ? encodeSchedule(effective) : null;

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

        {/* 폰 → 기기 */}
        <p className="mt-6 text-[11px] font-bold tracking-wide" style={{ color: 'var(--color-sc-muted)' }}>
          SHOW THIS TO THE DEVICE
        </p>
        {payload ? (
          <div className="mt-2 flex flex-col items-center rounded-3xl bg-white px-5 py-6 shadow-sm">
            <QRCodeSVG value={payload} size={200} level="M" />
            <div className="mt-4 w-full">
              {slots.map((s, i) => (
                <div key={s.slot} className="flex items-center gap-2 py-1">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: 'var(--color-sc-primary)' }}>
                    {s.slot}
                  </span>
                  <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
                    {names[i] ?? `Compartment ${s.slot}`}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--color-sc-muted)' }}>{s.times.join(' · ')}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-2 rounded-2xl bg-white px-4 py-6 text-center text-sm shadow-sm" style={{ color: 'var(--color-sc-muted)' }}>
            Scan a prescription first — the schedule it creates is what the device needs.
          </p>
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
