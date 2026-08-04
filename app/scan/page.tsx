'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { MobileScreen } from '@/components/sc/MobileScreen';
import { VerdictHero } from '@/components/sc/VerdictHero';
import { PictogramStrip, OneGlyph } from '@/components/sc/PictogramStrip';
import { TeachBack } from '@/components/sc/TeachBack';
import { NutrientBars } from '@/components/sc/NutrientBars';
import { Hear, Say, Speakable, sayable } from '@/components/sc/Say';
import { HoldToHear } from '@/components/sc/HoldToHear';
import { doseSentence, storageSentence } from '@/lib/snapcare/say';
import { alternativeFor, type Alternative } from '@/lib/snapcare/alternative';
import { spokenName } from '@/lib/tts/speakable';
import { TimeGlyph } from '@/components/sc/TimeGlyph';
import { BasketIcon, FoodIcon, PillIcon } from '@/components/icons';
import { useNutrition } from '@/lib/nutrition/useNutrition';
import { useAnalysis } from '@/stores/analysis';
import { putThumb, prunePhotos } from '@/lib/photos/store';
import { useProfile } from '@/stores/profile';
import { useScans, nowLabel, todayKey } from '@/stores/scans';
import { useReminders } from '@/stores/reminders';
import { usePreferences } from '@/stores/preferences';
import { requestPermission, scheduleNotification } from '@/lib/notifications';
import { msUntil } from '@/lib/snapcare/clock';
import { computeVerdict, LEVEL_META } from '@/lib/snapcare/verdict';
import { checkInteractions } from '@/lib/medication/interactions';
import { itemToDsl } from '@/lib/snapcare/sigil';
import { durationDays } from '@/lib/hardware/dispenser';
import { itemVoiceScript } from '@/lib/snapcare/say';
import { speak } from '@/lib/voice';
import type { ItemFlag, Member, ScanItem, Verdict } from '@/lib/snapcare/types';

export default function ScanResultPage() {
  const router = useRouter();
  const item = useAnalysis((s) => s.current);
  const setCurrent = useAnalysis((s) => s.setCurrent);
  const photo = useAnalysis((s) => s.photo);
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
    const id = `r_${cryptoId()}`;
    /*
      사진을 이 기록에 붙인다.

      기다리지 않는다. 사람은 이미 "다 됐다" 를 눌렀고 다음 화면으로 가는 중인데,
      IndexedDB 쓰기를 기다리면 그 지연이 버튼이 안 먹은 것으로 읽힌다. 실패해도
      조용하다 — 사진은 곁들이고, 판정과 기록이 이 앱의 일이다.

      정리도 여기서 한 번 돈다. 기록은 200개·90일에서 잘리는데(retention.ts) 사진은
      그것을 모르므로, 가리킬 기록이 없어진 사진이 계속 쌓인다.
    */
    if (photo) void putThumb(id, photo);
    void prunePhotos([id, ...scans.map((r) => r.id)]);
    addScan({
      id,
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
      // 복약 기간을 함께 싣는다. 처방전에서 읽어 이미 갖고 있던 값인데(§durationText)
      // 지금까지 기기로 보낼 때만 쓰고 앱 자신의 알람은 끝을 몰랐다 — 7일짜리
      // 항생제 알람이 100일째에도 울렸다. 0 이면 무기한이다.
      addReminders(
        sched.map((s, i) => ({
          id: `rem_${cryptoId()}_${i}`,
          memberId: member.id,
          time: s.time,
          item: scanned!,
          startedOn: todayKey(),
          days: durationDays(scanned!.rx?.durationText),
        })),
      );
      /*
        첫 복용 시각에 알린다.

        전에는 **8초 뒤**에 띄웠다. 시연으로는 그럴듯한데, 뜨는 알림에는 "아침 8시"
        라고 적혀 있었다 — 사람에게 하는 거짓말이고, 하필 복약 시각을 두고 하는
        거짓말이다. 지금은 그 시각까지 기다린다.

        탭이 닫히면 오지 않는다. 그것이 지금의 한계이고 lib/notifications.ts 에 적어
        두었다. 상자와 짝지은 사람에게는 이것 말고 다른 길이 있다 — 상자가 약을 내밀면
        useDoseAlert 가 알린다.
      */
      void requestPermission().then((granted) => {
        if (!granted) return;
        const delay = msUntil(sched[0].time);
        scheduleNotification(
          'SnapCare · Dose reminder',
          `${scanned!.name} — ${sched[0].label} (${sched[0].time})`,
          delay,
        );
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
        {/* 20px 이모지였다. 이 화면에서 판정 전체를 다시 듣는 유일한 버튼인데 손끝보다
            작았다. 다른 화면과 같은 44 짜리로 맞춘다. */}
        <Hear text={itemVoiceScript(scanned, verdict, member)} />
      </div>

      {/*
        첫 실행 안내를 없애면서 거기 있던 한 가지 — 꾹 눌러 듣는 손짓 — 를 여기로
        옮겼다. 이 화면이 그 손짓이 실제로 쓸모 있는 첫 자리다: 약 이름 하나,
        복용 시각 하나를 다시 듣고 싶은 곳이 여기다. 딱 한 번만 뜬다.
      */}
      <HoldToHear />

      {isRx ? (
        <RxResult item={scanned} verdict={verdict} onDone={createReminders} photo={photo} />
      ) : (
        <FoodResult
          item={scanned}
          verdict={verdict}
          member={member}
          alternative={alternative}
          onDone={finish}
          photo={photo}
        />
      )}
    </MobileScreen>
  );
}

function FoodResult({
  item, verdict, member, alternative, onDone, photo,
}: {
  item: ScanItem; verdict: Verdict; member: Member;
  alternative: Alternative | null; onDone: () => void;
  photo?: string | null;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <VerdictHero item={item} verdict={verdict} photo={photo} />

      <div className="mt-2 flex flex-col gap-3 px-5">
        {/*
          무엇이 들어 있는지 그림으로. 이 줄이 없어서 땅콩이 든 과자를 찍어 회피 판정이
          떠도 땅콩 그림은 화면 어디에도 없었다 — 처방 화면에만 스트립이 있었다.
          플래그가 하나도 없으면 컴포넌트가 스스로 아무것도 그리지 않는다.
        */}
        <PictogramStrip source={itemToDsl(item, verdict.level === 'avoid')} />

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
                {/* 왼쪽은 **방금 찍은 그것**이다. 사진이 있으면 사진이 맞다. */}
                {photo
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={photo} alt="" aria-hidden className="h-9 w-9 rounded-lg object-cover" />
                  : <span className="text-3xl" style={{ color: 'var(--color-avoid)' }} aria-hidden><FoodIcon /></span>}
              </SwapSide>

              <span className="text-2xl" style={{ color: 'var(--color-sc-muted)' }} aria-hidden>→</span>

              <SwapSide mark="✓" color="var(--color-safe)" say={alternative.text}>
                {alternative.glyph
                  ? <OneGlyph line={`\\no{\\${alternative.glyph}}`} className="h-10 w-10" />
                  : <span className="text-3xl" style={{ color: 'var(--color-safe)' }} aria-hidden><BasketIcon /></span>}
              </SwapSide>

              <p className="flex-1 text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
                <Say bare>{alternative.text}</Say>
              </p>
            </div>
          </div>
        )}

      </div>

      <div className="mt-auto px-5 pb-8 pt-4">
        {/* 체크 표시. 이 버튼이 하는 일은 "확인했다, 기록에 남긴다" 다. */}
        <PrimaryButton onClick={onDone} level={verdict.level} icon="✔️"
                       say="Done. This is saved to your history, and you go back to the start.">
          Done
        </PrimaryButton>
      </div>
    </div>
  );
}

function RxResult({
  item, verdict, onDone, photo,
}: {
  item: ScanItem; verdict: Verdict; onDone: () => void; photo?: string | null;
}) {
  const router = useRouter();
  const meta = LEVEL_META[verdict.level];
  const conflict = verdict.level !== 'safe';
  return (
    <div className="flex flex-1 flex-col px-5">
      <div className="flex flex-col items-center pt-4 text-center">
        {/* 찍은 것이 그 약봉지·그 처방전이다. 사진이 이모지보다 정확하다. */}
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full"
             style={{ background: conflict ? meta.bg : 'var(--color-med-bg)',
                      color: conflict ? meta.color : 'var(--color-sc-primary)', fontSize: 48,
                      boxShadow: photo ? `0 0 0 4px ${conflict ? meta.color : 'var(--color-sc-primary)'}` : undefined }}>
          {photo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={photo} alt="" aria-hidden className="h-full w-full object-cover" />
            : <PillIcon />}
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
        손으로 쓴 처방전.

        읽은 것을 지우지 않는다 — 지우면 아무 도움이 안 되고, 대개는 대체로 맞다.
        지우는 것은 **확신**이다. 실측에서 "8시간마다" 가 "8밀리그램" 으로 읽혔고 종이에
        없는 시각 세 개가 붙었다. 그런 화면을 초록불과 함께 내보내면, 사용자는 확인할
        길이 없는 채로 확신을 갖는다.

        그래서 사람을 부르라고 말하고, 종이 서식이라는 **다른 길**을 같이 내민다.
        의사가 칸을 채운 서식은 손글씨가 아니라 표시라서 기기가 정확히 읽는다.
      */}
      {item.handwritten && (
        <button
          onClick={() => router.push('/device')}
          className="mt-3 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left"
          style={{ background: 'var(--color-caution-bg)' }}
          {...sayable('This is handwritten, so some of it may be read wrong. Ask a person to read it to you. Or ask the clinic to fill in the paper sheet, which this app reads exactly. Tap to open the sheet reader.')}
        >
          <span className="text-xl" aria-hidden>✍️</span>
          <span className="flex-1">
            <span className="block text-sm font-bold" style={{ color: 'var(--color-caution)' }}>
              Handwritten — some of this may be wrong
            </span>
            <span className="block text-xs" style={{ color: 'var(--color-sc-ink)' }}>
              Ask someone to read it, or use the clinic&apos;s paper sheet
            </span>
          </span>
          <span style={{ color: 'var(--color-caution)' }}>›</span>
        </button>
      )}

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
        <PictogramStrip source={itemToDsl(item, verdict.level === 'avoid')} />
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
            {/*
              `flex-wrap` 과 최소폭. 이 줄에는 같은 것을 말하는 셋이 나란히 있다 —
              아침 그림, "Morning at 8:00 AM", 그리고 시계 그림. 글자를 가장 크게
              두면 셋이 271px 을 나눠 갖다가 가운데 글이 52px 로 눌려 "Mor / nin /
              g at" 처럼 낱말 가운데가 끊겼다.

              글에 최소폭을 주면 자리가 모자랄 때 시계 그림이 아랫줄로 내려간다.
              셋 다 남고 글만 온전해진다.
            */}
            {item.rx.schedule.map((s, i) => (
              <div key={i} className="flex flex-wrap items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
                <span className="shrink-0 text-xl">{s.emoji}</span>
                <Say className="min-w-[8rem] flex-1 text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>{`${s.label} at ${s.time}`}</Say>
                <TimeGlyph label={s.time} className="text-sm" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/*
        되말하기.

        설명이 다 끝난 자리에 둔다 — 그림, 용량, 보관, 시각을 지나온 뒤다. 앞에 두면
        아직 말하지 않은 것을 묻게 되고, 알람을 만드는 버튼 뒤에 두면 아무도 보지 않는다.

        건너뛸 수 있고, 틀려도 막지 않는다. 확인을 통과해야 정보를 주는 앱은 약을 못
        먹게 하는 앱이다 — 이유는 lib/snapcare/teachBack.ts 에 적었다.
      */}
      <TeachBack item={item} />

      {/*
        손글씨면 버튼도 초록이 아니다.

        누르면 하는 일은 같다 — 막지 않는다. 다만 이 버튼이 만드는 것은 **읽어낸 시각의
        알람**이고, 그 시각이 종이에 없던 것일 수 있다는 사실이 버튼 색과 말에 남아
        있어야 한다. 초록 버튼은 "확인됐다" 로 읽힌다.
      */}
      <div className="mt-auto pb-8 pt-6">
        {/* 알람 시계. 이 버튼이 만드는 것이 정확히 그것이다 — 시각마다 폰이 부른다. */}
        <PrimaryButton onClick={onDone} level={item.handwritten ? 'caution' : 'safe'} icon="⏰"
                       say={item.handwritten
                         ? 'Create reminders from what we read. This was handwritten, so check the times with a person first.'
                         : 'Create reminders. The phone will tell you at each time on the list above.'}>
          Create reminders
        </PrimaryButton>
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

/**
 * 화면을 끝내는 버튼 — 옆에 듣기 버튼을 하나 둔다.
 *
 * 이 화면에서 소리가 없는 마지막 요소였다. 그런데 여기가 **누르면 되돌릴 수 없는
 * 자리**다. 판정을 기록으로 남기고, 처방이면 알람까지 만든다. 무슨 일이 일어나는지
 * 모르고 누르는 버튼이 하필 그것이면 안 된다.
 *
 * 버튼 글자가 아니라 **누르면 무엇이 되는지**를 말한다. "Done" 을 읽어 주는 것은
 * 이미 보이는 것을 되풀이하는 것이고, 정작 모르는 것 — 그래서 어떻게 되는가 — 은
 * 그대로 남는다.
 */
/**
 * 이 화면을 끝내는 버튼.
 *
 * `icon` 을 따로 받는 이유
 * -----------------------
 * 화면을 훑어 보니 **글자만 있고 그림이 없는 누를 곳**이 여섯 있었고, 그중 이것이
 * 가장 중요했다. 처방전을 알람으로 바꾸는 자리, 즉 이 흐름 전체의 결정 지점인데
 * 파란 칸에 영어 두 낱말만 적혀 있었다.
 *
 * 글을 못 읽어도 된다는 것이 이 앱의 주장이라면, 그 주장은 픽토그램 줄에서만
 * 지켜지면 안 된다. 누를 곳마다 지켜져야 한다 — 그림을 아무리 잘 그려도 그 다음에
 * 눌러야 하는 버튼이 글자뿐이면 거기서 멈춘다.
 *
 * 글자는 지우지 않는다. 보호자와 심사자도 이 화면을 본다. 그림을 **더한다.**
 */
function PrimaryButton({ children, onClick, level, say, icon }: {
  children: React.ReactNode;
  onClick: () => void;
  level: 'safe' | 'caution' | 'avoid';
  say: string;
  /** 글자를 못 읽는 사람이 이 버튼을 알아볼 그림 */
  icon?: string;
}) {
  const bg = level === 'avoid' ? 'var(--color-avoid)' : level === 'caution' ? 'var(--color-caution)' : 'var(--color-sc-primary)';
  return (
    /*
      늘리지 않고 가운데 맞춘다.

      전에는 `items-stretch` 에 듣기 버튼이 `h-auto` 라, 그 버튼이 옆 버튼 높이를
      따라갔다. 기본 크기에서는 56×56 이라 동그라미였는데, 글자를 가장 크게 두면
      옆 버튼이 160px 높이가 되면서 112×160 짜리 타원이 됐다. 동그라미가 타원이
      되면 그것은 이 앱에서 "듣기" 를 뜻하는 모양이 아니게 된다.
    */
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={onClick}
              /*
                최소폭 8rem: 이보다 좁아지면 "reminders" 가 낱말 가운데서 끊긴다.
                자리가 모자라면 듣기 버튼이 아랫줄로 내려가고 이 버튼이 폭을 다 쓴다.
              */
              className="flex min-w-[8rem] flex-1 items-center justify-center gap-2 rounded-2xl py-4 text-center
                         text-base font-bold text-white active:scale-[0.98] transition-transform"
              style={{ background: bg }}>
        {/* aria-hidden: 소리로는 옆의 듣기 버튼과 say 가 이미 말한다. 스크린리더가
            "알람 시계 이모지" 를 읽으면 문장 가운데 잡음이 하나 끼는 것과 같다. */}
        {icon && <span aria-hidden className="shrink-0 text-xl leading-none">{icon}</span>}
        {/* 맨몸 글자를 flex 안에 두면 익명 칸이 되어 줄어들지도 접히지도 않는다.
            큰 글자에서 "reminders" 가 그렇게 버튼 밖으로 잘렸다. */}
        <span className="min-w-0">{children}</span>
      </button>
      {/* 듣기 버튼은 흰 바탕에 둔다 — 같은 색으로 붙이면 버튼 하나가 두 칸으로
          쪼개진 것처럼 보여서, 오른쪽을 눌러도 끝나는 줄 안다. */}
      <Hear text={say} className="h-14 w-14 shadow-sm" />
    </div>
  );
}

function cryptoId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID().slice(0, 8);
  return Math.abs(Date.now()).toString(36);
}
