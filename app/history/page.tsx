'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { MobileScreen } from '@/components/sc/MobileScreen';
import { Hear, Speakable, ask } from '@/components/sc/Say';
import { useScans, todayKey } from '@/stores/scans';
import { useProfile } from '@/stores/profile';
import { useIsClient } from '@/lib/hooks';
import { byDay, dayLabel, daySentence, type DaySummary } from '@/lib/history/byDay';
import { adherence, adherenceSentence, clockOf, doseRows } from '@/lib/history/adherence';
import { LEVEL_META } from '@/lib/snapcare/verdict';

/**
 * 지난 날들.
 *
 * 왜 이 화면이 필요한가
 * ---------------------
 * 이 앱은 스캔마다 기록을 남긴다. 무엇을 먹었는지, 그때 무엇이 들어 있다고 보았는지,
 * 몸이 어땠는지, 그리고 짝지은 상자가 있으면 약을 먹었는지 걸렀는지까지. 그런데
 * 그걸 되짚어 볼 자리가 없었다 — 홈에 최근 네 줄, 영양 화면에 오늘 누적. 그게 전부였다.
 *
 * 쌓아 놓고 아무도 안 보는 자료였다. 그리고 그 자료가 답할 수 있는 물음은 진료실에서
 * 실제로 나오는 물음이다. 두드러기가 난 날 무엇을 먹었는지, 약을 언제부터 걸렀는지.
 * 사람의 기억으로는 답이 안 되는 것들이고, 특히 글로 적어 두지 못하는 사람에게는.
 *
 * 무엇을 앞에 두는가
 * ------------------
 * 복약이 맨 위다. 음식은 하루 늦게 알아도 되지만 약은 오늘 저녁에 알아야 한다.
 */
export default function HistoryPage() {
  const router = useRouter();
  const scans = useScans((s) => s.scans);
  const member = useProfile((s) => s.profile);
  const ready = useIsClient();

  // 기록은 브라우저에만 있다. 그릴 때 읽으면 서버가 그린 화면과 어긋난다.
  const today = ready ? todayKey() : '';
  const days = useMemo(
    () => (ready && member ? byDay(scans, today, member.id) : []),
    [ready, scans, today, member],
  );
  const week = useMemo(
    () => (ready && member ? adherence(doseRows(scans, member.id), today, 7) : null),
    [ready, scans, today, member],
  );

  return (
    <MobileScreen tab="home">
      <div className="px-5 pt-14 pb-4">
        <button onClick={() => router.push('/home')}
                className="flex items-center gap-1 text-sm font-semibold"
                style={{ color: 'var(--color-sc-muted)' }}>
          <span aria-hidden>◀️</span> Home
        </button>

        <h1 className="mt-3 text-2xl font-extrabold" style={{ color: 'var(--color-sc-ink)' }}
            {...ask('Past days. Everything you have checked, day by day, newest first.')}>
          Past days
        </h1>

        {week && week.rate !== null && <AdherenceCard week={week} />}

        {days.length === 0 && (
          <p className="mt-10 text-center text-sm" style={{ color: 'var(--color-sc-muted)' }}>
            Nothing recorded yet.
          </p>
        )}

        <div className="mt-4 flex flex-col gap-4">
          {days.map((day) => <Day key={day.dayKey} day={day} today={today} />)}
        </div>
      </div>
    </MobileScreen>
  );
}

/**
 * 이번 주 복약.
 *
 * 백분율을 크게 쓰지 않는다. 숫자를 못 읽는 사람에게 86% 는 도착하지 않고, 그
 * 사람이 이 앱의 사용자다. 대신 **칸을 그린다** — 한 칸이 한 번의 복용이고, 채워진
 * 칸은 먹은 것, 빈 칸은 거른 것이다. 세면 된다.
 */
function AdherenceCard({ week }: { week: NonNullable<ReturnType<typeof adherence>> }) {
  const say = adherenceSentence(week);
  return (
    <div className="mt-4 rounded-3xl bg-white px-5 py-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Speakable text={say} className="flex flex-1 items-center gap-2 text-[11px] font-bold tracking-wide"
                   style={{ color: 'var(--color-sc-muted)' }}>
          <span className="flex-1">THIS WEEK&apos;S MEDICINE</span>
        </Speakable>
        <Hear text={say} />
      </div>

      {/*
        한 칸이 한 번. 스물한 칸을 넘으면(하루 세 번 × 7일) 줄이 접힌다.
        aria-hidden 인 이유는 옆의 듣기 버튼과 아래 문장이 같은 것을 말하기 때문이다 —
        스크린리더가 칸 스물한 개를 하나씩 읽으면 그게 더 나쁘다.
      */}
      <div aria-hidden className="mt-3 flex flex-wrap gap-1.5">
        {Array.from({ length: week.taken }, (_, i) => (
          <span key={`t${i}`} className="h-6 w-6 rounded-md"
                style={{ background: 'var(--color-safe)' }} />
        ))}
        {Array.from({ length: week.missed }, (_, i) => (
          <span key={`m${i}`} className="h-6 w-6 rounded-md border-2"
                style={{ borderColor: 'var(--color-caution)', background: 'transparent' }} />
        ))}
      </div>

      <p className="mt-3 text-sm" style={{ color: 'var(--color-sc-ink)' }}>{say}</p>

      {week.worstTime && (
        <p className="mt-1 text-xs" style={{ color: 'var(--color-sc-muted)' }}>
          Most often missed at {clockOf(week.worstTime)}.
        </p>
      )}

      {/*
        이 수가 무엇을 세지 않았는지 적는다. 상자에서 오지 않은 복용은 분모에 없고,
        그 사실을 안 적으면 이 화면은 "약을 다 드셨네요" 라고 잘못 말하게 된다.
      */}
      <p className="mt-2 text-[10px] leading-snug" style={{ color: 'var(--color-sc-muted)' }}>
        Counted from the pill box only. Medicines you take without it are not in this number.
      </p>
    </div>
  );
}

/** 하루 한 덩어리. */
function Day({ day, today }: { day: DaySummary; today: string }) {
  const label = dayLabel(day.dayKey, today);
  const say = daySentence(day, label);
  const [open, setOpen] = useState(false);

  return (
    <div>
      <div className="flex items-center gap-2">
        {/*
          이름을 못박는다. 접근성 트리에서 이 버튼은 이름이 비어 있었다 — 안의
          글자가 span 여럿에 흩어져 있고 그림은 전부 aria-hidden 이라 그렇다.
          스캐닝으로 훑는 사람에게는 날짜 목록이 이름 없는 버튼 여러 개가 된다.
        */}
        <button onClick={() => setOpen(!open)} aria-expanded={open}
                aria-label={open ? `Hide ${label}` : `Show what happened on ${label}`}
                className="flex flex-1 items-center gap-2 text-left">
          <span aria-hidden className="text-sm">{open ? '▼' : '▶'}</span>
          <span className="text-sm font-bold" style={{ color: 'var(--color-sc-ink)' }}>{label}</span>
          {/* 그날에 무슨 일이 있었는지를 줄 끝에서 한눈에. 펴 보지 않아도 보인다. */}
          {day.missed > 0 && <span aria-hidden title="missed a dose">💊</span>}
          {day.hadAvoid && <span aria-hidden title="something to avoid">🚫</span>}
          {day.hadReaction && <span aria-hidden title="felt unwell">🤢</span>}
        </button>
        <Hear text={say} />
      </div>

      {/*
        접힌 상태에서도 그날 먹은 것의 그림은 보인다. 펴야만 보이면 되짚는 데
        누름이 하루마다 하나씩 더 들고, 이 화면은 되짚으라고 있는 화면이다.
      */}
      <div className="mt-2 flex flex-wrap gap-1.5 pl-6">
        {day.records.slice(0, open ? day.records.length : 8).map((r) => (
          <span key={r.id} aria-hidden
                className="flex h-9 w-9 items-center justify-center rounded-xl text-lg"
                style={{ background: 'white' }}>
            {r.emoji}
          </span>
        ))}
        {!open && day.records.length > 8 && (
          <span className="flex h-9 items-center px-1 text-xs" style={{ color: 'var(--color-sc-muted)' }}>
            +{day.records.length - 8}
          </span>
        )}
      </div>

      {open && (
        <div className="mt-2 flex flex-col gap-1.5 pl-6">
          {day.records.map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2 shadow-sm">
              <span aria-hidden className="text-base">{r.emoji}</span>
              <span className="flex-1">
                <span className="block text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
                  {r.name}
                </span>
                <span className="block text-[11px]" style={{ color: 'var(--color-sc-muted)' }}>
                  {r.timeLabel}
                </span>
              </span>
              {/* 상자에서 온 것은 먹었는지 걸렀는지를 그림으로 낸다. 판정 색과 다른
                  뜻이라 색만으로 구별하지 않는다. */}
              {r.dose && (
                <span aria-hidden className="text-base">{r.dose.taken ? '✅' : '⭕'}</span>
              )}
              {!r.dose && r.level !== 'safe' && (
                <span aria-hidden className="text-base">{LEVEL_META[r.level].emoji}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
