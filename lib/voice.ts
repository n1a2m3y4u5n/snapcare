// Web Speech API 래퍼 — TTS + STT

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
 * 텍스트를 음성으로 읽어준다 (TTS)
 */
export function speak(text: string, lang = 'ko-KR'): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      resolve();
      return;
    }
    // 이전 발화 중단
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = lang;
    utt.rate = 0.9;
    utt.onend = () => resolve();
    utt.onerror = () => resolve();
    window.speechSynthesis.speak(utt);
  });
}

/**
 * 마이크로 음성을 인식해 텍스트를 반환한다 (STT)
 */
export function listen(lang = 'ko-KR'): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('브라우저 환경이 아닙니다'));
      return;
    }

    const w = window as unknown as Record<string, unknown>;
    const Ctor = (w['SpeechRecognition'] ?? w['webkitSpeechRecognition']) as WebSpeechRecognitionConstructor | undefined;

    if (!Ctor) {
      reject(new Error('이 브라우저는 음성 인식을 지원하지 않습니다'));
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
