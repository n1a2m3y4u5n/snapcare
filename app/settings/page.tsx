'use client';

import { useRouter } from 'next/navigation';
import { MobileScreen } from '@/components/sc/MobileScreen';
import { LanguagePicker } from '@/components/sc/LanguagePicker';
import { useProfile } from '@/stores/profile';
import { usePreferences, SPEECH_RATES } from '@/stores/preferences';
import { TEXT_SIZES, TEXT_SIZE_LABEL, ROOT_PX } from '@/lib/a11y/textSize';
import { sayable, ask, Speakable } from '@/components/sc/Say';
import { useMyColor } from '@/lib/hooks';
import { speak, setSpeechRate as setVoiceRate } from '@/lib/voice';

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
  const profile = useProfile((s) => s.profile);
  const myColor = useMyColor(profile.color);
  const autoTts = usePreferences((s) => s.autoTts);
  const speechRate = usePreferences((s) => s.speechRate);
  const setSpeechRate = usePreferences((s) => s.setSpeechRate);
  const setAutoTts = usePreferences((s) => s.setAutoTts);
  const textSize = usePreferences((s) => s.textSize);
  const setTextSize = usePreferences((s) => s.setTextSize);

  return (
    <MobileScreen bar="inner">
      <div className="px-5 pt-14">
        <h1 {...ask('Settings. Change who we check for, how the voice reads, and the pill device.')} className="text-2xl font-extrabold" style={{ color: 'var(--color-sc-ink)' }}>Settings</h1>

        {/* 판정 기준이 되는 사람 */}
        <Speakable text={'Who we check for.'} className="mt-6 text-[11px] font-bold tracking-wide flex w-full items-center gap-2" style={{ color: 'var(--color-sc-muted)' }}>
          <span className="flex-1">WHO WE CHECK FOR</span>
        </Speakable>
        <button
          onClick={() => router.push('/profile')}
          className="mt-2 flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-sm"
        >
          <span
            className="flex h-10 w-10 items-center justify-center rounded-full text-xl"
            style={{ background: myColor }}
          >
            {profile.emoji}
          </span>
          <span className="flex-1">
            <span className="block text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}
                  {...sayable('Me and my conditions. Age and allergies decide every verdict.')}>
              Me &amp; my conditions
            </span>
            <span className="block text-xs" style={{ color: 'var(--color-sc-muted)' }}>
              {profile.role}{profile.conditionIds.length > 0 ? ` · ${profile.conditionIds.length}` : ''}
            </span>
          </span>
          <span style={{ color: 'var(--color-sc-muted)' }}>›</span>
        </button>

        {/*
          한 폰을 여럿이 쓰는 경우.

          위의 "나와 내 조건" 바로 아래에 둔다. 둘은 같은 질문의 두 켜다 — 위는 지금
          누구 기준으로 보고 있는지고, 여기는 그 '누구' 가 몇 명인지다.

          하단 탭이 아니라 설정 안에 두는 이유는 가족 명단을 없앨 때와 같다. 탭에 있으면
          '가족 관리 앱' 으로 읽히는데, 이것은 하루에 한 번 있는 일도 아니다.
        */}
        <button
          onClick={() => router.push('/people')}
          className="mt-2 flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-sm"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full text-xl"
                style={{ background: 'var(--color-sc-line)' }}>👥</span>
          <span className="flex-1">
            <span className="block text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}
                  {...sayable('Who uses this phone. Add someone else, or switch to them.')}>
              Who uses this phone
            </span>
            <span className="block text-xs" style={{ color: 'var(--color-sc-muted)' }}>
              Share this phone — each person keeps their own
            </span>
          </span>
          <span style={{ color: 'var(--color-sc-muted)' }}>›</span>
        </button>

        {/*
          글자 크기.

          **음성보다 위에 둔다.** 이 목록을 읽어 내려오는 사람은 글자가 작아서
          고생하는 중일 수 있고, 그렇다면 가장 먼저 만나야 하는 것이 이것이다.

          기본이 'Large' 인 이유는 lib/a11y/textSize.ts 에 적었다 — 요약하면,
          작아서 못 읽는 사람이 "글자 크기" 라는 작은 글자를 찾을 수는 없다.
        */}
        <Speakable text={'Text size. How big the words are on every screen.'} className="mt-6 text-[11px] font-bold tracking-wide flex w-full items-center gap-2" style={{ color: 'var(--color-sc-muted)' }}>
          <span className="flex-1">TEXT SIZE</span>
        </Speakable>
        <div className="mt-2 flex gap-2">
          {TEXT_SIZES.map((size) => {
            const on = size === textSize;
            return (
              <button
                key={size}
                onClick={() => setTextSize(size)}
                aria-pressed={on}
                aria-label={`Text size: ${TEXT_SIZE_LABEL[size]}`}
                className="flex flex-1 flex-col items-center gap-1 rounded-2xl bg-white py-3 shadow-sm"
                style={{ outline: on ? '3px solid var(--color-sc-primary)' : 'none' }}
              >
                {/*
                  보기가 곧 예시다. 'Large' 라는 낱말을 못 읽어도 **글자 크기가
                  실제로 다르게 그려져 있으면** 무엇을 고르는지가 보인다. 그래서
                  크기를 rem 이 아니라 px 로 박는다 — rem 이면 셋이 같이 커져서
                  차이가 안 보인다.
                */}
                <span aria-hidden style={{ fontSize: ROOT_PX[size] * 1.1, lineHeight: 1 }}
                      className="font-extrabold">
                  Aa
                </span>
                <span aria-hidden className="text-[11px] font-semibold"
                      style={{ color: on ? 'var(--color-sc-primary)' : 'var(--color-sc-muted)' }}>
                  {TEXT_SIZE_LABEL[size]}
                </span>
              </button>
            );
          })}
        </div>

        {/* 음성 — 접근성 코어라 설정에서 끌 수 있게만 둔다 */}
        <Speakable text={'Voice.'} className="mt-6 text-[11px] font-bold tracking-wide flex w-full items-center gap-2" style={{ color: 'var(--color-sc-muted)' }}>
          <span className="flex-1">VOICE</span>
        </Speakable>
        <button
          onClick={() => setAutoTts(!autoTts)}
          className="mt-2 flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-sm"
          aria-pressed={autoTts}
        >
          <span className="text-lg">{autoTts ? '🔊' : '🔇'}</span>
          <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }} {...sayable('Read results aloud. This is on.')}>Read results aloud
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

        <LanguagePicker />

        {/*
          말하기 속도.
          숫자(0.85×)는 이 앱의 사용자가 읽을 수 없는 표기다. 거북이와 토끼는 크기가
          곧 뜻이라 세지 않아도 읽히고, 고르면 그 속도로 바로 한 문장을 들려준다 —
          설명을 읽는 대신 들어보고 고르게 하는 편이 이 앱의 방식이다.
        */}
        <div className="mt-2 flex items-center gap-2 rounded-2xl bg-white px-4 py-3 shadow-sm">
          <span className="text-lg">🐢</span>
          <div className="flex flex-1 gap-1.5">
            {SPEECH_RATES.map((r) => {
              const on = Math.abs(speechRate - r) < 0.01;
              return (
                <button
                  key={r}
                  onClick={() => {
                    setSpeechRate(r);
                    setVoiceRate(r);
                    void speak('This is how fast I will read.');
                  }}
                  aria-label={`Speech speed ${r}`}
                  aria-pressed={on}
                  className="flex-1 rounded-xl py-2 text-xs font-bold"
                  style={{
                    background: on ? 'var(--color-sc-primary)' : 'var(--color-sc-bg)',
                    color: on ? '#fff' : 'var(--color-sc-muted)',
                  }}
                >
                  {'▪'.repeat(SPEECH_RATES.indexOf(r) + 1)}
                </button>
              );
            })}
          </div>
          <span className="text-lg">🐇</span>
        </div>

        {/* 기기 — 네트워크 없이 카메라로만 오간다 */}
        <Speakable text={'Pill device.'} className="mt-6 text-[11px] font-bold tracking-wide flex w-full items-center gap-2" style={{ color: 'var(--color-sc-muted)' }}>
          <span className="flex-1">PILL DEVICE</span>
        </Speakable>
        <button
          onClick={() => router.push('/device')}
          className="mt-2 flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-sm"
        >
          <span className="text-lg">💊</span>
          <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }} {...sayable('Send the schedule to the pill device, using the camera.')}>Send the schedule to the device
          </span>
          <span style={{ color: 'var(--color-sc-muted)' }}>›</span>
        </button>

        {/* 의료진 공유 — 타이핑 없이 기록을 넘기는 경로 */}
        <Speakable text={'At the clinic.'} className="mt-6 text-[11px] font-bold tracking-wide flex w-full items-center gap-2" style={{ color: 'var(--color-sc-muted)' }}>
          <span className="flex-1">AT THE CLINIC</span>
        </Speakable>
        <button
          onClick={() => router.push('/provider')}
          className="mt-2 flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-sm"
        >
          <span className="text-lg">👩‍⚕️</span>
          <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }} {...sayable('Show your history to a health worker.')}>Show history to a provider
          </span>
          <span style={{ color: 'var(--color-sc-muted)' }}>›</span>
        </button>
      </div>
    </MobileScreen>
  );
}
