'use client';

import { useMemo, useState } from 'react';

import { MobileScreen } from '@/components/sc/MobileScreen';
import { Hear, Speakable, ask, sayable } from '@/components/sc/Say';
import { useScans, todayKey } from '@/stores/scans';
import { useProfile } from '@/stores/profile';
import { useIsClient } from '@/lib/hooks';
import { adherence, adherenceSentence, clockOf, doseRows } from '@/lib/history/adherence';
import { calendar } from '@/lib/history/calendar';
import { routineSentence, routines } from '@/lib/history/routines';
import { useReminders } from '@/stores/reminders';
import type { Reminder } from '@/stores/reminders';
import { finished, nextDue, running } from '@/lib/snapcare/course';
import { useAnalysis } from '@/stores/analysis';
import { useRouter } from 'next/navigation';
import { spokenName } from '@/lib/tts/speakable';
import { DoseCalendar } from '@/components/sc/DoseCalendar';
import { byMedicine, medicineSentence } from '@/lib/history/byMedicine';
import { MonthNav, anchorFor, windowLabel } from '@/components/sc/MonthNav';
import { ListIcon, PillIcon } from '@/components/icons';

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
  const reminders = useReminders((s) => s.reminders);
  const dropMedicine = useReminders((s) => s.dropMedicine);
  const setCurrent = useAnalysis((s) => s.setCurrent);
  const router = useRouter();

  const member = useProfile((s) => s.profile);
  const ready = useIsClient();

  // 기록은 브라우저에만 있다. 그릴 때 읽으면 서버가 그린 화면과 어긋난다.
  const today = ready ? todayKey() : '';
  /* 몇 창 뒤로 와 있는가. 0 이면 오늘이 든 창. */
  const [back, setBack] = useState(0);
  const anchor = anchorFor(today, back);

  /*
    달력과 같은 창을 센다. 그림이 넉 주인데 숫자가 한 주면, 같은 카드 안에서
    그림과 말이 서로 다른 것을 가리키게 된다.
  */
  const week = useMemo(
    () => (ready && member ? adherence(doseRows(scans, member.id), anchor, 28) : null),
    [ready, scans, anchor, member],
  );
  /*
    달력은 넉 주를 본다.

    한 주는 요일을 못 읽는다 — 각 요일이 한 번씩만 나오므로 "주말마다 빠진다" 가
    한 번의 우연과 구별되지 않는다. 넉 주면 같은 요일이 네 번 줄지어 서고, 그때
    비로소 세로줄이 뜻을 갖는다. 그 이상은 폰 화면에서 칸이 너무 작아진다.
  */
  /*
    지금 정해져 있는 것. 아래 그림보다 먼저 온다 — 거른 칸이 둘인 것은 하루 두
    번짜리 처방에서는 하루를 통째로 건너뛴 것이고 하루 다섯 번짜리에서는 한 끼를
    늦게 먹은 것이라, 무엇이 일어났어야 하는지를 모르면 같은 그림이 다른 뜻이 된다.
  */
  const setNow = useMemo(
    () => (ready ? routines(reminders, today) : []),
    [ready, reminders, today],
  );
  /*
    복약률을 약마다 따로.

    합친 수는 고칠 곳을 안 가리킨다. 열 번을 걸렀다는 것이 한 약에 몰린 것인지 두
    약에 흩어진 것인지에 따라 할 일이 다르고, 진료실에서 오가는 물음도 약 단위다.
    그리고 이 기계에는 이미 그 단위가 있다 — 트레이가 층으로 쌓여 있고 한 층이 한
    약이라, 화면이 층별로 말하면 약통을 열어 그 층을 보면 되는 것이 된다.
  */
  const perMedicine = useMemo(
    () => (ready && member ? byMedicine(doseRows(scans, member.id), anchor, 28) : []),
    [ready, scans, anchor, member],
  );
  const month = useMemo(
    () => (ready && member ? calendar(doseRows(scans, member.id), anchor, 28, today) : []),
    [ready, scans, anchor, today, member],
  );

  /*
    다음 복용과 다 먹은 처방. 홈에서 옮겨 왔다 — 둘 다 복약 루틴에 대한 것이고,
    이 화면에 이미 지금 정해져 있는 것과 지난 넉 주가 있다.

    시각은 그릴 때 읽으면 안 된다(서버가 그린 화면과 어긋난다). 붙은 뒤에 읽는다.
  */
  const hm = ready
    ? (() => {
        const d = new Date();
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      })()
    : '';
  const live = ready ? running(reminders, today) : [];
  const nextDose: Reminder | undefined = ready ? nextDue(live, hm) : undefined;
  const done: Reminder[] = ready ? finished(reminders, today) : [];

  function openDose(r: Reminder) {
    setCurrent(r.item);
    router.push('/dose');
  }


  return (
    <MobileScreen bar="inner">
      <div className="px-5 pt-14 pb-4">
        {/* 위쪽 뒤로가기는 걷어냈다. 아래 줄의 큰 Home 버튼이 그 일을 하고,
            그쪽이 엄지가 닿는 자리다. 화면마다 '◀️ Home' '◀️ Back' '◀️ Settings'
            로 제각각이던 것이 하나로 모인다. */}
        <h1 className=" text-2xl font-extrabold" style={{ color: 'var(--color-sc-ink)' }}
            {...ask('Medicine. What is set right now, how the last four weeks went, and every dose day by day.')}>
          Medicine
        </h1>

        {/*
          다 먹었다.

          그림을 함께 낸다 — `finish_course` 는 "끝까지 드세요" 를 뜻하는 형태소인데,
          지금까지 그 그림이 화면에 나오는 자리가 처방 판정뿐이었다. 끝났다고 말할 때
          같은 그림을 다시 쓰면, 처음 볼 때 못 알아봤어도 두 번째에 이어 붙는다.
        */}
        {done.map((r) => (
          <div key={r.id} className="mt-4 flex items-center gap-3 rounded-2xl px-4 py-3"
               style={{ background: 'var(--color-safe-bg)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/glyphs/finish_course.png" alt="" aria-hidden className="h-10 w-10 shrink-0" />
            <span className="flex-1">
              <Speakable
                text={`You have finished ${spokenName(r.item.name, r.item.kind)}. All the days are done. Do not take any more of it. Tap to clear the reminder.`}
                className="flex w-full items-center gap-2 text-sm font-semibold"
                style={{ color: 'var(--color-sc-ink)' }}>
                <span className="flex-1">{r.item.name} — all done</span>
              </Speakable>
              <span className="block text-xs" style={{ color: 'var(--color-sc-muted)' }}>
                The course is over — no more reminders
              </span>
            </span>
            <button onClick={() => dropMedicine(r.item.name)}
                    aria-label={`Clear the reminder for ${r.item.name}`}
                    className="flex h-11 items-center rounded-xl px-4 text-sm font-bold text-white"
                    style={{ background: 'var(--color-safe)' }}>
              OK
            </button>
          </div>
        ))}

        {/*
          "다음 복용" 카드가 여기 있었다. 걷어낸 이유는 **바로 아래가 같은 말을
          하기 때문**이다 — 루틴 목록에 그 약과 그 시각이 이미 적혀 있어서, 한
          화면이 같은 처방을 두 번 말하고 있었다. 벤치에서 그대로 나온 말:
          "복약 스케줄이 중복으로 2번 표시되는 것 같은데."

          대신 목록 안에서 다음 것을 짚는다. 자리를 하나 덜 쓰면서 같은 것을
          말하고, 무엇보다 그 시각이 **어느 약의 것인지**가 한 줄 안에서 붙는다.
        */}

        {setNow.length > 0 && <RoutineCard list={setNow} next={nextDose} onOpen={openDose} />}
        {week && week.rate !== null && <AdherenceCard span={week} month={month} each={perMedicine}
                          back={back} onBack={setBack} />}

        {/*
          날짜별 복용 목록이 여기 있었다. 걷어냈다.

          기록을 하나하나 되보여줄 이유가 없다. 이 앱은 그것을 **뒤에서 쌓고
          분석하는** 데 쓰지, 사람에게 다시 읽히려고 모으는 것이 아니다. 위의 달력이
          이미 어느 날 무슨 일이 있었는지를 말하고, 목록은 그 위에 스물여덟 줄을
          더할 뿐이었다 — 몇 달을 쓰면 아무도 안 내리는 벽이 된다.

          벤치에서 그대로 나온 말: "이 데이터 하나하나를 유저한테 다시 보여줄 필요는
          없을 것 같음."
        */}

      </div>
    </MobileScreen>
  );
}

/**
 * 지금 정해져 있는 복약 루틴.
 *
 * 아래의 달력과 게이지가 "무엇이 일어났나" 라면 이 카드는 "무엇이 일어났어야
 * 하나" 다. 둘 중 하나만 있으면 나머지가 안 읽힌다 — 거른 칸이 둘인 것은 하루 두
 * 번짜리 처방에서는 하루를 통째로 건너뛴 것이고, 하루 다섯 번짜리에서는 한 끼를
 * 늦게 먹은 것이다.
 *
 * 칸 번호를 같이 적는 이유는 이 목록이 **약을 채워 넣을 때** 펼쳐지는 목록이기도
 * 해서다. 그 번호는 상자로 일정을 보낼 때 쓰는 것과 같은 함수에서 나온다.
 */
function RoutineCard({ list, next, onOpen }: {
  list: ReturnType<typeof routines>;
  /** 다음에 올 복용. 그 줄을 짚어 준다. */
  next?: Reminder;
  onOpen: (r: Reminder) => void;
}) {
  const say = list.map(routineSentence).join(' ');
  return (
    <div className="mt-4 rounded-3xl bg-white px-5 py-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span aria-hidden className="flex items-center justify-center text-lg leading-none"><ListIcon /></span>
        <Speakable text={say} className="flex flex-1 items-center gap-2 text-[11px] font-bold tracking-wide"
                   style={{ color: 'var(--color-sc-muted)' }}>
          <span className="flex-1">SET RIGHT NOW</span>
        </Speakable>
        <Hear text={say} />
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {list.map((r) => {
          const isNext = !!next && next.item.name === r.name;
          return (
          <div key={r.name} className="sc-row flex items-center rounded-2xl py-2"
               style={{
                 background: isNext ? 'var(--color-med-bg)' : 'var(--color-sc-bg)',
                 outline: isNext ? '2px solid var(--color-sc-primary)' : undefined,
               }}
               onClick={isNext && next ? () => onOpen(next) : undefined}>
            <span aria-hidden className="sc-icon"
                  style={{ color: isNext ? 'var(--color-sc-primary)' : 'var(--color-sc-muted)' }}>
              <PillIcon />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}
                    {...sayable(routineSentence(r))}>
                {r.name}
              </span>
              <span className="block text-xs" style={{ color: 'var(--color-sc-muted)' }}>
                {/*
                  다음에 올 것에는 그 시각만 짚어 준다. 목록은 하루 전체를 적고,
                  이 표시는 "지금 기준으로 다음" 이라 서로 다른 것을 말한다.
                */}
                {isNext && next ? `Next · ${next.time} — ` : ''}
                {r.times.join(' · ')}
                {r.endsOn && ` — until ${r.endsOn}`}
              </span>
            </span>
            {/*
              어느 칸에 넣는가. 숫자 하나지만 이 화면에서 유일하게 **손으로 하는
              일**을 가리키는 값이다.
            */}
            {r.tray !== null && (
              <span className="sc-end flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold"
                    style={{ background: 'var(--color-med-bg)', color: 'var(--color-sc-ink)' }}>
                {r.tray}
              </span>
            )}
          </div>
          );
        })}
      </div>
    </div>
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
function AdherenceCard({ span, month, each, back, onBack }: {
  span: NonNullable<ReturnType<typeof adherence>>;
  month: ReturnType<typeof calendar>;
  each: ReturnType<typeof byMedicine>;
  back: number;
  onBack: (next: number) => void;
}) {
  const say = adherenceSentence(span);
  return (
    <div className="mt-4 rounded-3xl bg-white px-5 py-4 shadow-sm">
      {/*
        무엇에 대한 그림인지 제목이 말해야 한다.

        이 화면에는 복약과 음식이 같이 있고, 한때 이 카드의 제목이 그냥 "지난 넉
        주" 였다. 그러면 아래의 초록 칸들이 약 이야기인지 끼니 이야기인지 구별이
        안 된다 — 벤치에서 그대로 나온 말이다.

        그리고 글자에만 기대지 않는다. 알약 그림이 앞에 서면 읽지 못하는 사람도
        이 카드가 무엇에 대한 것인지 안다. 아래 날짜별 목록이 같은 그림으로 약을
        표시하므로, 여기서 새로 배울 것도 없다.
      */}
      <div className="flex items-center gap-2">
        <span aria-hidden className="flex items-center justify-center text-lg leading-none"><PillIcon /></span>
        <Speakable text={say} className="flex flex-1 items-center gap-2 text-[11px] font-bold tracking-wide"
                   style={{ color: 'var(--color-sc-muted)' }}>
          <span className="flex-1">MEDICINE</span>
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
        <MonthNav back={back} onBack={onBack} label={windowLabel(back)} />
      </div>
      <div className="mt-2">
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
      {/*
        게이지를 **약마다** 낸다. 하나로 합친 것이 여기 있었는데, 그 수는 고칠 곳을
        가리키지 못했다 — 걸린 열 번이 한 약에 몰렸는지 흩어졌는지가 안 보인다.

        층 번호를 앞에 둔다. 이 기계는 트레이가 층으로 쌓여 있어서, 화면이 층으로
        말하면 약통을 열어 그 층을 보는 것으로 이어진다. 숫자와 손이 같은 것을
        가리킨다.
      */}
      <div className="mt-4 flex flex-col gap-3">
        {each.map((m) => (
          <div key={m.tray} {...sayable(medicineSentence(m))}>
            <div className="flex items-baseline gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold"
                    style={{ background: 'var(--color-med-bg)', color: 'var(--color-sc-ink)' }}>
                {m.tray}
              </span>
              <span className="flex-1 truncate text-sm font-semibold"
                    style={{ color: 'var(--color-sc-ink)' }}>{m.name}</span>
              <span className="text-xs tabular-nums" style={{ color: 'var(--color-sc-muted)' }}>
                {m.taken}/{m.offered}
              </span>
            </div>
            <div className="mt-1 h-3 w-full overflow-hidden rounded-full"
                 style={{ background: 'var(--color-sc-bg)' }}>
              <div className="h-full rounded-full"
                   style={{
                     width: `${Math.round((m.rate ?? 0) * 100)}%`,
                     background: 'var(--color-safe)',
                   }} />
            </div>
          </div>
        ))}
        <p className="mt-1 text-sm" style={{ color: 'var(--color-sc-ink)' }}>{say}</p>
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


