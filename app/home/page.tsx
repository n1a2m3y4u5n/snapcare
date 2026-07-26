'use client';

import { useRouter } from 'next/navigation';
import { MobileScreen } from '@/components/sc/MobileScreen';
import { useScans } from '@/stores/scans';
import { useFamily } from '@/stores/family';
import { useAnalysis } from '@/stores/analysis';
import { useReminders } from '@/stores/reminders';
import { getItem } from '@/lib/snapcare/catalog';
import { LEVEL_META } from '@/lib/snapcare/verdict';
import type { Reminder } from '@/stores/reminders';
import type { ScanRecord } from '@/lib/snapcare/types';
import { HowDidItSit, pendingFeedback } from './how-did-it-sit';
import { SuspectedTriggerCard } from './suspected';
import { SpeakIcon } from '@/components/sc/Say';
import { TimeGlyph } from '@/components/sc/TimeGlyph';
import { spokenName } from '@/lib/tts/speakable';

export default function HomePage() {
  const router = useRouter();
  const scans = useScans((s) => s.scans);
  const { setActiveMember, getMember, activeMemberId } = useFamily();
  const setCurrent = useAnalysis((s) => s.setCurrent);
  const reminders = useReminders((s) => s.reminders);

  // 처방을 스캔해 알람을 만들었을 때만 뜬다.
  // 예전에는 존재하지도 않는 Metformin 알람이 항상 박혀 있었다 —
  // 눌러도 실제 알람과 무관했고, 데모에서 눌러보면 어긋나는 자리였다.
  const nextDose: Reminder | undefined = reminders[0];

  // 반응은 먹은 직후에 나오지 않으므로, 아직 답하지 않은 끼니 중 가장 오래된 것을 묻는다.
  const pending = pendingFeedback(scans, activeMemberId);

  function openDose(r: Reminder) {
    setCurrent(r.item);
    setActiveMember(r.memberId);
    router.push('/dose');
  }

  function openScan(rec: ScanRecord) {
    // 기록에 담아둔 대상을 우선 쓰고, 없으면(구버전 기록) 카탈로그에서 찾는다.
    const item = rec.item ?? getItem(rec.itemId);
    if (!item) return;
    setCurrent(item);
    setActiveMember(rec.memberId);
    router.push(rec.kind === 'prescription' || rec.kind === 'medicine' ? '/dose' : '/scan');
  }

  return (
    <MobileScreen tab="home">
      <div className="px-5 pt-14">
        <h1 className="text-2xl font-extrabold" style={{ color: 'var(--color-sc-ink)' }}>
          SnapCare
        </h1>

        {/* 복약 리마인더 — 실제로 만든 알람이 있을 때만 */}
        {nextDose && (
          <button
            onClick={() => openDose(nextDose)}
            className="mt-4 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left"
            style={{ background: 'var(--color-med-bg)' }}
          >
            <span className="text-xl">{nextDose.item.emoji}</span>
            <span className="flex-1">
              <span className="block text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
                {nextDose.item.name} · {nextDose.time}
              </span>
              <span className="block text-xs" style={{ color: 'var(--color-sc-muted)' }}>
                {getMember(nextDose.memberId)?.name ?? ''}
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
          <span className="mt-2 text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
            Scan something
          </span>
        </div>

        {/*
          기록에서 드러난 것이 있으면 먼저 묻는다. 아직 답하지 않은 끼니를 묻는 것보다
          이쪽이 무겁고, 통계 문턱을 넘었을 때만 뜨므로 자주 보일 일이 없다.
        */}
        <SuspectedTriggerCard memberId={activeMemberId} />

        {/* 식이 일지 — 아직 답하지 않은 끼니가 있을 때만 뜬다 */}
        {pending && <HowDidItSit key={pending.id} record={pending} />}

        {/* 최근 */}
        <p className="mt-8 text-xs font-bold tracking-wide" style={{ color: 'var(--color-sc-muted)' }}>
          RECENT
        </p>
        <div className="mt-2 flex flex-col gap-2">
          {scans.map((s) => {
            const meta = LEVEL_META[s.level];
            const member = getMember(s.memberId);
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
                    {/* 이름은 아바타로, 시각은 시계로 — 둘 다 이미 그림으로 가진 정보다.
                        행 자체가 버튼이라 여기서는 누를 수 없는 형태를 쓴다. */}
                    <span className="mt-0.5 flex items-center gap-1.5">
                      {member && (
                        <span
                          className="flex h-4 w-4 items-center justify-center rounded-full text-[9px]"
                          style={{ background: member.color }}
                          title={member.name}
                        >
                          {member.emoji}
                        </span>
                      )}
                      <TimeGlyph label={s.timeLabel} mute />
                    </span>
                  </span>
                </button>
                <SpeakIcon text={`${spokenName(s.name, s.kind)}. ${member ? `For ${member.name}. ` : ''}${meta.label}.`} />
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
