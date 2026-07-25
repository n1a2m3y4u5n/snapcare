'use client';

import { useRouter } from 'next/navigation';
import { MobileScreen } from '@/components/sc/MobileScreen';
import { useFamily } from '@/stores/family';
import { usePreferences } from '@/stores/preferences';

/**
 * 설정 — 판정에 실제로 영향을 주는 것만 둔다.
 *
 * 이전에는 SOS 경보와 기기 페어링 목록이 있었다. 둘 다 섭취물과 무관해서
 * 앱을 "건강 포털"처럼 보이게 만들었고, SOS는 붙어 있는 연락 체계가 없는데도
 * 안전 기능처럼 보인다는 점에서 오히려 위험했다.
 *
 * 가족 프로필은 여기로 들어왔다. 하단 탭에 있으면 '가족 관리 앱'으로 읽히지만,
 * 설정 안에 있으면 본래 역할 — 기준치를 정하는 입력 — 로 읽힌다.
 */
export default function SettingsPage() {
  const router = useRouter();
  const members = useFamily((s) => s.members);
  const autoTts = usePreferences((s) => s.autoTts);
  const setAutoTts = usePreferences((s) => s.setAutoTts);

  return (
    <MobileScreen tab="settings">
      <div className="px-5 pt-14">
        <h1 className="text-2xl font-extrabold" style={{ color: 'var(--color-sc-ink)' }}>Settings</h1>

        {/* 판정 기준이 되는 사람들 */}
        <p className="mt-6 text-[11px] font-bold tracking-wide" style={{ color: 'var(--color-sc-muted)' }}>
          WHO WE CHECK FOR
        </p>
        <button
          onClick={() => router.push('/family')}
          className="mt-2 flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-sm"
        >
          <span className="flex -space-x-2">
            {members.slice(0, 4).map((m) => (
              <span
                key={m.id}
                className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ background: m.color, border: '2px solid white' }}
              >
                {m.emoji}
              </span>
            ))}
          </span>
          <span className="flex-1">
            <span className="block text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
              People &amp; conditions
            </span>
            <span className="block text-xs" style={{ color: 'var(--color-sc-muted)' }}>
              Age and allergies decide every verdict
            </span>
          </span>
          <span style={{ color: 'var(--color-sc-muted)' }}>›</span>
        </button>

        {/* 음성 — 접근성 코어라 설정에서 끌 수 있게만 둔다 */}
        <p className="mt-6 text-[11px] font-bold tracking-wide" style={{ color: 'var(--color-sc-muted)' }}>
          VOICE
        </p>
        <button
          onClick={() => setAutoTts(!autoTts)}
          className="mt-2 flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-sm"
          aria-pressed={autoTts}
        >
          <span className="text-lg">{autoTts ? '🔊' : '🔇'}</span>
          <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
            Read results aloud
          </span>
          <span
            className="flex h-6 w-11 items-center rounded-full px-0.5 transition-colors"
            style={{ background: autoTts ? 'var(--color-safe)' : 'var(--color-sc-line)' }}
          >
            <span
              className="h-5 w-5 rounded-full bg-white transition-transform"
              style={{ transform: autoTts ? 'translateX(20px)' : 'none' }}
            />
          </span>
        </button>

        {/* 기기 — 네트워크 없이 카메라로만 오간다 */}
        <p className="mt-6 text-[11px] font-bold tracking-wide" style={{ color: 'var(--color-sc-muted)' }}>
          PILL DEVICE
        </p>
        <button
          onClick={() => router.push('/device')}
          className="mt-2 flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-sm"
        >
          <span className="text-lg">💊</span>
          <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
            Send the schedule to the device
          </span>
          <span style={{ color: 'var(--color-sc-muted)' }}>›</span>
        </button>

        {/* 의료진 공유 — 타이핑 없이 기록을 넘기는 경로 */}
        <p className="mt-6 text-[11px] font-bold tracking-wide" style={{ color: 'var(--color-sc-muted)' }}>
          AT THE CLINIC
        </p>
        <button
          onClick={() => router.push('/provider')}
          className="mt-2 flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-sm"
        >
          <span className="text-lg">👩‍⚕️</span>
          <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
            Show history to a provider
          </span>
          <span style={{ color: 'var(--color-sc-muted)' }}>›</span>
        </button>
      </div>
    </MobileScreen>
  );
}
