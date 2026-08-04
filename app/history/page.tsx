'use client';

import { useMemo, useState } from 'react';

import { MobileScreen } from '@/components/sc/MobileScreen';
import { Hear, Speakable, ask } from '@/components/sc/Say';
import { useScans, todayKey } from '@/stores/scans';
import { useProfile } from '@/stores/profile';
import { useIsClient } from '@/lib/hooks';
import { byDay, dayLabel, daySentence, type DaySummary } from '@/lib/history/byDay';
import { adherence, adherenceSentence, clockOf, doseRows } from '@/lib/history/adherence';
import { calendar } from '@/lib/history/calendar';
import { DoseCalendar } from '@/components/sc/DoseCalendar';
import { LEVEL_META } from '@/lib/snapcare/verdict';
import { Thumb } from '@/components/sc/Thumb';

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
  const scans = useScans((s) => s.scans);
  const member = useProfile((s) => s.profile);
  const ready = useIsClient();

  // 기록은 브라우저에만 있다. 그릴 때 읽으면 서버가 그린 화면과 어긋난다.
  const today = ready ? todayKey() : '';
  const days = useMemo(
    () => (ready && member ? byDay(scans, today, member.id) : []),
    [ready, scans, today, member],
  );
  /*
    달력과 같은 창을 센다. 그림이 넉 주인데 숫자가 한 주면, 같은 카드 안에서
    그림과 말이 서로 다른 것을 가리키게 된다.
  */
  const week = useMemo(
    () => (ready && member ? adherence(doseRows(scans, member.id), today, 28) : null),
    [ready, scans, today, member],
  );
  /*
    달력은 넉 주를 본다.

    한 주는 요일을 못 읽는다 — 각 요일이 한 번씩만 나오므로 "주말마다 빠진다" 가
    한 번의 우연과 구별되지 않는다. 넉 주면 같은 요일이 네 번 줄지어 서고, 그때
    비로소 세로줄이 뜻을 갖는다. 그 이상은 폰 화면에서 칸이 너무 작아진다.
  */
  const month = useMemo(
    () => (ready && member ? calendar(doseRows(scans, member.id), today, 28) : []),
    [ready, scans, today, member],
  );

  return (
    <MobileScreen bar="inner">
      <div className="px-5 pt-14 pb-4">
        {/* 위쪽 뒤로가기는 걷어냈다. 아래 줄의 큰 Home 버튼이 그 일을 하고,
            그쪽이 엄지가 닿는 자리다. 화면마다 '◀️ Home' '◀️ Back' '◀️ Settings'
            로 제각각이던 것이 하나로 모인다. */}
        <h1 className=" text-2xl font-extrabold" style={{ color: 'var(--color-sc-ink)' }}
            {...ask('Past days. Everything you have checked, day by day, newest first.')}>
          Past days
        </h1>

        {week && week.rate !== null && <AdherenceCard span={week} month={month} />}

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
 * 지난 넉 주의 복약.
 *
 * 백분율을 크게 쓰지 않는다. 숫자를 못 읽는 사람에게 86% 는 도착하지 않고, 그
 * 사람이 이 앱의 사용자다. 대신 **그림을 그린다** — 달력은 어느 날 걸렀는지를,
 * 그 아래 게이지는 전체에서 얼마나 채웠는지를 보인다. 둘 다 세거나 눈대중할 수
 * 있는 것이고, 둘이 답하는 물음이 다르다.
 *
 * 한 주가 아니라 넉 주인 이유는 요일이다. 한 주에서는 각 요일이 한 번씩만 나와서
 * "주말마다 저녁을 거른다" 가 한 번의 우연과 구별되지 않는다.
 */
function AdherenceCard({ span, month }: {
  span: NonNullable<ReturnType<typeof adherence>>;
  month: ReturnType<typeof calendar>;
}) {
  const say = adherenceSentence(span);
  return (
    <div className="mt-4 rounded-3xl bg-white px-5 py-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Speakable text={say} className="flex flex-1 items-center gap-2 text-[11px] font-bold tracking-wide"
                   style={{ color: 'var(--color-sc-muted)' }}>
          <span className="flex-1">THE LAST FOUR WEEKS</span>
        </Speakable>
        <Hear text={say} />
      </div>

      {/*
        복용 한 번을 칸 하나로 늘어놓던 자리다. 한 주에 스물한 번쯤이면 셀 만한
        그림이었지만 그 수는 위로 열려 있었다 — 벤치에서 칸 128개가 한 줄로 흘렀다.
        그리고 늘어선 칸들은 "얼마나 잘 하고 있나" 는 말해도 **언제 걸렀나** 는
        말하지 못한다.

        달력은 둘 다 한다. 개수가 날짜에 묶여 위로 안 열리고, 빈 자리가 요일 위에
        있으니 "주말마다 저녁을 거른다" 같은 것이 보인다.
      */}
      <div className="mt-3">
        <DoseCalendar days={month} />
      </div>

      {/*
        달력 아래의 게이지 — 넉 주를 통틀어 몇 번 중 몇 번인가.

        달력은 "어느 날" 을 답하지만 "전체로 보면 어떤가" 는 답하지 못한다. 칸이
        스물여덟이라 눈으로 합산이 안 되기 때문이고, 그 합이 진료실에서 실제로
        오가는 값이다. 게이지 하나면 그것이 한 눈에 들어온다.

        여기서도 백분율은 안 쓴다. 채워진 길이가 곧 답이고, 옆의 두 수는 그것을
        읽을 수 있는 사람을 위한 것이다.
      */}
      <div className="mt-4">
        <div className="h-4 w-full overflow-hidden rounded-full"
             style={{ background: 'var(--color-sc-bg)' }}>
          <div className="h-full rounded-full"
               style={{
                 width: `${span.offered ? Math.round((span.taken / span.offered) * 100) : 0}%`,
                 background: 'var(--color-safe)',
               }} />
        </div>
        <p className="mt-2 text-sm" style={{ color: 'var(--color-sc-ink)' }}>{say}</p>
      </div>

      {span.worstTime && (
        <p className="mt-1 text-xs" style={{ color: 'var(--color-sc-muted)' }}>
          Most often missed at {clockOf(span.worstTime)}.
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
        {/* 직접 찍은 것은 사진으로, 나머지는 이모지로. 이유는 Thumb 안에 적었다. */}
        {day.records.slice(0, open ? day.records.length : 8).map((r) => (
          <Thumb key={r.id} id={r.id} emoji={r.emoji} />
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
              <Thumb id={r.id} emoji={r.emoji} size={28} />
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
