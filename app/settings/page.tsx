'use client';

import { useState } from 'react';
import { MobileScreen } from '@/components/sc/MobileScreen';
import { LanguagePicker } from '@/components/sc/LanguagePicker';
import { resetDemo } from '@/stores/scans';
import { isDemo } from '@/lib/snapcare/demo';
import { useIsClient } from '@/lib/hooks';
import { usePreferences, SPEECH_RATES } from '@/stores/preferences';
import { TEXT_SIZES, TEXT_SIZE_LABEL, ROOT_PX } from '@/lib/a11y/textSize';
import { ask, Speakable, Hear } from '@/components/sc/Say';
import { speak, setSpeechRate as setVoiceRate } from '@/lib/voice';
import { DotIcon, HareIcon, SpeakerIcon, SpeakerOffIcon, TortoiseIcon, UndoIcon } from '@/components/icons';

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
  /*
    `isDemo()` 는 주소와 브라우저 저장소를 읽으므로 서버에는 없다. 그리기 중에
    부르면 서버가 그린 화면과 어긋나서, 화면이 붙은 뒤에 판단한다.
  */
  const ready = useIsClient();
  const demo = ready && isDemo();
  const [reset, setReset] = useState('');
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

        {/*
          "누구 기준으로 보는가" 묶음이 여기 있었다 — 나와 내 조건, 그리고 이 폰을
          쓰는 사람들. 둘 다 걷었다.

          홈 오른쪽 위의 얼굴이 그 둘을 다 한다. 얼굴을 누르면 명단이 열리고, 자기
          줄을 누르면 나이와 조건으로 간다. 그쪽이 더 나은 자리이기도 하다 — 사람을
          바꾸는 것은 설정이 아니라 중간 동작이고, 무엇보다 **지금 누구 기준인지가
          늘 보여야** 한다. 설정 안에 있으면 들어가 봐야만 알 수 있다.

          `/profile` 과 `/people` 화면은 남아 있다. 지운 것은 길이지 기능이 아니다.
        */}

        {/*
          "이 폰을 쓰는 사람들" 이 여기 있었다. 걷었다.

          홈 오른쪽 위의 얼굴이 같은 일을 한다 — 명단, 추가, 전환. 그리고 그쪽이
          더 나은 자리다: 사람을 바꾸는 것은 설정이 아니라 **중간 동작**이고, 하루에
          몇 번 있는 일이며, 무엇보다 지금 누구 기준인지가 늘 보여야 한다.

          `/people` 화면 자체는 남아 있다. 지운 것은 길이지 기능이 아니다 —
          거기에는 사람을 지우는 것처럼 이 시트에 두면 안 되는 것도 있다.
        */}

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
        {/* 다섯이 한 줄에 들어가지 않는다. 접히게 두면 칸 폭이 들쭉날쭉해지므로
            격자로 고정한다 — 크기를 견주는 화면에서 칸이 다른 크기면 방해가 된다. */}
        <div className="mt-2 grid grid-cols-5 gap-2">
          {TEXT_SIZES.map((size) => {
            const on = size === textSize;
            return (
              <button
                key={size}
                onClick={() => setTextSize(size)}
                aria-pressed={on}
                aria-label={`Text size: ${TEXT_SIZE_LABEL[size]}`}
                className="flex flex-col items-center justify-end gap-1 rounded-2xl bg-white py-3 shadow-sm"
                style={{ outline: on ? '3px solid var(--color-sc-primary)' : 'none' }}
              >
                {/*
                  보기가 곧 예시다. 'Large' 라는 낱말을 못 읽어도 **글자 크기가
                  실제로 다르게 그려져 있으면** 무엇을 고르는지가 보인다. 그래서
                  크기를 rem 이 아니라 px 로 박는다 — rem 이면 셋이 같이 커져서
                  차이가 안 보인다.
                */}
                {/* px 로 박는다. rem 이면 다섯이 다 같이 커져서 차이가 안 보인다. */}
                <span aria-hidden style={{ fontSize: Math.min(ROOT_PX[size], 26), lineHeight: 1 }}
                      className="font-extrabold">
                  Aa
                </span>
                <span aria-hidden className="text-[10px] font-semibold leading-tight"
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
          className="sc-row mt-2 flex w-full items-center rounded-2xl bg-white py-3 text-left shadow-sm"
          aria-pressed={autoTts}
        >
          <span aria-hidden className="sc-icon flex items-center justify-center"
                style={{ color: autoTts ? 'var(--color-sc-primary)' : 'var(--color-sc-muted)' }}>
            {autoTts ? <SpeakerIcon /> : <SpeakerOffIcon />}
          </span>
          <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
            Read results aloud
          </span>
          <Hear text={`Read results aloud. This is ${autoTts ? 'on' : 'off'}. Tap the row to change it.`} />
          <span
            className="flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors"
            style={{ background: autoTts ? 'var(--color-safe)' : 'var(--color-sc-line)' }}
          >
            <span
              className="h-5 w-5 shrink-0 rounded-full bg-white transition-transform"
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
          <span aria-hidden className="flex items-center text-lg leading-none"
                style={{ color: 'var(--color-sc-muted)' }}><TortoiseIcon /></span>
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
                  {/*
                    네모 한 글자를 되풀이하고 있었다(`'▪'.repeat`). 글꼴이 가진
                    도형이라 기기마다 크기와 무게가 다르고, 이 앱이 이모지를 걷어낸
                    이유와 같은 문제다. 같은 수만큼 우리 점을 찍는다.
                  */}
                  <span className="flex items-center justify-center gap-0.5">
                    {Array.from({ length: SPEECH_RATES.indexOf(r) + 1 }, (_, i) => (
                      <DotIcon key={i} size="0.5em" />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
          <span aria-hidden className="flex items-center text-lg leading-none"
                style={{ color: 'var(--color-sc-muted)' }}><HareIcon /></span>
        </div>

        {/*
          여기 두 묶음이 있었다 — PILL DEVICE 와 AT THE CLINIC. 둘 다 걷었다.

          약통은 홈 궤도에 "Pill box" 위성으로 이미 있다. 설정에 또 두면 같은 곳으로
          가는 문이 둘이 되고, 문이 둘이면 어느 쪽이 최신인지 사람이 알 수 없다 —
          실제로 이 버튼은 `/device` 의 옛 이름("일정을 기기로 보낸다")을 그대로
          달고 있었는데, 그 일은 이제 알람을 만들면 저절로 된다(`useAutoSend`).
          문이 자기가 여는 방의 옛 이름을 부르고 있었다.

          진료실 공유(`/provider`)는 만들어 두고 쓰이지 않았다. 설정은 사람이 헤매는
          자리라 안 쓰는 줄이 가장 비싸다. 화면 자체는 남아 있으므로 주소로는 여전히
          열린다 — 지운 것은 길이지 기능이 아니다.
        */}

        {/*
          시연용 자료 되돌리기 — **시연 모드에서만** 보인다.

          시연 자료는 한 번 넣고 마는 것이 아니라 쌓인다. 짝지은 상자가 배출할
          때마다 복용 기록이 하나씩 들어오고, 그것은 진짜 기록이라 지워지지 않는다.
          리허설로 알람을 열 번 울리면 열 칸이 남는다. 벤치에서는 하루 시험한 끝에
          이번 주 복약 카드가 칸 128개를 그렸다.

          실제로 쓰는 사람에게는 이 버튼이 **없어야 한다.** 자기 복약 기록을 한 번에
          지우는 버튼은 이 앱에 있어서는 안 되는 것이고, `?demo=1` 로 연 브라우저가
          아니면 `resetDemo()` 는 아무 일도 하지 않는다. 여기서 숨기는 것은 그
          거절을 사람에게 미리 보여주는 것뿐이다.
        */}
        {demo && (
          <>
            <Speakable text={'Demo.'} className="mt-6 text-[11px] font-bold tracking-wide flex w-full items-center gap-2" style={{ color: 'var(--color-sc-muted)' }}>
              <span className="flex-1">DEMO</span>
            </Speakable>
            <button
              onClick={() => {
                const ok = resetDemo();
                setReset(ok ? 'The demo data is back to how it started.' : '');
                if (ok) speak('The demo data is back to how it started.', 'en-US');
              }}
              className="sc-row mt-2 flex w-full items-center rounded-2xl bg-white py-3 text-left shadow-sm"
            >
              <span aria-hidden className="sc-icon flex items-center justify-center"
                    style={{ color: 'var(--color-sc-primary)' }}><UndoIcon /></span>
              <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--color-sc-ink)' }}>
                Reset the demo data
              </span>
              <Hear text="Reset the demo data. This puts the demo data back to how it started." />
            </button>
            {reset && (
              <p className="mt-2 text-xs" style={{ color: 'var(--color-sc-muted)' }}>{reset}</p>
            )}
          </>
        )}
      </div>
    </MobileScreen>
  );
}
