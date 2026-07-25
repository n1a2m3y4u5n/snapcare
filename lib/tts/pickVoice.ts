/**
 * 어떤 목소리로 읽을 것인가.
 *
 * 지금까지는 목소리를 고르지 않고 브라우저 기본값에 맡겼다. 기본값은 대개 그 기기에
 * 내장된 가장 가벼운 음성이고(로봇 같은 소리가 나는 그것), 같은 기기에 훨씬 나은 음성이
 * 깔려 있어도 쓰이지 않는다. 목소리를 고르는 것만으로 품질이 달라진다.
 *
 * 클라우드 TTS 를 쓰지 않는 이유: 이 앱의 음성은 장식이 아니라 글을 못 읽는 사용자에게
 * 결과를 전달하는 유일한 통로다. 인터넷이 끊기면 안 들리는 통로는 통로가 아니고,
 * 대상 지역은 데이터가 비싸다. 그래서 기기 안의 음성 중에서 가장 좋은 것을 고른다.
 */

/** SpeechSynthesisVoice 중 우리가 보는 부분만. 브라우저 없이 검증할 수 있게 분리했다. */
export interface VoiceLike {
  name: string;
  lang: string;
  localService: boolean;
  default?: boolean;
}

/** 이름에 품질이 드러나는 음성들. 제조사가 붙인 등급 표시라 신뢰할 만하다. */
const HIGH_GRADE = /premium|enhanced|neural|natural|siri/i;

/** 품질이 좋다고 알려진 이름들 (Apple·Google·Microsoft 의 주력 음성). */
const KNOWN_GOOD = /google|samantha|ava|allison|serena|zoe|evan|nathan|joelle|matilda|aria|jenny|guy/i;

/**
 * 절대 쓰면 안 되는 것들.
 * macOS 는 장난감 음성을 한가득 깔아두고(Zarvox, Trinoids…) 이것들도 en-US 로 잡힌다.
 * 판정 결과를 로봇 목소리나 노랫소리로 듣게 되면 접근성이 아니라 조롱이 된다.
 * 'compact' 는 Apple 의 저용량 버전이라 같은 이름이라도 음질이 눈에 띄게 나쁘다.
 */
const NOVELTY = /albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|eloquence|compact|espeak/i;

export function scoreVoice(v: VoiceLike, want = 'en-US'): number {
  if (NOVELTY.test(v.name)) return -Infinity;

  const lang = v.lang.replace('_', '-');
  const wantLang = want.split('-')[0];
  if (!lang.toLowerCase().startsWith(wantLang.toLowerCase())) return -Infinity;

  let score = 0;
  if (HIGH_GRADE.test(v.name)) score += 100;
  if (KNOWN_GOOD.test(v.name)) score += 40;
  // 네트워크 음성은 기기 내장보다 대체로 낫다. 다만 오프라인에서 조용해지므로
  // 로컬 고품질 음성이 있으면 그쪽이 이기도록 가중치를 낮게 둔다.
  if (!v.localService) score += 20;
  if (lang.toLowerCase() === want.toLowerCase()) score += 10;
  if (v.default) score += 1;   // 완전 동점일 때만 기본값을 따른다
  return score;
}

/** 후보 중 가장 나은 음성. 쓸 만한 것이 없으면 null (브라우저 기본값에 맡긴다). */
export function pickVoice<T extends VoiceLike>(voices: T[], want = 'en-US'): T | null {
  let best: T | null = null;
  let bestScore = -Infinity;
  for (const v of voices) {
    const s = scoreVoice(v, want);
    if (s > bestScore) { bestScore = s; best = v; }
  }
  return bestScore === -Infinity ? null : best;
}
