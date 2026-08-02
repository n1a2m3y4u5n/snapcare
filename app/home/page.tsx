'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MobileScreen } from '@/components/sc/MobileScreen';
import { DoseRelease } from '@/components/sc/DoseRelease';
import { useDispenser } from '@/lib/dispenser/useDispenser';
import { useScans, todayKey } from '@/stores/scans';
import { useProfile, PROFILE_ID } from '@/stores/profile';
import { useAnalysis } from '@/stores/analysis';
import { useReminders } from '@/stores/reminders';
import { finished, nextDue, running } from '@/lib/snapcare/course';
import { getItem } from '@/lib/snapcare/catalog';
import { LEVEL_META } from '@/lib/snapcare/verdict';
import type { Reminder } from '@/stores/reminders';
import type { ScanRecord } from '@/lib/snapcare/types';
import { HowDidItSit, pendingFeedback } from './how-did-it-sit';
import { SuspectedTriggerCard } from './suspected';
import { Today } from './today';
import { TryIt } from './try-it';
import { Hear, sayable, ask, Speakable } from '@/components/sc/Say';
import { spokenName } from '@/lib/tts/speakable';
import { TimeGlyph } from '@/components/sc/TimeGlyph';

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

  // 처방을 스캔해 알람을 만들었을 때만 뜬다.
  // 예전에는 존재하지도 않는 Metformin 알람이 항상 박혀 있었다 —
  // 눌러도 실제 알람과 무관했고, 데모에서 눌러보면 어긋나는 자리였다.
  //
  // 그리고 `reminders[0]` 을 쓰고 있었다. 그 배열은 **최근에 더한 순**이지 시각순이
  // 아니라, 약을 셋 먹는 사람에게 홈은 아무거나 하나를 "다음 복용" 이라고 보여줬다.
  //
  // 날짜·시각은 그릴 때 읽으면 안 된다 — 서버가 그린 화면과 어긋난다. 붙은 뒤에 읽는다.
  const [now, setNow] = useState<{ day: string; hm: string } | null>(null);
  useEffect(() => {
    const d = new Date();
    setNow({ day: todayKey(), hm: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` });
  }, []);

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

  function openScan(rec: ScanRecord) {
    // 기록에 담아둔 대상을 우선 쓰고, 없으면(구버전 기록) 카탈로그에서 찾는다.
    const item = rec.item ?? getItem(rec.itemId);
    if (!item) return;
    setCurrent(item);
    router.push(rec.kind === 'prescription' || rec.kind === 'medicine' ? '/dose' : '/scan');
  }

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
          프로필을 한 번도 확인하지 않은 사람에게, 지금 무엇을 기준으로 판정하고
          있는지 보여준다. 기본값은 '어른, 조건 없음' 인데 그것이 아무 표시 없이
          정해져 왔다 — 아이가 써도 어른 기준이고, 알레르기가 있어도 등록할 자리를
          만나지 못했다. 첫 실행에서 건너뛴 사람이 여기로 돌아올 수 있어야 한다.
        */}
        {!confirmed && (
          <button onClick={() => router.push('/profile?setup=1')}
                  className="mt-4 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left"
                  style={{ background: 'color-mix(in srgb, var(--color-caution) 14%, white)' }}
                  {...sayable('We are checking as an adult with no conditions. Tap to set who this is for.')}>
            <span className="text-xl" aria-hidden>⚖️</span>
            <span className="flex-1">
              <span className="block text-sm font-bold" style={{ color: 'var(--color-sc-ink)' }}>
                Checking as an adult
              </span>
              <span className="block text-xs" style={{ color: 'var(--color-sc-muted)' }}>
                Tap to set your age and allergies
              </span>
            </span>
            <span style={{ color: 'var(--color-sc-muted)' }}>›</span>
          </button>
        )}

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

        {/* 스캔 버튼 */}
        <div className="mt-8 flex flex-col items-center">
          <button
            onClick={() => router.push('/camera')}
            className="flex h-24 w-24 items-center justify-center rounded-full text-white shadow-lg active:scale-95 transition-transform"
            style={{ background: 'var(--color-sc-primary)' }}
            aria-label="Scan something"
          >
            <CameraGlyph />
          </button>
          <span className="mt-2 text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}
                {...sayable('The big blue button takes a photograph.')}>
            Scan something
          </span>
        </div>

        {/*
          아직 아무것도 찍지 않았다면 눌러볼 것을 내놓는다. 이 자리는 원래 빈 공간이었고,
          빈 화면은 "쓸 것이 없다"로 읽힌다 — 실제로는 카메라 화면 안쪽에 다 있었다.
        */}
        {scans.length === 0 && <TryIt />}

        {/*
          기록에서 드러난 것이 있으면 먼저 묻는다. 아직 답하지 않은 끼니를 묻는 것보다
          이쪽이 무겁고, 통계 문턱을 넘었을 때만 뜨므로 자주 보일 일이 없다.
        */}
        <SuspectedTriggerCard />

        {/* 오늘 하루 누적 — 오늘 먹은 것이 있을 때만 스스로 뜬다 */}
        <Today scans={scans} />

        {/* 식이 일지 — 아직 답하지 않은 끼니가 있을 때만 뜬다 */}
        {pending && <HowDidItSit key={pending.id} record={pending} />}

        {/*
          최근 — 아무것도 없으면 제목도 내지 않는다. 빈 목록 위의 제목은 자리를
          차지하면서 아무것도 말하지 않고, 소리로 들으면 "RECENT" 다음에 침묵이라
          뭔가 놓친 것처럼 들린다.
        */}
        {scans.length > 0 && (
          <Speakable text={'Recent. What has been checked lately.'} className="mt-8 text-xs font-bold tracking-wide flex w-full items-center gap-2" style={{ color: 'var(--color-sc-muted)' }}>
          <span className="flex-1">RECENT</span>
        </Speakable>
        )}
        <div className="mt-2 flex flex-col gap-2">
          {scans.map((s) => {
            const meta = LEVEL_META[s.level];
            return (
              // 듣기 버튼을 행 버튼 안에 넣으면 버튼이 중첩돼 키보드 탐색이 깨진다.
              // 행을 div 로 두고 두 버튼을 나란히 놓는다.
              <div
                key={s.id}
                className="flex items-center gap-2 rounded-2xl bg-white pr-2 shadow-sm"
              >
                <button
                  onClick={() => openScan(s)}
                  className="flex flex-1 items-center gap-3 px-4 py-3 text-left"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full text-lg" style={{ background: meta.bg }}>
                    {s.emoji}
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
                      {s.name}
                    </span>
                    {/* 시각은 시계로 — 이미 그림으로 가진 정보다.
                        누구 것인지 표시하던 아바타는 뺐다. 쓰는 사람이 한 명이므로
                        매 줄에 같은 얼굴이 붙는 것은 정보가 아니라 잡음이다. */}
                    <span className="mt-0.5 flex items-center gap-1.5">
                      <TimeGlyph label={s.timeLabel} mute />
                    </span>
                  </span>
                </button>
                <Hear text={`${spokenName(s.name, s.kind)}. ${meta.label}.`} />
                {/*
                  판정은 이 목록에서 가장 중요한 정보인데 2.5px 색 점이었다.
                  색만으로 뜻을 싣는 것은 색 규약을 아는 사람에게만 통하고, 적록색약이면
                  안전과 회피가 같은 점이 된다. 색은 그대로 두고 기호를 얹는다 —
                  ✅ ⚠️ ⛔ 는 색과 무관하게 모양이 다르다.
                */}
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm"
                  style={{ background: meta.bg }}
                  title={meta.label}
                >
                  {meta.emoji}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </MobileScreen>
  );
}

function CameraGlyph() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
