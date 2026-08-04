'use client';

import { isDemo } from '@/lib/snapcare/demo';
import { demoBox } from '@/lib/snapcare/sync';
import { loadPaired, pairWith } from './paired';

/**
 * 시연에서 **약통 짝을 폰들끼리 나눈다.**
 *
 * 무엇이 문제였나
 * ---------------
 * 짝은 이 기기 안에만 있다. 상자 열쇠가 `extractable: false` 인 CryptoKey 라 꺼낼 수
 * 없고, 그것이 이 저장소가 일부러 고른 성질이다(`paired.ts`). 그래서 다른 폰으로
 * `/present` 를 열면 처음부터다 — 상자 화면의 코드를 다시 읽어야 한다.
 *
 * 심사장에서는 그 한 걸음이 비싸다. 폰이 바뀌는 것은 예외가 아니라 기본이고, 그때
 * 상자를 깨워 QR 을 띄우고 카메라를 맞추는 동안 설명이 끊긴다.
 *
 * 무엇을 나누는가
 * ---------------
 * 열쇠가 아니라 **코드**다. 열쇠는 꺼낼 수 없지만 코드에서 다시 유도할 수는 있다
 * (`deriveKeys`). 그래서 시연 블롭에 코드를 두고, 새 폰이 그것으로 스스로 짝짓는다.
 *
 * 왜 이것이 위험을 늘리지 않는가
 * ------------------------------
 * 코드를 안 남기기로 한 판단은 그대로다 — 실제 사용자의 블롭에는 이 값이 안 들어간다.
 * 넣는 쪽도 읽는 쪽도 `isDemo()` 안에 있고, 시연 블롭은 대회용 상자 하나만 가리킨다.
 * 그 상자에 접근한 사람이 할 수 있는 일은 우리 시연 상자의 트레이를 여는 것이다.
 *
 * 그리고 그 파일에 닿으려면 여전히 **유효한 기기 서명**이 필요하다. 시연 모드가 푸는
 * 것은 인증이 아니라 *어느 파일을 여는가* 하나다.
 */

/*
  적는 쪽(`shareIfDemo`)은 `paired.ts` 안에 있다. 이 파일에 두면 `paired → demoBox →
  paired` 로 수입이 돌고, 그런 고리는 번들러마다 다르게 풀려서 어떤 빌드에서만
  `undefined` 가 되는 종류의 결함을 낳는다. 읽는 쪽만 여기 남긴다.
*/

/**
 * 아직 짝이 없는데 시연 블롭에 상자가 있으면 스스로 짝짓는다.
 *
 * `pull()` 이 끝난 뒤에 부른다 — 그전에는 `demoBox()` 가 아무것도 모른다.
 *
 * 이미 짝이 있으면 손대지 않는다. 시연 도중에 이 폰이 직접 맺은 짝을 블롭의 것으로
 * 덮으면, 사람이 방금 한 일이 조용히 취소된다.
 */
export async function adoptDemoBox(): Promise<boolean> {
  if (!isDemo()) return false;
  const box = demoBox();
  if (!box) return false;
  if (await loadPaired()) return false;
  try {
    await pairWith(box.claim, box.relayUrl);
    return true;
  } catch (err) {
    console.warn('[demo] 시연 블롭의 상자로 짝짓지 못했다:', err);
    return false;
  }
}
