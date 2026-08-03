'use client';

import { useEffect, useState } from 'react';
import { LANGUAGES, languageByCode, voiceAvailable } from '@/lib/i18n/languages';
import { usePreferences } from '@/stores/preferences';
import { speak, voicesReady } from '@/lib/voice';
import { dslSentence } from '@/lib/snapcare/dslSpeech';
import { Speakable } from '@/components/sc/Say';

/**
 * 어느 언어로 말할지 고른다.
 *
 * 고르면 **그 자리에서 한 문장을 들려준다.** 이 앱의 방식이다 — 설명을 읽고 고르는
 * 대신 들어보고 고른다. 읽을 수 있는 사람에게도 그편이 빠르고, 읽지 못하는 사람에게는
 * 이것이 유일한 방법이다. 들려주는 문장은 "먼저 손을 씻으세요" 인데, 짧고 어느 언어로도
 * 자연스러우며 무엇보다 **이 앱이 실제로 하는 말** 중 하나다.
 *
 * 목소리가 없는 언어를 흐리게 둔다
 * --------------------------------
 * 브라우저의 음성 목록은 기기마다 다르다. 우르두어 목소리가 깔려 있지 않은 폰에서
 * 우르두어를 고르면 소리가 아예 안 나거나, 영어 목소리가 우르두 글자를 영어로 읽어
 * 알아들을 수 없는 소리가 난다. 둘 다 사용자에게는 "앱이 고장났다" 로 보인다.
 *
 * 그래서 미리 말해 준다. 막지는 않는다 — 목소리를 나중에 깔 수도 있고, 화면의 글자를
 * 읽어 주는 다른 도구를 쓸 수도 있다. 다만 지금 이 기기에서 무슨 일이 일어날지는
 * 고르기 전에 알아야 한다.
 */
export function LanguagePicker() {
  const sayLang = usePreferences((s) => s.sayLang);
  const setSayLang = usePreferences((s) => s.setSayLang);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    let alive = true;
    void voicesReady().then((v: SpeechSynthesisVoice[]) => { if (alive) setVoices(v); });
    return () => { alive = false; };
  }, []);

  return (
    <>
      <Speakable text="What language should I speak? The words on the screen stay in English."
                 className="mt-6 flex w-full items-center gap-2 text-[11px] font-bold tracking-wide"
                 style={{ color: 'var(--color-sc-muted)' }}>
        <span className="flex-1">WHAT LANGUAGE SHOULD I SPEAK?</span>
      </Speakable>

      <div className="mt-2 flex flex-col gap-1.5">
        {LANGUAGES.map((l) => {
          const on = l.code === sayLang;
          // 아직 목소리 목록을 못 받았으면 없다고 단정하지 않는다 — 브라우저가 늦게 준다.
          const mute = voices.length > 0 && !voiceAvailable(l.tag, voices);
          return (
            <button
              key={l.code}
              onClick={() => {
                setSayLang(l.code);
                // 고른 그 언어로, 이 앱이 실제로 하는 말 하나를 들려준다.
                void speak(dslSentence('\\hand_wash', l.code) ?? 'Wash your hands first.', l.tag);
              }}
              aria-pressed={on}
              aria-label={`Speak ${l.english}${mute ? ' — no voice on this phone' : ''}`}
              className="flex items-center gap-3 rounded-2xl px-4 py-3 text-left"
              style={{
                background: on ? 'var(--color-sc-primary)' : 'white',
                color: on ? '#fff' : 'var(--color-sc-ink)',
              }}
            >
              <span className="text-xl" aria-hidden>{l.flag}</span>
              <span className="flex-1">
                <span className="block text-sm font-bold">{l.native}</span>
                <span className="block text-xs" style={{ color: on ? 'rgba(255,255,255,0.8)' : 'var(--color-sc-muted)' }}>
                  {mute ? `${l.english} — no voice on this phone` : l.english}
                </span>
              </span>
              {mute && <span aria-hidden className="text-base">🔇</span>}
              {on && <span aria-hidden className="text-base">✓</span>}
            </button>
          );
        })}
      </div>

      {/*
        번역의 한계를 화면에도 적는다.

        코드에만 적어 두면 이 앱을 쓰는 사람과 심사하는 사람은 모른다. 복약 지시의
        오역은 이 앱이 막으려는 바로 그 해를 끼치는 종류라, 아직 원어민 임상 검수를
        받지 않았다는 사실이 화면에 있어야 한다.
      */}
      <p className="mt-2 px-1 text-[11px] leading-relaxed" style={{ color: 'var(--color-sc-muted)' }}>
        The screen stays in English. Only the voice changes.
        {' '}These translations have not yet been checked by a clinician who speaks the
        language — {languageByCode(sayLang).english} included.
      </p>
    </>
  );
}
