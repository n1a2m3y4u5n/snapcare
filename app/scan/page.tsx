'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { MobileScreen } from '@/components/sc/MobileScreen';
import { VerdictHero } from '@/components/sc/VerdictHero';
import { PictogramStrip, OneGlyph } from '@/components/sc/PictogramStrip';
import { NutrientBars } from '@/components/sc/NutrientBars';
import { Say, Speakable } from '@/components/sc/Say';
import { doseSentence, storageSentence } from '@/lib/snapcare/say';
import { alternativeFor, type Alternative } from '@/lib/snapcare/alternative';
import { spokenName } from '@/lib/tts/speakable';
import { TimeGlyph } from '@/components/sc/TimeGlyph';
import { useNutrition } from '@/lib/nutrition/useNutrition';
import { useAnalysis } from '@/stores/analysis';
import { useProfile } from '@/stores/profile';
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
  const addScan = useScans((s) => s.addScan);
  const scans = useScans((s) => s.scans);
  const addReminders = useReminders((s) => s.addReminders);

  const autoTts = usePreferences((s) => s.autoTts);
  const member = useProfile((s) => s.profile);

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

  // "그럼 뭘 먹어야 하나" — 회피 사유에서 유도한다 (lib/snapcare/alternative.ts)
  const alternative = item ? alternativeFor(item, verdict) : null;

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
      // 그때 이 음식에 들어 있다고 본 것. 나중에 식이 일지가 이걸 가로질러 본다.
      tags: nutrition.profile?.allergenTags ?? item!.profile?.allergenTags ?? [],
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
    <MobileScreen ownRead>
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
          alternative={alternative}
          onDone={finish}
        />
      )}
    </MobileScreen>
  );
}

function FoodResult({
  item, verdict, member, alternative, onDone,
}: {
  item: ScanItem; verdict: Verdict; member: Member;
  alternative: Alternative | null; onDone: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <VerdictHero item={item} verdict={verdict} />

      <div className="mt-2 flex flex-col gap-3 px-5">
        {/*
          무엇이 들어 있는지 그림으로. 이 줄이 없어서 땅콩이 든 과자를 찍어 회피 판정이
          떠도 땅콩 그림은 화면 어디에도 없었다 — 처방 화면에만 스트립이 있었다.
          플래그가 하나도 없으면 컴포넌트가 스스로 아무것도 그리지 않는다.
        */}
        <PictogramStrip source={itemToDsl(item, verdict.level !== 'safe')} />

        {/* 영양 엔진 — 바코드가 있으면 실제 수치를 구성원 기준치와 대조해 보여준다 */}
        <NutrientBars barcode={item.barcode} profile={item.profile} member={member} />

        {/* 바코드가 없는 경우의 정성 폴백 */}
        {!item.barcode && item.nutrition?.note && (
          <div className="flex items-start gap-2 rounded-2xl bg-white px-4 py-3 shadow-sm">
            <span className="text-lg" style={{ color: 'var(--color-caution)' }}>●</span>
            <Say className="text-sm" style={{ color: 'var(--color-sc-ink)' }}>{item.nutrition.note}</Say>
          </div>
        )}

        {/*
          대체 기준 — 이것 말고 저것.

          예전에는 카탈로그에 손으로 적어둔 대체품이 있을 때만 떴다 — 바코드로 알아본
          몇 품목뿐이라 라벨 촬영 경로에서는 한 번도 뜨지 않았다(형성 평가: 12/12).
          이제 회피 사유에서 유도한다.

          왜 짝으로 바꿨나
          ----------------
          그림이 하나일 때는 위의 픽토그램 줄과 **똑같은 그림**이었다. 땅콩이 든 과자를
          찍으면 줄에도 🚫🥜, 여기에도 🚫🥜 가 떴다. 이 칸이 답해야 하는 질문은
          "그럼 뭘 먹지" 인데, 그림으로는 방금 들은 말을 되풀이할 뿐이라 새 정보가
          하나도 없었다. 화면에서 가장 값진 자리를 반복에 쓴 셈이다.

          IKEA 설명서의 오래된 수법이 이 자리에 맞는다: **틀린 것과 맞는 것을 나란히**
          놓는다. 왼쪽은 지금 손에 든 바로 그 물건이고(✕), 오른쪽은 다음에 고를 기준
          이다(✓). 그러면 두 그림이 서로 다른 것을 말하고, 화살표가 둘을 잇는다 —
          글자 없이 "이거 말고 저거" 가 성립한다.
        */}
        {alternative && (
          <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--color-safe-bg)' }}>
            <Speakable text={`Try instead. ${alternative.text}`}
                       className="flex w-full items-center gap-2 text-[11px] font-bold tracking-wide"
                       style={{ color: 'var(--color-safe)' }}>
              <span className="flex-1">TRY INSTEAD</span>
            </Speakable>
            <div className="mt-2 flex items-center gap-3">
              <SwapSide
                mark="✕"
                color="var(--color-avoid)"
                say={`Not this one. ${spokenName(item.name, item.kind)}.`}
              >
                <span className="text-3xl" aria-hidden>{item.emoji}</span>
              </SwapSide>

              <span className="text-2xl" style={{ color: 'var(--color-sc-muted)' }} aria-hidden>→</span>

              <SwapSide mark="✓" color="var(--color-safe)" say={alternative.text}>
                {alternative.glyph
                  ? <OneGlyph line={`\\no{\\${alternative.glyph}}`} className="h-10 w-10" />
                  : <span className="text-3xl" aria-hidden>🛒</span>}
              </SwapSide>

              <p className="flex-1 text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
                <Say bare>{alternative.text}</Say>
              </p>
            </div>
          </div>
        )}

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
        <h1 className="mt-4 text-2xl font-bold" style={{ color: 'var(--color-sc-ink)' }}>
          {/* 화면에는 포장지 원문, 음성은 영어 — 대회 공식 언어가 영어다 */}
          <Say as={spokenName(item.name, item.kind)}>{item.name}</Say>
        </h1>
        {item.rx && <p className="mt-1 text-sm" style={{ color: 'var(--color-sc-muted)' }}><Say>{item.rx.dosageText}</Say></p>}
      </div>

      {/* 안전 배지 / 충돌 경고 */}
      <div className="mt-5 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold"
        style={{ background: meta.bg, color: meta.color }}>
        <span className="text-lg">{meta.emoji}</span>
        {/* 복약 지시는 잘못 들으면 바로 위험해지는 문장이라 반드시 누를 수 있어야 한다 */}
        <Say>{conflict ? verdict.summary : `Take as prescribed. ${item.rx?.dosageText ?? ''}`}</Say>
      </div>

      {/*
        그림 줄을 여기로 올렸다.

        전에는 화면 맨 아래, 용량·보관·복용시각 세 덩어리 **뒤**에 있었다. 글을 읽는
        사람에게는 요약이지만, 못 읽는 사람에게는 그 세 덩어리가 통째로 비어 있고
        **이 줄이 지시의 전부**다. 그 사람이 실제로 만나는 순서는 [빈칸][빈칸][빈칸]
        [진짜 내용] 이었던 셈이다.

        음식 화면은 이미 판정 바로 다음에 그림 줄이 온다. 같은 것이 화면마다 다른
        자리에 있으면, 매번 어디를 봐야 하는지 다시 찾아야 한다 — 설명서의 연속성이
        새로 배울 것을 줄인다는 IKEA 의 원칙이 여기에도 그대로 걸린다.
      */}
      <div className="mt-5">
        <PictogramStrip source={itemToDsl(item, verdict.level !== 'safe')} />
      </div>

      {/*
        1회 용량과 보관.
        둘 다 OCR 이 뽑아 픽토그램에는 쓰이고 있었는데 문자·음성에는 어디에도 없었다
        (형성 평가: 처방 16시행 전부). 그림이 통하지 않는 사용자에게는 정보가 통째로
        사라지는 자리였다. 스케줄보다 위에 두는 이유는 "몇 시에" 보다 "얼마나" 가
        먼저 필요하기 때문이다.
      */}
      {(doseSentence(item.rx) || storageSentence(item.rx)) && (
        <div className="mt-5 flex flex-col gap-2">
          {doseSentence(item.rx) && (
            <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
              <span className="text-xl" aria-hidden>💊</span>
              <Say className="flex-1 text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
                {doseSentence(item.rx)!}
              </Say>
            </div>
          )}
          {storageSentence(item.rx) && (
            <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
              <span className="text-xl" aria-hidden>🧊</span>
              <Say className="flex-1 text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
                {storageSentence(item.rx)!}
              </Say>
            </div>
          )}
        </div>
      )}

      {/* 복용 스케줄 */}
      {item.rx && (
        <div className="mt-5">
          <Speakable text="Intake schedule. When to take it."
                     className="flex w-full items-center gap-2 text-[11px] font-bold tracking-wide"
                     style={{ color: 'var(--color-sc-muted)' }}>
            <span className="flex-1">INTAKE SCHEDULE</span>
          </Speakable>
          <div className="mt-2 flex flex-col gap-2">
            {item.rx.schedule.map((s, i) => (
              <div key={i} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
                <span className="text-xl">{s.emoji}</span>
                <Say className="flex-1 text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>{`${s.label} at ${s.time}`}</Say>
                <TimeGlyph label={s.time} className="text-sm" />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-auto pb-8 pt-6">
        <PrimaryButton onClick={onDone} level="safe">Create reminders</PrimaryButton>
      </div>
    </div>
  );
}


/**
 * "이것 말고 저것" 의 한쪽.
 *
 * 표시(✕/✓)를 그림 위 모서리에 얹는다. 옆에 두면 어느 표시가 어느 그림 것인지가
 * 흐려지고, 이 칸은 두 그림이 서로 반대라는 것 하나로 뜻이 성립하는 자리다.
 */
function SwapSide({ mark, color, say, children }: {
  mark: string; color: string; say: string; children: React.ReactNode;
}) {
  return (
    <Speakable text={say} bare className="relative flex h-14 w-14 shrink-0 items-center justify-center
                                          rounded-2xl bg-white shadow-sm">
      {children}
      <span aria-hidden
            className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full
                       text-xs font-bold text-white"
            style={{ background: color }}>
        {mark}
      </span>
    </Speakable>
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
