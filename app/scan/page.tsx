'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { MobileScreen } from '@/components/sc/MobileScreen';
import { VerdictHero } from '@/components/sc/VerdictHero';
import { PictogramStrip } from '@/components/sc/PictogramStrip';
import { NutrientBars } from '@/components/sc/NutrientBars';
import { useNutrition } from '@/lib/nutrition/useNutrition';
import { assessForMember, flagsForMember } from '@/lib/nutrition/compute';
import type { NutrientProfile } from '@/lib/nutrition/types';
import { useAnalysis } from '@/stores/analysis';
import { useFamily } from '@/stores/family';
import { useScans, nowLabel, todayKey } from '@/stores/scans';
import { useReminders } from '@/stores/reminders';
import { usePreferences } from '@/stores/preferences';
import { requestPermission, scheduleNotification } from '@/lib/notifications';
import { computeVerdict, LEVEL_META } from '@/lib/snapcare/verdict';
import { checkInteractions } from '@/lib/medication/interactions';
import { itemToDsl } from '@/lib/snapcare/sigil';
import { itemVoiceScript } from '@/lib/snapcare/say';
import { speak } from '@/lib/voice';
import type { ItemFlag, Member, ScanItem, Verdict } from '@/lib/snapcare/types';

export default function ScanResultPage() {
  const router = useRouter();
  const item = useAnalysis((s) => s.current);
  const setCurrent = useAnalysis((s) => s.setCurrent);
  const { members, activeMemberId } = useFamily();
  const addScan = useScans((s) => s.addScan);
  const scans = useScans((s) => s.scans);
  const addReminders = useReminders((s) => s.addReminders);

  const autoTts = usePreferences((s) => s.autoTts);
  const member = members.find((m) => m.id === activeMemberId) ?? members[0];

  // 영양 엔진이 이 사람 기준으로 계산한 플래그를 아이템에 합쳐 판정한다.
  // (카탈로그에 손으로 박아둔 플래그가 아니라 실제 수치·알레르기 태그에서 나온 것)
  const nutrition = useNutrition({ barcode: item?.barcode, profile: item?.profile }, member);
  const derivedKey = nutrition.flags?.join(',') ?? '';
  const scanned = useMemo(() => {
    if (!item) return null;
    if (!derivedKey) return item;
    return { ...item, flags: [...new Set([...item.flags, ...derivedKey.split(',') as ItemFlag[]])] };
  }, [item, derivedKey]);

  // 결과를 지우고 나갈 때 아래 가드 이펙트가 먼저 깨어 카메라로 되돌리는 경쟁이 있었다.
  // 의도적으로 떠나는 중이면 가드를 끈다.
  const leaving = useRef(false);

  useEffect(() => {
    if (!item && !leaving.current) router.replace('/camera');
  }, [item, router]);

  useEffect(() => {
    if (!scanned || !member || !autoTts) return;
    speak(itemVoiceScript(scanned, computeVerdict(scanned, member, nutrition.assessments), member), 'en-US');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanned?.id, derivedKey, member?.id, autoTts]);

  if (!item || !scanned || !member) return null;

  const isRx = item.kind === 'prescription' || item.kind === 'medicine';
  const baseVerdict = computeVerdict(scanned, member, nutrition.assessments);

  // 지금 복용 중인 약과 대조한다. 상품명이 달라도 성분이 겹치면 용량이 합쳐지는데,
  // 포장지를 읽을 수 없는 사용자는 그걸 스스로 알아낼 방법이 없다.
  const activeMeds = scans
    .filter((r) => r.memberId === member.id && (r.kind === 'medicine' || r.kind === 'prescription'))
    .map((r) => r.item)
    .filter((i): i is ScanItem => Boolean(i))
    .filter((i) => i.id !== scanned.id);
  const interactions = isRx ? checkInteractions(scanned, activeMeds) : [];

  const verdict: Verdict = interactions.length === 0 ? baseVerdict : {
    ...baseVerdict,
    level: 'avoid',
    headline: `Do not take with your other medicine`,
    summary: interactions.map((w) => w.text).join(' · '),
    reasons: [...baseVerdict.reasons, ...interactions.map((w) => ({ level: w.level, text: w.text }))],
  };

  function finish() {
    addScan({
      id: `r_${cryptoId()}`,
      itemId: item!.id,
      name: item!.name,
      kind: item!.kind,
      emoji: item!.emoji,
      memberId: member.id,
      level: verdict.level,
      timeLabel: nowLabel(),
      dayKey: todayKey(),
      // 하루 누적 분석이 이 기록을 합산할 수 있게 바코드와 먹은 양을 남긴다.
      barcode: item!.barcode,
      grams: nutrition.grams,
      item: scanned!,
    });
    leaving.current = true;
    setCurrent(null);
    router.push('/home');
  }

  function createReminders() {
    const sched = scanned!.rx?.schedule ?? [];
    if (sched.length > 0) {
      // 알람은 먼저 만든다. OS 알림 권한은 부가 기능이라 이걸 기다리면 안 된다 —
      // 사용자가 권한 창을 닫거나 무시하면 await 가 풀리지 않아 버튼이 죽은 것처럼 보였다.
      addReminders(
        sched.map((s, i) => ({
          id: `rem_${cryptoId()}_${i}`,
          memberId: member.id,
          time: s.time,
          item: scanned!,
        })),
      );
      // 권한이 있으면 데모용으로 첫 알림을 8초 뒤 실제로 띄운다 (없으면 앱 안에서만 동작)
      void requestPermission().then((granted) => {
        if (granted) {
          scheduleNotification(
            'SnapCare · Dose reminder',
            `${scanned!.name} — ${sched[0].label} (${sched[0].time})`,
            8000,
          );
        }
      });
    }
    finish();
  }

  const header =
    item.kind === 'prescription' ? 'PRESCRIPTION RECOGNIZED'
    : item.kind === 'medicine' ? 'MEDICINE RECOGNIZED'
    : `FOR ${member.name.toUpperCase()}`;

  return (
    <MobileScreen>
      <div className="flex items-center justify-between px-5 pt-14 pb-1">
        <button onClick={() => router.push('/home')} aria-label="Close" className="text-2xl leading-none" style={{ color: 'var(--color-sc-muted)' }}>×</button>
        <span className="text-[11px] font-bold tracking-wide" style={{ color: 'var(--color-sc-muted)' }}>{header}</span>
        <button onClick={() => speak(itemVoiceScript(scanned, verdict, member), 'en-US')} aria-label="Replay voice" className="text-xl leading-none">🔊</button>
      </div>

      {isRx ? (
        <RxResult item={scanned} verdict={verdict} onDone={createReminders} />
      ) : (
        <FoodResult
          item={scanned}
          verdict={verdict}
          member={member}
          members={members}
          profile={nutrition.profile}
          onDone={finish}
        />
      )}
    </MobileScreen>
  );
}

function FoodResult({
  item, verdict, member, members, profile, onDone,
}: {
  item: ScanItem; verdict: Verdict; member: Member; members: Member[];
  profile?: NutrientProfile; onDone: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <VerdictHero item={item} verdict={verdict} />

      <div className="mt-2 flex flex-col gap-3 px-5">
        {/* 영양 엔진 — 바코드가 있으면 실제 수치를 구성원 기준치와 대조해 보여준다 */}
        <NutrientBars barcode={item.barcode} profile={item.profile} member={member} />

        {/* 바코드가 없는 경우의 정성 폴백 */}
        {!item.barcode && item.nutrition?.note && (
          <div className="flex items-start gap-2 rounded-2xl bg-white px-4 py-3 shadow-sm">
            <span className="text-lg" style={{ color: 'var(--color-caution)' }}>●</span>
            <span className="text-sm" style={{ color: 'var(--color-sc-ink)' }}>{item.nutrition.note}</span>
          </div>
        )}

        {/* 대체품 */}
        {item.alt && (
          <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--color-safe-bg)' }}>
            <p className="text-[11px] font-bold tracking-wide" style={{ color: 'var(--color-safe)' }}>TRY INSTEAD</p>
            <p className="mt-0.5 text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
              {item.alt.name} — {item.alt.note}
            </p>
          </div>
        )}

        {/* 가족별 판정 */}
        <div>
          <p className="text-[11px] font-bold tracking-wide" style={{ color: 'var(--color-sc-muted)' }}>CHECKED FOR FAMILY</p>
          <div className="mt-2 flex gap-3">
            {members.map((m) => {
              // 기준치가 사람마다 다르므로 플래그도 구성원별로 다시 계산한다.
              // (같은 제품이 성인에겐 safe, 7살에겐 caution 이 될 수 있다)
              const flags = profile
                ? [...new Set([...item.flags, ...flagsForMember(profile, m)])]
                : item.flags;
              const v = computeVerdict(
                { ...item, flags },
                m,
                profile ? assessForMember(profile, m) : undefined,
              );
              const meta = LEVEL_META[v.level];
              return (
                <div key={m.id} className="flex flex-col items-center gap-1">
                  <span className="relative flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: m.color }}>
                    {m.emoji}
                    <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white" style={{ background: meta.color }} />
                  </span>
                  <span className="text-[11px]" style={{ color: 'var(--color-sc-muted)' }}>{m.name.split(' ')[0]}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-auto px-5 pb-8 pt-4">
        <PrimaryButton onClick={onDone} level={verdict.level}>Done</PrimaryButton>
      </div>
    </div>
  );
}

function RxResult({
  item, verdict, onDone,
}: {
  item: ScanItem; verdict: Verdict; onDone: () => void;
}) {
  const meta = LEVEL_META[verdict.level];
  const conflict = verdict.level !== 'safe';
  return (
    <div className="flex flex-1 flex-col px-5">
      <div className="flex flex-col items-center pt-4 text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full text-5xl" style={{ background: conflict ? meta.bg : 'var(--color-med-bg)' }}>
          {item.emoji}
        </div>
        <h1 className="mt-4 text-2xl font-bold" style={{ color: 'var(--color-sc-ink)' }}>{item.name}</h1>
        {item.rx && <p className="mt-1 text-sm" style={{ color: 'var(--color-sc-muted)' }}>{item.rx.dosageText}</p>}
      </div>

      {/* 안전 배지 / 충돌 경고 */}
      <div className="mt-5 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold"
        style={{ background: meta.bg, color: meta.color }}>
        <span className="text-lg">{meta.emoji}</span>
        <span>{conflict ? verdict.summary : `Take as prescribed. ${item.rx?.dosageText ?? ''}`}</span>
      </div>

      {/* 복용 스케줄 */}
      {item.rx && (
        <div className="mt-5">
          <p className="text-[11px] font-bold tracking-wide" style={{ color: 'var(--color-sc-muted)' }}>INTAKE SCHEDULE</p>
          <div className="mt-2 flex flex-col gap-2">
            {item.rx.schedule.map((s, i) => (
              <div key={i} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
                <span className="text-xl">{s.emoji}</span>
                <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>{s.label}</span>
                <span className="text-sm" style={{ color: 'var(--color-sc-muted)' }}>{s.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SIGIL 자체 엔진 픽토그램 (읽기 없이 이해) */}
      <div className="mt-5">
        <PictogramStrip source={itemToDsl(item, verdict.level !== 'safe')} />
      </div>

      <div className="mt-auto pb-8 pt-6">
        <PrimaryButton onClick={onDone} level="safe">Create reminders</PrimaryButton>
      </div>
    </div>
  );
}


function PrimaryButton({ children, onClick, level }: { children: React.ReactNode; onClick: () => void; level: 'safe' | 'caution' | 'avoid' }) {
  const bg = level === 'avoid' ? 'var(--color-avoid)' : level === 'caution' ? 'var(--color-caution)' : 'var(--color-sc-primary)';
  return (
    <button onClick={onClick} className="w-full rounded-2xl py-4 text-center text-base font-bold text-white active:scale-[0.98] transition-transform" style={{ background: bg }}>
      {children}
    </button>
  );
}

function cryptoId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID().slice(0, 8);
  return Math.abs(Date.now()).toString(36);
}
