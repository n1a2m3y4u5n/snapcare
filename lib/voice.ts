// Web Speech API 래퍼 — TTS + STT
import { pickVoice } from './tts/pickVoice';
import { voiceLangFor } from './tts/voiceLang';

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
export function voicesReady(): Promise<SpeechSynthesisVoice[]> {
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

/**
 * 이번 세션에서 쓸 음성. 한 번 고르면 재사용한다.
 *
 * **null 은 기억하지 않는다.** 이것이 실제 결함이었다.
 *
 * 크롬은 첫 `getVoices()` 에서 빈 배열을 준다. 위 함수가 `voiceschanged` 를 기다리되
 * 1초 뒤에는 포기하는데, 브라우저를 막 켠 상태에서는 목록이 그보다 늦게 찬다. 그러면
 * `pickVoice([])` 가 null 을 내고, 그 null 이 **세션 내내** 캐시에 앉는다. 목록이
 * 1초 뒤에 다 차 있어도 다시 고르지 않는다.
 *
 * 결과: 목소리를 지정하지 않은 발화가 계속 나가고, 브라우저는 **기기 기본 음성**으로
 * 읽는다. 한국어 환경의 기본값은 한국어 음성이라(이 기기에서는 '유나' [ko-KR]),
 * 영어 문장을 한국어 음성이 읽는 소리가 난다 — 한국 사람이 영어를 읽는 것처럼.
 *
 * 못 골랐으면 기억하지 않는다. 다음 발화에서 다시 고르고, 그때는 목록이 차 있다.
 */
let chosen: { lang: string; voice: SpeechSynthesisVoice } | null = null;

/**
 * 말하기 속도. 스토어를 여기서 import 하면 lib 이 UI 상태에 의존하게 되므로,
 * 설정 화면이 값을 밀어 넣는다.
 */
let currentRate = 0.95;
export function setSpeechRate(rate: number): void {
  currentRate = rate;
}

export async function preferredVoice(lang: string): Promise<SpeechSynthesisVoice | null> {
  if (chosen && chosen.lang === lang) return chosen.voice;
  const voice = pickVoice(await voicesReady(), lang);
  // 고른 것만 기억한다. 위 주석의 이유로 null 은 기억하면 안 된다.
  if (voice) chosen = { lang, voice };
  return voice;
}

/**
 * 지금 말하는 언어의 음성 태그.
 *
 * 속도와 같은 방식으로 둔다 — 설정에서 바꾸면 여기로 밀어 넣고, 부르는 쪽은 아무것도
 * 모른 채 그냥 speak() 를 부른다. 말하는 자리가 수십 곳이라 전부에 언어를 들려 보내면
 * **한 곳만 빠뜨려도 그 문장만 영어로 나온다**, 그리고 그 한 곳이 복용량일 수 있다.
 */
let currentLang = 'en-US';
export function setSayLang(tag: string): void {
  currentLang = tag;
  chosen = null;   // 목소리를 다시 고른다
}

/**
 * 텍스트를 음성으로 읽어준다 (TTS).
 *
 * 언어를 주지 않으면 사용자가 고른 언어로 말한다. 화면 글자는 영어로 남고 소리만
 * 바뀌는데, 그 이유는 lib/i18n/languages.ts 에 적었다 — 글을 못 읽는 사람에게 도착하는
 * 통로는 소리다.
 */
export async function speak(text: string, lang = currentLang): Promise<void> {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  /*
    문장과 목소리가 어긋나지 않게 한 번 더 거른다.

    사용자가 한국어로 읽으라고 했는데 이 문장이 아직 번역되지 않은 영어면, 한국어
    목소리는 그것을 소리 나는 대로 읽는다 — 한국 사람이 영어를 읽는 소리가 나고
    알아들을 수 없다. 왜 이렇게 가르는지는 lib/tts/voiceLang.ts 에 적었다.
  */
  const useLang = voiceLangFor(text, lang);
  const voice = await preferredVoice(useLang);

  return new Promise((resolve) => {
    // 이전 발화 중단
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = useLang;
    if (voice) utt.voice = voice;
    // 사용자가 고른 속도. 설정에서 바꾸면 다음 발화부터 적용된다.
    utt.rate = currentRate;
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
