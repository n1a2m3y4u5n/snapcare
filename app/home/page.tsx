'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { MobileScreen } from '@/components/sc/MobileScreen';
import { DoseRelease } from '@/components/sc/DoseRelease';
import { useDispenser } from '@/lib/dispenser/useDispenser';
import { useIsClient } from '@/lib/hooks';
import { useDoseLog } from '@/lib/dispenser/useDoseLog';
import { useDoseAlert } from '@/lib/dispenser/useDoseAlert';
import { planTrays, FITTED_TRAYS } from '@/lib/hardware/dispenser';
import { useScans, todayKey } from '@/stores/scans';
import { useProfile, PROFILE_ID } from '@/stores/profile';
import { useAnalysis } from '@/stores/analysis';
import { useReminders } from '@/stores/reminders';
import { finished, nextDue, running } from '@/lib/snapcare/course';
import type { Reminder } from '@/stores/reminders';
import { HowDidItSit, pendingFeedback } from './how-did-it-sit';
import { SuspectedTriggerCard } from './suspected';
import { TryIt } from './try-it';
import { Orbit, type Satellite } from './orbit';
import { sayable, ask, Speakable } from '@/components/sc/Say';
import { spokenName } from '@/lib/tts/speakable';

export default function HomePage() {
  const router = useRouter();
  // 약통이 짝지어져 있으면 걸린 약을 여기서 보여준다. 짝이 없으면 훅이 조용히
  // 아무것도 안 하고, DoseRelease 는 걸린 약이 없으면 그리지 않는다.
  const box = useDispenser();
  const scans = useScans((s) => s.scans);
  const profile = useProfile((s) => s.profile);
  const confirmed = useProfile((s) => s.confirmed);
  const setCurrent = useAnalysis((s) => s.setCurrent);
  const reminders = useReminders((s) => s.reminders);
  const dropMedicine = useReminders((s) => s.dropMedicine);

  // 상자가 약을 내보내거나 놓친 것을 기록에 남긴다. 홈에서도 도는 이유는, 기기 화면을
  // 한 번도 열지 않는 사람이 대부분이기 때문이다 — 짝은 한 번 짓고 나면 끝이다.
  const trayNames = useMemo(
    () => Object.fromEntries(
      planTrays(reminders, box.report?.status.trayCount ?? FITTED_TRAYS).plan.map((t) => [t.tray, t.name]),
    ),
    [reminders, box.report?.status.trayCount],
  );
  useDoseLog(box.report, trayNames);
  // 앱을 보고 있지 않을 때는 알림이 부른다 — 배출 버튼은 화면을 봐야 보인다.
  useDoseAlert(box.report);

  // 처방을 스캔해 알람을 만들었을 때만 뜬다.
  // 예전에는 존재하지도 않는 Metformin 알람이 항상 박혀 있었다 —
  // 눌러도 실제 알람과 무관했고, 데모에서 눌러보면 어긋나는 자리였다.
  //
  // 그리고 `reminders[0]` 을 쓰고 있었다. 그 배열은 **최근에 더한 순**이지 시각순이
  // 아니라, 약을 셋 먹는 사람에게 홈은 아무거나 하나를 "다음 복용" 이라고 보여줬다.
  //
  // 날짜·시각은 그릴 때 읽으면 안 된다 — 서버가 그린 화면과 어긋난다. 붙은 뒤에 읽는다.
  //
  // 붙은 뒤에 이펙트에서 setState 하던 것을 바꿨다. 결과는 같은데 두 가지가 낫다:
  // 그리자마자 한 번 더 그리지 않고, 화면이 다시 그려질 때마다 시각을 새로 읽는다.
  // 뒤쪽이 실제로 중요하다 — 예전에는 마운트 때 읽은 날짜를 계속 들고 있어서, 자정을
  // 넘겨 앱을 켜 둔 사람에게 '오늘' 이 어제로 남았다.
  const isClient = useIsClient();
  const now = isClient
    ? (() => {
        const d = new Date();
        return { day: todayKey(), hm: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` };
      })()
    : null;

  const live = now ? running(reminders, now.day) : [];
  const nextDose: Reminder | undefined = now ? nextDue(live, now.hm) : undefined;

  /*
   * 복약이 끝난 약.
   *
   * 조용히 지우지 않는다. 끝났다는 것은 **사용자가 알아야 하는 사실**이고, 이 앱이
   * 그것을 전할 유일한 자리가 여기다. 처방전에 "7일간" 이 적혀 있어도 그것을 읽을 수
   * 없는 사람에게, 약이 끝났다고 말해 주는 것은 지금까지 아무도 하지 않던 일이다.
   *
   * 확인을 누르면 그때 알람을 걷는다. 확인 전까지는 남아 있지만 `running` 이 이미
   * 걸러 내므로 울리지는 않는다.
   */
  const done: Reminder[] = now ? finished(reminders, now.day) : [];

  // 반응은 먹은 직후에 나오지 않으므로, 아직 답하지 않은 끼니 중 가장 오래된 것을 묻는다.
  const pending = pendingFeedback(scans, PROFILE_ID);

  function openDose(r: Reminder) {
    setCurrent(r.item);
    router.push('/dose');
  }

  /*
    둘레에 놓을 것들.

    기준 하나: **아래 탭이 못 닿는 곳만.**

    처음에는 '오늘(/nutrition)' 도 위성으로 뒀다. 홈에서 한 번에 닿는 편이 낫다고
    봤는데, 아래 탭에 같은 곳이 이미 있어서 한 화면에 같은 곳으로 가는 길이 둘이
    됐다. 못 읽는 사람에게 길이 둘인 것이 늘 나은 것은 아니다 — 두 그림이 같은
    데로 간다는 것을 알아내려면 **둘 다 눌러 봐야** 하고, 그 사이에 "이 둘은 뭐가
    다르지" 라는 물음이 생긴다. 이 앱은 그 물음을 안 만드는 것이 일이다.

    남은 셋은 아래 탭 어디에도 없다. 지난 날들과 약통과 프로필은 지금까지 설정
    안쪽에 묻혀 있었고, 그래서 궤도가 실제로 길을 **새로 내는** 자리가 된다.

    배지는 답을 기다리는 것에만 붙인다. 숫자를 못 읽어도 **점이 붙었다**는 것은
    보이고, 그것만으로 "여기 뭔가 있다" 는 뜻이 선다.
  */
  const satellites: Satellite[] = [
    {
      emoji: '📅', label: 'Past days', href: '/history',
      say: 'Past days. Everything you have checked, day by day, and how your medicine went.',
    },
    {
      emoji: '💊', label: 'Pill box', href: '/device',
      say: 'The pill box. Send the schedule, and see what it has done.',
    },
    {
      emoji: '🧑', label: 'Who', href: '/profile',
      say: 'Who we are checking for. Your age, your conditions and your allergies.',
      // 프로필을 한 번도 확인하지 않았으면 점을 붙인다. 판정이 전부 이 값에서
      // 나오는데 기본값('어른, 조건 없음')이 아무 표시 없이 정해져 있었다.
      badge: confirmed ? 0 : 1,
    },
  ];


  return (
    <MobileScreen tab="home">
      <div className="px-5 pt-14">
        <h1 className="text-2xl font-extrabold" style={{ color: 'var(--color-sc-ink)' }}
            {...ask('SnapCare. Photograph food or medicine to check it. The big blue button takes a photograph.')}>
          SnapCare
        </h1>

        {/*
          지금 꺼내야 하는 약. 기기는 시간이 됐다고 내보내지 않으므로 이것이 화면에
          뜨는 순간이 곧 사람이 움직여야 하는 순간이고, 그래서 홈의 맨 위다.

          한 번 아래에 두어 봤다가 되돌렸다. "TRY IT" 예시 카드 밑으로 내려가 있었는데,
          화면에서 **유예가 있는 것은 이것뿐**이다 — 한 시간이 지나면 트레이는 열리지
          않고 '놓침' 이 기록된다. 글을 못 읽는 사람에게 스크롤을 시켜서 찾게 할 것이
          아니다. 걸린 약이 없으면 아무것도 그리지 않으므로 평소에는 자리를 먹지 않는다.
        */}
        <div className="mt-4 empty:mt-0">
          <DoseRelease report={box.report} onRelease={box.release} />
        </div>

        {/*
          프로필 안내 카드가 여기 있었다. 걷어낸 이유는 **`Who` 위성의 배지가 같은
          말을 하기 때문**이다. 한 화면에서 같은 것을 두 번 말하면 읽는 쪽은 둘이
          다른 것을 말한다고 생각하고, 무엇보다 이 카드가 궤도를 화면 밖으로 밀어냈다.

          배지가 카드보다 약한 신호인 것은 맞다. 대신 **늘 보인다** — 카드는 스크롤로
          지나가지만 궤도는 이 화면의 가운데다.
        */}

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

        {/* 복약 리마인더 — 실제로 만든 알람이 있을 때만 */}
        {nextDose && (
          <button
            onClick={() => openDose(nextDose)}
            className="mt-4 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left"
            style={{ background: 'var(--color-med-bg)' }}
          >
            <span className="text-xl">{nextDose.item.emoji}</span>
            <span className="flex-1">
              <span className="block text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}
                    {...sayable(`Next dose: ${nextDose.item.name} at ${nextDose.time}.`)}>
                {nextDose.item.name} · {nextDose.time}
              </span>
              <span className="block text-xs" style={{ color: 'var(--color-sc-muted)' }}>
                {profile.name}
              </span>
            </span>
            <span style={{ color: 'var(--color-sc-muted)' }}>›</span>
          </button>
        )}

        {/*
          가운데에 카메라, 둘레에 나머지.

          왜 이 모양인지는 lib/home/orbit.ts 에 적었다. 요약하면 홈이 세로로 긴
          목록이었고, 그 안에서 카메라가 여덟 칸 중 하나로 보였다 — 이 앱에서 사람이
          하는 일은 사진을 찍는 것 하나인데.

          통계는 걷어내 자기 화면으로 보냈다. 오늘 누적은 `/nutrition`, 최근 목록은
          `/history` 에 이미 있었고, 홈에 있던 것은 그 화면들의 **미리보기**였다.
          미리보기가 본체 옆에 계속 떠 있으면 눈이 그쪽으로 새고, 정작 그 미리보기로는
          아무 판단도 못 한다(넉 줄로는 추세가 안 보인다).

          위쪽 알림 카드들은 그대로 뒀다. 저것들은 통계가 아니라 **지금 해야 하는
          일**이고, 특히 배출 카드는 유예가 지나면 트레이가 닫힌다.
        */}
        <div className="mt-6">
          <Orbit satellites={satellites} />
        </div>

        {/*
          아직 아무것도 안 찍은 사람에게만 표본을 내놓는다. 궤도 아래에 두는 이유는
          이것이 **한 번 쓰고 사라지는 안내**이기 때문이다 — 한 번이라도 찍고 나면
          다시는 안 보이므로 궤도를 차지할 자리가 아니다.
        */}
        {scans.length === 0 && <TryIt />}

        {/*
          묻는 것들은 궤도 **아래**다.

          한 번 위에 두었다가 내렸다. 둘 다 통계가 아니라 답해야 하는 것이라 위가
          맞다고 봤는데, 실제로 그려 보니 이 둘이 뜨는 날에는 카메라가 화면 밖으로
          밀려났다 — 홈을 다시 짠 이유가 그것이었는데 되돌아간 셈이다.

          위에 남는 것은 배출 카드뿐이다. 그것만 **유예가 있다**: 한 시간이 지나면
          트레이는 열리지 않고 '놓침' 이 기록된다. 나머지는 오늘 안에만 답하면 된다.
        */}
        <SuspectedTriggerCard />
        {pending && <HowDidItSit key={pending.id} record={pending} />}
      </div>
    </MobileScreen>
  );
}
