// Web Speech API 래퍼 — TTS + STT
import { pickVoice } from './tts/pickVoice';

// 브라우저 전용 타입 보조
interface WebSpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((event: {
    results: { [index: number]: { [index: number]: { transcript: string } | undefined } | undefined };
  }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type WebSpeechRecognitionConstructor = new () => WebSpeechRecognition;

/**
 * 사용 가능한 음성 목록.
 *
 * Chrome 은 첫 호출에서 빈 배열을 준다 — 목록을 비동기로 채우고 voiceschanged 로 알린다.
 * 그걸 모르고 첫 호출 결과만 보면 "고를 음성이 없다"고 판단해 늘 기본값으로 떨어진다.
 */
function voicesReady(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const now = window.speechSynthesis.getVoices();
    if (now.length > 0) { resolve(now); return; }
    const done = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', done);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener('voiceschanged', done);
    // 이벤트가 끝내 오지 않는 브라우저가 있다 — 음성 없이라도 읽게 둔다
    setTimeout(done, 1000);
  });
}

let chosen: { lang: string; voice: SpeechSynthesisVoice | null } | null = null;

/** 이번 세션에서 쓸 음성. 한 번 고르면 재사용한다 (매번 목록을 훑을 이유가 없다). */
export async function preferredVoice(lang: string): Promise<SpeechSynthesisVoice | null> {
  if (chosen && chosen.lang === lang) return chosen.voice;
  const voice = pickVoice(await voicesReady(), lang);
  chosen = { lang, voice };
  return voice;
}

/**
 * 텍스트를 음성으로 읽어준다 (TTS).
 *
 * 기본 언어가 en-US 인 이유: 화면 문구가 전부 영어다(글로벌 팀·심사 언어).
 * 한국어 음성으로 영어 문장을 읽히면 발음이 무너진다 — layout.tsx 의 lang 과 같은 이유다.
 */
export async function speak(text: string, lang = 'en-US'): Promise<void> {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  const voice = await preferredVoice(lang);

  return new Promise((resolve) => {
    // 이전 발화 중단
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = lang;
    if (voice) utt.voice = voice;
    // 판정을 처음 듣는 사람이 따라올 수 있는 속도. 너무 느리면 늘어져 더 못 알아듣는다.
    utt.rate = 0.95;
    utt.pitch = 1;
    utt.onend = () => resolve();
    utt.onerror = () => resolve();
    window.speechSynthesis.speak(utt);
  });
}

/** 읽는 중인 것을 멈춘다 (다른 문장을 누르거나 화면을 떠날 때). */
export function stopSpeaking(): void {
  if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
}

/**
 * 마이크로 음성을 인식해 텍스트를 반환한다 (STT)
 */
export function listen(lang = 'en-US'): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('not a browser environment'));
      return;
    }

    const w = window as unknown as Record<string, unknown>;
    const Ctor = (w['SpeechRecognition'] ?? w['webkitSpeechRecognition']) as WebSpeechRecognitionConstructor | undefined;

    if (!Ctor) {
      reject(new Error('speech recognition is not supported in this browser'));
      return;
    }

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? '';
      resolve(transcript);
    };

    recognition.onerror = (event) => {
      reject(new Error(event.error));
    };

    recognition.onend = () => resolve('');

    recognition.start();
  });
}
